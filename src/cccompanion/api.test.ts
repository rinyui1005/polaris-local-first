import { describe, expect, it } from 'vitest';
import { mergeChatRecords, normalizeBaseUrl } from './api';

describe('normalizeBaseUrl', () => {
  it('adds https and removes the trailing slash', () => {
    expect(normalizeBaseUrl('ccc.example.com/')).toBe('https://ccc.example.com');
  });

  it('uses the supplied same-origin fallback', () => {
    expect(normalizeBaseUrl('', 'https://chat.example.com')).toBe('https://chat.example.com');
  });
});

describe('mergeChatRecords', () => {
  it('deduplicates and sorts records chronologically', () => {
    const earlier = { role: 'user', text: 'hello', ts: '2026-08-20T10:00:00Z' };
    const later = { role: 'assistant', text: 'hi', ts: '2026-08-20T10:00:01Z', turn_id: 'turn-1' };
    expect(mergeChatRecords([later], [earlier, later])).toEqual([earlier, later]);
  });

  it('keeps the same array when polling returns no new chat records', () => {
    const current = [{ role: 'user', text: 'still here', ts: '2026-08-20T10:00:00Z' }];

    expect(mergeChatRecords(current, [])).toBe(current);
    expect(mergeChatRecords(current, [...current])).toBe(current);
  });
});
