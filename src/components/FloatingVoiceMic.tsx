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

interface FloatingVoiceMicProps {
  onCommandExecuted?: (result: any) => void;
}

export const FloatingVoiceMic: React.FC<FloatingVoiceMicProps> = ({ onCommandExecuted }) => {
  const { toast } = useToast();
  const { voiceToken, isAuthenticated, isLoading: sessionLoading, createVoiceSession, clearVoiceSession } = useVoiceSession();
  
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [retryCommand, setRetryCommand] = useState<string | null>(null);
  
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

  // Check browser support OR Capacitor native support
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    
    // In Capacitor WebView, Web Speech API should work directly
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      setIsSpeechSupported(true);
      console.log('🎤 Speech recognition available:', isNative ? 'Native WebView' : 'Browser');
    } else {
      setIsSpeechSupported(false);
      console.log('❌ Speech recognition NOT available');
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
        // Retry after 1 second (WebView might still be initializing)
        setTimeout(() => {
          if (window.speechSynthesis) {
            console.log('✅ Speech Synthesis now available on retry');
            initSpeechSynthesis();
          } else {
            console.warn('⚠️ Speech Synthesis still not available');
          }
        }, 1000);
      }
    };
    
    initSpeechSynthesis();
  }, []);

  // Initialize voice session on mount
  useEffect(() => {
    if (!isAuthenticated && !sessionLoading && isSpeechSupported) {
      console.log('🔐 Attempting to create voice session...');
      createVoiceSession().catch(err => {
        console.error('❌ Failed to create voice session:', err);
        console.error('Error details:', err.response?.data || err.message);
        toast({
          title: '⚠️ Voice Session Error',
          description: 'Please login first to use voice commands',
          variant: 'destructive'
        });
      });
    } else if (isAuthenticated) {
      console.log('✅ Voice session already authenticated');
    }
  }, [isAuthenticated, sessionLoading, createVoiceSession, isSpeechSupported, toast]);

  // Initialize speech recognition (lazy initialization - only when needed)
  const initRecognition = () => {
    if (!isSpeechSupported || recognitionRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = voiceSettings.continuousMode;
    recognition.interimResults = voiceSettings.showTranscript;
    recognition.lang = voiceSettings.language;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      setInterimTranscript('');
      toast({
        title: '🎤 Listening...',
        description: voiceSettings.continuousMode ? 'Say "stop" to end' : 'Speak your command now',
      });
      
      // Load suggestions
      if (voiceSettings.showSuggestions) {
        setSuggestions([
          'Turn on all lights',
          'Turn off fans in classroom',
          'Show device status',
          'Set schedule for tomorrow',
          'What\'s the temperature?',
        ]);
      }
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPiece;
        } else {
          interim += transcriptPiece;
        }
      }
      
      if (voiceSettings.showTranscript) {
        setInterimTranscript(interim);
        if (finalTranscript) {
          setTranscript(prev => prev + ' ' + finalTranscript);
        }
      }
      
      if (finalTranscript) {
        const command = finalTranscript.trim();
        
        // Check for stop command in continuous mode
        if (voiceSettings.continuousMode && /^(stop|exit|quit|end)$/i.test(command)) {
          recognition.stop();
          setIsListening(false);
          toast({ title: 'Voice control stopped', description: 'Click to start again' });
          return;
        }
        
        processCommand(command);
        
        // In continuous mode, don't stop after each command
        if (!voiceSettings.continuousMode) {
          setTranscript('');
          setInterimTranscript('');
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      
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
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

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

  const handleClick = async (e: React.MouseEvent) => {
    // Don't trigger click if we were dragging
    if (dragMoved || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    e.stopPropagation();

    if (isListening) {
      // Stop listening
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
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
        } catch (error) {
          console.error('Failed to start recognition:', error);
          toast({
            title: 'Microphone Error',
            description: 'Please allow microphone access and try again',
            variant: 'destructive'
          });
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

      // Function to speak response using native TTS or browser TTS
      const speakResponse = async (text: string) => {
        if (!voiceSettings.ttsEnabled) {
          console.log('🔊 TTS disabled in settings');
          return;
        }

        console.log('🔊 TTS Enabled, speaking response:', text);
        console.log('🔊 TTS Settings:', {
          rate: voiceSettings.ttsRate,
          volume: voiceSettings.ttsVolume,
          voice: voiceSettings.ttsVoice,
          isNativePlatform: Capacitor.isNativePlatform()
        });

        try {
          // Use native TTS on mobile devices or when browser TTS is unavailable
          if (Capacitor.isNativePlatform() || !synthRef.current) {
            console.log('🔊 Using native Capacitor TTS');
            setIsSpeaking(true);
            
            await TextToSpeech.speak({
              text: text,
              lang: voiceSettings.language || 'en-US',
              rate: voiceSettings.ttsRate,
              volume: voiceSettings.ttsVolume,
              pitch: 1.0,
              category: 'ambient'
            });
            
            console.log('🔊 Native TTS completed');
            setIsSpeaking(false);
          } else {
            // Use browser TTS
            console.log('🔊 Using browser Speech Synthesis');
            
            // Cancel any ongoing speech first
            synthRef.current.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = voiceSettings.ttsRate;
            utterance.volume = voiceSettings.ttsVolume;
            
            // Set voice if available
            const voices = window.speechSynthesis.getVoices();
            console.log('🔊 Available voices:', voices.length);
            
            if (voices.length > 0) {
              const selectedVoice = voices.find(v => v.name === voiceSettings.ttsVoice);
              if (selectedVoice) {
                utterance.voice = selectedVoice;
                console.log('🔊 Using voice:', selectedVoice.name);
              } else {
                // Use default voice
                const defaultVoice = voices.find(v => v.default) || voices[0];
                utterance.voice = defaultVoice;
                console.log('🔊 Using default voice:', defaultVoice.name);
              }
            }
            
            // Add event listeners for debugging and state management
            utterance.onstart = () => {
              console.log('🔊 Browser TTS started');
              setIsSpeaking(true);
            };
            utterance.onend = () => {
              console.log('🔊 Browser TTS ended');
              setIsSpeaking(false);
            };
            utterance.onerror = (e) => {
              console.error('🔊 Browser TTS error:', e);
              setIsSpeaking(false);
            };
            
            synthRef.current.speak(utterance);
            console.log('🔊 Browser speech queued successfully');
          }
        } catch (error) {
          console.error('🔊 TTS Error:', error);
          setIsSpeaking(false);
        }
      };

      if (success) {
        toast({
          title: '✅ Command Executed',
          description: message,
        });

        // Speak the success response
        speakResponse(message);

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
        speakResponse(message);
        
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

  if (!isSpeechSupported) {
    return null; // Don't show if not supported
  }

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
    </>
  );
};
