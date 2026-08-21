import { useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useRuntimeStore } from '../../stores/runtimeStore';

/**
 * Temporary, opt-in on-screen readout for diagnosing why the companion
 * "live thinking" indicator does or doesn't stay visible during a plain
 * (no tool call) reply. Only renders when the page URL has
 * ?debugStreaming=1, so it stays invisible in normal use. Safe to delete
 * once the underlying streaming-visibility issue is understood.
 */
export function CompanionStreamingDebugBadge() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEnabled(new URLSearchParams(window.location.search).get('debugStreaming') === '1');
  }, []);

  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const companionConnections = useRuntimeStore((state) => state.companionConnections);
  const companionSnapshots = useRuntimeStore((state) => state.companionSnapshots);

  if (!enabled) return null;

  const connection = companionConnections.find((entry) => entry.conversationId === activeConversationId) ?? null;
  const snapshot = connection ? companionSnapshots[connection.id] ?? null : null;
  const lastMessage = snapshot && snapshot.messages.length > 0
    ? snapshot.messages[snapshot.messages.length - 1]
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        top: 'max(8px, env(safe-area-inset-top))',
        zIndex: 99999,
        maxWidth: '92vw',
        padding: '6px 8px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.82)',
        color: '#7CFC9A',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none'
      }}
    >
      {`connection=${connection ? connection.id : 'none'}
generating=${String(snapshot?.generating ?? 'n/a')}
snapshot.updatedAt=${snapshot?.updatedAt ?? 'n/a'}
messages.length=${snapshot?.messages.length ?? 'n/a'}
lastMsg.role=${lastMessage?.role ?? 'n/a'}
lastMsg.thinkingText=${(lastMessage?.thinkingText ?? '').slice(0, 24)}
lastMsg.content=${(lastMessage?.content ?? '').slice(0, 24)}
now=${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`}
    </div>
  );
}
