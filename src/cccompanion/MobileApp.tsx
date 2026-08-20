import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthenticationError,
  applySessionOptions,
  fetchHistory,
  fetchSessionOptions,
  fetchThinking,
  mergeChatRecords,
  normalizeBaseUrl,
  pollChat,
  sendMessage,
} from './api';
import { Markdown } from './Markdown';
import { buildTimelineItems, splitAssistantMessage } from './presentation';
import { clearConnectionSettings, loadConnectionSettings, saveConnectionSettings } from './storage';
import type { ChatRecord, CompanionStatus, ConnectionSettings, SessionOptions } from './types';

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
        <div className="cc-sheet-handle" aria-hidden="true" />
        <p className="cc-eyebrow">POLARIS · CLAUDE CODE</p>
        <h1>连接设置</h1>
        <p className="cc-settings-copy">地址和密钥只保存在这台设备里，不会写进网页代码或 Git。</p>
        <label>
          <span>服务器地址</span>
          <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://你的地址" />
        </label>
        <label>
          <span>访问密钥</span>
          <input type="password" autoCapitalize="none" autoCorrect="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="只在这里填写" />
        </label>
        {error ? <p className="cc-form-error" role="alert">{error}</p> : null}
        <button className="cc-primary" type="submit" disabled={testing}>{testing ? '正在确认…' : '保存连接'}</button>
        {onCancel ? <button className="cc-secondary" type="button" onClick={onCancel}>取消</button> : null}
        {onForget ? <button className="cc-forget" type="button" onClick={onForget}>清除这台设备上的连接信息</button> : null}
      </form>
    </div>
  );
}

