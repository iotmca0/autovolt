import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2, Settings, History, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { voiceAssistantAPI } from '@/services/api';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { VoiceControlSettings } from './VoiceControlSettings';
import { VoiceTranscriptDisplay } from './VoiceTranscriptDisplay';
import { VoiceCommandHistory } from './VoiceCommandHistory';
import { VoiceCommandSuggestions } from './VoiceCommandSuggestions';
import { useAuth } from '@/context/AuthContext';

interface FloatingVoiceMicProps {
  onCommandExecuted?: (result: any) => void;
}

interface VoiceCommand {
  id: string;
  command: string;
  response: string;
  timestamp: Date;
  success: boolean;
}

interface VoiceSettings {
  continuousMode: boolean;
  language: string;
  ttsEnabled: boolean;
  showSuggestions: boolean;
  showTranscript: boolean;
  confirmationRequired: boolean;
  theme: 'default' | 'dark' | 'colorful';
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonSize: 'small' | 'medium' | 'large';
}

const FloatingVoiceMic: React.FC<FloatingVoiceMicProps> = ({ onCommandExecuted }) => {
  const { toast } = useToast();
  const { voiceToken, isAuthenticated: voiceSessionAuthenticated, isLoading: sessionLoading, createVoiceSession, clearVoiceSession } = useVoiceSession();
  const { isAuthenticated: userAuthenticated, loading: authLoading } = useAuth();

  // Core voice states
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);

  // UI states
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Voice data
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [commandHistory, setCommandHistory] = useState<VoiceCommand[]>([]);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string>('');

  // Settings
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    continuousMode: false,
    language: 'en-US',
    ttsEnabled: true,
    showSuggestions: true,
    showTranscript: true,
    confirmationRequired: true,
    theme: 'default',
    position: 'bottom-right',
    buttonSize: 'medium'
  });

  // Refs
  const recognitionRef = useRef<any>(null);
  const recognitionListenerRef = useRef<any>(null);

  // Check platform capabilities
  useEffect(() => {
    const checkCapabilities = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          // For Android, prefer web APIs since Capacitor plugins may not be fully implemented
          const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          setIsSpeechSupported(!!SpeechRecognitionAPI);
          setIsTTSSupported(!!window.speechSynthesis);

          // Try native plugins but don't fail if they're not available
          try {
            const { available } = await SpeechRecognition.available();
            if (available) {
              console.log('Native speech recognition available');
            }
          } catch (error) {
            console.log('Native speech recognition not available, using web fallback');
          }
        } else {
          // Web platform - use browser APIs
          const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          setIsSpeechSupported(!!SpeechRecognitionAPI);
          setIsTTSSupported(!!window.speechSynthesis);
        }
      } catch (error) {
        console.error('Failed to check voice capabilities:', error);
        // Final fallback - try web APIs
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        setIsSpeechSupported(!!SpeechRecognitionAPI);
        setIsTTSSupported(!!window.speechSynthesis);
      }
    };

    checkCapabilities();
  }, []);

  // Initialize speech recognition
  const initRecognition = useCallback(async () => {
    if (!isSpeechSupported || recognitionRef.current) return;

    try {
      if (Capacitor.isNativePlatform()) {
        // For Android, prefer web API directly since native plugins may not be fully implemented
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognitionAPI) {
          const recognition = new SpeechRecognitionAPI();

          // Improved settings for Android web fallback
          recognition.continuous = false; // Disable continuous for better Android support
          recognition.interimResults = true; // Keep interim for real-time feedback
          recognition.lang = voiceSettings.language || 'en-US';
          recognition.maxAlternatives = 1;

          // Add timeout for Android (stop listening after 5 seconds of silence)
          let silenceTimeout: NodeJS.Timeout;

          recognition.onstart = () => {
            setIsListening(true);
            setCurrentTranscript('');
            console.log('Web speech recognition started on Android');

            // Set timeout to stop listening after 5 seconds of silence
            silenceTimeout = setTimeout(() => {
              if (recognition && recognition.abort) {
                console.log('Stopping recognition due to timeout');
                recognition.abort();
              }
            }, 5000);
          };

          recognition.onresult = async (event: any) => {
            // Clear silence timeout when we get results
            if (silenceTimeout) {
              clearTimeout(silenceTimeout);
            }

            let finalTranscript = '';
            let interimTranscript = '';
            let highestConfidence = 0;

            // Process all results
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              const transcript = result[0].transcript;
              const confidence = result[0].confidence || 0;

              if (result.isFinal) {
                // Use the result with highest confidence
                if (confidence > highestConfidence) {
                  finalTranscript = transcript;
                  highestConfidence = confidence;
                }
              } else {
                interimTranscript = transcript;
              }
            }

            // Update transcript display with interim results
            if (interimTranscript) {
              setCurrentTranscript(interimTranscript.trim());
            }

            // Process final results
            if (finalTranscript.trim()) {
              console.log('Final transcript:', finalTranscript.trim(), 'Confidence:', highestConfidence);
              setCurrentTranscript(finalTranscript.trim());
              // Stop current recognition before processing command to prevent conflicts
              setIsRecognitionActive(false);
              recognition.stop();
              await processCommand(finalTranscript.trim());
            }
          };

          recognition.onerror = (event: any) => {
            console.error('Web speech recognition error:', event.error, event.message);
            if (silenceTimeout) {
              clearTimeout(silenceTimeout);
            }
            setIsListening(false);
            setIsRecognitionActive(false);
            setCurrentTranscript('');

            // Show user-friendly error messages
            let errorMessage = 'Speech recognition error';
            switch (event.error) {
              case 'no-speech':
                errorMessage = 'No speech detected. Please try again.';
                break;
              case 'audio-capture':
                errorMessage = 'Microphone access denied. Please allow microphone access.';
                break;
              case 'not-allowed':
                errorMessage = 'Microphone permission denied. Please enable microphone access.';
                break;
              case 'network':
                errorMessage = 'Network error. Please check your connection.';
                break;
              case 'service-not-allowed':
                errorMessage = 'Speech recognition service not available.';
                break;
            }

            toast({
              title: '🎤 Recognition Error',
              description: errorMessage,
              variant: 'destructive'
            });
          };

          recognition.onend = () => {
            console.log('Web speech recognition ended');
            if (silenceTimeout) {
              clearTimeout(silenceTimeout);
            }
            setIsListening(false);
            setIsRecognitionActive(false);
          };

          recognitionRef.current = recognition;
        }
      } else {
        // Web platform - use browser APIs
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = voiceSettings.continuousMode;
        recognition.interimResults = true;
        recognition.lang = voiceSettings.language;

        recognition.onstart = () => {
          setIsListening(true);
          setCurrentTranscript('');
        };

        recognition.onresult = async (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            }
          }

          if (finalTranscript.trim()) {
            setCurrentTranscript(finalTranscript.trim());
            // Stop current recognition before processing command to prevent conflicts
            setIsRecognitionActive(false);
            recognition.stop();
            await processCommand(finalTranscript.trim());
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setIsRecognitionActive(false);
          setCurrentTranscript('');
        };

        recognition.onend = () => {
          setIsListening(false);
          setIsRecognitionActive(false);
        };

        recognitionRef.current = recognition;
      }
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
    }
  }, [isSpeechSupported, voiceSettings]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!userAuthenticated && !authLoading) {
      toast({
        title: 'Authentication Required',
        description: 'Please login to use voice commands',
        variant: 'destructive'
      });
      return;
    }

    // Prevent multiple starts - but allow restart if we're in confirmation mode
    if (isListening || isProcessing) {
      console.log('Already listening or processing, ignoring start request');
      return;
    }

    // If recognition is active but we're not listening (e.g., after command processing),
    // force stop it before starting new one
    if (isRecognitionActive && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setIsRecognitionActive(false);
        // Wait a bit for the stop to take effect
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.warn('Error stopping previous recognition:', error);
      }
    }

    if (!recognitionRef.current) {
      await initRecognition();
    }

    try {
      setIsRecognitionActive(true);

      if (Capacitor.isNativePlatform()) {
        // For Android, use web API directly
        if (recognitionRef.current && typeof recognitionRef.current.start === 'function') {
          recognitionRef.current.start();
        } else {
          throw new Error('Speech recognition not initialized');
        }
      } else if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      setIsListening(true);
      toast({
        title: '🎤 Listening...',
        description: voiceSettings.continuousMode ? 'Continuous mode - say "stop listening" to end' : 'Speak your command',
      });
    } catch (error) {
      console.error('Failed to start recognition:', error);
      setIsRecognitionActive(false);
      toast({
        title: 'Microphone Error',
        description: 'Please allow microphone access and try again',
        variant: 'destructive'
      });
    }
  }, [userAuthenticated, authLoading, initRecognition, voiceSettings, toast, isListening, isProcessing, isRecognitionActive]);

  // Stop listening
  const stopListening = useCallback(async () => {
    setIsListening(false);
    setIsContinuousMode(false);
    setIsRecognitionActive(false);

    if (Capacitor.isNativePlatform()) {
      // For Android, use web API directly
      if (recognitionRef.current && typeof recognitionRef.current.stop === 'function') {
        recognitionRef.current.stop();
      }
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    await speakText('Voice listening stopped.');
  }, []);

  // Advanced TTS with fallback
  const speakText = useCallback(async (text: string) => {
    if (!voiceSettings.ttsEnabled) return;

    try {
      if (Capacitor.isNativePlatform()) {
        // For Android, prefer web speech synthesis since native TTS plugin may not be implemented
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = voiceSettings.language;
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          window.speechSynthesis.speak(utterance);
        } else {
          console.warn('Web speech synthesis not available on Android');
        }
      } else if (window.speechSynthesis) {
        // Web platform - use browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voiceSettings.language;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('TTS failed:', error);
    }
  }, [voiceSettings]);

  // Check if command requires confirmation
  const requiresConfirmation = useCallback((command: string): boolean => {
    if (!voiceSettings.confirmationRequired) return false;

    const lowerCommand = command.toLowerCase();

    // Only require confirmation for very specific bulk commands that are likely to affect multiple devices
    const bulkCommands = [
      'turn off all lights', 'turn on all lights',
      'turn off all fans', 'turn on all fans',
      'turn off all switches', 'turn on all switches',
      'turn off all devices', 'turn on all devices',
      'shutdown all', 'power off all',
      'disable all', 'reset all', 'restart all'
    ];

    return bulkCommands.some(bulkCmd => lowerCommand.includes(bulkCmd));
  }, [voiceSettings.confirmationRequired]);

  // Start confirmation listening
  const startConfirmationListening = useCallback(async (command: string) => {
    setAwaitingConfirmation(true);
    setPendingCommand(command);

    // Force stop any existing recognition before starting confirmation
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        // Ignore errors if already stopped
      }
    }
    setIsRecognitionActive(false);
    setIsListening(false);

    await speakText(`Are you sure you want to ${command}? Say yes to confirm or no to cancel.`);

    toast({
      title: '🔄 Confirmation Required',
      description: `Say "yes" to confirm or "no" to cancel: "${command}"`,
      duration: 10000,
    });

    // Wait longer to ensure recognition has fully stopped
    await new Promise(resolve => setTimeout(resolve, 1000));

    await startListening();
  }, [speakText, toast, startListening]);

  // Process confirmation response
  const processConfirmation = useCallback(async (response: string) => {
    const confirmation = response.toLowerCase().trim();

    if (confirmation === 'yes' || confirmation === 'confirm' || confirmation === 'okay' || confirmation === 'sure') {
      setAwaitingConfirmation(false);
      await speakText('Confirmed. Executing command.');
      await processCommand(pendingCommand, false, true);
      setPendingCommand('');
    } else if (confirmation === 'no' || confirmation === 'cancel' || confirmation === 'stop') {
      setAwaitingConfirmation(false);
      await speakText('Command cancelled.');
      toast({
        title: '❌ Command Cancelled',
        description: 'Voice command was cancelled',
      });
      setPendingCommand('');
    } else {
      await speakText('Please say yes or no clearly.');
    }
  }, [pendingCommand, speakText, toast]);

  // Ensure voice session (fallback to JWT if voice session fails)
  const ensureVoiceSession = useCallback(async () => {
    // First try to get existing voice token
    if (voiceToken) return voiceToken;

    // If no voice token, try to create one
    try {
      const session = await createVoiceSession();
      if (session?.voiceToken) {
        return session.voiceToken;
      }
    } catch (error) {
      console.warn('Voice session creation failed, using JWT authentication:', error);
    }

    // Fallback: Return null to indicate JWT authentication should be used
    // The voiceAuth middleware will handle JWT fallback when no voiceToken is provided
    console.log('Using JWT authentication for voice commands (no voice session)');
    return null;
  }, [voiceToken, createVoiceSession]);

  // Main command processing
  const processCommand = useCallback(async (command: string, retried = false, isConfirmed = false) => {
    if (awaitingConfirmation) {
      await processConfirmation(command);
      return;
    }

    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('stop listening') || lowerCommand.includes('stop voice') || lowerCommand.includes('end listening')) {
      await stopListening();
      toast({
        title: '🛑 Listening Stopped',
        description: 'Voice control deactivated',
      });
      return;
    }

    if (!isConfirmed && requiresConfirmation(command)) {
      await startConfirmationListening(command);
      return;
    }

    const activeToken = await ensureVoiceSession();
    if (!activeToken) return;

    setIsProcessing(true);
    setCurrentTranscript('');

    if (!retried) {
      toast({
        title: '🎤 Processing...',
        description: `"${command}"`,
      });
    }

    try {
      const requestData: any = {
        command,
        assistant: Capacitor.isNativePlatform() ? 'android' : 'web'
      };

      // Only include voiceToken if we have a real voice session token
      // If activeToken is null, we're using JWT authentication
      if (activeToken) {
        requestData.voiceToken = activeToken;
      }

      const response = await voiceAssistantAPI.processVoiceCommand(requestData);

      const commandResult: VoiceCommand = {
        id: Date.now().toString(),
        command,
        response: response.data.message || 'Command executed',
        timestamp: new Date(),
        success: response.data.success
      };

      setCommandHistory(prev => [commandResult, ...prev.slice(0, 49)]);

      if (response.data.success) {
        toast({
          title: '✅ Command Executed',
          description: response.data.message || 'Voice command successful',
        });

        await speakText(response.data.message || 'Command executed successfully');
        onCommandExecuted?.(response.data);
      } else {
        toast({
          title: '❌ Command Failed',
          description: response.data.message || 'Could not execute command',
          variant: 'destructive'
        });

        await speakText('Sorry, I could not execute that command. ' + (response.data.message || 'Please try again.'));
      }
    } catch (error: any) {
      console.error('Voice command error:', error);

      const commandResult: VoiceCommand = {
        id: Date.now().toString(),
        command,
        response: 'Command failed',
        timestamp: new Date(),
        success: false
      };

      setCommandHistory(prev => [commandResult, ...prev.slice(0, 49)]);

      let errorMessage = 'Failed to process command';

      if (error.response?.status === 401) {
        errorMessage = 'Please login first to use voice commands';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast({
        title: '❌ Command Failed',
        description: errorMessage,
        variant: 'destructive'
      });

      await speakText('Sorry, there was an error processing your command. ' + errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [
    awaitingConfirmation, processConfirmation, stopListening, requiresConfirmation,
    startConfirmationListening, ensureVoiceSession, toast, speakText, onCommandExecuted
  ]);

  // Handle mic button click
  const handleMicClick = useCallback(async () => {
    if (isProcessing) return;

    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isProcessing, isListening, stopListening, startListening]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'm':
            event.preventDefault();
            handleMicClick();
            break;
          case 'h':
            event.preventDefault();
            setShowHistory(true);
            break;
          case 's':
            event.preventDefault();
            setShowSettings(true);
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleMicClick]);

  // Auto-start continuous mode
  useEffect(() => {
    if (isContinuousMode && !isListening && !isProcessing && !awaitingConfirmation) {
      const timer = setTimeout(() => {
        startListening();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isContinuousMode, isListening, isProcessing, awaitingConfirmation, startListening]);

  // Load settings on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('voiceSettings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        setVoiceSettings(settings);
        setIsContinuousMode(settings.continuousMode || false);
        setShowTranscript(settings.showTranscript || false);
        setShowSuggestions(settings.showSuggestions || false);
      } catch (error) {
        console.warn('Failed to load voice settings:', error);
      }
    }
  }, []);

  // Save settings when changed
  useEffect(() => {
    const settings = {
      ...voiceSettings,
      continuousMode: isContinuousMode,
      showTranscript,
      showSuggestions
    };
    localStorage.setItem('voiceSettings', JSON.stringify(settings));
  }, [voiceSettings, isContinuousMode, showTranscript, showSuggestions]);

  if (!isSpeechSupported) {
    return null;
  }

  return (
    <>
      {/* Main Floating Mic Button */}
      <div
        className={cn(
          "fixed z-50 transition-all duration-300 ease-in-out",
          voiceSettings.position === 'bottom-right' && "bottom-6 right-6",
          voiceSettings.position === 'bottom-left' && "bottom-6 left-6",
          voiceSettings.position === 'top-right' && "top-6 right-6",
          voiceSettings.position === 'top-left' && "top-6 left-6"
        )}
      >
        <div className="relative">
          {/* Pulsing animation when listening */}
          {isListening && (
            <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-20" />
          )}

          {/* Main mic button */}
          <Button
            onClick={handleMicClick}
            disabled={isProcessing}
            size={voiceSettings.buttonSize === 'large' ? 'lg' : voiceSettings.buttonSize === 'small' ? 'sm' : 'default'}
            className={cn(
              "rounded-full shadow-lg transition-all duration-200",
              isListening && "bg-red-500 hover:bg-red-600 animate-pulse",
              isProcessing && "bg-yellow-500 hover:bg-yellow-600",
              awaitingConfirmation && "bg-orange-500 hover:bg-orange-600",
              voiceSettings.theme === 'dark' && "bg-gray-800 hover:bg-gray-700 text-white",
              voiceSettings.theme === 'colorful' && "bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-200"
            )}
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isListening ? (
              <MicOff className="h-5 w-5" />
            ) : awaitingConfirmation ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          {/* Status indicator */}
          {(isListening || isProcessing || awaitingConfirmation) && (
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-current rounded-full flex items-center justify-center">
              {isListening && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              {isProcessing && <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />}
              {awaitingConfirmation && <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />}
            </div>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="absolute top-full mt-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSettings(true)}
            className="rounded-full w-8 h-8 p-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHistory(true)}
            className="rounded-full w-8 h-8 p-0"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transcript Display */}
      {showTranscript && (
        <VoiceTranscriptDisplay
          transcript={currentTranscript}
          isListening={isListening}
          onEdit={(newTranscript) => setCurrentTranscript(newTranscript)}
          onSend={() => {
            if (currentTranscript.trim()) {
              processCommand(currentTranscript.trim());
            }
          }}
        />
      )}

      {/* Command Suggestions */}
      {showSuggestions && (
        <VoiceCommandSuggestions
          onCommandSelect={(command) => processCommand(command)}
          recentCommands={commandHistory.slice(0, 5).map(h => h.command)}
        />
      )}

      {/* Command History */}
      {showHistory && (
        <VoiceCommandHistory
          history={commandHistory}
          onRepeatCommand={(command) => processCommand(command)}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Settings Dialog */}
      {showSettings && (
        <VoiceControlSettings
          settings={{
            continuousListening: isContinuousMode,
            language: voiceSettings.language,
            ttsEnabled: voiceSettings.ttsEnabled,
            showSuggestions: voiceSettings.showSuggestions,
            showTranscript: voiceSettings.showTranscript,
            confirmationRequired: voiceSettings.confirmationRequired,
            theme: voiceSettings.theme,
            size: voiceSettings.buttonSize
          }}
          onSettingsChange={(newSettings) => {
            setVoiceSettings({
              continuousMode: newSettings.continuousListening,
              language: newSettings.language,
              ttsEnabled: newSettings.ttsEnabled,
              showSuggestions: newSettings.showSuggestions,
              showTranscript: newSettings.showTranscript,
              confirmationRequired: newSettings.confirmationRequired,
              theme: newSettings.theme,
              position: voiceSettings.position,
              buttonSize: newSettings.size
            });
            setIsContinuousMode(newSettings.continuousListening);
            setShowTranscript(newSettings.showTranscript);
            setShowSuggestions(newSettings.showSuggestions);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
};

export default FloatingVoiceMic;
