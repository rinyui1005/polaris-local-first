import { describe, expect, it, vi } from 'vitest';
import { submitCompanionMessage } from './chatCompanionSubmit';
import { sendCompanionClientCommand, uploadCompanionClientAttachment } from '../../engines/companionApi';
import { getAssetBlob } from '../../infrastructure/assetStore';

vi.mock('../../engines/companionApi', () => ({
  sendCompanionClientCommand: vi.fn(() => Promise.resolve()),
  uploadCompanionClientAttachment: vi.fn(() => Promise.resolve())
}));

vi.mock('../../infrastructure/assetStore', () => ({
  getAssetBlob: vi.fn()
}));

const connection = {
  id: 'connection-1',
  collaboratorId: 'companion-1',
  label: 'Mac',
  relayUrl: 'https://relay.example',
  hostId: 'host-1',
  clientId: 'client-1',
  clientSecret: 'secret'
} as never;

describe('submitCompanionMessage', () => {
  it('loads a writable body before optimistic local write and relay send', async () => {
    const addMessage = vi.fn();
    const setInputDraft = vi.fn();
    const onUserMessageSubmitted = vi.fn();

    await submitCompanionMessage({
      inputDraft: '继续',
      pendingAttachments: [],
      pendingCardReference: null,
      activeConversation: {
        id: 'conv-companion',
        collaboratorId: 'companion-1',
        messages: []
      }
    }, {
      ensureConversationWritable: vi.fn(async (conversationId: string) => ({
        conversationId,
        conversation: {
          id: conversationId,
          title: 'Companion',
          collaboratorId: 'companion-1',
          messages: []
        } as never,
        messages: []
      })),
      addMessage,
      setInputDraft,
      clearPendingAttachments: vi.fn(),
      clearPendingCardReference: vi.fn(),
      setCommandStatus: vi.fn(),
      onUserMessageSubmitted
    }, connection);

    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-companion'
    }), expect.objectContaining({
      role: 'user',
      content: '继续'
    }));
    expect(setInputDraft).toHaveBeenCalledWith('');
    expect(onUserMessageSubmitted).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-companion'
    }));
    expect(sendCompanionClientCommand).toHaveBeenCalled();
  });

  it('does not clear or relay when the body cannot become writable', async () => {
    const addMessage = vi.fn();
    const setInputDraft = vi.fn();
    const setCommandStatus = vi.fn();
    vi.mocked(sendCompanionClientCommand).mockClear();

    await submitCompanionMessage({
      inputDraft: '不要消失',
      pendingAttachments: [],
      pendingCardReference: null,
      activeConversation: {
        id: 'conv-companion',
        collaboratorId: 'companion-1',
        messages: []
      }
    }, {
      ensureConversationWritable: vi.fn(async () => {
        throw new Error('message chunk missing');
      }),
      addMessage,
      setInputDraft,
      clearPendingAttachments: vi.fn(),
      clearPendingCardReference: vi.fn(),
      setCommandStatus
    }, connection);

    expect(addMessage).not.toHaveBeenCalled();
    expect(setInputDraft).not.toHaveBeenCalled();
    expect(sendCompanionClientCommand).not.toHaveBeenCalled();
    expect(setCommandStatus).toHaveBeenCalledWith('读取当前对话历史失败，先别发送，避免用空历史继续。', true);
  });

  it('uploads a selected attachment with its caption instead of sending a text-only command', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    vi.mocked(getAssetBlob).mockResolvedValue(blob);
    vi.mocked(sendCompanionClientCommand).mockClear();
    vi.mocked(uploadCompanionClientAttachment).mockClear();

    await submitCompanionMessage({
      inputDraft: '看看这张图',
      pendingAttachments: [{
        id: 'attachment-1',
        assetId: 'asset-1',
        kind: 'image',
        name: '测试图片.png',
        mimeType: 'image/png',
        size: blob.size
      }],
      pendingCardReference: null,
      activeConversation: {
        id: 'conv-companion',
        collaboratorId: 'companion-1',
        messages: []
      }
    }, {
      ensureConversationWritable: vi.fn(async (conversationId: string) => ({
        conversationId,
        conversation: { id: conversationId } as never,
        messages: []
      })),
      addMessage: vi.fn(),
      setInputDraft: vi.fn(),
      clearPendingAttachments: vi.fn(),
      clearPendingCardReference: vi.fn(),
      setCommandStatus: vi.fn()
    }, connection);

    expect(uploadCompanionClientAttachment).toHaveBeenCalledWith(expect.objectContaining({
      filename: '测试图片.png',
      text: '看看这张图',
      blob
    }));
    expect(sendCompanionClientCommand).not.toHaveBeenCalled();
  });
});
