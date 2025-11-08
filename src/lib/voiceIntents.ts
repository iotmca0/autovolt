// voiceIntents.ts
// Lightweight intent parser for voice commands with synonym support.
// Parses raw transcript into structured intent objects.
// Extendable: add domain-specific device mappings (lights, fans, AC, all devices, status queries).

export type VoiceIntentType =
  | 'TURN_ON'
  | 'TURN_OFF'
  | 'TOGGLE'
  | 'STATUS'
  | 'SCHEDULE'
  | 'ALL_OFF'
  | 'ALL_ON'
  | 'UNKNOWN';

export interface ParsedVoiceIntent {
  type: VoiceIntentType;
  deviceNames: string[]; // normalized target devices (may be empty for global intents)
  raw: string; // original transcript
  confidence: number; // heuristic confidence 0-1
  parameters?: Record<string, any>;
  wakeWordDetected?: boolean;
  notes?: string; // optional parser notes for UX
}

// Synonym groups for action detection
const ACTION_SYNONYMS = {
  on: ['turn on', 'switch on', 'power on', 'activate', 'enable', 'start'],
  off: ['turn off', 'switch off', 'power off', 'deactivate', 'disable', 'shut down', 'stop'],
  toggle: ['toggle', 'flip', 'change'],
  status: ['status', 'state', 'condition', 'is it on', 'is it off', 'check', 'what is the status'],
  all: ['all', 'everything', 'entire'],
};

// Device keyword normalization map
const DEVICE_SYNONYMS: Record<string, string[]> = {
  light: ['light', 'lights', 'lamp', 'bulb', 'tube light', 'tubelight', 'ceiling light', 'classroom lights'],
  fan: ['fan', 'fans', 'ceiling fan', 'exhaust fan'],
  projector: ['projector', 'projectors', 'beamer'],
  ac: ['ac', 'a/c', 'air conditioner', 'aircon', 'ac unit'],
  relay: ['relay', 'relays', 'switch', 'switches', 'outlet', 'plug', 'socket', 'power'],
};

// Compile device keyword reverse lookup
const DEVICE_LOOKUP: Record<string, string> = Object.entries(DEVICE_SYNONYMS).reduce(
  (acc, [canonical, variants]) => {
    variants.forEach(v => (acc[v] = canonical));
    return acc;
  },
  {} as Record<string, string>
);

const WAKE_WORDS = ['hey autovolt', 'ok autovolt', 'hello autovolt', 'hi autovolt'];

import Fuse from 'fuse.js';

function includesAny(base: string, phrases: string[]): string | undefined {
  return phrases.find(p => base.includes(p));
}

function extractDevices(tokens: string[]): string[] {
  const devices: string[] = [];
  for (const t of tokens) {
    const canonical = (DEVICE_LOOKUP as any)[t];
    if (canonical && !devices.includes(canonical)) devices.push(canonical);
  }
  return devices;
}

function detectWakeWord(lowered: string): boolean {
  return WAKE_WORDS.some(w => lowered.startsWith(w));
}

