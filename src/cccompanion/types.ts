export type ChatRole = 'user' | 'assistant' | 'system' | string;

export type ChatRecord = {
  role: ChatRole;
  text: string;
  ts: string;
  source?: string | null;
  turn_id?: string | null;
};

export type CompanionStatus = {
  typing?: boolean;
  online?: boolean;
  sleeping?: boolean;
};

export type ThinkingRecord = {
  turn_id?: string | null;
  thinking: string;
};

export type SessionChoice = {
  id: string;
  label: string;
  description?: string;
};

export type SessionOptions = {
  current: {
    model: string;
    effort: string;
    thinking: boolean;
  };
  models: SessionChoice[];
  efforts: SessionChoice[];
  configurable: boolean;
  note?: string;
};

export type ConnectionSettings = {
  baseUrl: string;
  token: string;
};
