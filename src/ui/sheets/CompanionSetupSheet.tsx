import { useMemo, useState } from 'react';
import { RuntimePerformanceSurfaceMounted } from '../runtime-performance/RuntimePerformanceSurfaceSignals';
import {
  connectCompanionFromPairCode,
  disconnectCompanionConnection,
  stopPublishingCompanionHost
} from '../../app/companion/companionConnectionActions';
import {
  COMPANION_RELAY_LOCAL_PLACEHOLDER,
  resolveCompanionRelayPlaceholder,
  resolveDefaultCompanionRelayUrl
} from '../../engines/companionApi';
import { enterChatWorld } from '../../app/shell/frontstageNavigation';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useChatStore } from '../../stores/chatStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { writeTextToClipboard } from '../../infrastructure/clipboard';
import { Icon } from '../Icon';

type CompanionSetupSheetProps = {
  open: boolean;
  onClose: () => void;
};

const codexBridgeInstallCommand = 'npm run codex:bridge:install';

export function CompanionSetupSheet({ open, onClose }: CompanionSetupSheetProps) {
  const companionHost = useRuntimeStore((state) => state.companionHost);
  const companionConnections = useRuntimeStore((state) => state.companionConnections);
  const companionSnapshots = useRuntimeStore((state) => state.companionSnapshots);
  const setCompanionHost = useRuntimeStore((state) => state.setCompanionHost);
  const [cccSecret, setCccSecret] = useState('');
  const [clientRelayUrl, setClientRelayUrl] = useState(() => resolveDefaultCompanionRelayUrl());
  const [pairCode, setPairCode] = useState('');
  const [commandStatus, setCommandStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [codexBridgeCopyState, setCodexBridgeCopyState] = useState<'idle' | 'install' | 'run' | 'failed'>('idle');
  const [connecting, setConnecting] = useState(false);
  const [disconnectingHost, setDisconnectingHost] = useState(false);
  const [disconnectingConnectionId, setDisconnectingConnectionId] = useState<string | null>(null);

  const sortedConnections = useMemo(
    () => [...companionConnections].sort((left, right) => right.createdAt - left.createdAt),
    [companionConnections]
  );
  const codexBridgeCommand = useMemo(() => {
    const relayUrl = (clientRelayUrl.trim() || companionHost.relayUrl.trim() || resolveDefaultCompanionRelayUrl()).trim();
    if (!relayUrl) return `polaris-codex-bridge --relay-url ${COMPANION_RELAY_LOCAL_PLACEHOLDER}`;
    return `polaris-codex-bridge --relay-url ${relayUrl}`;
  }, [clientRelayUrl, companionHost.relayUrl]);

  const copyCodexBridgeCommand = async (command: string, kind: 'install' | 'run') => {
    try {
      await writeTextToClipboard(command);
      setCodexBridgeCopyState(kind);
    } catch {
      setCodexBridgeCopyState('failed');
    }
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="settings-sheet companion-setup-sheet">
        <RuntimePerformanceSurfaceMounted surface="companion-setup" />
        <div className="ps-topbar">
          <div className="ps-topbar-left">
            <span className="ps-topbar-title">连接电脑端</span>
            <span className="ps-topbar-sub">特殊协作者入口</span>
          </div>
          <button type="button" className="ps-topbar-close" onClick={onClose}>✕</button>
        </div>

        <div className="companion-setup-stack">
          <section className="companion-setup-intro">
            <span className="companion-setup-kicker">Remote Companion</span>
            <h2>这里接的是你自己的电脑端。</h2>
            <p>一人一器：电脑是 relay 和执行宿主，手机只是接管入口。消息正文默认不走 Polaris 官方服务器，除非你主动把 Relay 地址填成那条公共服务。</p>
          </section>

          <section className="ps-section companion-provider-card companion-provider-card--priority">
            <div className="companion-provider-card-head">
              <span className="companion-provider-kicker">VPS Claude Code</span>
              <strong>连接你的 CcCompanion</strong>
            </div>
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
            {commandStatus ? (
              <small className={commandStatus.isError ? 'ps-error' : 'ps-success'}>{commandStatus.text}</small>
            ) : null}
          </section>

          <section className="ps-section companion-provider-card companion-provider-card--priority">
            <div className="companion-provider-card-head">
              <span className="companion-provider-kicker">先做这条</span>
              <strong>把这台电脑设为 Relay</strong>
            </div>
            <p>在电脑上跑自己的 Polaris selfhost，或者用 Tailscale / Cloudflare Tunnel 给这台电脑一个 HTTPS 地址。手机端拿着这个地址和配对码连进来。</p>
            <label className="ps-field">
              <span>Relay 地址</span>
              <input
                className="ps-input"
                value={companionHost.relayUrl}
                onChange={(event) => setCompanionHost({ relayUrl: event.target.value })}
                placeholder={resolveCompanionRelayPlaceholder()}
              />
            </label>
            <label className="ps-field">
              <span>设备名称</span>
              <input
                className="ps-input"
                value={companionHost.label}
                onChange={(event) => setCompanionHost({ label: event.target.value })}
                placeholder="这台 Polaris"
              />
            </label>
            <div className="companion-provider-actions">
              <button
                type="button"
                className="ps-primary"
                onClick={() => {
                  const relayUrl = companionHost.relayUrl.trim() || resolveDefaultCompanionRelayUrl();
                  if (!relayUrl) {
                    setCommandStatus({ text: '先填这台电脑自己的 relay 地址，不默认走 Polaris 官方服务器。', isError: true });
                    return;
                  }
                  setCompanionHost({
                    enabled: true,
                    relayUrl,
                    error: null
                  });
                  setCommandStatus({ text: '这台电脑已开始作为你的私有 relay，等一两秒配对码就会出来。', isError: false });
                }}
              >
                启动这台 Relay
              </button>
              <button
                type="button"
                className="ps-secondary"
                disabled={disconnectingHost}
                onClick={() => {
                  if (disconnectingHost) return;
                  setDisconnectingHost(true);
                  void stopPublishingCompanionHost()
                    .then(() => {
                      setCommandStatus({ text: '已经收起这台电脑的 relay 发布。', isError: false });
                    })
                    .catch((error) => {
                      setCommandStatus({
                        text: error instanceof Error ? error.message : '关闭电脑 relay 失败。',
                        isError: true
                      });
                    })
                    .finally(() => {
                      setDisconnectingHost(false);
                    });
                }}
              >
                {disconnectingHost ? '关闭中…' : '关闭 Relay'}
              </button>
            </div>
            <div className="companion-provider-meta">
              <span>状态：{companionHost.enabled ? '已开启' : '未开启'}</span>
              <span>配对码：{companionHost.pairCode ?? '等待注册'}</span>
            </div>
            {companionHost.error ? <small className="ps-error">{companionHost.error}</small> : null}
          </section>

          <section className="ps-section companion-provider-card companion-provider-card--priority">
            <div className="companion-provider-card-head">
              <span className="companion-provider-kicker">手机端入口</span>
              <strong>连接另一台电脑端</strong>
            </div>
            <label className="ps-field">
              <span>Relay 地址</span>
              <input
                className="ps-input"
                value={clientRelayUrl}
                onChange={(event) => setClientRelayUrl(event.target.value)}
                placeholder={resolveCompanionRelayPlaceholder()}
              />
            </label>
            <label className="ps-field">
              <span>配对码</span>
              <input
                className="ps-input"
                value={pairCode}
                onChange={(event) => setPairCode(event.target.value.toUpperCase())}
                placeholder="输入电脑端给你的 6 位码"
              />
            </label>
            <div className="companion-provider-actions">
              <button
                type="button"
                className="ps-primary"
                disabled={connecting}
                onClick={() => {
                  if (connecting) return;
                  const relayUrl = clientRelayUrl.trim() || resolveDefaultCompanionRelayUrl();
                  if (!relayUrl) {
                    setCommandStatus({ text: '先填对方电脑的 relay 地址，不默认走 Polaris 官方服务器。', isError: true });
                    return;
                  }
                  setConnecting(true);
                  setCommandStatus(null);
                  void connectCompanionFromPairCode({
                    relayUrl,
                    pairCode: pairCode.trim(),
                    label: '手机端'
                  })
                    .then(() => {
                      setPairCode('');
                      setCommandStatus({ text: '已经连上了，现在它会作为一个特殊协作者出现在聊天里。', isError: false });
                      onClose();
                    })
                    .catch((error) => {
                      setCommandStatus({
                        text: error instanceof Error ? error.message : 'Companion 连接失败。',
                        isError: true
                      });
                    })
                    .finally(() => {
                      setConnecting(false);
                    });
                }}
              >
                {connecting ? '连接中…' : '连接电脑端'}
              </button>
            </div>
            {commandStatus ? (
              <small className={commandStatus.isError ? 'ps-error' : 'ps-success'}>{commandStatus.text}</small>
            ) : null}
          </section>

          <section className="ps-section companion-provider-card companion-provider-card--priority">
            <div className="companion-provider-card-head">
              <span className="companion-provider-kicker">本地 bridge</span>
              <strong>连接 Codex 电脑端</strong>
            </div>
            <p>先打开电脑上的 Codex 线程，再在终端运行 bridge。它只连接已打开的桌面线程并打印 6 位配对码；relay 地址也应该是你这台电脑自己的地址。</p>
            <div className="companion-bridge-commands">
              <div className="companion-bridge-command-row">
                <span className="companion-bridge-command-label">首次安装</span>
                <code>{codexBridgeInstallCommand}</code>
                <button
                  type="button"
                  className="companion-bridge-copy"
                  onClick={() => { void copyCodexBridgeCommand(codexBridgeInstallCommand, 'install'); }}
                  aria-label="复制 Codex bridge 安装命令"
                >
                  <Icon name="copy" size={13} />
                  <span>{codexBridgeCopyState === 'install' ? '已复制' : '复制'}</span>
                </button>
              </div>
              <div className="companion-bridge-command-row">
                <span className="companion-bridge-command-label">启动连接</span>
                <code>{codexBridgeCommand}</code>
                <button
                  type="button"
                  className="companion-bridge-copy"
                  onClick={() => { void copyCodexBridgeCommand(codexBridgeCommand, 'run'); }}
                  aria-label="复制 Codex bridge 启动命令"
                >
                  <Icon name="copy" size={13} />
                  <span>{codexBridgeCopyState === 'run' ? '已复制' : '复制'}</span>
                </button>
              </div>
            </div>
            {codexBridgeCopyState === 'failed' ? (
              <small className="ps-error">复制失败，可以手动选中命令。</small>
            ) : null}
          </section>

          {sortedConnections.length > 0 ? (
            <section className="ps-section companion-provider-card companion-provider-card--priority">
              <div className="companion-provider-card-head">
                <span className="companion-provider-kicker">已连接</span>
                <strong>电脑端协作者</strong>
              </div>
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
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
