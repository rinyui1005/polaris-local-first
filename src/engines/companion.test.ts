import { describe, expect, it } from 'vitest';
import { createMessage } from './chatMessageFactory';
import {
  areCompanionMessageListsEqual,
  createCompanionPersonaProjection,
  reconcileCompanionConversationMessages,
  shouldAcceptCompanionSnapshot
} from './companion';
import type { PolarisCompanionConnection } from '../types/domain';

function createConnection(patch: Partial<PolarisCompanionConnection> = {}): PolarisCompanionConnection {
  return {
    id: 'companion-1',
    source: 'codex',
    collaboratorId: 'companion:one',
    conversationId: 'conversation-1',
    relayUrl: 'https://vps.example.com',
    hostId: 'ccc-claude-code-vps',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    label: 'Claude Code · VPS',
    hostLabel: 'Claude Code · VPS',
    pushToken: null,
    pushPlatform: null,
    remoteThreadId: null,
    createdAt: 1000,
    lastSnapshotAt: null,
    lastError: null,
    ...patch
  };
}

describe('reconcileCompanionConversationMessages', () => {
  it('keeps a local pending user tail until the remote snapshot catches up', () => {
    const remoteMessages = [
      createMessage('assistant', '已经连上了。', undefined, 'assistant-reply', 'assistant-1')
    ];
    const localPending = createMessage('user', '你还在吗', undefined, 'user-input', 'local-user-1');
    localPending.timestamp = 10;

    const nextMessages = reconcileCompanionConversationMessages(
      [...remoteMessages, localPending],
      remoteMessages
    );

    expect(nextMessages.map((message) => message.id)).toEqual(['assistant-1', 'local-user-1']);
  });

  it('reuses the local pending user id once the remote snapshot acknowledges the same turn', () => {
    const remoteBase = createMessage('assistant', '已经连上了。', undefined, 'assistant-reply', 'assistant-1');
    const localPending = createMessage('user', '你还在吗', undefined, 'user-input', 'local-user-1');
    localPending.timestamp = 10;
    const remoteAck = createMessage('user', '你还在吗', undefined, 'user-input', 'remote-user-9');
    remoteAck.timestamp = 20;
    const remoteReply = createMessage('assistant', '在。', undefined, 'assistant-reply', 'assistant-2');

    const nextMessages = reconcileCompanionConversationMessages(
      [remoteBase, localPending],
      [remoteBase, remoteAck, remoteReply]
    );

    expect(nextMessages.map((message) => message.id)).toEqual([
      'assistant-1',
      'local-user-1',
      'assistant-2'
    ]);
    expect(nextMessages[1].content).toBe('你还在吗');
    expect(nextMessages[1].timestamp).toBe(10);
  });

  it('keeps repeated pending texts in order until each remote echo arrives', () => {
    const remoteBase = createMessage('assistant', '开始吧。', undefined, 'assistant-reply', 'assistant-1');
    const pendingA = createMessage('user', 'hi', undefined, 'user-input', 'local-user-1');
    pendingA.timestamp = 10;
    const pendingB = createMessage('user', 'hi', undefined, 'user-input', 'local-user-2');
    pendingB.timestamp = 11;
    const remoteAckA = createMessage('user', 'hi', undefined, 'user-input', 'remote-user-1');
    const remoteReplyA = createMessage('assistant', 'hello', undefined, 'assistant-reply', 'assistant-2');

    const nextMessages = reconcileCompanionConversationMessages(
      [remoteBase, pendingA, pendingB],
      [remoteBase, remoteAckA, remoteReplyA]
    );

    expect(nextMessages.map((message) => message.id)).toEqual([
      'assistant-1',
      'local-user-1',
      'assistant-2',
      'local-user-2'
    ]);
  });

  it('keeps a local assistant tail when the remote snapshot lags behind', () => {
    const remoteBase = createMessage('user', '写一下今天的计划', undefined, 'user-input', 'user-1');
    const localReply = createMessage('assistant', '先整理三件最重要的事。', undefined, 'assistant-reply', 'assistant-local-1');
    localReply.timestamp = 20;

    const nextMessages = reconcileCompanionConversationMessages(
      [remoteBase, localReply],
      [remoteBase]
    );

    expect(nextMessages.map((message) => message.id)).toEqual(['user-1', 'assistant-local-1']);
  });

  it('keeps local assistant output after a remote echo acknowledges the pending user turn', () => {
    const remoteBase = createMessage('assistant', '开始吧。', undefined, 'assistant-reply', 'assistant-1');
    const pendingUser = createMessage('user', 'hi', undefined, 'user-input', 'local-user-1');
    pendingUser.timestamp = 10;
    const localReply = createMessage('assistant', 'hello', undefined, 'assistant-reply', 'local-assistant-1');
    localReply.timestamp = 20;
    const remoteAck = createMessage('user', 'hi', undefined, 'user-input', 'remote-user-1');

    const nextMessages = reconcileCompanionConversationMessages(
      [remoteBase, pendingUser, localReply],
      [remoteBase, remoteAck]
    );

    expect(nextMessages.map((message) => message.id)).toEqual([
      'assistant-1',
      'local-user-1',
      'local-assistant-1'
    ]);
  });

  it('cleans up an already-persisted duplicate even when the remote reply is shared', () => {
    const remoteUser = createMessage(
      'user',
      '[2026-08-21 08:52:26] 测试连接',
      undefined,
      'user-input',
      'remote-user-1'
    );
    remoteUser.timestamp = 1_000;
    const remoteReply = createMessage('assistant', '收到了。', undefined, 'assistant-reply', 'assistant-1');
    remoteReply.timestamp = 2_000;
    const duplicatedLocalUser = createMessage('user', '测试连接', undefined, 'user-input', 'local-user-1');
    duplicatedLocalUser.timestamp = 1_100;

    const nextMessages = reconcileCompanionConversationMessages(
      [remoteUser, remoteReply, duplicatedLocalUser],
      [remoteUser, remoteReply]
    );

    expect(nextMessages).toHaveLength(2);
    expect(nextMessages.map((message) => message.id)).toEqual(['local-user-1', 'assistant-1']);
    expect(nextMessages[0].content).toContain('测试连接');
  });
});

