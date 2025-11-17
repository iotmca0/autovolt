import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, RotateCcw, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VoiceCommand {
  id: string;
  command: string;
  response: string;
  timestamp: Date;
  success: boolean;
}

interface VoiceCommandHistoryProps {
  history: VoiceCommand[];
  onClose: () => void;
  onRepeatCommand: (command: string) => void;
}

export const VoiceCommandHistory: React.FC<VoiceCommandHistoryProps> = ({
  history,
  onClose,
  onRepeatCommand
}) => {
  const formatTime = (timestamp: Date) => {
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  const getCommandPreview = (command: string) => {
    return command.length > 50 ? `${command.substring(0, 50)}...` : command;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Voice Command History
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No voice commands yet</p>
              <p className="text-sm">Start using voice control to see your history here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item, index) => (
                <div key={item.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {item.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <Badge variant={item.success ? "default" : "destructive"}>
                        {item.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Command:</div>
                      <div className="text-sm bg-muted p-2 rounded font-mono">
                        "{item.command}"
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Response:</div>
                      <div className="text-sm bg-muted p-2 rounded">
                        {item.response}
                      </div>
                    </div>
                  </div>

                  <Separator className="my-3" />

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRepeatCommand(item.command)}
                      className="flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Repeat Command
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {history.length} command{history.length !== 1 ? 's' : ''} in history
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};