function ModelSheet({ options, loading, error, onReload, onClose, onApply }: {
  options: SessionOptions | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  onClose: () => void;
  onApply: (next: SessionOptions['current']) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SessionOptions['current'] | null>(options?.current || null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (options) setDraft(options.current);
  }, [options]);

  const apply = async () => {
    if (!draft || !options?.configurable) return;
    setSaving(true);
    setSaveError('');
    try {
      await onApply(draft);
      onClose();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : '切换失败，请稍后再试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cc-sheet-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="cc-model-sheet" aria-label="模型与思考设置">
        <div className="cc-sheet-handle" aria-hidden="true" />
        <div className="cc-model-title">
          <div><p className="cc-eyebrow">CURRENT SESSION</p><h2>模型与思考</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        {loading ? <p className="cc-option-note">正在读取 Claude Code 当前提供的选项…</p> : null}
        {error ? <button className="cc-option-error" type="button" onClick={onReload}>{error}<span>轻点重试</span></button> : null}
        {options && draft ? (
          <>
            <fieldset className="cc-choice-group">
              <legend>模型</legend>
              <div className="cc-choice-grid">
                {options.models.map((choice) => (
                  <button type="button" className={draft.model === choice.id ? 'is-selected' : ''} onClick={() => setDraft((current) => current && ({ ...current, model: choice.id }))} key={choice.id}>
                    <strong>{choice.label}</strong>{choice.description ? <span>{choice.description}</span> : null}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="cc-choice-group">
              <legend>思考强度</legend>
              <div className="cc-choice-grid is-compact">
                {options.efforts.map((choice) => <button type="button" className={draft.effort === choice.id ? 'is-selected' : ''} onClick={() => setDraft((current) => current && ({ ...current, effort: choice.id }))} key={choice.id}>{choice.label}</button>)}
              </div>
            </fieldset>
            <label className="cc-thinking-toggle">
              <span><strong>显示 Thinking</strong><small>折叠展示 Claude Code 提供的思考摘要</small></span>
              <input type="checkbox" checked={draft.thinking} onChange={(event) => setDraft((current) => current && ({ ...current, thinking: event.target.checked }))} />
            </label>
            {options.note ? <p className="cc-option-note">{options.note}</p> : null}
            {saveError ? <p className="cc-form-error" role="alert">{saveError}</p> : null}
            <button className="cc-primary" type="button" onClick={() => void apply()} disabled={!options.configurable || saving}>
              {saving ? '正在切换…' : options.configurable ? '应用到当前会话' : '当前只读'}
            </button>
          </>
        ) : null}
      </section>
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  return <details className="cc-thinking"><summary><span>✦</span><em>thinking</em><b>›</b></summary><div><Markdown text={text} /></div></details>;
}

function ToolActivity({ records }: { records: ChatRecord[] }) {
  return (
    <details className="cc-tools">
      <summary><span>⌁</span> 使用 {records.length} 个工具 <b>›</b></summary>
      <ul>{records.map((record) => <li key={`${record.ts}-${record.text}`}>{record.text}</li>)}</ul>
    </details>
  );
}

function ChatMessage({ record, thinking, showThinking }: { record: ChatRecord; thinking?: string; showThinking: boolean }) {
  const bubbles = record.role === 'assistant' ? splitAssistantMessage(record.text) : [record.text];
  return (
    <article className={`cc-message is-${record.role}`}>
      {record.role === 'assistant' && thinking && showThinking ? <ThinkingBlock text={thinking} /> : null}
      <div className="cc-bubble-stack">
        {bubbles.map((bubble, index) => <div className="cc-message-body" key={`${record.ts}-${index}`}><Markdown text={bubble} /></div>)}
      </div>
      <time dateTime={record.ts}>{formatTime(record.ts)}</time>
    </article>
  );
}

export function MobileApp() {
  const [settings, setSettings] = useState<ConnectionSettings | null>(() => loadConnectionSettings());
  const [editingSettings, setEditingSettings] = useState(() => !loadConnectionSettings());
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [sessionOptions, setSessionOptions] = useState<SessionOptions | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [thinkingByTurn, setThinkingByTurn] = useState<Record<string, string>>({});
  const [companionStatus, setCompanionStatus] = useState<CompanionStatus>({});
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const thinkingAttemptsRef = useRef<Record<string, number>>({});

  const latestTimestamp = useMemo(() => records[records.length - 1]?.ts, [records]);
  const timelineItems = useMemo(() => buildTimelineItems(records), [records]);

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
      const next = await pollChat(activeSettings, since);
      setRecords((current) => mergeChatRecords(current, next.records));
      setCompanionStatus(next.status);
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
    void fetchHistory(settings).then((initialRecords) => {
      setRecords(initialRecords);
      setConnection('connected');
      setError('');
      return refresh(settings, initialRecords[initialRecords.length - 1]?.ts);
    }).catch(handleRequestError);
  }, [settings, refresh, handleRequestError]);

  useEffect(() => {
    if (!settings || editingSettings) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(settings, latestTimestamp).catch(() => undefined);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [editingSettings, latestTimestamp, refresh, settings]);

  useEffect(() => {
    if (!settings) return;
    const findThinking = () => {
      const turnIds = records.filter((record) => record.role === 'assistant' && record.turn_id).slice(-12).map((record) => record.turn_id as string).filter((turnId) => !thinkingByTurn[turnId] && (thinkingAttemptsRef.current[turnId] || 0) < 20);
      turnIds.forEach((turnId) => {
        thinkingAttemptsRef.current[turnId] = (thinkingAttemptsRef.current[turnId] || 0) + 1;
        void fetchThinking(settings, turnId).then((text) => {
          if (text) setThinkingByTurn((current) => ({ ...current, [turnId]: text }));
        }).catch(() => undefined);
      });
    };
    findThinking();
    const timer = window.setInterval(findThinking, 3000);
    return () => window.clearInterval(timer);
  }, [records, settings, thinkingByTurn]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || (!shouldStickRef.current && didInitialScrollRef.current)) return;
    timeline.scrollTo({ top: timeline.scrollHeight, behavior: didInitialScrollRef.current ? 'smooth' : 'auto' });
    didInitialScrollRef.current = true;
  }, [records, thinkingByTurn]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft]);

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

  const loadSessionOptions = useCallback(() => {
    if (!settings) return;
    setSessionLoading(true);
    setSessionError('');
    void fetchSessionOptions(settings).then(setSessionOptions).catch((caught) => setSessionError(caught instanceof Error ? caught.message : '读取选项失败。')).finally(() => setSessionLoading(false));
  }, [settings]);

  useEffect(() => {
    if (modelSheetOpen) loadSessionOptions();
  }, [loadSessionOptions, modelSheetOpen]);

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

  const connectionLabel = companionStatus.typing ? '正在回复' : ({ idle: '尚未连接', connecting: '正在连接', connected: '连着呢', offline: '网络暂不可用', unauthorized: '密钥需要更新' }[connection]);
  const modelLabel = sessionOptions?.models.find((choice) => choice.id === sessionOptions.current.model)?.label || sessionOptions?.current.model || 'Claude';

  return (
    <main className="cc-app">
      <header className="cc-header">
        <div className="cc-identity">
          <div className="cc-avatar" aria-hidden="true">L</div>
          <div className="cc-identity-copy">
            <div className="cc-name-row"><h1>Lyko</h1><button className="cc-model-pill" type="button" onClick={() => setModelSheetOpen(true)}>{modelLabel}<span>⌄</span></button></div>
            <p><span className={`cc-status-dot is-${connection}`} aria-hidden="true" />{connectionLabel}</p>
          </div>
        </div>
        <button className="cc-icon-button" type="button" onClick={() => setEditingSettings(true)} aria-label="连接设置">⋯</button>
      </header>

      {error ? <button className="cc-error-banner" type="button" onClick={() => settings && void refresh(settings).catch(() => undefined)}><strong>{connectionLabel}</strong><span>{error} 轻点重试</span></button> : null}

      <div className="cc-timeline" ref={timelineRef} onScroll={(event) => {
        const element = event.currentTarget;
        shouldStickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
      }}>
        {!records.length && connection === 'connecting' ? <div className="cc-empty"><span>✦</span><p>正在寻找聊天记录…</p></div> : null}
        {!records.length && connection === 'connected' ? <div className="cc-empty"><span>✦</span><p>这里还很安静。说点什么吧。</p></div> : null}
        {timelineItems.map((item) => item.type === 'tools'
          ? <ToolActivity records={item.records} key={item.id} />
          : <ChatMessage
              record={item.record}
              thinking={item.record.turn_id ? thinkingByTurn[item.record.turn_id] : undefined}
              showThinking={sessionOptions?.current.thinking !== false}
              key={`${item.record.ts}-${item.record.role}-${item.record.turn_id || item.record.text}`}
            />)}
      </div>

      <form className="cc-composer" onSubmit={submit}>
        <textarea ref={textareaRef} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={connection === 'connected' ? '和 Lyko 说点什么…' : connectionLabel} disabled={!settings || connection === 'unauthorized'} aria-label="消息" />
        <button type="submit" disabled={!draft.trim() || sending || connection === 'unauthorized'} aria-label="发送">{sending ? <span className="cc-spinner" /> : <span>➤</span>}</button>
      </form>

      {editingSettings ? <SettingsSheet initial={settings} onSave={saveSettings} onCancel={settings ? () => setEditingSettings(false) : null} onForget={settings ? resetConnection : null} /> : null}
      {modelSheetOpen ? <ModelSheet options={sessionOptions} loading={sessionLoading} error={sessionError} onReload={loadSessionOptions} onClose={() => setModelSheetOpen(false)} onApply={async (next) => {
        if (!settings) return;
        const updated = await applySessionOptions(settings, next);
        setSessionOptions(updated);
      }} /> : null}
    </main>
  );
}
