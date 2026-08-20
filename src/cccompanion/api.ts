import type {
  ChatRecord,
  CompanionStatus,
  ConnectionSettings,
  SessionOptions,
  ThinkingRecord,
} from './types';

type HistoryResponse = {
  ok?: boolean;
  records?: unknown;
  count?: number;
  error?: string;
};

type SendResponse = {
  ok?: boolean;
  record?: unknown;
  error?: string;
};

type PollResponse = {
  ok?: boolean;
  chat?: {
    new_records?: unknown;
    last_ts?: string | null;
  };
  status?: CompanionStatus;
  error?: string;
};

type ThinkingResponse = {
  ok?: boolean;
  records?: unknown;
  error?: string;
};

type SessionOptionsResponse = Partial<SessionOptions> & {
  ok?: boolean;
  error?: string;
};

export class AuthenticationError extends Error {
  constructor() {
    super('访问密钥不正确，请重新填写。');
    this.name = 'AuthenticationError';
  }
}

export class CompanionRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'CompanionRequestError';
    this.status = status;
  }
}

export function normalizeBaseUrl(raw: string, fallbackOrigin = '') {
  const candidate = raw.trim() || fallbackOrigin.trim();
  if (!candidate) {
    throw new Error('请填写服务器地址。');
  }

  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('服务器地址必须以 https:// 或 http:// 开头。');
  }
  return url.toString().replace(/\/$/, '');
}

function isChatRecord(value: unknown): value is ChatRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.role === 'string'
    && typeof record.text === 'string'
    && typeof record.ts === 'string';
}

function isThinkingRecord(value: unknown): value is ThinkingRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.thinking === 'string';
}

function buildUrl(settings: ConnectionSettings, path: string) {
  return `${normalizeBaseUrl(settings.baseUrl)}${path}`;
}

async function requestJson<T>(settings: ConnectionSettings, path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(buildUrl(settings, path), {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-Auth-Token': settings.token,
        ...init?.headers,
      },
    });
  } catch {
    throw new CompanionRequestError('暂时连不上服务器，请检查网络后重试。');
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthenticationError();
  }

  let body: T;
  try {
    body = await response.json() as T;
  } catch {
    throw new CompanionRequestError('服务器返回了无法识别的内容。', response.status);
  }

  if (!response.ok) {
    const error = body as { error?: unknown };
    const message = typeof error.error === 'string' ? error.error : `请求失败（${response.status}）`;
    throw new CompanionRequestError(message, response.status);
  }

  return body;
}

export async function fetchHistory(settings: ConnectionSettings, since?: string) {
  const query = since
    ? `?since=${encodeURIComponent(since)}&limit=200`
    : '?limit=200';
  const body = await requestJson<HistoryResponse>(settings, `/chat/history${query}`);
  if (!Array.isArray(body.records)) {
    throw new CompanionRequestError(body.error || '聊天记录格式不正确。');
  }
  return body.records.filter(isChatRecord);
}

export async function pollChat(settings: ConnectionSettings, since?: string) {
  const query = since ? `?since=${encodeURIComponent(since)}&limit=200` : '?limit=200';
  const body = await requestJson<PollResponse>(settings, `/chat/poll${query}`);
  const incoming = body.chat?.new_records;
  if (!Array.isArray(incoming)) {
    throw new CompanionRequestError(body.error || '聊天更新格式不正确。');
  }
  return {
    records: incoming.filter(isChatRecord),
    status: body.status || {},
    lastTimestamp: body.chat?.last_ts || undefined,
  };
}

export async function fetchThinking(settings: ConnectionSettings, turnId: string) {
  const body = await requestJson<ThinkingResponse>(
    settings,
    `/v1/thinking?turn_id=${encodeURIComponent(turnId)}&limit=50`,
  );
  if (!Array.isArray(body.records)) return '';
  return body.records
    .filter(isThinkingRecord)
    .map((record) => record.thinking.trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function fetchSessionOptions(settings: ConnectionSettings) {
  const body = await requestJson<SessionOptionsResponse>(settings, '/session/options');
  if (!body.current || !Array.isArray(body.models) || !Array.isArray(body.efforts)) {
    throw new CompanionRequestError(body.error || '暂时读不到 Claude Code 的运行选项。');
  }
  return body as SessionOptions;
}

export async function applySessionOptions(
  settings: ConnectionSettings,
  selection: SessionOptions['current'],
) {
  const body = await requestJson<SessionOptionsResponse>(settings, '/session/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection),
  });
  if (!body.current || !Array.isArray(body.models) || !Array.isArray(body.efforts)) {
    throw new CompanionRequestError(body.error || '切换会话设置失败。');
  }
  return body as SessionOptions;
}

export async function sendMessage(settings: ConnectionSettings, text: string) {
  const body = await requestJson<SendResponse>(settings, '/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return isChatRecord(body.record) ? body.record : null;
}

export function chatRecordKey(record: ChatRecord) {
  return `${record.turn_id || ''}\u0000${record.ts}\u0000${record.role}\u0000${record.text}`;
}

export function mergeChatRecords(current: ChatRecord[], incoming: ChatRecord[]) {
  if (!incoming.length) return current;

  const byKey = new Map<string, ChatRecord>();
  current.forEach((record) => byKey.set(chatRecordKey(record), record));
  incoming.forEach((record) => byKey.set(chatRecordKey(record), record));
  const merged = [...byKey.values()].sort((left, right) => left.ts.localeCompare(right.ts));
  const unchanged = merged.length === current.length
    && merged.every((record, index) => chatRecordKey(record) === chatRecordKey(current[index]));
  return unchanged ? current : merged;
}
