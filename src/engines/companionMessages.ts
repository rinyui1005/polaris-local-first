import type { ChatMessage, Conversation, PolarisCompanionSnapshot } from '../types/domain.js';

export function stripCompanionMessage(message: PolarisCompanionSnapshot['messages'][number]) {
  return {
    ...message,
    attachments: undefined,
    cardReference: undefined
  };
}

function normalizeCompanionMessageContent(content: string) {
  return content
    .replace(
      /^\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?\]\s*/u,
      ''
    )
    .trim();
}

const COMPANION_ACK_WINDOW_MS = 5 * 60 * 1000;

function serializeCompanionMessage(message: ChatMessage) {
  return JSON.stringify({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    origin: message.origin,
    requestRole: message.requestRole,
    requestContent: message.requestContent,
    providerId: message.providerId,
    providerName: message.providerName,
    model: message.model,
    tokenCount: message.tokenCount,
    tokenUsage: message.tokenUsage,
    assistantName: message.assistantName,
    thinkingText: message.thinkingText,
    nativeToolCalls: message.nativeToolCalls,
    toolInvocation: message.toolInvocation
  });
}

export function areCompanionMessageListsEqual(left: ChatMessage[], right: ChatMessage[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (serializeCompanionMessage(left[index]) !== serializeCompanionMessage(right[index])) {
      return false;
    }
  }
  return true;
}

export function reconcileCompanionConversationMessages(
  localMessages: ChatMessage[],
  remoteMessages: ChatMessage[]
) {
  if (localMessages.length === 0) {
    return remoteMessages;
  }
  if (remoteMessages.length === 0) {
    return localMessages;
  }

  const remoteIds = new Set(remoteMessages.map((message) => message.id));
  const trailingLocalMessages: ChatMessage[] = [];
  for (let index = localMessages.length - 1; index >= 0; index -= 1) {
    const message = localMessages[index];
    if (remoteIds.has(message.id)) {
      break;
    }
    trailingLocalMessages.unshift(message);
  }

  if (trailingLocalMessages.length === 0) {
    return remoteMessages;
  }

  const trailingPendingUsers = trailingLocalMessages.filter((message) => message.role === 'user');
  const consumedLocalMessageIds = new Set<string>();
  if (trailingPendingUsers.length === 0) {
    return [...remoteMessages, ...trailingLocalMessages];
  }

  let lastSharedRemoteIndex = -1;
  for (let index = remoteMessages.length - 1; index >= 0; index -= 1) {
    if (localMessages.some((message) => message.id === remoteMessages[index].id)) {
      lastSharedRemoteIndex = index;
      break;
    }
  }

  const nextRemoteMessages = remoteMessages.map((message, index) => {
    if (message.role !== 'user') {
      return message;
    }
    const nextPending = trailingPendingUsers[0];
    if (!nextPending) {
      return message;
    }
    if (normalizeCompanionMessageContent(message.content) !== normalizeCompanionMessageContent(nextPending.content)) {
      return message;
    }
    const closeInTime = Math.abs(message.timestamp - nextPending.timestamp) <= COMPANION_ACK_WINDOW_MS;
    if (index <= lastSharedRemoteIndex && !closeInTime) {
      return message;
    }
    trailingPendingUsers.shift();
    consumedLocalMessageIds.add(nextPending.id);
    return {
      ...message,
      id: nextPending.id,
      timestamp: nextPending.timestamp
    };
  });

  const unacknowledgedLocalTail = trailingLocalMessages.filter(
    (message) => !consumedLocalMessageIds.has(message.id)
  );

  if (unacknowledgedLocalTail.length === 0) {
    return nextRemoteMessages;
  }

  return [...nextRemoteMessages, ...unacknowledgedLocalTail];
}

export function shouldAcceptCompanionSnapshot(
  localConversation: Pick<Conversation, 'updatedAt'> | null | undefined,
  snapshot: Pick<PolarisCompanionSnapshot, 'updatedAt'>
) {
  return !localConversation || snapshot.updatedAt >= localConversation.updatedAt;
}
