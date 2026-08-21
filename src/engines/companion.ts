import { createPersonaTemplate } from '../config/persona/personaBuilder.js';
import type { Persona, PolarisCompanionConnection, PolarisCompanionSnapshot } from '../types/domain.js';
export {
  areCompanionMessageListsEqual,
  reconcileCompanionConversationMessages,
  shouldAcceptCompanionSnapshot,
  stripCompanionMessage
} from './companionMessages.js';

export const COMPANION_COLLABORATOR_PREFIX = 'companion:';

export function toCompanionCollaboratorId(connectionId: string) {
  return `${COMPANION_COLLABORATOR_PREFIX}${connectionId}`;
}

export function isCompanionCollaboratorId(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(COMPANION_COLLABORATOR_PREFIX);
}

export function createCompanionPersonaProjection(
  connection: PolarisCompanionConnection,
  snapshot: PolarisCompanionSnapshot | null
): Persona {
  const remoteCollaboratorName = snapshot?.collaboratorName?.trim() || null;
  const sourceLabel = connection.source === 'codex'
    ? (connection.hostLabel.includes('Claude Code') ? 'Claude Code' : 'Codex')
    : 'Polaris';
  const displayName = connection.label.trim() || connection.hostLabel.trim() || '电脑端';
  const defaultDescription = remoteCollaboratorName
    ? `远程协作端 · 当前由 ${remoteCollaboratorName} 挂在电脑上的 ${sourceLabel} 会话继续活着。`
    : `远程协作端 · 这是电脑上正在活着的 ${sourceLabel} 会话。`;
  const defaultPurpose = remoteCollaboratorName
    ? `这不是本地 persona，而是电脑端的 ${sourceLabel} 活体会话。当前主说话人是 ${remoteCollaboratorName}。`
    : `这不是本地 persona，而是电脑端的 ${sourceLabel} 活体会话。`;

  return createPersonaTemplate({
    id: connection.collaboratorId,
    name: displayName,
    description: connection.descriptionOverride?.trim() || defaultDescription,
    purpose: connection.purposeOverride?.trim() || defaultPurpose,
    userName: connection.userNameOverride?.trim() || '',
    builderManaged: false,
    compiledPrompt: '',
    baseId: 'executor',
    relationship: 'partner',
    expression: 'natural',
    advanced: {
      modelOverride: '',
      temperature: '0.7',
      topP: '',
      maxTokens: '',
      thinkingBudget: '',
      contextMessageLimit: '',
      showThinking: true,
      streaming: true,
      customHeaders: '',
      customBody: '',
      regexRules: '',
      snippets: []
    }
  });
}
