import { describe, expect, it } from 'vitest';
import type { PolarisCompanionSnapshot } from '../types/domain';
import { cloneCompanionSnapshot, normalizeCompanionConnection } from './runtimeStoreCompanion';

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

describe('normalizeCompanionConnection', () => {
  it('preserves the identity-tab overrides instead of silently dropping them', () => {
    const normalized = normalizeCompanionConnection({
      id: 'companion-1',
      source: 'codex',
      collaboratorId: 'companion:companion-1',
      label: 'Claude Code · VPS',
      userNameOverride: 'lyko',
      purposeOverride: '负责陪聊和记事',
      descriptionOverride: '我的常驻搭子'
    });

    expect(normalized.userNameOverride).toBe('lyko');
    expect(normalized.purposeOverride).toBe('负责陪聊和记事');
    expect(normalized.descriptionOverride).toBe('我的常驻搭子');
  });
});
