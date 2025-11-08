// src/hooks/useVoiceControl.ts
import { useState, useEffect, useCallback } from 'react';

interface VoiceControlHook {
  isRecording: boolean;
  hasPermission: boolean;
  transcript: string;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | undefined>;
  error: string | null;
}

/**
 * Hook for voice control using Web Speech API (web) or Capacitor (mobile)
 * Supports both browser and native mobile platforms
 */
export const useVoiceControl = (): VoiceControlHook => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    // Initialize Web Speech API
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognitionInstance = new SpeechRecognition();
    
  recognitionInstance.continuous = false; // set to true for continuous listening
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'en-US';
    recognitionInstance.maxAlternatives = 1;

    recognitionInstance.onstart = () => {
      console.log('🎤 Voice recognition started');
      setIsRecording(true);
      setError(null);
    };

    recognitionInstance.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcriptResult = event.results[current][0].transcript;
      setTranscript(transcriptResult);
      console.log('📝 Transcript:', transcriptResult);
    };

    recognitionInstance.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error);
      setError(`Error: ${event.error}`);
      setIsRecording(false);
    };

    recognitionInstance.onend = () => {
      console.log('🛑 Voice recognition ended');
      setIsRecording(false);
      setIsProcessing(false);
    };

    setRecognition(recognitionInstance);
    setHasPermission(true);

    return () => {
      if (recognitionInstance && isRecording) {
        recognitionInstance.stop();
      }
    };
  }, [isSupported]);

  const startRecording = useCallback(async () => {
    if (!recognition) {
      setError('Speech recognition not initialized');
      return;
    }

    if (isRecording) {
      console.warn('⚠️ Already recording');
      return;
    }

    try {
      setTranscript('');
      setError(null);
      // Prompt for permission explicitly
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasPermission(true);
      } catch (permErr) {
        setHasPermission(false);
        setError('Microphone permission denied. Please enable it in browser settings.');
        return;
      }
      setIsProcessing(true);
      recognition.start();
    } catch (err: any) {
      console.error('❌ Error starting recording:', err);
      setError(err.message);
    }
  }, [recognition, isRecording]);

  const stopRecording = useCallback(async (): Promise<string | undefined> => {
    if (!recognition) {
      setError('Speech recognition not initialized');
      return;
    }

    if (!isRecording) {
      console.warn('⚠️ Not currently recording');
      return transcript;
    }

    try {
      recognition.stop();
      // Slight debounce to allow final onresult
      setTimeout(() => setIsProcessing(false), 200);
      return transcript;
    } catch (err: any) {
      console.error('❌ Error stopping recording:', err);
      setError(err.message);
      return undefined;
    }
  }, [recognition, isRecording, transcript]);

  return {
    isRecording,
    hasPermission,
    transcript,
    isSupported,
    startRecording,
    stopRecording,
    error
  };
};

/**
 * Process voice command and execute action
 */
export const processVoiceCommand = (transcript: string): {
  action: string;
  params?: any;
  confidence: number;
} => {
  const text = transcript.toLowerCase().trim();
  
  // Device control commands
  if (text.includes('turn on') || text.includes('switch on')) {
    const match = text.match(/turn on|switch on\s+(.+)/);
    return {
      action: 'TURN_ON_DEVICE',
      params: { deviceName: match?.[1] },
      confidence: 0.9
    };
  }

  if (text.includes('turn off') || text.includes('switch off')) {
    const match = text.match(/turn off|switch off\s+(.+)/);
    return {
      action: 'TURN_OFF_DEVICE',
      params: { deviceName: match?.[1] },
      confidence: 0.9
    };
  }

  if (text.includes('status of') || text.includes('check status')) {
    const match = text.match(/status of|check status\s+(.+)/);
    return {
      action: 'CHECK_STATUS',
      params: { deviceName: match?.[1] },
      confidence: 0.85
    };
  }

  // Navigation commands
  if (text.includes('show analytics') || text.includes('analytics page')) {
    return {
      action: 'NAVIGATE',
      params: { page: '/dashboard/analytics' },
      confidence: 0.9
    };
  }

  if (text.includes('show devices') || text.includes('device list')) {
    return {
      action: 'NAVIGATE',
      params: { page: '/dashboard/devices' },
      confidence: 0.9
    };
  }

  if (text.includes('go home') || text.includes('home page')) {
    return {
      action: 'NAVIGATE',
      params: { page: '/dashboard' },
      confidence: 0.9
    };
  }

  // Schedule commands
  if (text.includes('create schedule') || text.includes('new schedule')) {
    return {
      action: 'CREATE_SCHEDULE',
      confidence: 0.8
    };
  }

  // Batch commands
  if (text.includes('turn on all') || text.includes('all on')) {
    return {
      action: 'TURN_ON_ALL',
      confidence: 0.85
    };
  }

  if (text.includes('turn off all') || text.includes('all off')) {
    return {
      action: 'TURN_OFF_ALL',
      confidence: 0.85
    };
  }

  // Unknown command
  return {
    action: 'UNKNOWN',
    params: { transcript: text },
    confidence: 0.1
  };
};
