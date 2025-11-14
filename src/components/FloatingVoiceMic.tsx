import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { voiceAssistantAPI } from '@/services/api';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';

interface FloatingVoiceMicProps {
  onCommandExecuted?: (result: any) => void;
}

export const FloatingVoiceMic: React.FC<FloatingVoiceMicProps> = ({ onCommandExecuted }) => {
  const { toast } = useToast();
  const { voiceToken, isAuthenticated, isLoading: sessionLoading, createVoiceSession, clearVoiceSession } = useVoiceSession();
  
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 100, y: window.innerHeight - 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

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
    
    if (window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
    }
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

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      toast({
        title: '🎤 Listening...',
        description: 'Speak your command now',
      });
    };

    recognition.onresult = (event: any) => {
      // Only process final results to prevent duplicate command execution
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;

      const transcript = result[0].transcript.trim();
      if (transcript) {
        console.log('🎤 Final transcript:', transcript);
        processCommand(transcript);
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

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Constrain to window bounds
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 80;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Check if it's a right-click or Shift+click for dragging
    if (e.button === 2 || e.shiftKey) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
        setIsDragging(true);
      }
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    if (isDragging) return;
    
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

      if (response.data.success) {
        toast({
          title: '✅ Command Executed',
          description: response.data.message || 'Voice command successful',
        });

        // Text-to-speech response
        if (synthRef.current) {
          const utterance = new SpeechSynthesisUtterance(response.data.message || 'Command executed');
          utterance.rate = 1.0;
          synthRef.current.speak(utterance);
        }

        onCommandExecuted?.(response.data);
      } else {
        toast({
          title: '❌ Command Failed',
          description: response.data.message || 'Could not execute command',
          variant: 'destructive'
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
      } else if (error.message) {
        errorMessage = `Connection error: ${error.message}`;
      } else if (!navigator.onLine) {
        errorMessage = 'No internet connection. Please check your network.';
      }

      toast({
        title: '❌ Command Failed',
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
    <div
      ref={buttonRef}
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()} // Prevent context menu on right-click
      title="Click to speak | Shift+Click to drag"
    >
      <Button
        onClick={handleClick}
        className={cn(
          "w-16 h-16 rounded-full shadow-2xl transition-all duration-300 relative",
          isListening && "animate-pulse bg-red-500 hover:bg-red-600",
          isProcessing && "animate-pulse bg-blue-600 hover:bg-blue-700",
          isDragging && "cursor-grabbing scale-110",
          !isDragging && "cursor-pointer hover:scale-110"
        )}
        disabled={!isAuthenticated && !sessionLoading}
        size="icon"
      >
        {isProcessing ? (
          <Loader2 className="w-8 h-8 animate-spin" />
        ) : isListening ? (
          <MicOff className="w-8 h-8" />
        ) : (
          <Mic className="w-8 h-8" />
        )}
      </Button>

      {/* Listening indicator ring */}
      {isListening && (
        <div className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping" />
      )}
    </div>
  );
};
