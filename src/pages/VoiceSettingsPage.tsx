import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { Mic } from 'lucide-react';

export const VoiceSettingsPage: React.FC = () => {
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mic className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Voice Control Settings</h1>
            <p className="text-muted-foreground">
              Customize your voice assistant experience and preferences
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Voice Assistant Configuration</CardTitle>
          <CardDescription>
            Configure speech recognition, text-to-speech, and manage your command history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoiceSettingsPanel />
        </CardContent>
      </Card>
    </div>
  );
};
