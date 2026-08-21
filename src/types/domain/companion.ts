import type { ChatMessage } from './chat';

export type CompanionSource = 'polaris' | 'codex';
export type PolarisCompanionPushPlatform = 'android' | 'ios' | 'web';

export interface PolarisCompanionPushRegistration {
  platform: PolarisCompanionPushPlatform;
  token: string;
  updatedAt: number;
}

export interface PolarisCompanionHostState {
  enabled: boolean;
  relayUrl: string;
  label: string;
  hostId: string | null;
  hostSecret: string | null;
  pairCode: string | null;
  lastRegisteredAt: number | null;
  error: string | null;
}

export interface PolarisCompanionConnection {
  id: string;
  source: CompanionSource;
  collaboratorId: string;
  conversationId: string;
  relayUrl: string;
  hostId: string;
  clientId: string;
  clientSecret: string;
  label: string;
  hostLabel: string;
  /** User-owned local title for the mirrored conversation. */
  conversationLabel?: string;
  /** Last title reported by the remote host, used to avoid overwriting local renames. */
  remoteConversationLabel?: string;
  /** User-owned local display name for assistant messages. */
  collaboratorLabel?: string;
  pushToken: string | null;
  pushPlatform: PolarisCompanionPushPlatform | null;
  remoteThreadId?: string | null;
  createdAt: number;
  lastSnapshotAt: number | null;
  lastError: string | null;
}

export type PolarisTriggerSource = 'schedule' | 'webhook' | 'shortcut' | 'mcp' | 'manual';
export type PolarisTriggerSchedule =
  | {
      kind: 'daily';
      time: string;
    }
  | {
      kind: 'interval';
      everyMinutes: number;
    };
export type PolarisTriggerTarget = {
  collaboratorId: string;
  conversationMode: 'follow-latest' | 'fixed';
  conversationId: string | null;
};
export type PolarisTriggerAction = {
  prompt: string;
};
export interface PolarisTriggerRule {
  id: string;
  name: string;
  enabled: boolean;
  source: PolarisTriggerSource;
  webhookSecret: string;
  schedule: PolarisTriggerSchedule;
  target: PolarisTriggerTarget;
  action: PolarisTriggerAction;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastError: string | null;
}

export interface PolarisCompanionAutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  webhookSecret: string;
  schedule: PolarisTriggerSchedule;
  target: PolarisTriggerTarget;
  action: PolarisTriggerAction;
  lastRunAt: number | null;
  nextRunAt: number | null;
  updatedAt: number;
}

export interface PolarisCompanionTriggerCommand {
  ruleId: string;
  name: string;
  target: PolarisTriggerTarget;
  prompt: string;
  eventPrompt: string | null;
  source: 'webhook' | 'schedule' | 'mcp';
}

export interface PolarisCompanionCommand {
  id: string;
  text: string;
  createdAt: number;
  trigger?: PolarisCompanionTriggerCommand;
}

export interface PolarisCompanionSnapshot {
  hostId: string;
  hostLabel: string;
  threadKey: string | null;
  conversationTitle: string | null;
  collaboratorId: string | null;
  collaboratorName: string | null;
  messages: ChatMessage[];
  updatedAt: number;
}

