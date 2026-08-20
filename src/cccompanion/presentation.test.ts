import { describe, expect, it } from 'vitest';
import { buildTimelineItems, splitAssistantMessage } from './presentation';

describe('splitAssistantMessage', () => {
  it('splits prose paragraphs into separate visual bubbles', () => {
    expect(splitAssistantMessage('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。']);
  });

  it('keeps blank lines inside fenced code blocks intact', () => {
    const text = '```ts\nconst first = 1;\n\nconst second = 2;\n```\n\n完成。';
    expect(splitAssistantMessage(text)).toEqual([
      '```ts\nconst first = 1;\n\nconst second = 2;\n```',
      '完成。',
    ]);
  });
});

describe('buildTimelineItems', () => {
  it('folds consecutive task records into one tool group', () => {
    const records = [
      { role: 'task', text: 'Read file', ts: '2026-08-20T10:00:00Z' },
      { role: 'task', text: 'Run tests', ts: '2026-08-20T10:00:01Z' },
      { role: 'assistant', text: '好了', ts: '2026-08-20T10:00:02Z' },
    ];
    const items = buildTimelineItems(records);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('tools');
    if (items[0].type === 'tools') expect(items[0].records).toHaveLength(2);
  });
});
