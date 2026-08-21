import { useMemo, useState } from 'react';
import { RuntimePerformanceSurfaceMounted } from '../runtime-performance/RuntimePerformanceSurfaceSignals';
import {
  connectCompanionFromPairCode,
  disconnectCompanionConnection
} from '../../app/companion/companionConnectionActions';
import { enterChatWorld } from '../../app/shell/frontstageNavigation';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useChatStore } from '../../stores/chatStore';
import { useSpaceStore } from '../../stores/spaceStore';

type CompanionSetupSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function CompanionSetupSheet({ open, onClose }: CompanionSetupSheetProps) {
  const companionConnections = useRuntimeStore((state) => state.companionConnections);
  const companionSnapshots = useRuntimeStore((state) => state.companionSnapshots);
  const updateCompanionConnection = useRuntimeStore((state) => state.updateCompanionConnection);
  const [cccSecret, setCccSecret] = useState('');
  const [commandStatus, setCommandStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingConnectionId, setDisconnectingConnectionId] = useState<string | null>(null);

  const sortedConnections = useMemo(
    () => [...companionConnections].sort((left, right) => right.createdAt - left.createdAt),
    [companionConnections]
  );

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="settings-sheet companion-setup-sheet">
        <RuntimePerformanceSurfaceMounted surface="companion-setup" />
        <div className="ps-topbar">
          <div className="ps-topbar-left">
            <span className="ps-topbar-title">连接 Companion</span>
            <span className="ps-topbar-sub">特殊协作者入口</span>
          </div>
          <button type="button" className="ps-topbar-close" onClick={onClose}>✕</button>
        </div>

        <div className="companion-setup-stack">
          <section className="companion-setup-intro">
            <span className="companion-setup-kicker">Remote Companion</span>
            <h2>这里接的是你自己的电脑端。</h2>
            <p>一人一器：电脑是执行宿主，手机只是接管入口。消息正文默认不走 Polaris 官方服务器。</p>
          </section>

          <section className="ps-section companion-provider-card companion-provider-card--priority">
            <div className="companion-provider-card-head">
              <span className="companion-provider-kicker">VPS Claude Code</span>
              <strong>连接</strong>
            </div>
            {sortedConnections.length === 0 ? (
              <>
                <p>输入现有的 CCC 访问密钥即可。密钥只保存在这台设备的 Polaris 数据中，不会写进网页源码或 Git。</p>
                <label className="ps-field">
                  <span>CCC 访问密钥</span>
                  <input
                    className="ps-input"
                    type="password"
                    value={cccSecret}
                    onChange={(event) => setCccSecret(event.target.value)}
                    placeholder="输入你的 shared_secret"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <div className="companion-provider-actions">
                  <button
                    type="button"
                    className="ps-primary"
                    disabled={connecting || !cccSecret.trim()}
                    onClick={() => {
                      if (connecting || typeof window === 'undefined') return;
                      setConnecting(true);
                      setCommandStatus(null);
                      void connectCompanionFromPairCode({
                        relayUrl: window.location.origin,
                        pairCode: cccSecret.trim(),
                        label: 'iPhone'
                      })
                        .then(() => {
                          setCccSecret('');
                          setCommandStatus({ text: 'Claude Code 已连接，正在打开实时会话。', isError: false });
                          onClose();
                        })
                        .catch((error) => {
                          setCommandStatus({
                            text: error instanceof Error ? error.message : 'CCC 连接失败。',
                            isError: true
                          });
                        })
                        .finally(() => {
                          setConnecting(false);
                        });
                    }}
                  >
                    {connecting ? '连接中…' : '连接 Claude Code'}
                  </button>
                </div>
              </>
            ) : (
              <div className="companion-connected-list">
                {sortedConnections.map((connection) => {
                  const snapshot = companionSnapshots[connection.id] ?? null;
                  return (
                    <article key={connection.id} className="companion-connected-item">
                      <div>
                        <strong>{connection.label}</strong>
                        <div className="companion-provider-meta">
                          <span>{connection.source === 'codex' ? 'Codex' : 'Polaris'}</span>
                          <span>{connection.relayUrl}</span>
                          <span>{snapshot?.collaboratorName ?? '等待电脑端快照'}</span>
                        </div>
                      </div>
                      <div className="companion-provider-actions">
                        <button
                          type="button"
                          className="ps-secondary"
                          onClick={() => {
                            if (useChatStore.getState().activeConversationId !== connection.conversationId) {
                              useSpaceStore.getState().clearPendingAttachments();
                              useSpaceStore.getState().clearPendingCardReference();
                            }
                            useChatStore.getState().setActiveConversation(connection.conversationId);
                            useSpaceStore.getState().setFrontstageCollaboratorId(connection.collaboratorId);
                            enterChatWorld(useSpaceStore.getState());
                            onClose();
                          }}
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          className="ps-secondary"
                          disabled={disconnectingConnectionId === connection.id}
                          onClick={() => {
                            if (disconnectingConnectionId === connection.id) return;
                            setDisconnectingConnectionId(connection.id);
                            void disconnectCompanionConnection(connection.id)
                              .then(() => {
                                setCommandStatus({ text: '已经断开这个电脑端协作者了。', isError: false });
                              })
                              .catch((error) => {
                                setCommandStatus({
                                  text: error instanceof Error ? error.message : '断开 companion 失败。',
                                  isError: true
                                });
                              })
                              .finally(() => {
                                setDisconnectingConnectionId(null);
                              });
                          }}
                        >
                          {disconnectingConnectionId === connection.id ? '断开中…' : '断开'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {commandStatus ? (
              <small className={commandStatus.isError ? 'ps-error' : 'ps-success'}>{commandStatus.text}</small>
            ) : null}
          </section>

          {sortedConnections.length > 0 ? (
            <section className="ps-section companion-provider-card companion-provider-card--priority">
              <div className="companion-provider-card-head">
                <span className="companion-provider-kicker">显示名</span>
                <strong>聊天对象的名字</strong>
              </div>
              <p>Claude 回复上方显示的名字，跟房间名是两回事，只影响这里怎么称呼它。</p>
              <div className="companion-connected-list">
                {sortedConnections.map((connection) => {
                  const snapshot = companionSnapshots[connection.id] ?? null;
                  const collaboratorLabel = connection.collaboratorLabel?.trim()
                    || snapshot?.collaboratorName?.trim()
                    || 'Claude Code';
                  return (
                    <label key={connection.id} className="ps-field">
                      <span>{connection.label}</span>
                      <input
                        key={`${connection.id}:collaborator:${collaboratorLabel}`}
                        className="ps-input"
                        defaultValue={collaboratorLabel}
                        onBlur={(event) => {
                          const label = event.target.value.trim();
                          if (!label) {
                            event.target.value = collaboratorLabel;
                            return;
                          }
                          updateCompanionConnection(connection.id, { collaboratorLabel: label });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
