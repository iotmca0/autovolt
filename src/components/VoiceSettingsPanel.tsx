// VoiceSettingsPanel.tsx - Settings UI for voice control
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Volume2, Zap, Languages, MessageSquare, Star, Trash2, RotateCcw } from 'lucide-react';
import { useVoiceSettings } from '@/hooks/useVoiceSettings';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';

interface VoiceSettingsPanelProps {
  onClose?: () => void;
}

export const VoiceSettingsPanel: React.FC<VoiceSettingsPanelProps> = ({ onClose }) => {
  const {
    ttsEnabled,
    ttsVoice,
    ttsRate,
    ttsVolume,
    continuousMode,
    language,
    showTranscript,
    showSuggestions,
    showAudioLevel,
    setTTSEnabled,
    setTTSVoice,
    setTTSRate,
    setTTSVolume,
    setContinuousMode,
    setLanguage,
    setShowTranscript,
    setShowSuggestions,
    setShowAudioLevel,
    commandHistory,
    toggleFavorite,
    removeCommand,
    clearHistory,
    getFavorites,
  } = useVoiceSettings();

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testingVoice, setTestingVoice] = useState(false);

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout;
    let voicesChangedSet = false;

    const loadVoices = () => {
      if (!window.speechSynthesis) {
        console.warn('⚠️ Speech Synthesis not available, will retry...');
        // Retry after 1 second (WebView might be loading)
        retryTimeout = setTimeout(() => {
          if (window.speechSynthesis) {
            console.log('✅ Speech Synthesis now available!');
            loadVoices();
          } else {
            console.warn('⚠️ Speech Synthesis still not available after retry');
          }
        }, 1000);
        return;
      }
      
      const voices = window.speechSynthesis.getVoices();
      console.log('🔊 Loaded voices in VoiceSettingsPanel:', voices.length);
      setAvailableVoices(voices);
      
      // Set default voice if not set
      if (!ttsVoice && voices.length > 0) {
        const defaultVoice = voices.find(v => v.default) || voices[0];
        setTTSVoice(defaultVoice.name);
        console.log('🔊 Set default voice:', defaultVoice.name);
      }
      
      // In WebView, voices might load after a delay
      if (voices.length === 0 && !voicesChangedSet) {
        console.log('🔊 No voices yet, waiting for voiceschanged event...');
      }
    };

    loadVoices();
    
    // Set up voiceschanged listener for WebView compatibility
    if (window.speechSynthesis) {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          console.log('🔊 Voices changed event fired');
          loadVoices();
        };
        voicesChangedSet = true;
      }
      
      // Also retry loading voices after a short delay (WebView quirk)
      const retryVoicesTimeout = setTimeout(() => {
        if (window.speechSynthesis) {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0 && availableVoices.length === 0) {
            console.log('🔊 Voices loaded on retry');
            loadVoices();
          }
        }
      }, 500);
      
      return () => {
        clearTimeout(retryVoicesTimeout);
        if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [ttsVoice, setTTSVoice, availableVoices.length]);

  const testVoice = () => {
    if (testingVoice || !window.speechSynthesis) return;
    
    setTestingVoice(true);
    
    try {
      const utterance = new SpeechSynthesisUtterance('Hello! This is a test of the voice assistant.');
      utterance.rate = ttsRate;
      utterance.volume = ttsVolume;
      
      const selectedVoice = availableVoices.find(v => v.name === ttsVoice);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      
      utterance.onend = () => setTestingVoice(false);
      utterance.onerror = () => setTestingVoice(false);
      
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Error testing voice:', error);
      setTestingVoice(false);
    }
  };

  const favorites = getFavorites();
  const recentCommands = commandHistory.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Voice Recognition Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Recognition Settings
          </CardTitle>
          <CardDescription>Configure voice recognition behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Continuous Mode</Label>
              <p className="text-xs text-muted-foreground">Keep listening until stopped</p>
            </div>
            <Switch checked={continuousMode} onCheckedChange={setContinuousMode} />
          </div>

          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">🇺🇸 English (US)</SelectItem>
                <SelectItem value="en-GB">🇬🇧 English (UK)</SelectItem>
                <SelectItem value="hi-IN">🇮🇳 Hindi</SelectItem>
                <SelectItem value="es-ES">🇪🇸 Spanish</SelectItem>
                <SelectItem value="fr-FR">🇫🇷 French</SelectItem>
                <SelectItem value="de-DE">🇩🇪 German</SelectItem>
                <SelectItem value="ja-JP">🇯🇵 Japanese</SelectItem>
                <SelectItem value="zh-CN">🇨🇳 Chinese</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Live Transcript</Label>
              <p className="text-xs text-muted-foreground">Display speech as you talk</p>
            </div>
            <Switch checked={showTranscript} onCheckedChange={setShowTranscript} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Command Suggestions</Label>
              <p className="text-xs text-muted-foreground">Display available commands</p>
            </div>
            <Switch checked={showSuggestions} onCheckedChange={setShowSuggestions} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Audio Level</Label>
              <p className="text-xs text-muted-foreground">Display microphone input level</p>
            </div>
            <Switch checked={showAudioLevel} onCheckedChange={setShowAudioLevel} />
          </div>
        </CardContent>
      </Card>

      {/* Text-to-Speech Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Voice Feedback
          </CardTitle>
          <CardDescription>Customize speech output</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!window.speechSynthesis && Capacitor.isNativePlatform() && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-500">
                ℹ️ Using native device text-to-speech. Voice selection and some settings may not be available.
              </p>
            </div>
          )}
          
          {!window.speechSynthesis && !Capacitor.isNativePlatform() && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-600 dark:text-yellow-500">
                ⚠️ Speech synthesis is not available in this browser. Voice feedback will not work.
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Voice Feedback</Label>
              <p className="text-xs text-muted-foreground">Speak command results</p>
            </div>
            <Switch 
              checked={ttsEnabled} 
              onCheckedChange={setTTSEnabled}
              disabled={!window.speechSynthesis}
            />
          </div>

          {ttsEnabled && window.speechSynthesis && (
            <>
              <div className="space-y-2">
                <Label>Voice</Label>
                {availableVoices.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground bg-muted rounded-md">
                    Loading voices... Please wait a moment.
                  </div>
                ) : (
                  <Select value={ttsVoice} onValueChange={setTTSVoice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVoices.map((voice) => (
                        <SelectItem key={voice.name} value={voice.name}>
                          {voice.name} {voice.lang && `(${voice.lang})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tts-rate">Speech Rate</Label>
                  <span className="text-sm text-muted-foreground">{ttsRate.toFixed(1)}x</span>
                </div>
                <input
                  id="tts-rate"
                  type="range"
                  value={ttsRate}
                  onChange={(e) => setTTSRate(parseFloat(e.target.value))}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tts-volume">Volume</Label>
                  <span className="text-sm text-muted-foreground">{Math.round(ttsVolume * 100)}%</span>
                </div>
                <input
                  id="tts-volume"
                  type="range"
                  value={ttsVolume}
                  onChange={(e) => setTTSVolume(parseFloat(e.target.value))}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
              </div>

              <Button onClick={testVoice} disabled={testingVoice} variant="outline" className="w-full">
                <Volume2 className="mr-2 h-4 w-4" />
                {testingVoice ? 'Playing...' : 'Test Voice'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Command History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Command History
              </CardTitle>
              <CardDescription>Recent and favorite commands</CardDescription>
            </div>
            {commandHistory.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearHistory}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Favorites */}
          {favorites.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                Favorites
              </h4>
              <ScrollArea className="h-[120px]">
                <div className="space-y-2">
                  {favorites.map((cmd) => (
                    <CommandHistoryItem
                      key={cmd.id}
                      command={cmd}
                      onToggleFavorite={toggleFavorite}
                      onRemove={removeCommand}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Recent Commands */}
          {recentCommands.length > 0 ? (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <RotateCcw className="h-4 w-4" />
                Recent
              </h4>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {recentCommands.map((cmd) => (
                    <CommandHistoryItem
                      key={cmd.id}
                      command={cmd}
                      onToggleFavorite={toggleFavorite}
                      onRemove={removeCommand}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No commands yet. Start using voice control!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface CommandHistoryItemProps {
  command: {
    id: string;
    command: string;
    timestamp: Date;
    success: boolean;
    response: string;
    isFavorite?: boolean;
  };
  onToggleFavorite: (id: string) => void;
  onRemove: (id: string) => void;
}

const CommandHistoryItem: React.FC<CommandHistoryItemProps> = ({ command, onToggleFavorite, onRemove }) => {
  const timeAgo = React.useMemo(() => {
    const now = new Date();
    const then = new Date(command.timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }, [command.timestamp]);

  return (
    <div className={cn(
      "p-2 rounded-lg border text-sm transition-colors",
      command.success ? "bg-green-50 dark:bg-green-950/20 border-green-200" : "bg-red-50 dark:bg-red-950/20 border-red-200"
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium truncate">{command.command}</p>
            <Badge variant={command.success ? "default" : "destructive"} className="text-[10px] px-1 h-4">
              {command.success ? '✓' : '✗'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{command.response}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{timeAgo}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onToggleFavorite(command.id)}
          >
            <Star className={cn("h-3 w-3", command.isFavorite && "fill-yellow-400 text-yellow-400")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onRemove(command.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};
