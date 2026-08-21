import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types/domain.js';
import { reconcileCompanionConversationMessages } from './companionMessages.js';

function userMessage(id: string, content: string, timestamp: number): ChatMessage {
  return { id, role: 'user', content, timestamp, origin: 'user-input' };
}

function assistantMessage(id: string, content: string, timestamp: number): ChatMessage {
  return { id, role: 'assistant', content, timestamp, origin: 'assistant-reply' };
}

describe('reconcileCompanionConversationMessages', () => {
  it('swaps a single pending message for its exact remote match', () => {
    const local = [userMessage('local-1', '你好', 1000)];
    const remote = [userMessage('remote-1', '你好', 1050)];

    const result = reconcileCompanionConversationMessages(local, remote);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('local-1');
    expect(result[0].timestamp).toBe(1000);
  });

  it('folds several queued phone messages into one merged remote turn instead of duplicating them', () => {
    const local = [
      userMessage('local-image', '我测试一下发送图片的功能', 1000),
      userMessage('local-followup', 'lyko你还在吗0 0', 1500)
    ];
    const remote = [
      userMessage(
        'remote-merged',
        '[Image #2][用户发了图片: IMG_7320.jpeg]\n我测试一下发送图片的功能\n本地路径:[2026-08-21 11:53:38] lyko你还在吗0 0',
        1600
      )
    ];

    const result = reconcileCompanionConversationMessages(local, remote);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('local-followup');
  });

  it('keeps later remote messages after the merged turn instead of reordering them behind stranded local bubbles', () => {
    const local = [
      userMessage('local-image', '我测试一下发送图片的功能', 1000),
      userMessage('local-followup', 'lyko你还在吗0 0', 1500)
    ];
    const remote = [
      userMessage(
        'remote-merged',
        '[Image #2][用户发了图片: IMG_7320.jpeg]\n我测试一下发送图片的功能\n本地路径:[2026-08-21 11:53:38] lyko你还在吗0 0',
        1600
      ),
      assistantMessage('remote-reply', '看到啦，图片收到了。', 1700)
    ];

    const result = reconcileCompanionConversationMessages(local, remote);

    expect(result.map((message) => message.id)).toEqual(['local-followup', 'remote-reply']);
  });

  it('keeps a genuinely unmatched but recent pending message appended at the end', () => {
    const local = [
      userMessage('local-old', '已经同步过的消息', 100),
      userMessage('local-new', '刚发的新消息', 5000)
    ];
    const remote = [userMessage('local-old', '已经同步过的消息', 100)];

    const result = reconcileCompanionConversationMessages(local, remote);

    expect(result.map((message) => message.id)).toEqual(['local-old', 'local-new']);
  });
});
