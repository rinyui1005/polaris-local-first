import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthenticationError,
  fetchHistory,
  mergeChatRecords,
  normalizeBaseUrl,
  sendMessage,
} from './api';
import { Markdown } from './Markdown';
import { clearConnectionSettings, loadConnectionSettings, saveConnectionSettings } from './storage';
import type { ChatRecord, ConnectionSettings } from './types';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'offline' | 'unauthorized';

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function SettingsSheet({
  initial,
  onSave,
  onCancel,
  onForget,
}: {
  initial: ConnectionSettings | null;
  onSave: (settings: ConnectionSettings) => Promise<void>;
  onCancel: (() => void) | null;
  onForget: (() => void) | null;
}) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || window.location.origin);
  const [token, setToken] = useState(initial?.token || '');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setTesting(true);
    try {
      const settings = { baseUrl: normalizeBaseUrl(baseUrl, window.location.origin), token: token.trim() };
      if (!settings.token) throw new Error('请填写访问密钥。');
      await onSave(settings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '连接失败，请稍后重试。');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="cc-sheet-backdrop" role="presentation">
      <form className="cc-settings" onSubmit={submit}>
        <div className="cc-settings-star" aria-hidden="true">✦</div>
        <p className="cc-eyebrow">POLARIS · CLAUDE CODE</p>
        <h1>连接你的房间</h1>
        <p className="cc-settings-copy">地址和密钥只保存在这台设备里，不会写进网页代码或 Git。</p>

        <label>
          <span>服务器地址</span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://你的地址"
          />
        </label>
        <label>
          <span>访问密钥</span>
          <input
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="只在这里填写"
          />
        </label>
        {error ? <p className="cc-form-error" role="alert">{error}</p> : null}
        <button className="cc-primary" type="submit" disabled={testing}>
          {testing ? '正在确认…' : '连接'}
        </button>
        {onCancel ? <button className="cc-secondary" type="button" onClick={onCancel}>取消</button> : null}
        {onForget ? <button className="cc-forget" type="button" onClick={onForget}>清除这台设备上的连接信息</button> : null}
      </form>
    </div>
  );
}

export function App() {
  const [settings, setSettings] = useState<ConnectionSettings | null>(() => loadConnectionSettings());
  const [editingSettings, setEditingSettings] = useState(() => !loadConnectionSettings());
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const shouldStickRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  const latestTimestamp = useMemo(() => records[records.length - 1]?.ts, [records]);

  const handleRequestError = useCallback((caught: unknown) => {
    if (caught instanceof AuthenticationError) {
      setConnection('unauthorized');
      setError(caught.message);
      return;
    }
    setConnection('offline');
    setError(caught instanceof Error ? caught.message : '连接暂时中断。');
  }, []);

  const refresh = useCallback(async (activeSettings: ConnectionSettings, since?: string) => {
    try {
      const next = await fetchHistory(activeSettings, since);
      setRecords((current) => mergeChatRecords(current, next));
      setConnection('connected');
      setError('');
    } catch (caught) {
      handleRequestError(caught);
      throw caught;
    }
  }, [handleRequestError]);

  useEffect(() => {
    if (!settings) return;
    setConnection('connecting');
    void refresh(settings).catch(() => undefined);
  }, [settings, refresh]);

  useEffect(() => {
    if (!settings || editingSettings) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh(settings, latestTimestamp).catch(() => undefined);
      }
    }, 2200);
    return () => window.clearInterval(timer);
  }, [editingSettings, latestTimestamp, refresh, settings]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || (!shouldStickRef.current && didInitialScrollRef.current)) return;
    timeline.scrollTo({ top: timeline.scrollHeight, behavior: didInitialScrollRef.current ? 'smooth' : 'auto' });
    didInitialScrollRef.current = true;
  }, [records]);

  const saveSettings = async (next: ConnectionSettings) => {
    setConnection('connecting');
    try {
      const initialRecords = await fetchHistory(next);
      saveConnectionSettings(next);
      setRecords(initialRecords);
      setSettings(next);
      setConnection('connected');
      setError('');
      setEditingSettings(false);
    } catch (caught) {
      handleRequestError(caught);
      throw caught;
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !settings || sending) return;
    setSending(true);
    setError('');
    shouldStickRef.current = true;
    try {
      const record = await sendMessage(settings, text);
      setDraft('');
      if (record) setRecords((current) => mergeChatRecords(current, [record]));
      await refresh(settings, latestTimestamp);
    } catch (caught) {
      handleRequestError(caught);
    } finally {
      setSending(false);
    }
  };

  const resetConnection = () => {
    clearConnectionSettings();
    setSettings(null);
    setRecords([]);
    setEditingSettings(true);
  };

  const connectionLabel = {
    idle: '尚未连接',
    connecting: '正在连接',
    connected: '已连接',
    offline: '网络暂不可用',
    unauthorized: '密钥需要更新',
  }[connection];

  return (
    <main className="cc-app">
      <header className="cc-header">
        <div>
          <span className={`cc-status-dot is-${connection}`} aria-hidden="true" />
          <div>
            <p className="cc-eyebrow">LAS RUINAS CIRCULARES</p>
            <h1>Claude Code</h1>
          </div>
        </div>
        <button className="cc-icon-button" type="button" onClick={() => setEditingSettings(true)} aria-label="连接设置">•••</button>
      </header>

      {error ? (
        <button className="cc-error-banner" type="button" onClick={() => settings && void refresh(settings).catch(() => undefined)}>
          <strong>{connectionLabel}</strong>
          <span>{error} 轻点重试</span>
        </button>
      ) : null}

      <div
        className="cc-timeline"
        ref={timelineRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldStickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        }}
      >
        {!records.length && connection === 'connecting' ? <div className="cc-empty"><span>✦</span><p>正在寻找聊天记录…</p></div> : null}
        {!records.length && connection === 'connected' ? <div className="cc-empty"><span>✦</span><p>这里还很安静。说点什么吧。</p></div> : null}
        {records.map((record) => (
          <article className={`cc-message is-${record.role}`} key={`${record.ts}-${record.role}-${record.turn_id || record.text}`}>
            <div className="cc-message-body"><Markdown text={record.text} /></div>
            <time dateTime={record.ts}>{formatTime(record.ts)}</time>
          </article>
        ))}
      </div>

      <form className="cc-composer" onSubmit={submit}>
        <textarea
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={connection === 'connected' ? '发消息给 Claude Code…' : connectionLabel}
          disabled={!settings || connection === 'unauthorized'}
          aria-label="消息"
        />
        <button type="submit" disabled={!draft.trim() || sending || connection === 'unauthorized'} aria-label="发送">
          {sending ? <span className="cc-spinner" /> : <span>↑</span>}
        </button>
      </form>

      {editingSettings ? (
        <SettingsSheet
          initial={settings}
          onSave={saveSettings}
          onCancel={settings ? () => setEditingSettings(false) : null}
          onForget={settings ? resetConnection : null}
        />
      ) : null}
    </main>
  );
}
