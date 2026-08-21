import { createHash } from 'node:crypto';

export type ClaudeTranscriptMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  origin: 'user-input' | 'assistant-reply' | 'tool-runtime';
  assistantName?: string;
  thinkingText?: string;
  toolInvocation?: {
    id: string;
    kind: 'invokeMcpTool';
    toolName: string;
    status: 'running' | 'executed' | 'failed';
    title: string;
    summary: string;
    originMessageId: string;
    toolCallId: string;
    detailText?: string;
    error?: string;
  };
};

type JsonObject = Record<string, unknown>;

type ParsedTool = {
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  failed?: boolean;
  timestamp: number;
  originMessageId: string;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseTimestamp(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 20)}`;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

/**
 * CcCompanion prefixes phone messages before typing them into Claude Code so
 * the terminal has a useful arrival time. That transport metadata should not
 * become part of the chat bubble shown by Polaris.
 */
export function stripCccTransportTimestamp(value: string) {
  return value.replace(
    /^\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?\]\s*/u,
    ''
  );
}

/**
 * Claude Code may persist the same growing block more than once. Treat a longer
 * prefix-compatible value as a replacement snapshot and only append genuinely
 * new fragments. This is the main guard against repeated thinking summaries.
 */
export function mergeClaudeTextSnapshot(current: string, incoming: string) {
  const left = current.trim();
  const right = incoming.trim();
  if (!right || left === right) return left;
  if (!left || right.startsWith(left)) return right;
  if (left.startsWith(right)) return left;

  const leftParagraphs = left.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const rightParagraphs = right.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const unseen = rightParagraphs.filter((part) => !leftParagraphs.includes(part));
  return unseen.length > 0 ? [...leftParagraphs, ...unseen].join('\n\n') : left;
}

function stringifyDetail(value: unknown, maxLength = 6000) {
  if (value === undefined || value === null || value === '') return '';
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  const normalized = text.trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}\n…（内容已截短）`
    : normalized;
}

function humanizeToolName(name: string) {
  const mcp = name.match(/^mcp__(.+?)__(.+)$/u);
  if (mcp) return `MCP · ${mcp[1]} / ${mcp[2]}`;
  const normalized = name.replace(/[_-]+/g, ' ').trim();
  return normalized || 'Claude Code 工具';
}

function readContentBlocks(message: JsonObject) {
  const content = message.content;
  if (typeof content === 'string') {
    return [{ type: 'text', text: content } satisfies JsonObject];
  }
  return Array.isArray(content) ? content.filter(isObject) : [];
}

function readUserText(blocks: JsonObject[]) {
  const text = blocks
    .filter((block) => block.type === 'text')
    .map((block) => normalizeText(block.text))
    .filter(Boolean)
    .join('\n\n');
  return stripCccTransportTimestamp(text).trim();
}

function readToolResultText(block: JsonObject) {
  if (typeof block.content === 'string') return block.content;
  if (!Array.isArray(block.content)) return stringifyDetail(block.content);
  return block.content
    .filter(isObject)
    .map((entry) => normalizeText(entry.text) || stringifyDetail(entry))
    .filter(Boolean)
    .join('\n');
}

function rowIdentity(row: JsonObject, index: number) {
  const direct = normalizeText(row.uuid) || normalizeText(row.id);
  if (direct) return direct;
  return `${index}:${normalizeText(row.timestamp)}:${normalizeText(row.type)}`;
}

