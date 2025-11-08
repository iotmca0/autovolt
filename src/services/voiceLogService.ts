// voiceLogService.ts
// Lightweight client-side voice event logging for analytics and debugging

export type VoiceLogEvent = {
  ts: number; // epoch ms
  level: 'info' | 'warn' | 'error';
  stage: 'parse' | 'execute' | 'confirm' | 'permission' | 'other';
  message: string;
  data?: Record<string, unknown>;
};

const STORAGE_KEY = 'voice_logs_v1';
const MAX_LOGS = 200;

function readAll(): VoiceLogEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as VoiceLogEvent[];
    return [];
  } catch {
    return [];
  }
}

function writeAll(events: VoiceLogEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_LOGS)));
  } catch {
    // ignore quota errors
  }
}

export const voiceLogService = {
  log(event: Omit<VoiceLogEvent, 'ts'> & { ts?: number }) {
    const entry: VoiceLogEvent = { ts: event.ts ?? Date.now(), level: event.level, stage: event.stage, message: event.message, data: event.data };
    const existing = readAll();
    existing.push(entry);
    writeAll(existing);
    return entry;
  },
  getRecent(limit = 50) {
    const all = readAll();
    return all.slice(-limit).reverse();
  },
  clear() {
    writeAll([]);
  }
};
