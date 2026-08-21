import { describe, expect, it } from 'vitest';
import {
  isAutonomousLoopHeartbeat,
  mergeClaudeTextSnapshot,
  parseClaudeTranscriptJsonl,
  stripCccTransportTimestamp
} from './claudeTranscript.js';

function line(value: unknown) {
  return JSON.stringify(value);
}

describe('mergeClaudeTextSnapshot', () => {
  it('replaces growing snapshots instead of repeating them', () => {
    expect(mergeClaudeTextSnapshot('先看一下。', '先看一下。\n\n再检查工具。')).toBe(
      '先看一下。\n\n再检查工具。'
    );
  });

  it('keeps distinct fragments once each', () => {
    expect(mergeClaudeTextSnapshot('第一段', '第二段')).toBe('第一段\n\n第二段');
    expect(mergeClaudeTextSnapshot('第一段\n\n第二段', '第二段')).toBe('第一段\n\n第二段');
  });
});

describe('stripCccTransportTimestamp', () => {
  it('removes the timestamp injected by CcCompanion without touching the message', () => {
    expect(stripCccTransportTimestamp('[2026-08-21 08:52:26] lyko我修改了前端，测试连接'))
      .toBe('lyko我修改了前端，测试连接');
  });

  it('keeps ordinary bracketed user text intact', () => {
    expect(stripCccTransportTimestamp('[重要] 这句不要删')).toBe('[重要] 这句不要删');
  });
});

describe('isAutonomousLoopHeartbeat', () => {
  it('flags scheduled wake-up prompts regardless of casing or spacing', () => {
    expect(isAutonomousLoopHeartbeat('<<autonomous-loop-dynamic>> continue the task')).toBe(true);
    expect(isAutonomousLoopHeartbeat('Autonomous Loop check-in')).toBe(true);
  });

  it('leaves ordinary messages untouched', () => {
    expect(isAutonomousLoopHeartbeat('lyko: 帮我看看今天的日程')).toBe(false);
  });
});

describe('parseClaudeTranscriptJsonl', () => {
  it('hides autonomous-loop heartbeat turns from the mirrored chat', () => {
    const transcript = [
      line({
        type: 'user',
        uuid: 'row-heartbeat',
        timestamp: '2026-08-21T01:00:00.000Z',
        message: { role: 'user', content: '<<autonomous-loop-dynamic>> 继续任务' }
      }),
      line({
        type: 'assistant',
        uuid: 'row-heartbeat-reply',
        timestamp: '2026-08-21T01:00:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: '好的，继续。' }] }
      })
    ].join('\n');

    const messages = parseClaudeTranscriptJsonl(transcript);
    expect(messages.some((message) => message.role === 'user')).toBe(false);
    expect(messages.some((message) => message.content === '好的，继续。')).toBe(true);
  });

  it('hides Claude Code\'s own isMeta bookkeeping rows (e.g. local image path references)', () => {
    const transcript = [
      line({
        type: 'user',
        uuid: 'row-user-1',
        timestamp: '2026-08-21T09:51:30.000Z',
        message: { role: 'user', content: '我测试一下发送图片的功能' }
      }),
      line({
        type: 'user',
        uuid: 'row-meta-image',
        isMeta: true,
        timestamp: '2026-08-21T09:51:37.314Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '[Image: source: /home/ubuntu/CcCompanion/apns-server/tokens/attachments/1cf029e203ab4d0a9b41f87a578bf6b5.png]' }]
        }
      }),
      line({
        type: 'assistant',
        uuid: 'row-assistant-1',
        timestamp: '2026-08-21T09:51:40.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: '看着呢，一口都不会少。' }] }
      })
    ].join('\n');

    const messages = parseClaudeTranscriptJsonl(transcript);

    expect(messages.some((message) => message.content.includes('Image: source:'))).toBe(false);
    expect(messages.map((message) => message.content)).toEqual([
      '我测试一下发送图片的功能',
      '看着呢，一口都不会少。'
    ]);
  });

  it('produces one deduplicated thinking block and native tool events for a turn', () => {
    const transcript = [
      line({
        type: 'user',
        uuid: 'row-user-1',
        timestamp: '2026-08-21T01:00:00.000Z',
        message: { role: 'user', content: '看看记忆里有什么' }
      }),
      line({
        type: 'assistant',
        uuid: 'row-assistant-1',
        timestamp: '2026-08-21T01:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '先调取记忆。' }]
        }
      }),
      line({
        type: 'assistant',
        uuid: 'row-assistant-2',
        timestamp: '2026-08-21T01:00:02.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '先调取记忆。\n\n再整理一下。' },
            { type: 'tool_use', id: 'tool-1', name: 'mcp__ombre_brain__breath', input: { limit: 20 } }
          ]
        }
      }),
      line({
        type: 'user',
        uuid: 'row-tool-result',
        timestamp: '2026-08-21T01:00:03.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '找到了 20 条。' }]
        }
      }),
      line({
        type: 'assistant',
        uuid: 'row-assistant-3',
        timestamp: '2026-08-21T01:00:04.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: '我找到了。' }] }
      })
    ].join('\n');

    const messages = parseClaudeTranscriptJsonl(transcript);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'system']);
    const assistant = messages.find((message) => message.role === 'assistant');
    expect(assistant?.thinkingText).toBe('先调取记忆。\n\n再整理一下。');
    expect(assistant?.content).toBe('我找到了。');
    const tool = messages.find((message) => message.toolInvocation)?.toolInvocation;
    expect(tool).toMatchObject({
      kind: 'invokeMcpTool',
      toolName: 'mcp__ombre_brain__breath',
      status: 'executed',
      originMessageId: assistant?.id
    });
    expect(tool?.detailText).toContain('找到了 20 条。');
  });

  it('shows an immediate response placeholder while the turn is active', () => {
    const transcript = line({
      type: 'user',
      uuid: 'row-user-1',
      timestamp: '2026-08-21T01:00:00.000Z',
      message: { role: 'user', content: '还在吗' }
    });

    const messages = parseClaudeTranscriptJsonl(transcript, { active: true, now: 1234 });
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      thinkingText: '正在响应…'
    });
  });

  it('does not expose the CcCompanion arrival timestamp in a user bubble', () => {
    const transcript = line({
      type: 'user',
      uuid: 'row-user-timestamped',
      timestamp: '2026-08-21T00:52:26.000Z',
      message: { role: 'user', content: '[2026-08-21 08:52:26] 测试连接' }
    });

    expect(parseClaudeTranscriptJsonl(transcript)[0]?.content).toBe('测试连接');
  });
});
