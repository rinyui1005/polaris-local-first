import { describe, expect, it } from 'vitest';
import type { PolarisCompanionSnapshot } from '../types/domain';
import { cloneCompanionSnapshot } from './runtimeStoreCompanion';

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

describe('cloneCompanionSnapshot', () => {
  it('preserves the generating flag instead of silently dropping it', () => {
    expect(cloneCompanionSnapshot(createSnapshot({ generating: true }))?.generating).toBe(true);
    expect(cloneCompanionSnapshot(createSnapshot({ generating: false }))?.generating).toBe(false);
  });
});
