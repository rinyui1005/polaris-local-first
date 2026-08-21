import { createUid } from '../engines/id';
import type {
  PolarisCompanionConnection,
  PolarisCompanionHostState,
  PolarisCompanionPushPlatform,
  PolarisCompanionSnapshot
} from '../types/domain';

function normalizeRelayUrl(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\/$/, '');
}

function normalizePushPlatform(value: PolarisCompanionPushPlatform | null | undefined) {
  if (value === 'android' || value === 'ios' || value === 'web') return value;
  return null;
}

export const DEFAULT_COMPANION_HOST_STATE: PolarisCompanionHostState = {
  enabled: false,
  relayUrl: '',
  label: '这台 Polaris',
  hostId: null,
  hostSecret: null,
  pairCode: null,
  lastRegisteredAt: null,
  error: null
};

export function normalizeCompanionHostState(
  host?: Partial<PolarisCompanionHostState> | null
): PolarisCompanionHostState {
  return {
    enabled: host?.enabled === true,
    relayUrl: normalizeRelayUrl(host?.relayUrl),
    label: host?.label?.trim() || DEFAULT_COMPANION_HOST_STATE.label,
    hostId: host?.hostId?.trim() || null,
    hostSecret: host?.hostSecret?.trim() || null,
    pairCode: host?.pairCode?.trim() || null,
    lastRegisteredAt: typeof host?.lastRegisteredAt === 'number' ? host.lastRegisteredAt : null,
    error: host?.error?.trim() || null
  };
}

export function normalizeCompanionConnection(
  connection?: Partial<PolarisCompanionConnection> | null
): PolarisCompanionConnection {
  const id = connection?.id?.trim() || createUid('companion');
  const collaboratorId = connection?.collaboratorId?.trim() || `companion:${id}`;
  const source = connection?.source === 'codex' ? 'codex' : 'polaris';
  const fallbackLabel = source === 'codex' ? 'Codex 电脑端' : '电脑端';
  const fallbackHostLabel = source === 'codex' ? '这台 Codex' : '这台 Polaris';
  return {
    id,
    source,
    collaboratorId,
    conversationId: connection?.conversationId?.trim() || createUid('c'),
    relayUrl: normalizeRelayUrl(connection?.relayUrl),
    hostId: connection?.hostId?.trim() || '',
    clientId: connection?.clientId?.trim() || '',
    clientSecret: connection?.clientSecret?.trim() || '',
    label: connection?.label?.trim() || fallbackLabel,
    hostLabel: connection?.hostLabel?.trim() || connection?.label?.trim() || fallbackHostLabel,
    conversationLabel: connection?.conversationLabel?.trim() || '',
    remoteConversationLabel: connection?.remoteConversationLabel?.trim() || '',
    collaboratorLabel: connection?.collaboratorLabel?.trim() || '',
    pushToken: connection?.pushToken?.trim() || null,
    pushPlatform: normalizePushPlatform(connection?.pushPlatform),
    remoteThreadId: connection?.remoteThreadId?.trim() || null,
    createdAt: typeof connection?.createdAt === 'number' ? connection.createdAt : Date.now(),
    lastSnapshotAt: typeof connection?.lastSnapshotAt === 'number' ? connection.lastSnapshotAt : null,
    lastError: connection?.lastError?.trim() || null
  };
}

export function normalizeCompanionConnections(
  connections?: Partial<PolarisCompanionConnection>[] | null
) {
  return (connections ?? []).map((connection) => normalizeCompanionConnection(connection));
}

export function cloneCompanionSnapshot(
  snapshot?: PolarisCompanionSnapshot | null
): PolarisCompanionSnapshot | null {
  if (!snapshot) return null;
  return {
    hostId: snapshot.hostId,
    hostLabel: snapshot.hostLabel,
    threadKey: snapshot.threadKey,
    conversationTitle: snapshot.conversationTitle,
    collaboratorId: snapshot.collaboratorId,
    collaboratorName: snapshot.collaboratorName,
    messages: snapshot.messages.map((message) => ({
      ...message,
      attachments: undefined,
      nativeToolCalls: message.nativeToolCalls?.map((toolCall) => ({ ...toolCall })),
      toolInvocation: message.toolInvocation ? { ...message.toolInvocation } : undefined,
      cardReference: undefined
    })),
    updatedAt: snapshot.updatedAt,
    generating: snapshot.generating
  };
}
