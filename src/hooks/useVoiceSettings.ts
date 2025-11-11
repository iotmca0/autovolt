// useVoiceSettings.ts - Voice control settings and preferences
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VoiceCommand {
  id: string;
  command: string;
  timestamp: Date;
  success: boolean;
  response: string;
  isFavorite?: boolean;
}

export interface VoiceSettings {
  // TTS Settings
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsRate: number; // 0.5 to 2.0
  ttsVolume: number; // 0 to 1
  
  // Recognition Settings
  continuousMode: boolean;
  language: string;
  
  // UI Settings
  showTranscript: boolean;
  showSuggestions: boolean;
  showAudioLevel: boolean;
  
  // Advanced AI Features
  autoConfirmation: boolean; // Auto-listen for confirmations
  voiceResponses: boolean; // Always speak responses
  wakeWord: string; // Wake word to activate (default: "AutoVolt")
  assistantMode: boolean; // AI chatbot mode
  
  // Command History
  commandHistory: VoiceCommand[];
  maxHistorySize: number;
}

interface VoiceSettingsStore extends VoiceSettings {
  // Actions
  setTTSEnabled: (enabled: boolean) => void;
  setTTSVoice: (voice: string) => void;
  setTTSRate: (rate: number) => void;
  setTTSVolume: (volume: number) => void;
  setContinuousMode: (enabled: boolean) => void;
  setLanguage: (lang: string) => void;
  setShowTranscript: (show: boolean) => void;
  setShowSuggestions: (show: boolean) => void;
  setShowAudioLevel: (show: boolean) => void;
  
  // Advanced AI Actions
  setAutoConfirmation: (enabled: boolean) => void;
  setVoiceResponses: (enabled: boolean) => void;
  setWakeWord: (word: string) => void;
  setAssistantMode: (enabled: boolean) => void;
  
  // Command History Actions
  addCommand: (command: Omit<VoiceCommand, 'id' | 'timestamp'>) => void;
  toggleFavorite: (commandId: string) => void;
  clearHistory: () => void;
  removeCommand: (commandId: string) => void;
  getFavorites: () => VoiceCommand[];
  getRecentCommands: (limit?: number) => VoiceCommand[];
}

const defaultSettings: VoiceSettings = {
  ttsEnabled: true,
  ttsVoice: '',
  ttsRate: 1.0,
  ttsVolume: 1.0,
  continuousMode: false,
  language: 'en-US',
  showTranscript: true,
  showSuggestions: true,
  showAudioLevel: true,
  autoConfirmation: true,
  voiceResponses: true,
  wakeWord: 'AutoVolt',
  assistantMode: false,
  commandHistory: [],
  maxHistorySize: 50,
};

export const useVoiceSettings = create<VoiceSettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      
      setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),
      setTTSVoice: (voice) => set({ ttsVoice: voice }),
      setTTSRate: (rate) => set({ ttsRate: Math.max(0.5, Math.min(2.0, rate)) }),
      setTTSVolume: (volume) => set({ ttsVolume: Math.max(0, Math.min(1, volume)) }),
      setContinuousMode: (enabled) => set({ continuousMode: enabled }),
      setLanguage: (lang) => set({ language: lang }),
      setShowTranscript: (show) => set({ showTranscript: show }),
      setShowSuggestions: (show) => set({ showSuggestions: show }),
      setShowAudioLevel: (show) => set({ showAudioLevel: show }),
      
      setAutoConfirmation: (enabled) => set({ autoConfirmation: enabled }),
      setVoiceResponses: (enabled) => set({ voiceResponses: enabled }),
      setWakeWord: (word) => set({ wakeWord: word }),
      setAssistantMode: (enabled) => set({ assistantMode: enabled }),
      
      addCommand: (command) => {
        const newCommand: VoiceCommand = {
          ...command,
          id: `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        };
        
        set((state) => {
          const history = [newCommand, ...state.commandHistory];
          // Keep only maxHistorySize items
          if (history.length > state.maxHistorySize) {
            history.splice(state.maxHistorySize);
          }
          return { commandHistory: history };
        });
      },
      
      toggleFavorite: (commandId) => {
        set((state) => ({
          commandHistory: state.commandHistory.map((cmd) =>
            cmd.id === commandId ? { ...cmd, isFavorite: !cmd.isFavorite } : cmd
          ),
        }));
      },
      
      clearHistory: () => set({ commandHistory: [] }),
      
      removeCommand: (commandId) => {
        set((state) => ({
          commandHistory: state.commandHistory.filter((cmd) => cmd.id !== commandId),
        }));
      },
      
      getFavorites: () => {
        return get().commandHistory.filter((cmd) => cmd.isFavorite);
      },
      
      getRecentCommands: (limit = 10) => {
        return get().commandHistory.slice(0, limit);
      },
    }),
    {
      name: 'voice-settings-storage',
    }
  )
);
