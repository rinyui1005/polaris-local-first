import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  areCompanionMessageListsEqual,
  reconcileCompanionConversationMessages,
  shouldAcceptCompanionSnapshot,
  stripCompanionMessage
} from '../engines/companion';
import {
  fetchCompanionClientSnapshot,
  publishCompanionAutomationRules,
  publishCompanionClientAutomationRules,
  publishCompanionSnapshot,
  pullCompanionHostCommands,
  registerCompanionHost
} from '../engines/companionApi';
import { useRuntimeStore } from '../stores/runtimeStore';
import { useChatStore } from '../stores/chatStore';
import { useCollectionStore } from '../stores/collectionStore';
import { usePersonaStore } from '../stores/personaStore';
import { useSpaceStore } from '../stores/spaceStore';
import { useI18n } from '../i18n';
import { runCompanionHostCommand } from './companion/companionHostCommandRuntime';
import { useCompanionNativePushRegistration } from './companion/useCompanionNativePushRegistration';
import type { PolarisCompanionConnection, PolarisCompanionSnapshot, World } from '../types/domain';

const COMPANION_CHAT_SYNC_INTERVAL_MS = 400;
const COMPANION_COLLECTION_SYNC_INTERVAL_MS = 5000;

function resolveCompanionSyncInterval(activeWorld: World) {
  return activeWorld === 'chat'
    ? COMPANION_CHAT_SYNC_INTERVAL_MS
    : COMPANION_COLLECTION_SYNC_INTERVAL_MS;
}

export function resolveCompanionConnectionSyncKey(connections: PolarisCompanionConnection[]) {
  return connections
    .map((connection) => [
      connection.id,
      connection.relayUrl,
      connection.hostId,
      connection.clientId,
      connection.clientSecret,
      connection.source,
      connection.conversationId
    ].join('\u001f'))
    .join('\u001e');
}

function resolveSnapshotRevision(snapshot: PolarisCompanionSnapshot | null | undefined) {
  if (!snapshot) return 'none';
  return [
    snapshot.updatedAt,
    snapshot.threadKey ?? '',
    snapshot.conversationTitle ?? '',
    snapshot.collaboratorId ?? '',
    snapshot.collaboratorName ?? '',
    snapshot.messages.length
  ].join('|');
}

function shouldStoreCompanionSnapshot(
  currentSnapshot: PolarisCompanionSnapshot | null | undefined,
  nextSnapshot: PolarisCompanionSnapshot | null
) {
  return resolveSnapshotRevision(currentSnapshot) !== resolveSnapshotRevision(nextSnapshot);
}

