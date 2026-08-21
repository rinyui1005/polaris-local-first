import { describe, expect, it } from 'vitest';
import type { PolarisCompanionConnection, PolarisCompanionSnapshot } from '../types/domain';
import { resolveCompanionConnectionSyncKey, shouldStoreCompanionSnapshot } from './useCompanionRuntime';

function createSnapshot(patch: Partial<PolarisCompanionSnapshot> = {}): PolarisCompanionSnapshot {
  return {
    hostId: 'host-1',
    hostLabel: 'Claude Code · VPS',
    threadKey: 'thread-1',
    conversationTitle: 'Claude Code',
    collaboratorId: null,
    collaboratorName: 'Claude Code',
    messages: [],
    updatedAt: 1000,
    ...patch
  };
}

function createConnection(patch: Partial<PolarisCompanionConnection> = {}): PolarisCompanionConnection {
  return {
    id: 'companion-1',
    source: 'polaris',
    collaboratorId: 'companion:one',
    conversationId: 'conversation-1',
    relayUrl: 'http://192.168.0.108:8787',
    hostId: 'host-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    label: '电脑端',
    hostLabel: '这台 Polaris',
    pushToken: null,
    pushPlatform: null,
    remoteThreadId: null,
    createdAt: 1000,
    lastSnapshotAt: null,
    lastError: null,
    ...patch
  };
}

describe('resolveCompanionConnectionSyncKey', () => {
  it('ignores runtime result fields that should not restart polling', () => {
    const baseKey = resolveCompanionConnectionSyncKey([
      createConnection({
        lastError: null,
        lastSnapshotAt: 1000,
        remoteThreadId: 'remote-1'
      })
    ]);
    const resultKey = resolveCompanionConnectionSyncKey([
      createConnection({
        lastError: 'Load failed',
        lastSnapshotAt: 2000,
        remoteThreadId: 'remote-2'
      })
    ]);

    expect(resultKey).toBe(baseKey);
  });

  it('changes when the connection target changes', () => {
    const baseKey = resolveCompanionConnectionSyncKey([createConnection()]);
    const targetKey = resolveCompanionConnectionSyncKey([
      createConnection({
        relayUrl: 'http://127.0.0.1:8787'
      })
    ]);

    expect(targetKey).not.toBe(baseKey);
  });
});

describe('shouldStoreCompanionSnapshot', () => {
  it('detects a generating-only change so the live "thinking" indicator can turn on', () => {
    const idle = createSnapshot({ generating: false });
    const typing = createSnapshot({ generating: true });

    expect(shouldStoreCompanionSnapshot(idle, typing)).toBe(true);
  });

  it('treats an unset generating flag as false', () => {
    const withoutFlag = createSnapshot();
    const explicitlyIdle = createSnapshot({ generating: false });

    expect(shouldStoreCompanionSnapshot(withoutFlag, explicitlyIdle)).toBe(false);
  });
});
