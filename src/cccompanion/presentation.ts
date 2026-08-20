import type { ChatRecord } from './types';

export type TimelineItem =
  | { type: 'record'; record: ChatRecord }
  | { type: 'tools'; id: string; records: ChatRecord[] };

export function splitAssistantMessage(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    const value = current.join('\n').trim();
    if (value) parts.push(value);
    current = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && !line.trim()) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  return parts.length ? parts : [text];
}

export function buildTimelineItems(records: ChatRecord[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let tools: ChatRecord[] = [];

  const flushTools = () => {
    if (!tools.length) return;
    const first = tools[0];
    items.push({
      type: 'tools',
      id: `tools-${first.ts}-${first.turn_id || ''}`,
      records: tools,
    });
    tools = [];
  };

  records.forEach((record) => {
    if (record.role === 'task') {
      tools.push(record);
      return;
    }
    flushTools();
    items.push({ type: 'record', record });
  });
  flushTools();
  return items;
}