export function parseClaudeTranscriptJsonl(
  jsonl: string,
  options: { active?: boolean; now?: number } = {}
): ClaudeTranscriptMessage[] {
  const now = options.now ?? Date.now();
  const rows = jsonl
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const value: unknown = JSON.parse(line);
        return isObject(value) ? value : null;
      } catch {
        return null;
      }
    })
    .filter((row): row is JsonObject => Boolean(row));

  const messages: ClaudeTranscriptMessage[] = [];
  const tools = new Map<string, ParsedTool>();
  const toolOrder: string[] = [];
  let turnKey = 'opening';
  let turnTimestamp = now;
  let assistant: ClaudeTranscriptMessage | null = null;

  const ensureAssistant = (timestamp: number) => {
    if (assistant) return assistant;
    const assistantId = stableId('claude-assistant', turnKey);
    assistant = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp,
      origin: 'assistant-reply',
      assistantName: 'Claude Code'
    };
    messages.push(assistant);
    return assistant;
  };

  rows.forEach((row, index) => {
    const rowType = normalizeText(row.type);
    if (rowType !== 'user' && rowType !== 'assistant') return;
    const message = isObject(row.message) ? row.message : null;
    if (!message) return;
    const role = normalizeText(message.role) || rowType;
    const timestamp = parseTimestamp(row.timestamp ?? message.timestamp, now + index);
    const blocks = readContentBlocks(message);

    if (role === 'user') {
      const humanText = readUserText(blocks);
      if (humanText) {
        const identity = rowIdentity(row, index);
        turnKey = normalizeText(message.id) || identity;
        turnTimestamp = timestamp;
        assistant = null;
        messages.push({
          id: stableId('claude-user', turnKey),
          role: 'user',
          content: humanText,
          timestamp,
          origin: 'user-input'
        });
      }

      for (const block of blocks) {
        if (block.type !== 'tool_result') continue;
        const toolId = normalizeText(block.tool_use_id);
        if (!toolId) continue;
        const tool = tools.get(toolId);
        if (!tool) continue;
        tool.result = readToolResultText(block);
        tool.failed = block.is_error === true;
      }
      return;
    }

    const currentAssistant = ensureAssistant(timestamp);
    for (const block of blocks) {
      if (block.type === 'thinking') {
        const thinking = normalizeText(block.thinking ?? block.text);
        if (thinking) {
          currentAssistant.thinkingText = mergeClaudeTextSnapshot(
            currentAssistant.thinkingText ?? '',
            thinking
          );
        }
        continue;
      }

      if (block.type === 'text') {
        const text = normalizeText(block.text);
        if (text) {
          currentAssistant.content = mergeClaudeTextSnapshot(currentAssistant.content, text);
        }
        continue;
      }

      if (block.type === 'tool_use') {
        const toolId = normalizeText(block.id) || stableId('tool-call', `${turnKey}:${index}:${toolOrder.length}`);
        const name = normalizeText(block.name) || 'Claude Code 工具';
        const existing = tools.get(toolId);
        if (existing) {
          existing.input = block.input ?? existing.input;
        } else {
          tools.set(toolId, {
            id: toolId,
            name,
            input: block.input,
            timestamp,
            originMessageId: currentAssistant.id
          });
          toolOrder.push(toolId);
        }
      }
    }
  });

  if (options.active) {
    const assistantAtEnd = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (!assistantAtEnd || (!assistantAtEnd.content && !assistantAtEnd.thinkingText)) {
      const pendingAssistant = ensureAssistant(Math.max(turnTimestamp + 1, now));
      pendingAssistant.thinkingText = '正在响应…';
    }
  }

  const toolMessages = new Map<string, ClaudeTranscriptMessage[]>();
  for (const toolId of toolOrder) {
    const tool = tools.get(toolId);
    if (!tool) continue;
    const title = humanizeToolName(tool.name);
    const status = tool.result === undefined ? 'running' : tool.failed ? 'failed' : 'executed';
    const inputDetail = stringifyDetail(tool.input);
    const resultDetail = stringifyDetail(tool.result);
    const detailText = [
      inputDetail ? `参数\n${inputDetail}` : '',
      resultDetail ? `结果\n${resultDetail}` : ''
    ].filter(Boolean).join('\n\n');
    const toolMessage: ClaudeTranscriptMessage = {
      id: stableId('claude-tool', tool.id),
      role: 'system',
      content: title,
      timestamp: tool.timestamp,
      origin: 'tool-runtime',
      toolInvocation: {
        id: stableId('tool-invocation', tool.id),
        kind: 'invokeMcpTool',
        toolName: tool.name,
        status,
        title,
        summary:
          status === 'running'
            ? `正在调用 ${title}`
            : status === 'failed'
              ? `${title} 调用失败`
              : `已调用 ${title}`,
        originMessageId: tool.originMessageId,
        toolCallId: tool.id,
        detailText: detailText || undefined,
        error: tool.failed ? resultDetail || `${title} 调用失败` : undefined
      }
    };
    const bucket = toolMessages.get(tool.originMessageId) ?? [];
    bucket.push(toolMessage);
    toolMessages.set(tool.originMessageId, bucket);
  }

  const withTools: ClaudeTranscriptMessage[] = [];
  for (const message of messages) {
    withTools.push(message);
    if (message.role === 'assistant') {
      withTools.push(...(toolMessages.get(message.id) ?? []));
    }
  }

  return withTools.filter((message) => {
    if (message.toolInvocation) return true;
    if (message.role !== 'assistant') return Boolean(message.content.trim());
    return Boolean(message.content.trim() || message.thinkingText?.trim());
  });
}
