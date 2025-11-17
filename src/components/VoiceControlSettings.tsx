import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface VoiceSettings {
  continuousListening: boolean;
  language: string;
  ttsEnabled: boolean;
  showSuggestions: boolean;
  showTranscript: boolean;
  confirmationRequired: boolean;
  theme: 'default' | 'dark' | 'colorful';
  size: 'small' | 'medium' | 'large';
}

interface VoiceControlSettingsProps {
  settings: VoiceSettings;
  onSettingsChange: (settings: VoiceSettings) => void;
  onClose: () => void;
}

export const VoiceControlSettings: React.FC<VoiceControlSettingsProps> = ({
  settings,
  onSettingsChange,
  onClose
}) => {
  const updateSetting = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voice Control Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Language Selection */}
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={settings.language} onValueChange={(value) => updateSetting('language', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="en-GB">English (UK)</SelectItem>
                <SelectItem value="es-ES">Spanish</SelectItem>
                <SelectItem value="fr-FR">French</SelectItem>
                <SelectItem value="de-DE">German</SelectItem>
                <SelectItem value="it-IT">Italian</SelectItem>
                <SelectItem value="pt-BR">Portuguese (Brazil)</SelectItem>
                <SelectItem value="ja-JP">Japanese</SelectItem>
                <SelectItem value="ko-KR">Korean</SelectItem>
                <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Voice Features */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Voice Features</h4>

            <div className="flex items-center justify-between">
              <Label htmlFor="continuous">Continuous Listening</Label>
              <Switch
                id="continuous"
                checked={settings.continuousListening}
                onCheckedChange={(checked) => updateSetting('continuousListening', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="tts">Text-to-Speech</Label>
              <Switch
                id="tts"
                checked={settings.ttsEnabled}
                onCheckedChange={(checked) => updateSetting('ttsEnabled', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="confirmation">Require Confirmation</Label>
              <Switch
                id="confirmation"
                checked={settings.confirmationRequired}
                onCheckedChange={(checked) => updateSetting('confirmationRequired', checked)}
              />
            </div>
          </div>

          <Separator />

          {/* UI Features */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Interface</h4>

            <div className="flex items-center justify-between">
              <Label htmlFor="suggestions">Show Suggestions</Label>
              <Switch
                id="suggestions"
                checked={settings.showSuggestions}
                onCheckedChange={(checked) => updateSetting('showSuggestions', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Show Transcript</Label>
              <Switch
                id="transcript"
                checked={settings.showTranscript}
                onCheckedChange={(checked) => updateSetting('showTranscript', checked)}
              />
            </div>
          </div>

          <Separator />

          {/* Appearance */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Appearance</h4>

            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select value={settings.theme} onValueChange={(value: any) => updateSetting('theme', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="colorful">Colorful</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="size">Button Size</Label>
              <Select value={settings.size} onValueChange={(value: any) => updateSetting('size', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Keyboard Shortcuts */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Keyboard Shortcuts</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Ctrl+M: Toggle voice listening</div>
              <div>Ctrl+H: Show command history</div>
              <div>Ctrl+S: Open settings</div>
              <div>Shift+Click: Drag button</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};