describe('shouldAcceptCompanionSnapshot', () => {
  it('rejects older remote snapshots for an existing local conversation', () => {
    expect(shouldAcceptCompanionSnapshot({ updatedAt: 200 }, { updatedAt: 199 })).toBe(false);
  });

  it('accepts equal or newer remote snapshots', () => {
    expect(shouldAcceptCompanionSnapshot({ updatedAt: 200 }, { updatedAt: 200 })).toBe(true);
    expect(shouldAcceptCompanionSnapshot({ updatedAt: 200 }, { updatedAt: 201 })).toBe(true);
  });

  it('accepts remote snapshots when there is no local conversation yet', () => {
    expect(shouldAcceptCompanionSnapshot(null, { updatedAt: 1 })).toBe(true);
  });
});

describe('areCompanionMessageListsEqual', () => {
  it('treats matching companion message lists as equal', () => {
    const left = [createMessage('assistant', 'ok', undefined, 'assistant-reply', 'assistant-1')];
    const right = [createMessage('assistant', 'ok', undefined, 'assistant-reply', 'assistant-1')];
    left[0].timestamp = 1;
    right[0].timestamp = 1;

    expect(areCompanionMessageListsEqual(left, right)).toBe(true);
  });

  it('treats different ids as different even when the content matches', () => {
    const left = [createMessage('assistant', 'ok', undefined, 'assistant-reply', 'assistant-1')];
    const right = [createMessage('assistant', 'ok', undefined, 'assistant-reply', 'assistant-2')];
    left[0].timestamp = 1;
    right[0].timestamp = 1;

    expect(areCompanionMessageListsEqual(left, right)).toBe(false);
  });
});

describe('createCompanionPersonaProjection', () => {
  it('falls back to the generated description/purpose when no override is set', () => {
    const persona = createCompanionPersonaProjection(createConnection(), null);

    expect(persona.userName).toBe('');
    expect(persona.description).toContain('远程协作端');
    expect(persona.purpose).toContain('这不是本地 persona');
  });

  it('uses the identity-tab overrides once the user sets them, instead of the generated text', () => {
    const persona = createCompanionPersonaProjection(
      createConnection({
        userNameOverride: 'lyko',
        purposeOverride: '负责陪聊和记事',
        descriptionOverride: '我的常驻搭子'
      }),
      null
    );

    expect(persona.userName).toBe('lyko');
    expect(persona.purpose).toBe('负责陪聊和记事');
    expect(persona.description).toBe('我的常驻搭子');
  });

  it('uses the connection label as the room name', () => {
    const persona = createCompanionPersonaProjection(
      createConnection({ label: 'Las ruinas circulares' }),
      null
    );

    expect(persona.name).toBe('Las ruinas circulares');
  });
});
