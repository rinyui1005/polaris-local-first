import { describe, expect, it } from 'vitest';
import {
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

describe('parseClaudeTranscriptJsonl', () => {
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
