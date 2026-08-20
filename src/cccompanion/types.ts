export type ChatRole = 'user' | 'assistant' | 'system' | string;

export type ChatRecord = {
  role: ChatRole;
  text: string;
  ts: string;
  source?: string | null;
  turn_id?: string | null;
};

export type ConnectionSettings = {
  baseUrl: string;
  token: string;
};
