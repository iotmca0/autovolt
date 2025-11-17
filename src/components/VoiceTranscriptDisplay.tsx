import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Send, Edit3, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceTranscriptDisplayProps {
  transcript: string;
  isListening: boolean;
  onEdit: (transcript: string) => void;
  onSend: () => void;
}

export const VoiceTranscriptDisplay: React.FC<VoiceTranscriptDisplayProps> = ({
  transcript,
  isListening,
  onEdit,
  onSend
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState(transcript);
  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 200 });

  useEffect(() => {
    setEditedTranscript(transcript);
  }, [transcript]);

  const handleSend = () => {
    if (isEditing) {
      onEdit(editedTranscript);
    }
    onSend();
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedTranscript(transcript);
    setIsEditing(false);
  };

  if (!transcript && !isListening) return null;

  return (
    <Card
      className={cn(
        "fixed w-80 shadow-lg border-2 z-40",
        isListening && "border-red-500 bg-red-50",
        !isListening && "border-blue-500 bg-blue-50"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {isListening ? (
            <>
              <Mic className="w-4 h-4 text-red-500 animate-pulse" />
              Listening...
            </>
          ) : (
            <>
              <Edit3 className="w-4 h-4 text-blue-500" />
              Transcript
            </>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {isEditing ? (
          <Input
            value={editedTranscript}
            onChange={(e) => setEditedTranscript(e.target.value)}
            className="text-sm"
            placeholder="Edit your command..."
            autoFocus
          />
        ) : (
          <div className="text-sm min-h-[2rem] p-2 bg-white rounded border">
            {transcript || "Speak your command..."}
          </div>
        )}

        <div className="flex gap-2">
          {!isListening && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="flex-1"
              >
                <Edit3 className="w-3 h-3 mr-1" />
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>

              <Button
                size="sm"
                onClick={handleSend}
                disabled={!editedTranscript.trim()}
                className="flex-1"
              >
                <Send className="w-3 h-3 mr-1" />
                Send
              </Button>
            </>
          )}

          {isListening && (
            <div className="flex-1 text-xs text-muted-foreground flex items-center justify-center">
              Say your command clearly...
            </div>
          )}
        </div>

        {isListening && (
          <div className="flex justify-center">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};