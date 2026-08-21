import { describe, expect, it } from 'vitest';
import { formatMessageTimestamp } from './messageTimestamp';

describe('formatMessageTimestamp', () => {
  it('formats a message time in the device local timezone', () => {
    const value = new Date(2026, 7, 21, 9, 7, 42).getTime();
    expect(formatMessageTimestamp(value)).toBe('09:07');
  });

  it('hides missing or invalid timestamps', () => {
    expect(formatMessageTimestamp(0)).toBe('');
    expect(formatMessageTimestamp(Number.NaN)).toBe('');
  });
});