export function parseVoiceIntent(transcript: string): ParsedVoiceIntent {
  const lowered = transcript.trim().toLowerCase();
  const wakeWord = detectWakeWord(lowered);
  const cleaned = wakeWord ? lowered.replace(/^hey autovolt|^ok autovolt|^hello autovolt/, '').trim() : lowered;

  const tokens = cleaned.split(/\s+/).map(t => t.replace(/[^a-z0-9]/g, ''));
  const devices = extractDevices(tokens);

  // Action detection
  const foundOn = includesAny(cleaned, ACTION_SYNONYMS.on);
  const foundOff = includesAny(cleaned, ACTION_SYNONYMS.off);
  const foundToggle = includesAny(cleaned, ACTION_SYNONYMS.toggle);
  const foundStatus = includesAny(cleaned, ACTION_SYNONYMS.status);
  const hasAllKeyword = includesAny(cleaned, ACTION_SYNONYMS.all);

  // Schedule intent (e.g., schedule ac for 10:30 or schedule ac to start 30 minutes before class or at 6:30 pm)
  const scheduleTimeMatch = cleaned.match(/schedule\s+(?:the\s+)?([a-z]+)?\s*(?:to\s+)?(?:start\s+)?(?:at\s+)?(\d{1,2}:\d{2})/);
  const schedule12hMatch = cleaned.match(/(?:schedule\s+)?(?:.*\b)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const scheduleBeforeMatch = cleaned.match(/(\d+)\s+minutes\s+before\s+class/);

  // Room/location extraction (e.g., room 101, lab 2)
  const roomMatch = cleaned.match(/\broom\s+([a-z0-9\-]+)/);

  // Build intent
  let type: VoiceIntentType = 'UNKNOWN';
  let confidence = 0.3;
  const parameters: Record<string, any> = {};

  if (scheduleTimeMatch || scheduleBeforeMatch || schedule12hMatch) {
    type = 'SCHEDULE';
    confidence = 0.8;
    if (scheduleTimeMatch) parameters.time = scheduleTimeMatch[2];
    if (schedule12hMatch) {
      const hh = parseInt(schedule12hMatch[1], 10);
      const mm = schedule12hMatch[2] ? parseInt(schedule12hMatch[2], 10) : 0;
      const ap = schedule12hMatch[3];
      const hh24 = ((ap === 'pm' && hh !== 12) ? hh + 12 : (ap === 'am' && hh === 12) ? 0 : hh).toString().padStart(2, '0');
      parameters.time = `${hh24}:${mm.toString().padStart(2, '0')}`;
    }
    if (scheduleBeforeMatch) parameters.minutesBeforeClass = parseInt(scheduleBeforeMatch[1], 10);
    if (roomMatch) parameters.room = roomMatch[1];
  } else if (foundStatus) {
    type = 'STATUS';
    confidence = 0.7;
  } else if (foundOn && hasAllKeyword) {
    type = 'ALL_ON';
    confidence = 0.9;
  } else if (foundOff && hasAllKeyword) {
    type = 'ALL_OFF';
    confidence = 0.9;
  } else if (foundOn) {
    type = 'TURN_ON';
    confidence = 0.85;
  } else if (foundOff) {
    type = 'TURN_OFF';
    confidence = 0.85;
  } else if (foundToggle) {
    type = 'TOGGLE';
    confidence = 0.75;
  }

  let result: ParsedVoiceIntent = {
    type,
    deviceNames: devices,
    raw: transcript,
    confidence,
    parameters: Object.keys(parameters).length ? parameters : undefined,
    wakeWordDetected: wakeWord,
  };

  // Notes for UX (e.g., wake word present, room parsed)
  const notes: string[] = [];
  if (wakeWord) notes.push('wake');
  if (parameters.room) notes.push(`room:${parameters.room}`);
  if (notes.length) result.notes = notes.join(' ');

  // Fuzzy fallback if still UNKNOWN — attempt to infer closest action phrase
  if (result.type === 'UNKNOWN') {
    const corpus = [
      ...ACTION_SYNONYMS.on,
      ...ACTION_SYNONYMS.off,
      ...ACTION_SYNONYMS.toggle,
      ...ACTION_SYNONYMS.status,
      'schedule'
    ];
    const fuse = new Fuse(corpus, { includeScore: true, threshold: 0.4 });
    const fuzzy = fuse.search(cleaned);
    if (fuzzy.length) {
      const best = fuzzy[0];
      if (best.score !== undefined && best.score < 0.32) {
        const phrase = best.item;
        if (ACTION_SYNONYMS.on.includes(phrase)) result.type = 'TURN_ON';
        else if (ACTION_SYNONYMS.off.includes(phrase)) result.type = 'TURN_OFF';
        else if (ACTION_SYNONYMS.toggle.includes(phrase)) result.type = 'TOGGLE';
        else if (ACTION_SYNONYMS.status.includes(phrase)) result.type = 'STATUS';
        else if (phrase === 'schedule') result.type = 'SCHEDULE';
        result.confidence = Math.max(result.confidence, 0.6);
        result.notes = (result.notes ? result.notes + ' ' : '') + 'fuzzy';
      }
    }
  }
  return result;
  return result;
}

// Simple retry suggestion generator based on intent type
export function buildRetrySuggestions(intent: ParsedVoiceIntent): string[] {
  if (intent.type === 'UNKNOWN') {
    const base = [
      'Try: "Turn on all lights"',
      'Try: "What is the status of the projector"',
      'Try: "Schedule AC to start 30 minutes before class"',
      'Try: "Turn off the fan in room 101"'
    ];
    return base;
  }
  if (intent.type === 'STATUS') {
    return ['"Check status of lights"', '"Is the AC on"'];
  }
  if (intent.type === 'TURN_ON') {
    return ['"Turn on the fan"', '"Switch on projector"'];
  }
  if (intent.type === 'TURN_OFF') {
    return ['"Turn off all lights"', '"Disable AC"'];
  }
  return [];
}