function resolveCompanionConnectionPatch(
  connection: PolarisCompanionConnection,
  response: {
    hostLabel: string;
    snapshot: PolarisCompanionSnapshot | null;
  },
  options: {
    acceptSnapshot?: boolean;
  }
) {
  const acceptSnapshot = options.acceptSnapshot !== false;
  const nextRemoteThreadId = response.snapshot
    ? (acceptSnapshot ? response.snapshot.threadKey ?? null : connection.remoteThreadId)
    : null;
  const nextLastSnapshotAt = response.snapshot && acceptSnapshot
    ? response.snapshot.updatedAt
    : connection.lastSnapshotAt;
  const patch: Partial<PolarisCompanionConnection> = {};

  if (connection.hostLabel !== response.hostLabel) {
    patch.hostLabel = response.hostLabel;
  }
  const nextRemoteConversationLabel = response.snapshot && acceptSnapshot
    ? response.snapshot.conversationTitle?.trim() || ''
    : connection.remoteConversationLabel ?? '';
  if ((connection.remoteConversationLabel ?? '') !== nextRemoteConversationLabel) {
    patch.remoteConversationLabel = nextRemoteConversationLabel;
  }
  if (connection.remoteThreadId !== nextRemoteThreadId) {
    patch.remoteThreadId = nextRemoteThreadId;
  }
  if (connection.lastSnapshotAt !== nextLastSnapshotAt) {
    patch.lastSnapshotAt = nextLastSnapshotAt;
  }
  if (connection.lastError !== null) {
    patch.lastError = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function buildHostSnapshot() {
  const chatState = useChatStore.getState();
  const personaState = usePersonaStore.getState();
  const activeConversation = chatState.conversations.find((conversation) => conversation.id === chatState.activeConversationId) ?? null;
  const activeCollaborator = activeConversation?.collaboratorId
    ? personaState.personas.find((persona) => persona.id === activeConversation.collaboratorId) ?? null
    : null;

  return {
    hostId: '',
    hostLabel: '',
    threadKey: activeConversation?.id ?? null,
    conversationTitle: activeConversation?.title ?? null,
    collaboratorId: activeConversation?.collaboratorId ?? null,
    collaboratorName: activeCollaborator?.name ?? null,
    messages: (activeConversation?.messages ?? []).map(stripCompanionMessage),
    updatedAt: activeConversation?.updatedAt ?? Date.now()
  };
}

type UseCompanionRuntimeOptions = {
  enabled?: boolean;
};

export function useCompanionRuntime({ enabled = true }: UseCompanionRuntimeOptions = {}) {
  const { t } = useI18n();
  const runtimeHydrated = useRuntimeStore((state) => state.hydrated);
  const companionHost = useRuntimeStore((state) => state.companionHost);
  const companionConnections = useRuntimeStore((state) => state.companionConnections);
  const companionConnectionSyncKey = useRuntimeStore((state) =>
    resolveCompanionConnectionSyncKey(state.companionConnections)
  );
  const activeWorld = useSpaceStore((state) => state.activeWorld);
  const setCompanionHost = useRuntimeStore((state) => state.setCompanionHost);
  const setCompanionSnapshot = useRuntimeStore((state) => state.setCompanionSnapshot);
  const updateCompanionConnection = useRuntimeStore((state) => state.updateCompanionConnection);
  const chatHydrated = useChatStore((state) => state.hydrated);
  const personaHydrated = usePersonaStore((state) => state.hydrated);
  const collectionHydrated = useCollectionStore((state) => state.hydrated);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingLifecycleReleaseRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const appForegroundRef = useRef(true);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useCompanionNativePushRegistration({
    runtimeHydrated: enabled && runtimeHydrated,
    companionConnections,
    updateCompanionConnection
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const updateDocumentForeground = () => {
      appForegroundRef.current = document.visibilityState !== 'hidden';
    };

    updateDocumentForeground();
    document.addEventListener('visibilitychange', updateDocumentForeground);

    let cancelled = false;
    let removeAppStateListener: (() => void) | null = null;

    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('App')) {
      void CapacitorApp.addListener('appStateChange', (state) => {
        appForegroundRef.current = state.isActive;
      }).then((listener) => {
        if (cancelled) {
          void listener.remove();
          return;
        }
        removeAppStateListener = () => {
          void listener.remove();
        };
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', updateDocumentForeground);
      removeAppStateListener?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!runtimeHydrated || !chatHydrated || !personaHydrated || !collectionHydrated) return;
    if (!companionHost.enabled || !companionHost.relayUrl.trim()) return;

    let cancelled = false;
    let timerId: number | null = null;
    let running = false;

    const tick = async () => {
      if (cancelled || running || !appForegroundRef.current) return;
      running = true;
      try {
        const registration = await registerCompanionHost({
          relayUrl: companionHost.relayUrl,
          source: 'polaris',
          label: companionHost.label,
          hostId: companionHost.hostId,
          hostSecret: companionHost.hostSecret
        });
        if (cancelled) return;
        setCompanionHost({
          hostId: registration.hostId,
          hostSecret: registration.hostSecret,
          pairCode: registration.pairCode,
          lastRegisteredAt: registration.registeredAt,
          error: null
        });
        const snapshot = buildHostSnapshot();
        await publishCompanionSnapshot({
          relayUrl: companionHost.relayUrl,
          hostId: registration.hostId,
          hostSecret: registration.hostSecret,
          snapshot: {
            ...snapshot,
            hostId: registration.hostId,
            hostLabel: registration.label
          }
        });
        const latestRuntimeState = useRuntimeStore.getState();
        await publishCompanionAutomationRules({
          relayUrl: companionHost.relayUrl,
          hostId: registration.hostId,
          hostSecret: registration.hostSecret,
          rules: latestRuntimeState.triggerRules.map((rule) => ({
            id: rule.id,
            name: rule.name,
            enabled: rule.enabled,
            webhookSecret: rule.webhookSecret,
            schedule: rule.schedule,
            target: rule.target,
            action: rule.action,
            lastRunAt: rule.lastRunAt,
            nextRunAt: rule.nextRunAt,
            updatedAt: rule.updatedAt
          }))
        });
        if (!sendingRef.current) {
          const pending = await pullCompanionHostCommands({
            relayUrl: companionHost.relayUrl,
            hostId: registration.hostId,
            hostSecret: registration.hostSecret
          });
          for (const command of pending.commands) {
            if (cancelled) break;
            sendingRef.current = true;
            try {
              await runCompanionHostCommand(
                command,
                abortControllerRef,
                streamingLifecycleReleaseRef,
                (value) => {
                  sendingRef.current = value;
                },
                () => {}
              );
            } finally {
              sendingRef.current = false;
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setCompanionHost({
            error: error instanceof Error ? error.message : tRef.current('companion.hostSyncFailed')
          });
        }
      } finally {
        running = false;
      }
    };

    void tick();
    timerId = window.setInterval(() => {
      void tick();
    }, resolveCompanionSyncInterval(activeWorld));

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [
    chatHydrated,
    collectionHydrated,
    companionHost.enabled,
    companionHost.hostId,
    companionHost.hostSecret,
    companionHost.label,
    companionHost.relayUrl,
    activeWorld,
    enabled,
    personaHydrated,
    runtimeHydrated,
    setCompanionHost
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!runtimeHydrated || !companionConnectionSyncKey) return;
    let cancelled = false;
    let timerId: number | null = null;
    let running = false;

    const syncConnection = async (connectionId: string) => {
      const connection = useRuntimeStore.getState().companionConnections.find((entry) => entry.id === connectionId);
      if (!connection) return;
      try {
        const response = await fetchCompanionClientSnapshot({
          relayUrl: connection.relayUrl,
          hostId: connection.hostId,
          clientId: connection.clientId,
          clientSecret: connection.clientSecret
        });
        if (cancelled) return;
        const chatState = useChatStore.getState();
        const existingConversation = chatState.conversations.find((conversation) => conversation.id === connection.conversationId) ?? null;
        const acceptSnapshot = response.snapshot
          ? shouldAcceptCompanionSnapshot(existingConversation, response.snapshot)
          : true;
        const runtimeState = useRuntimeStore.getState();
        if (
          acceptSnapshot
          && shouldStoreCompanionSnapshot(runtimeState.companionSnapshots[connection.id] ?? null, response.snapshot)
        ) {
          setCompanionSnapshot(connection.id, response.snapshot);
        }
        const connectionPatch = resolveCompanionConnectionPatch(connection, response, { acceptSnapshot });
        if (connectionPatch) {
          updateCompanionConnection(connection.id, connectionPatch);
        }
        if (connection.source === 'polaris') {
          const latestRuntimeState = useRuntimeStore.getState();
          await publishCompanionClientAutomationRules({
            relayUrl: connection.relayUrl,
            hostId: connection.hostId,
            clientId: connection.clientId,
            clientSecret: connection.clientSecret,
            rules: latestRuntimeState.triggerRules.map((rule) => ({
              id: rule.id,
              name: rule.name,
              enabled: rule.enabled,
              webhookSecret: rule.webhookSecret,
              schedule: rule.schedule,
              target: rule.target,
              action: rule.action,
              lastRunAt: rule.lastRunAt,
              nextRunAt: rule.nextRunAt,
              updatedAt: rule.updatedAt
            }))
          });
        }
        if (!existingConversation) return;
        if (response.snapshot && acceptSnapshot) {
          const remoteTitle = response.snapshot.conversationTitle?.trim() || connection.label;
          const localTitle = connection.conversationLabel?.trim() || '';
          const previousRemoteTitle = connection.remoteConversationLabel?.trim() || '';
          const canAdoptRemoteTitle = !localTitle && (
            existingConversation.title === '新对话'
            || existingConversation.title === remoteTitle
            || (!!previousRemoteTitle && existingConversation.title === previousRemoteTitle)
          );
          const nextTitle = localTitle || (canAdoptRemoteTitle ? remoteTitle : existingConversation.title);
          if (nextTitle && nextTitle !== existingConversation.title) {
            chatState.renameConversation(connection.conversationId, nextTitle);
          }
          const collaboratorLabel = connection.collaboratorLabel?.trim() || '';
          const nextMessages = reconcileCompanionConversationMessages(
            existingConversation.messages,
            response.snapshot.messages.map(stripCompanionMessage).map((message) => (
              collaboratorLabel && message.role === 'assistant'
                ? { ...message, assistantName: collaboratorLabel }
                : message
            ))
          );
          if (!areCompanionMessageListsEqual(existingConversation.messages, nextMessages)) {
            const writableConversation = await chatState.ensureConversationWritable(connection.conversationId);
            if (!writableConversation) return;
            chatState.replaceConversationMessages(writableConversation, nextMessages);
          }
        }
      } catch (error) {
        if (!cancelled) {
          updateCompanionConnection(connectionId, {
            lastError: error instanceof Error ? error.message : tRef.current('companion.snapshotSyncFailed')
          });
        }
      }
    };

    const tick = async () => {
      if (running || !appForegroundRef.current) return;
      running = true;
      try {
        for (const connection of useRuntimeStore.getState().companionConnections) {
          if (cancelled) return;
          await syncConnection(connection.id);
        }
      } finally {
        running = false;
      }
    };

    void tick();
    timerId = window.setInterval(() => {
      void tick();
    }, resolveCompanionSyncInterval(activeWorld));

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [activeWorld, companionConnectionSyncKey, enabled, runtimeHydrated, setCompanionSnapshot, updateCompanionConnection]);
}
