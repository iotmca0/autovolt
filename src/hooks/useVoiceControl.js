/**
 * Advanced Voice Control System for AutoVolt
 * Integrates with AI service for natural language processing and intent recognition
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const VOICE_COMMANDS = {
  // Device control
  TURN_ON: ['turn on', 'switch on', 'enable', 'activate', 'start'],
  TURN_OFF: ['turn off', 'switch off', 'disable', 'deactivate', 'stop'],
  TOGGLE: ['toggle', 'switch', 'flip'],

  // Device targeting
  ALL_DEVICES: ['all devices', 'everything', 'all lights', 'all appliances'],
  ROOM_SPECIFIC: ['living room', 'bedroom', 'kitchen', 'bathroom', 'office', 'classroom'],

  // Advanced commands
  SCHEDULE: ['schedule', 'set timer', 'remind me', 'later'],
  STATUS: ['status', 'how is', 'what is', 'check'],
  ANALYTICS: ['analytics', 'report', 'usage', 'consumption', 'energy'],

  // Navigation
  NAVIGATE: ['go to', 'open', 'show', 'display'],
};

class VoiceControlEngine {
  constructor() {
    this.recognition = null;
    this.synthesis = null;
    this.isListening = false;
    this.isProcessing = false;
    this.commandHistory = [];
    this.context = {
      lastCommand: null,
      lastIntent: null,
      conversationState: 'idle',
      userPreferences: {},
    };

    this.initSpeechRecognition();
    this.initSpeechSynthesis();
  }

  initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 3;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.emit('listening', true);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.emit('listening', false);
      };

      this.recognition.onresult = (event) => {
        const results = Array.from(event.results[0]);
        const transcript = results[0].transcript.toLowerCase();
        const confidence = results[0].confidence;

        this.processVoiceCommand(transcript, confidence);
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.emit('error', { type: 'recognition', error: event.error });
      };
    }
  }

  initSpeechSynthesis() {
    if ('speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    }
  }

  async processVoiceCommand(transcript, confidence) {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.emit('processing', true);

    try {
      // Store command in history
      this.commandHistory.push({
        transcript,
        confidence,
        timestamp: new Date(),
        processed: false
      });

      // Send to AI service for NLP processing
      const response = await this.processWithAI(transcript);

      if (response) {
        // Update context
        this.context.lastCommand = transcript;
        this.context.lastIntent = response.intent;

        // Execute command
        await this.executeCommand(response);

        // Provide feedback
        if (response.feedback) {
          this.speak(response.feedback);
        }

        // Mark as processed
        this.commandHistory[this.commandHistory.length - 1].processed = true;
        this.commandHistory[this.commandHistory.length - 1].response = response;
      }

    } catch (error) {
      console.error('Voice command processing error:', error);
      this.speak('Sorry, I had trouble processing that command. Please try again.');
      this.emit('error', { type: 'processing', error: error.message });
    } finally {
      this.isProcessing = false;
      this.emit('processing', false);
    }
  }

  async processWithAI(transcript) {
    try {
      const response = await fetch('/api/ai/voice/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          text: transcript,
          context: this.context,
          history: this.commandHistory.slice(-5) // Last 5 commands for context
        })
      });

      if (!response.ok) {
        throw new Error('AI service unavailable');
      }

      return await response.json();
    } catch (error) {
      console.error('AI processing error:', error);
      // Fallback to local processing
      return this.fallbackProcessing(transcript);
    }
  }

  fallbackProcessing(transcript) {
    // Simple keyword-based fallback processing
    const intent = this.detectIntent(transcript);
    const entities = this.extractEntities(transcript);

    return {
      intent,
      entities,
      confidence: 0.7,
      feedback: this.generateFeedback(intent, entities),
      actions: this.generateActions(intent, entities)
    };
  }

  detectIntent(transcript) {
    // Check for device control commands
    if (VOICE_COMMANDS.TURN_ON.some(cmd => transcript.includes(cmd))) {
      return 'TURN_ON';
    }
    if (VOICE_COMMANDS.TURN_OFF.some(cmd => transcript.includes(cmd))) {
      return 'TURN_OFF';
    }
    if (VOICE_COMMANDS.TOGGLE.some(cmd => transcript.includes(cmd))) {
      return 'TOGGLE';
    }

    // Check for status commands
    if (VOICE_COMMANDS.STATUS.some(cmd => transcript.includes(cmd))) {
      return 'STATUS_CHECK';
    }

    // Check for navigation commands
    if (VOICE_COMMANDS.NAVIGATE.some(cmd => transcript.includes(cmd))) {
      return 'NAVIGATE';
    }

    // Check for analytics commands
    if (VOICE_COMMANDS.ANALYTICS.some(cmd => transcript.includes(cmd))) {
      return 'ANALYTICS';
    }

    return 'UNKNOWN';
  }

  extractEntities(transcript) {
    const entities = {
      devices: [],
      rooms: [],
      actions: [],
      parameters: {}
    };

    // Extract room names
    VOICE_COMMANDS.ROOM_SPECIFIC.forEach(room => {
      if (transcript.includes(room)) {
        entities.rooms.push(room);
      }
    });

    // Extract device types (would need device registry)
    const deviceTypes = ['light', 'fan', 'ac', 'heater', 'projector', 'computer'];
    deviceTypes.forEach(device => {
      if (transcript.includes(device)) {
        entities.devices.push(device);
      }
    });

    // Extract numbers for parameters
    const numberMatch = transcript.match(/\b(\d+)\b/);
    if (numberMatch) {
      entities.parameters.duration = parseInt(numberMatch[1]);
    }

    // Extract time expressions
    if (transcript.includes('minute')) {
      entities.parameters.unit = 'minutes';
    } else if (transcript.includes('hour')) {
      entities.parameters.unit = 'hours';
    }

    return entities;
  }

  generateFeedback(intent, entities) {
    switch (intent) {
      case 'TURN_ON':
        return entities.devices.length > 0
          ? `Turning on ${entities.devices.join(', ')}`
          : 'Turning on devices';

      case 'TURN_OFF':
        return entities.devices.length > 0
          ? `Turning off ${entities.devices.join(', ')}`
          : 'Turning off devices';

      case 'STATUS_CHECK':
        return 'Checking device status';

      case 'NAVIGATE':
        return 'Navigating to requested page';

      case 'ANALYTICS':
        return 'Showing analytics report';

      default:
        return 'Command processed';
    }
  }

  generateActions(intent, entities) {
    const actions = [];

    switch (intent) {
      case 'TURN_ON':
      case 'TURN_OFF':
      case 'TOGGLE':
        actions.push({
          type: 'DEVICE_CONTROL',
          action: intent.toLowerCase(),
          devices: entities.devices,
          rooms: entities.rooms
        });
        break;

      case 'STATUS_CHECK':
        actions.push({
          type: 'STATUS_REQUEST',
          devices: entities.devices,
          rooms: entities.rooms
        });
        break;

      case 'NAVIGATE':
        actions.push({
          type: 'NAVIGATION',
          destination: this.extractDestination(transcript)
        });
        break;

      case 'ANALYTICS':
        actions.push({
          type: 'SHOW_ANALYTICS',
          timeframe: entities.parameters.timeframe || 'today'
        });
        break;
    }

    return actions;
  }

  extractDestination(transcript) {
    const destinations = ['dashboard', 'devices', 'analytics', 'settings'];
    for (const dest of destinations) {
      if (transcript.includes(dest)) {
        return dest;
      }
    }
    return 'dashboard';
  }

  async executeCommand(response) {
    for (const action of response.actions || []) {
      try {
        switch (action.type) {
          case 'DEVICE_CONTROL':
            await this.executeDeviceControl(action);
            break;
          case 'STATUS_REQUEST':
            await this.executeStatusRequest(action);
            break;
          case 'NAVIGATION':
            this.executeNavigation(action);
            break;
          case 'SHOW_ANALYTICS':
            this.executeShowAnalytics(action);
            break;
        }
      } catch (error) {
        console.error('Action execution error:', error);
        this.emit('error', { type: 'execution', error: error.message });
      }
    }
  }

  async executeDeviceControl(action) {
    const payload = {
      action: action.action,
      devices: action.devices,
      rooms: action.rooms,
      source: 'voice'
    };

    const response = await fetch('/api/devices/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Device control failed');
    }

    const result = await response.json();
    this.emit('device-control', result);
  }

  async executeStatusRequest(action) {
    const params = new URLSearchParams();
    if (action.devices.length > 0) {
      params.append('devices', action.devices.join(','));
    }
    if (action.rooms.length > 0) {
      params.append('rooms', action.rooms.join(','));
    }

    const response = await fetch(`/api/devices/status?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Status request failed');
    }

    const status = await response.json();
    this.emit('status-update', status);

    // Generate voice feedback
    const activeDevices = status.devices.filter(d => d.state).length;
    const totalDevices = status.devices.length;
    this.speak(`${activeDevices} out of ${totalDevices} devices are currently active.`);
  }

  executeNavigation(action) {
    // This would integrate with React Router
    this.emit('navigation', action.destination);
  }

  executeShowAnalytics(action) {
    this.emit('show-analytics', action.timeframe);
  }

  speak(text) {
    if (this.synthesis) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;

      // Use a natural voice if available
      const voices = this.synthesis.getVoices();
      const preferredVoice = voices.find(voice =>
        voice.name.includes('Google') ||
        voice.name.includes('Natural') ||
        voice.lang.startsWith('en')
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      this.synthesis.speak(utterance);
    }
  }

  startListening() {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  // Event emitter functionality
  listeners = new Map();

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event callback error:', error);
        }
      });
    }
  }
}

// React Hook for Voice Control
export const useVoiceControl = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCommand, setLastCommand] = useState(null);
  const [commandHistory, setCommandHistory] = useState([]);
  const [error, setError] = useState(null);

  const engineRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    engineRef.current = new VoiceControlEngine();

    // Set up event listeners
    engineRef.current.on('listening', setIsListening);
    engineRef.current.on('processing', setIsProcessing);
    engineRef.current.on('device-control', (result) => {
      // Invalidate device queries to refresh data
      queryClient.invalidateQueries(['devices']);
      setLastCommand({ type: 'device-control', result, timestamp: new Date() });
    });
    engineRef.current.on('status-update', (status) => {
      setLastCommand({ type: 'status-update', status, timestamp: new Date() });
    });
    engineRef.current.on('navigation', (destination) => {
      setLastCommand({ type: 'navigation', destination, timestamp: new Date() });
      // This would trigger navigation in the parent component
    });
    engineRef.current.on('show-analytics', (timeframe) => {
      setLastCommand({ type: 'show-analytics', timeframe, timestamp: new Date() });
    });
    engineRef.current.on('error', (error) => {
      setError(error);
      setTimeout(() => setError(null), 5000); // Clear error after 5 seconds
    });

    return () => {
      if (engineRef.current) {
        engineRef.current.stopListening();
      }
    };
  }, []);

  // Update command history when commands are processed
  useEffect(() => {
    if (lastCommand) {
      setCommandHistory(prev => [lastCommand, ...prev.slice(0, 9)]); // Keep last 10
    }
  }, [lastCommand]);

  const startListening = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.startListening();
    }
  }, []);

  const stopListening = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stopListening();
    }
  }, []);

  const speak = useCallback((text) => {
    if (engineRef.current) {
      engineRef.current.speak(text);
    }
  }, []);

  // Voice command processing mutation
  const processVoiceCommand = useMutation({
    mutationFn: async (transcript) => {
      if (engineRef.current) {
        return await engineRef.current.processWithAI(transcript);
      }
      return null;
    },
    onSuccess: (result) => {
      if (result) {
        setLastCommand({ type: 'processed', result, timestamp: new Date() });
      }
    },
    onError: (error) => {
      setError({ type: 'processing', error: error.message });
    }
  });

  return {
    isListening,
    isProcessing,
    lastCommand,
    commandHistory,
    error,
    startListening,
    stopListening,
    speak,
    processVoiceCommand: processVoiceCommand.mutate,
    isSupported: !!engineRef.current?.recognition
  };
};

// Voice Control Context Provider
import { createContext, useContext } from 'react';

const VoiceControlContext = createContext(null);

export const VoiceControlProvider = ({ children }) => {
  const voiceControl = useVoiceControl();

  return (
    <VoiceControlContext.Provider value={voiceControl}>
      {children}
    </VoiceControlContext.Provider>
  );
};

export const useVoiceControlContext = () => {
  const context = useContext(VoiceControlContext);
  if (!context) {
    throw new Error('useVoiceControlContext must be used within a VoiceControlProvider');
  }
  return context;
};