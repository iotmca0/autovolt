import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { voiceAssistantAPI } from '@/services/api';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { useVoiceSettings } from '@/hooks/useVoiceSettings';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AutoVoltAssistant } from './AutoVoltAssistant';
import { androidVoiceHelper } from '@/utils/androidVoiceHelper';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface FloatingVoiceMicProps {
  onCommandExecuted?: (result: any) => void;
}

export const FloatingVoiceMic: React.FC<FloatingVoiceMicProps> = ({ onCommandExecuted }) => {
  const { toast } = useToast();
  const { voiceToken, isAuthenticated, isLoading: sessionLoading, createVoiceSession, clearVoiceSession } = useVoiceSession();
  const location = useLocation();
  const { user } = useAuth();
  
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [retryCommand, setRetryCommand] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [showAssistantPanel, setShowAssistantPanel] = useState(false);
  
  const voiceSettings = useVoiceSettings();
  
  // Constants for button positioning
  const BUTTON_SIZE = 64; // Button diameter
  const EDGE_MARGIN = 16; // Margin from screen edges
  const SNAP_THRESHOLD = 100; // Distance to snap to edge
  
  // Load saved position from localStorage or use default
  const getSavedPosition = () => {
    try {
      const saved = localStorage.getItem('voiceMicPosition');
      if (saved) {
        const pos = JSON.parse(saved);
        // Validate position is within window bounds
        if (pos.x >= 0 && pos.x < window.innerWidth && pos.y >= 0 && pos.y < window.innerHeight) {
          return pos;
        }
      }
    } catch (e) {
      console.error('Failed to load voice mic position:', e);
    }
    return { x: window.innerWidth - BUTTON_SIZE - EDGE_MARGIN, y: window.innerHeight - BUTTON_SIZE - EDGE_MARGIN };
  };
  
  const [position, setPosition] = useState(getSavedPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragStartTime, setDragStartTime] = useState(0);
  const [dragMoved, setDragMoved] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const buttonRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  // Timer to auto-cancel confirmation mode if user stays silent
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track latest awaitingConfirmation state to avoid stale closure in timer
  const awaitingConfirmationRef = useRef(false);
  // Auto stop timer to prevent listening forever when silent
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track latest listening state to avoid stale closures
  const isListeningRef = useRef(false);
  // Avoid duplicate native init in React 18 StrictMode (dev mounts effects twice)
  const initOnceRef = useRef(false);

  // Check browser support OR Capacitor native support
  useEffect(() => {
    if (initOnceRef.current) {
      // In React 18 StrictMode dev, effects mount twice; prevent double init/log noise
      return;
    }
    initOnceRef.current = true;
    const isNative = Capacitor.isNativePlatform();
    
    // Initialize Android-specific voice features
    if (isNative && Capacitor.getPlatform() === 'android') {
      console.log('📱 Initializing Android voice features...');
      androidVoiceHelper.initialize().then(available => {
        if (available) {
          console.log('✅ Android native voice features ready');
          setIsSpeechSupported(true);
        } else {
          console.log('⚠️ Android native voice not available, trying WebView fallback');
          // Fall back to Web Speech API in WebView
          const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          setIsSpeechSupported(!!SpeechRecognitionAPI);
        }
      }).catch(err => {
        console.error('❌ Android voice initialization failed:', err);
        // Fall back to Web Speech API
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        setIsSpeechSupported(!!SpeechRecognitionAPI);
      });
    } else {
      // In Capacitor WebView or browser, Web Speech API should work directly
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognitionAPI) {
        setIsSpeechSupported(true);
        console.log('🎤 Speech recognition available:', isNative ? 'Native WebView' : 'Browser');
      } else {
        setIsSpeechSupported(false);
        console.log('❌ Speech recognition NOT available');
      }
    }
    
    // Initialize speech synthesis with retry for WebView
    const initSpeechSynthesis = () => {
      if (window.speechSynthesis) {
        synthRef.current = window.speechSynthesis;
        console.log('🔊 Speech Synthesis initialized');
        
        // Load voices - Important: voices may not be loaded immediately
        const loadVoices = () => {
          if (!window.speechSynthesis) return;
          const voices = window.speechSynthesis.getVoices();
          console.log('🔊 Available TTS voices:', voices.length);
          if (voices.length > 0) {
            console.log('🔊 TTS is ready with', voices.length, 'voices');
            // Set default voice if not set
            if (!voiceSettings.ttsVoice && voices.length > 0) {
              const defaultVoice = voices.find(v => v.default) || voices[0];
              console.log('🔊 Setting default voice:', defaultVoice.name);
            }
          } else {
            console.log('🔊 No voices loaded yet, waiting for voiceschanged event');
          }
        };
        
        // Load voices immediately
        loadVoices();
        
        // Also load on voiceschanged event (Chrome/WebView needs this)
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        
        // Retry loading voices after a delay (WebView quirk)
        setTimeout(() => {
          if (window.speechSynthesis) {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
              console.log('🔊 Voices loaded on delayed retry:', voices.length);
            }
          }
        }, 500);
      } else {
        console.warn('⚠️ Speech Synthesis not available yet, will retry...');
        
        // Retry with exponential backoff for WebView initialization
        let retryCount = 0;
        const maxRetries = 5;
        const retryIntervals = [500, 1000, 2000, 3000, 5000];
        
        const retryInit = () => {
          if (retryCount >= maxRetries) {
            console.error('❌ Speech Synthesis failed to initialize after', maxRetries, 'attempts');
            console.warn('💡 Voice responses will use toast notifications as fallback');
            return;
          }
          
          setTimeout(() => {
            if (window.speechSynthesis) {
              console.log('✅ Speech Synthesis now available on retry', retryCount + 1);
              initSpeechSynthesis();
            } else {
              console.warn(`⚠️ Retry ${retryCount + 1}/${maxRetries} - Speech Synthesis still not available`);
              retryCount++;
              retryInit();
            }
          }, retryIntervals[retryCount]);
        };
        
        retryInit();
      }
    };
    
    initSpeechSynthesis();
  }, []);

  // Initialize voice session on mount (only if main app is logged in)
  useEffect(() => {
    // Check if user is logged in to main app
    const mainToken = localStorage.getItem('auth_token');
    
    if (!mainToken) {
      console.log('⚠️ User not logged in to main app - voice features disabled');
      return;
    }
    
    if (!isAuthenticated && !sessionLoading && isSpeechSupported) {
      console.log('🔐 Attempting to create voice session...');
      createVoiceSession().catch(err => {
        console.error('❌ Failed to create voice session:', err);
        console.error('Error details:', err.response?.data || err.message);
        // Only show toast if it's not a token error (user should be logged in already)
        if (err.response?.data?.code !== 'NO_TOKEN') {
          toast({
            title: '⚠️ Voice Session Error',
            description: 'Failed to initialize voice assistant',
            variant: 'destructive'
          });
        }
      });
    } else if (isAuthenticated) {
      console.log('✅ Voice session already authenticated');
    }
  }, [isAuthenticated, sessionLoading, createVoiceSession, isSpeechSupported, toast]);

  // Keep refs in sync with state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Helper: stop listening safely and clear timers
  const stopListening = (reason?: string) => {
    if (reason) {
      console.log(`🛑 Stopping recognition${reason ? ` (${reason})` : ''}`);
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (confirmationTimerRef.current && !awaitingConfirmationRef.current) {
      clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (isListeningRef.current) setIsListening(false);
  };

  // Helper: schedule auto stop while listening when idle
  const scheduleAutoStop = () => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    // Never auto-stop in continuous mode
    if (voiceSettings.continuousMode) return;
    const timeoutMs = awaitingConfirmationRef.current ? 15000 : 8000; // 15s for confirmation, 8s normal
    autoStopTimerRef.current = setTimeout(() => {
      // Only stop if still listening and not speaking
      if (isListeningRef.current && !isSpeaking) {
        stopListening('auto-timeout');
        toast({
          title: 'Listening timed out',
          description: 'No speech detected. Tap mic to try again.',
        });
      }
    }, timeoutMs);
  };

  // Initialize speech recognition (lazy initialization - only when needed)
  const initRecognition = () => {
    if (!isSpeechSupported) return;
    if (recognitionRef.current) return; // already initialized

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // CRITICAL: Always use continuous mode to prevent auto-stop during confirmation flow
    // When awaiting confirmation, we need recognition to stay active for the user's response
    recognition.continuous = true;
    recognition.interimResults = voiceSettings.showTranscript;
    recognition.lang = voiceSettings.language;

    recognition.onstart = () => {
      console.log('🎤 Recognition onstart event fired, isListening:', isListening);
      setIsListening(true);
      setTranscript('');
      setInterimTranscript('');
      
      const isConfirmationMode = awaitingConfirmationRef.current;
      toast({
        title: isConfirmationMode ? '🔔 Listening for confirmation...' : '🎤 Listening...',
        description: isConfirmationMode ? 'Say "yes" to confirm or "no" to cancel' : 'Speak your command now',
      });
      
      // Load suggestions only if not in confirmation mode
      if (voiceSettings.showSuggestions && !isConfirmationMode) {
        setSuggestions([
          'Turn on all lights',
          'Turn off fans in classroom',
          'Show device status',
          'Set schedule for tomorrow',
          'What\'s the temperature?',
        ]);
      }
      // Start inactivity auto-stop timer
      scheduleAutoStop();
    };

    // Enhanced noise filtering and confidence scoring
    const processRecognitionResult = (event: any) => {
      let finalTranscript = '';
      let interim = '';
      let maxConfidence = 0;
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        
        if (result.isFinal) {
          // Filter out noise: ignore very short or very long transcripts
          if (transcript.length < 2 || transcript.length > 100) continue;
          
          // Check confidence score (if available)
          const confidence = result[0].confidence || 0.5;
          if (confidence < 0.3) continue; // Too low confidence
          
          maxConfidence = Math.max(maxConfidence, confidence);
          finalTranscript += (finalTranscript ? ' ' : '') + transcript;
        } else {
          interim += transcript;
        }
      }
      
      // Only process if we have reasonable confidence
      if (finalTranscript && maxConfidence > 0.4) {
        // Reset inactivity timer and process command
        scheduleAutoStop();
        processCommand(finalTranscript);
      }
    };

    recognition.onresult = (event: any) => {
      processRecognitionResult(event);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        let errorMessage = 'Voice recognition error';
        switch(event.error) {
          case 'not-allowed':
            errorMessage = '🔒 Microphone blocked! Using HTTP on network IP. Solution: Access via http://localhost:5173 or enable HTTPS. See console for details.';
            console.error('🔒 MICROPHONE BLOCKED - SECURITY ISSUE');
            console.error('Problem: Browser blocks microphone on HTTP (non-localhost)');
            console.error('Quick Fix: Access app via http://localhost:5173 instead');
            console.error('Or use: edge://flags/#unsafely-treat-insecure-origin-as-secure');
            break;
          case 'network':
            errorMessage = 'Network error. Please check your connection.';
            break;
        }

        toast({
          title: 'Voice Error',
          description: errorMessage,
          variant: 'destructive'
        });
      }
    };

    recognition.onend = () => {
      const wasAwaitingConfirmation = awaitingConfirmationRef.current;
      console.log('🎤 Recognition onend event fired, awaitingConfirmation:', wasAwaitingConfirmation);
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      
      // If we're awaiting confirmation and recognition ended unexpectedly, restart it
      if (wasAwaitingConfirmation && !isListening) {
        console.log('⚠️ Recognition ended during confirmation wait - restarting...');
        try {
          setTimeout(() => {
            if (awaitingConfirmationRef.current && recognitionRef.current) {
              recognitionRef.current.start();
              console.log('✅ Recognition restarted for confirmation');
            }
          }, 100);
        } catch (err) {
          console.error('Failed to restart recognition:', err);
        }
      } else {
        console.log('🛑 Setting isListening to false');
        setIsListening(false);
      }
    };

    // If we detect end of speech and we're not in confirmation or continuous mode, stop quickly
    recognition.onspeechend = () => {
      if (!voiceSettings.continuousMode && !awaitingConfirmationRef.current) {
        stopListening('speech-end');
      }
    };

    recognitionRef.current = recognition;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
        confirmationTimerRef.current = null;
      }
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
  }, []);

  // Keep a ref in sync with awaitingConfirmation for use inside timers
  useEffect(() => {
    awaitingConfirmationRef.current = awaitingConfirmation;
  }, [awaitingConfirmation]);

  // Calculate snap position to nearest edge or corner
  const snapToEdge = (x: number, y: number): { x: number; y: number } => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Calculate center of button
    const centerX = x + BUTTON_SIZE / 2;
    const centerY = y + BUTTON_SIZE / 2;
    
    // Calculate distances to each edge
    const distToLeft = centerX;
    const distToRight = windowWidth - centerX;
    const distToTop = centerY;
    const distToBottom = windowHeight - centerY;
    
    // Find the two closest edges
    const horizontal = distToLeft < distToRight ? 'left' : 'right';
    const vertical = distToTop < distToBottom ? 'top' : 'bottom';
    
    // Determine if we should snap to corner or edge
    const minHorizontal = Math.min(distToLeft, distToRight);
    const minVertical = Math.min(distToTop, distToBottom);
    
    let snapX = x;
    let snapY = y;
    
    // If close to both edges, snap to corner
    if (minHorizontal < SNAP_THRESHOLD && minVertical < SNAP_THRESHOLD) {
      // Snap to corner
      snapX = horizontal === 'left' ? EDGE_MARGIN : windowWidth - BUTTON_SIZE - EDGE_MARGIN;
      snapY = vertical === 'top' ? EDGE_MARGIN : windowHeight - BUTTON_SIZE - EDGE_MARGIN;
    } 
    // Otherwise snap to nearest edge (left/right or top/bottom)
    else if (minHorizontal < minVertical) {
      // Snap to left or right edge
      snapX = horizontal === 'left' ? EDGE_MARGIN : windowWidth - BUTTON_SIZE - EDGE_MARGIN;
      // Keep Y position but constrain within bounds
      snapY = Math.max(EDGE_MARGIN, Math.min(y, windowHeight - BUTTON_SIZE - EDGE_MARGIN));
    } else {
      // Snap to top or bottom edge
      snapY = vertical === 'top' ? EDGE_MARGIN : windowHeight - BUTTON_SIZE - EDGE_MARGIN;
      // Keep X position but constrain within bounds
      snapX = Math.max(EDGE_MARGIN, Math.min(x, windowWidth - BUTTON_SIZE - EDGE_MARGIN));
    }
    
    return { x: snapX, y: snapY };
  };

  // Save position to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('voiceMicPosition', JSON.stringify(position));
    } catch (e) {
      console.error('Failed to save voice mic position:', e);
    }
  }, [position]);

  // Handle window resize - reposition to maintain edge/corner position
  useEffect(() => {
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Check if button is out of bounds after resize
      const maxX = windowWidth - BUTTON_SIZE - EDGE_MARGIN;
      const maxY = windowHeight - BUTTON_SIZE - EDGE_MARGIN;
      
      if (position.x > maxX || position.y > maxY || position.x < EDGE_MARGIN || position.y < EDGE_MARGIN) {
        // Snap to nearest valid edge/corner
        const snapped = snapToEdge(
          Math.max(EDGE_MARGIN, Math.min(position.x, maxX)),
          Math.max(EDGE_MARGIN, Math.min(position.y, maxY))
        );
        setIsAnimating(true);
        setPosition(snapped);
        setTimeout(() => setIsAnimating(false), 300);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position]);

  // Handle dragging - Mouse and Touch support
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      
      setDragMoved(true);
      const newX = clientX - dragOffset.x;
      const newY = clientY - dragOffset.y;

      // Constrain to window bounds
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 80;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleEnd = () => {
      if (isDragging) {
        // Snap to nearest edge/corner when drag ends
        const snapped = snapToEdge(position.x, position.y);
        setIsAnimating(true);
        setPosition(snapped);
        
        // Reset animation flag after transition
        setTimeout(() => setIsAnimating(false), 300);
      }
      
      setIsDragging(false);
      // Small delay to prevent click event after drag
      setTimeout(() => setDragMoved(false), 100);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragOffset, position]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragStartTime(Date.now());
    setDragMoved(false);
    
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: clientX - rect.left,
        y: clientY - rect.top
      });
      
      // Start dragging after 150ms hold (or immediately with Shift/right-click)
      const isRightClick = 'button' in e && e.button === 2;
      const isShiftClick = 'shiftKey' in e && e.shiftKey;
      
      if (isRightClick || isShiftClick) {
        setIsDragging(true);
        e.preventDefault();
        e.stopPropagation();
      } else {
        // Enable drag mode after holding for 150ms
        setTimeout(() => {
          if (Date.now() - dragStartTime >= 100 && !dragMoved) {
            setIsDragging(true);
          }
        }, 150);
      }
    }
  };

  // Unified speak response function
  const speakResponse = async (text: string) => {
    // Check if voice responses are enabled (default to true if not set)
    const voiceResponsesEnabled = voiceSettings.voiceResponses !== false;
    
    if (!voiceResponsesEnabled) {
      console.log('🔊 Voice responses disabled in settings');
      return;
    }

    console.log('🔊 Speaking response:', text);

    // Prevent TTS from being captured by recognition: pause if currently listening
    if (recognitionRef.current && isListeningRef.current) {
      stopListening('tts-playing');
    }

    try {
      setIsSpeaking(true);
      
      // Prefer Android native TTS for better quality
      const isAndroid = Capacitor.getPlatform() === 'android';
      
      if (isAndroid && androidVoiceHelper.isAndroidPlatform()) {
        console.log('🔊 Using Android native TTS (high quality)');
        
        try {
          await androidVoiceHelper.speak(text, {
            language: voiceSettings.language || 'en-US',
            rate: voiceSettings.ttsRate,
            pitch: 1.0,
            volume: voiceSettings.ttsVolume,
            category: 'ambient'
          });
          console.log('🔊 Android native TTS completed');
          setIsSpeaking(false);
          return; // Success, exit early
        } catch (androidError) {
          console.warn('🔊 Android native TTS failed, trying fallback:', androidError);
          // Fall through to Capacitor TTS
        }
      }
      
      // Try Capacitor TTS (works on both Android and iOS) if plugin is bridged
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech')) {
        console.log('🔊 Using Capacitor TTS');
        
        try {
          await TextToSpeech.speak({
            text: text,
            lang: voiceSettings.language || 'en-US',
            rate: voiceSettings.ttsRate,
            volume: voiceSettings.ttsVolume,
            pitch: 1.0,
            category: 'ambient'
          });
          console.log('🔊 Capacitor TTS completed');
          setIsSpeaking(false);
          return; // Success, exit early
        } catch (capacitorError) {
          console.warn('🔊 Capacitor TTS failed, trying browser fallback:', capacitorError);
          // Fall through to browser TTS
        }
      }
      
      // Browser TTS fallback (works in web browsers)
      if (window.speechSynthesis) {
        console.log('🔊 Using browser Speech Synthesis');
        
        return new Promise<void>((resolve, reject) => {
          try {
            // Cancel any ongoing speech first
            window.speechSynthesis.cancel();
            
            // Wait a bit for cancel to complete (Android WebView needs this)
            setTimeout(() => {
              const utterance = new SpeechSynthesisUtterance(text);
              utterance.rate = voiceSettings.ttsRate || 1.0;
              utterance.volume = voiceSettings.ttsVolume || 1.0;
              utterance.pitch = 1.0;
              
              // Set voice if available
              const voices = window.speechSynthesis.getVoices();
              
              if (voices.length > 0) {
                const selectedVoice = voices.find(v => v.name === voiceSettings.ttsVoice);
                if (selectedVoice) {
                  utterance.voice = selectedVoice;
                } else {
                  const defaultVoice = voices.find(v => v.default) || voices[0];
                  utterance.voice = defaultVoice;
                }
              }
              
              utterance.onstart = () => {
                console.log('🔊 Browser TTS started');
              };
              
              utterance.onend = () => {
                console.log('🔊 Browser TTS completed');
                setIsSpeaking(false);
                resolve();
              };
              
              utterance.onerror = (e) => {
                console.error('🔊 Browser TTS error:', e.error);
                setIsSpeaking(false);
                
                // Show toast as ultimate fallback
                toast({
                  title: '🔊 Voice Response',
                  description: text,
                  duration: 3000,
                });
                
                resolve(); // Resolve anyway to prevent hanging
              };
              
              window.speechSynthesis.speak(utterance);
            }, 100); // Small delay for Android WebView
          } catch (browserError) {
            console.error('🔊 Browser TTS setup error:', browserError);
            setIsSpeaking(false);
            
            // Show toast as fallback
            toast({
              title: '🔊 Voice Response',
              description: text,
              duration: 3000,
            });
            
            resolve();
          }
        });
      } else {
        console.warn('🔊 Speech Synthesis not available, using toast notification');
        setIsSpeaking(false);
        
        // Show toast notification as fallback
        toast({
          title: '🔊 Voice Response',
          description: text,
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('🔊 TTS Error:', error);
      setIsSpeaking(false);
      
      // Show toast notification as ultimate fallback
      toast({
        title: '🔊 Voice Response',
        description: text,
        duration: 3000,
      });
    }
  };

  // Handle confirmation responses (yes/no)
  const handleConfirmationResponse = async (response: string) => {
    const normalizedResponse = response.toLowerCase().trim();
    // Broad, token-based matching (word boundaries) so phrases like "yes please" or "no thanks" are accepted
    const isConfirmed = /\b(yes|yeah|yep|sure|ok|okay|confirm|proceed|do it|go ahead|continue|execute|perform|start)\b/i.test(normalizedResponse);
    const isCancelled = /\b(no|nope|cancel|stop|abort|nevermind|never mind|don't|do not|negative|reject|decline|forget it|skip)\b/i.test(normalizedResponse);
    
    if (isConfirmed && pendingAction) {
      console.log('✅ Confirmation detected - stopping recognition');
      // CRITICAL: Stop listening FIRST before any async operations
      setIsListening(false);
      setAwaitingConfirmation(false);
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
        confirmationTimerRef.current = null;
      }
      
      // Stop recognition immediately
      stopListening('confirmed');
      
      await speakResponse('Confirmed. Executing action now.');
      toast({
        title: '✅ Confirmed',
        description: 'Executing the action...',
      });
      
      // Execute the pending action
      await executePendingAction(pendingAction);
      setPendingAction(null);
    } else if (isCancelled) {
      console.log('❌ Cancellation detected - stopping recognition');
      // CRITICAL: Stop listening FIRST before any async operations
      setIsListening(false);
      setAwaitingConfirmation(false);
      setPendingAction(null);
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
        confirmationTimerRef.current = null;
      }
      
      // Stop recognition immediately
      stopListening('cancelled');
      
      await speakResponse('Action cancelled.');
      toast({
        title: '❌ Cancelled',
        description: 'The action was not executed',
      });
    } else {
      // Didn't understand, ask again
      console.log('⚠️ Unclear confirmation response, re-prompting');
      await speakResponse('Sorry, I didn\'t understand. Please say yes or no.');
      toast({
        title: '⚠️ Please confirm',
        description: 'Say "yes" to proceed or "no" to cancel',
      });
      
      // Keep listening for confirmation ONLY if not already listening
      if (!isListening && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.error('Failed to restart listening for confirmation:', err);
        }
      }
    }
  };

  // Execute the pending bulk action
  const executePendingAction = async (action: any) => {
    try {
      const response = await voiceAssistantAPI.processVoiceCommand({
        command: action.command,
        assistant: 'web',
        voiceToken: voiceToken || ''
      });

      const success = response.data.success;
      const message = response.data.message || 'Action completed';
      
      await speakResponse(message);
      
      toast({
        title: success ? '✅ Success' : '❌ Failed',
        description: message,
        variant: success ? 'default' : 'destructive'
      });

      if (success) {
        onCommandExecuted?.(response.data);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to execute action';
      await speakResponse(errorMessage);
      toast({
        title: '❌ Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    // Don't trigger click if we were dragging
    if (dragMoved || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    e.stopPropagation();

    // Handle double-click to open assistant chatbot
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;
    setLastClickTime(now);
    
    if (timeSinceLastClick < 300) {
      // Double-click detected - open assistant panel
      console.log('🤖 Double-click detected - opening AutoVolt Assistant');
      setShowAssistantPanel(true);
      await speakResponse(`Hello! I'm ${voiceSettings.wakeWord || 'AutoVolt'}, your AI assistant. How can I help you today?`);
      toast({
        title: `🤖 ${voiceSettings.wakeWord || 'AutoVolt'} Assistant`,
        description: 'Assistant panel opened. You can chat with me now!',
      });
      return;
    }

    if (isListening) {
      // Stop listening
      stopListening('manual-stop');
    } else {
      // Start listening
      if (!isAuthenticated) {
        toast({
          title: 'Creating voice session...',
          description: 'Please wait',
        });
        
        const session = await createVoiceSession();
        if (!session) {
          toast({
            title: 'Authentication Failed',
            description: 'Could not create voice session',
            variant: 'destructive'
          });
          return;
        }
      }

      // Initialize recognition on first use
      if (!recognitionRef.current) {
        initRecognition();
      }

      if (recognitionRef.current && !isListening) {
        try {
          recognitionRef.current.start();
          scheduleAutoStop();
        } catch (error: any) {
          if (error?.name === 'InvalidStateError') {
            console.warn('Recognition already active; ignoring duplicate start');
          } else {
            console.error('Failed to start recognition:', error);
            toast({
              title: 'Microphone Error',
              description: 'Please allow microphone access and try again',
              variant: 'destructive'
            });
          }
        }
      }
    }
  };

  const ensureVoiceSession = async () => {
    if (voiceToken) {
      return voiceToken;
    }

    const session = await createVoiceSession();
    if (session?.voiceToken) {
      return session.voiceToken;
    }

    toast({
      title: 'Authentication Required',
      description: 'Please login to use voice commands',
      variant: 'destructive'
    });
    return null;
  };

  const processCommand = async (command: string, retried = false) => {
    const activeToken = await ensureVoiceSession();
    if (!activeToken) {
      return;
    }

    setIsProcessing(true);
    setSuggestions([]);

    if (!retried) {
      toast({
        title: '🎤 Processing...',
        description: `"${command}"`,
      });
    }

    // Detect bulk operations that need confirmation
    const isBulkOperation = /\b(all|every|entire|whole|multiple|bulk)\b/i.test(command);
    const isCriticalOperation = /\b(turn off all|shut down|disable all|delete|remove all)\b/i.test(command);
    
    if (voiceSettings.autoConfirmation && (isBulkOperation || isCriticalOperation) && !retried) {
      // Request voice confirmation
      console.log('🔔 Bulk/Critical operation detected, requesting confirmation');
      setPendingAction({ command, activeToken });
      setAwaitingConfirmation(true);
      // Clear any existing timer and start a new auto-cancel timer
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }
      const timeoutMs = 15000; // default 15s
      confirmationTimerRef.current = setTimeout(() => {
        if (awaitingConfirmationRef.current) {
          console.log('⏱️ Confirmation timeout reached - auto cancelling');
          // CRITICAL: Stop listening and clear confirmation state
          setIsListening(false);
          setAwaitingConfirmation(false);
          setPendingAction(null);
          
          // Force stop recognition
          if (recognitionRef.current) {
            try { 
              recognitionRef.current.stop();
              console.log('🛑 Recognition forcibly stopped after timeout');
            } catch (err) {
              console.log('Recognition stop attempted (may already be stopped)');
            }
          }
          
          speakResponse('No confirmation received. Action cancelled.');
          toast({
            title: '⏱️ Timeout',
            description: 'No confirmation heard - action cancelled',
          });
        }
      }, timeoutMs);
      
      const confirmationMessage = `This will affect multiple devices. Say yes to confirm or no to cancel.`;
      await speakResponse(confirmationMessage);
      
      toast({
        title: '⚠️ Confirmation Required',
        description: confirmationMessage,
        duration: 10000,
      });
      
      setIsProcessing(false);
      
      // CRITICAL: Ensure recognition is running for confirmation
      // Use a short delay to ensure TTS completes and recognition is ready
      setTimeout(() => {
        if (!isListening && recognitionRef.current && awaitingConfirmationRef.current) {
          try {
            console.log('🎤 Starting recognition for confirmation input');
            recognitionRef.current.start();
          } catch (err) {
            if ((err as any)?.name === 'InvalidStateError') {
              console.log('✅ Confirmation listening already active');
            } else {
              console.error('Failed to start listening for confirmation:', err);
            }
          }
        } else {
          console.log('🎤 Recognition already active for confirmation');
        }
      }, 500); // Delay to let TTS finish speaking
      
      return;
    }

    try {
      const response = await voiceAssistantAPI.processVoiceCommand({
        command,
        assistant: 'web',
        voiceToken: activeToken
      });

      console.log('🎤 Voice command response:', response.data);
      
      const success = response.data.success;
      const message = response.data.message || (success ? 'Voice command successful' : 'Could not execute command');

      console.log('🎤 Command result:', { success, message });

      // Add to command history
      voiceSettings.addCommand({
        command,
        success,
        response: message,
      });

      if (success) {
        toast({
          title: '✅ Command Executed',
          description: message,
        });

        // Speak the success response
        await speakResponse(message);

        // Stop listening after successful command unless in continuous mode
        if (!voiceSettings.continuousMode) {
          stopListening('command-success');
        }

        onCommandExecuted?.(response.data);
        setRetryCommand(null);
      } else {
        // Store failed command for retry
        setRetryCommand(command);
        
        toast({
          title: '❌ Command Failed',
          description: message,
          variant: 'destructive',
          action: retried ? undefined : (
            <Button variant="outline" size="sm" onClick={() => processCommand(command, true)}>
              Retry
            </Button>
          ),
        });
        
        // Speak the failure message too (helpful for users)
        await speakResponse(message);
        
        // Stop listening after failed command unless in continuous mode
        if (!voiceSettings.continuousMode) {
          stopListening('command-failed');
        }
        
        voiceSettings.addCommand({
          command,
          success: false,
          response: message,
        });
      }
    } catch (error: any) {
      console.error('❌ Voice command error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      const statusCode = error.response?.status;
      const errorCode = error.response?.data?.code;
      let errorMessage = 'Failed to process command';

      if (!retried && (errorCode === 'INVALID_VOICE_SESSION' || errorCode === 'VOICE_SESSION_EXPIRED')) {
        clearVoiceSession();
        const session = await createVoiceSession();
        if (session) {
          toast({
            title: '🔄 Voice Session Refreshed',
            description: 'Please try your command again.',
          });
          return await processCommand(command, true);
        }
        errorMessage = 'Voice session expired. Please login again.';
      }

      if (statusCode === 401 && errorCode !== 'INVALID_VOICE_SESSION' && errorCode !== 'VOICE_SESSION_EXPIRED') {
        errorMessage = 'Please login first to use voice commands';
      } else if (statusCode === 403) {
        errorMessage = 'Voice session expired. Please refresh the page';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast({
        title: '❌ Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Allow TTS-only usage: show mic if any TTS mechanism available even if speech recognition unsupported
  const anyTtsPossible = (typeof androidVoiceHelper.pluginsAvailable === 'function'
    ? androidVoiceHelper.pluginsAvailable().tts
    : false) || !!window.speechSynthesis;
  if (!isSpeechSupported && !anyTtsPossible) {
    return null; // Nothing we can do
  }

  // Don't show voice mic if user is not logged in to main app
  const mainToken = localStorage.getItem('auth_token');
  if (!mainToken) {
    return null; // User must be logged in to use voice features
  }

  // Don't show on login, register, or landing pages
  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/reset-password'];
  if (publicRoutes.includes(location.pathname)) {
    return null;
  }

  // Voice control is available to all authenticated users
  // Backend will enforce specific voice command permissions based on role

  return (
    <>
      <div
        ref={buttonRef}
        className="fixed z-50"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transition: isAnimating ? 'left 0.3s ease-out, top 0.3s ease-out' : 'none',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onContextMenu={(e) => e.preventDefault()}
        title="Click to speak | Hold & drag to snap to edges"
      >
        <div className="relative">
          {/* Outer glow rings - Multiple animated rings for professional effect */}
          {isListening && (
            <>
              {/* Ring 1 - Fast pulse */}
              <div className="absolute inset-0 rounded-full border-4 border-red-500/60 animate-ping pointer-events-none" 
                   style={{ animationDuration: '1s' }} />
              
              {/* Ring 2 - Medium pulse */}
              <div className="absolute -inset-2 rounded-full border-2 border-red-400/40 animate-ping pointer-events-none" 
                   style={{ animationDuration: '1.5s', animationDelay: '0.3s' }} />
              
              {/* Ring 3 - Slow pulse */}
              <div className="absolute -inset-4 rounded-full border border-red-300/30 animate-ping pointer-events-none" 
                   style={{ animationDuration: '2s', animationDelay: '0.6s' }} />
              
              {/* Rotating glow effect */}
              <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-red-500/0 via-red-500/30 to-red-500/0 animate-spin pointer-events-none" 
                   style={{ animationDuration: '3s' }} />
            </>
          )}

          {/* Processing glow rings */}
          {isProcessing && (
            <>
              <div className="absolute -inset-2 rounded-full border-2 border-blue-500/50 animate-pulse pointer-events-none" />
              <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-500/0 via-blue-500/20 to-blue-500/0 animate-spin pointer-events-none" 
                   style={{ animationDuration: '2s' }} />
            </>
          )}

          {/* Main Mic Button */}
          <Button
            onClick={handleClick}
            className={cn(
              "w-16 h-16 rounded-full shadow-2xl transition-all duration-500 relative overflow-hidden",
              isListening && "bg-red-500 hover:bg-red-600 scale-110 shadow-red-500/50",
              isProcessing && "bg-blue-600 hover:bg-blue-700 scale-105",
              isDragging && "cursor-grabbing scale-110 opacity-70",
              !isDragging && !isListening && !isProcessing && "cursor-pointer hover:scale-110 bg-primary hover:bg-primary/90"
            )}
            disabled={!isAuthenticated && !sessionLoading}
            size="icon"
          >
            {/* Background shimmer effect when listening */}
            {isListening && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer pointer-events-none" 
                   style={{ 
                     backgroundSize: '200% 100%',
                     animation: 'shimmer 2s infinite'
                   }} />
            )}

            {/* Icon with smooth transitions */}
            <div className="relative z-10 transition-transform duration-300">
              {isProcessing ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : isListening ? (
                <div className="relative">
                  <MicOff className="w-8 h-8 animate-pulse" />
                  {/* Recording dot indicator */}
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse" />
                </div>
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </div>
          </Button>
          
          {/* Bottom recording animation bar - Professional style */}
          {isListening && (
            <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-20 space-y-1">
              {/* Animated sound waves */}
              <div className="flex justify-center items-end gap-1 h-8">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-red-500 rounded-full animate-soundwave"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: '0.8s',
                      height: voiceSettings.showAudioLevel ? `${Math.min(audioLevel, 100)}%` : '50%'
                    }}
                  />
                ))}
              </div>
              
              {/* Recording text */}
              <div className="text-center">
                <span className="text-xs font-medium text-red-500 animate-pulse">Recording...</span>
              </div>
            </div>
          )}

          {/* Processing animation bar */}
          {isProcessing && (
            <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-20">
              <div className="text-center">
                <span className="text-xs font-medium text-blue-500 animate-pulse">Processing...</span>
              </div>
            </div>
          )}

          {/* Speaking animation bar - TTS feedback */}
          {isSpeaking && !isListening && !isProcessing && (
            <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-20 space-y-1">
              {/* Animated sound waves for speaking */}
              <div className="flex justify-center items-end gap-1 h-6">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-green-500 rounded-full animate-soundwave"
                    style={{
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: '1s'
                    }}
                  />
                ))}
              </div>
              <div className="text-center">
                <span className="text-xs font-medium text-green-500 animate-pulse">Speaking...</span>
              </div>
            </div>
          )}
          
          {/* Dragging indicator */}
          {isDragging && dragMoved && (
            <div className="absolute -inset-2 rounded-full border-2 border-dashed border-primary/50 pointer-events-none animate-pulse" />
          )}
        </div>

        {/* Add custom keyframes for animations */}
        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          
          @keyframes soundwave {
            0%, 100% { 
              height: 20%;
              opacity: 0.6;
            }
            50% { 
              height: 100%;
              opacity: 1;
            }
          }
          
          .animate-soundwave {
            animation: soundwave 0.8s ease-in-out infinite;
          }
        `}</style>
      </div>

      {/* Transcript Display */}
      {(transcript || interimTranscript) && voiceSettings.showTranscript && !isDragging && (
        <Card className="fixed bottom-24 right-4 max-w-sm p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 z-40">
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Mic className="h-4 w-4 text-primary" />
              <span className="font-medium">Transcript</span>
            </div>
            <p className="text-foreground">
              {transcript}
              <span className="text-muted-foreground italic">{interimTranscript}</span>
            </p>
          </div>
        </Card>
      )}

      {/* Command Suggestions */}
      {suggestions.length > 0 && voiceSettings.showSuggestions && !isDragging && (
        <Card className="fixed bottom-24 right-4 max-w-sm p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 z-40">
          <div className="text-sm space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-primary" />
              <span className="font-medium">Try saying:</span>
            </div>
            {suggestions.map((suggestion, i) => (
              <Badge key={i} variant="outline" className="text-xs mr-1 mb-1">
                "{suggestion}"
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* AutoVolt AI Assistant Panel - Opens on double-click */}
      <AutoVoltAssistant
        isOpen={showAssistantPanel}
        onClose={() => setShowAssistantPanel(false)}
        voiceToken={voiceToken}
        onSpeakResponse={speakResponse}
      />
    </>
  );
};
