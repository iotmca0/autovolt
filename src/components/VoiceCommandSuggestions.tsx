import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Clock, Zap, Home, Power, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceCommandSuggestionsProps {
  onCommandSelect: (command: string) => void;
  recentCommands: string[];
}

export const VoiceCommandSuggestions: React.FC<VoiceCommandSuggestionsProps> = ({
  onCommandSelect,
  recentCommands
}) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 300 });

  // Predefined common commands
  const commonCommands = [
    { command: "turn on projector", icon: <Zap className="w-4 h-4" />, category: "Devices" },
    { command: "turn off all lights", icon: <Power className="w-4 h-4" />, category: "Devices" },
    { command: "show energy usage", icon: <Home className="w-4 h-4" />, category: "Analytics" },
    { command: "check classroom status", icon: <Settings className="w-4 h-4" />, category: "Status" },
    { command: "turn on fan", icon: <Zap className="w-4 h-4" />, category: "Devices" },
    { command: "dim lights", icon: <Lightbulb className="w-4 h-4" />, category: "Devices" },
    { command: "show temperature", icon: <Home className="w-4 h-4" />, category: "Sensors" },
    { command: "lock classroom", icon: <Settings className="w-4 h-4" />, category: "Security" },
  ];

  // Context-aware suggestions based on time
  const getContextSuggestions = () => {
    const hour = new Date().getHours();
    const suggestions = [];

    if (hour >= 8 && hour <= 12) {
      suggestions.push(
        { command: "good morning setup", icon: <Lightbulb className="w-4 h-4" />, category: "Morning" },
        { command: "turn on classroom lights", icon: <Zap className="w-4 h-4" />, category: "Morning" }
      );
    } else if (hour >= 17 && hour <= 21) {
      suggestions.push(
        { command: "evening shutdown", icon: <Power className="w-4 h-4" />, category: "Evening" },
        { command: "turn off all devices", icon: <Power className="w-4 h-4" />, category: "Evening" }
      );
    }

    return suggestions;
  };

  const contextSuggestions = getContextSuggestions();

  return (
    <Card
      className="fixed w-80 shadow-lg border z-30 bg-white/95 backdrop-blur-sm"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-500" />
          Voice Suggestions
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Recent Commands */}
        {recentCommands.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Recent Commands
            </div>
            <div className="space-y-1">
              {recentCommands.slice(0, 3).map((command, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => onCommandSelect(command)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Clock className="w-3 h-3 text-blue-500 flex-shrink-0" />
                    <span className="text-xs truncate">"{command}"</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Context Suggestions */}
        {contextSuggestions.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Suggested for Now
            </div>
            <div className="space-y-1">
              {contextSuggestions.map((suggestion, index) => (
                <Button
                  key={`context-${index}`}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => onCommandSelect(suggestion.command)}
                >
                  <div className="flex items-center gap-2 w-full">
                    {suggestion.icon}
                    <span className="text-xs">{suggestion.command}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {suggestion.category}
                    </Badge>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Common Commands */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Popular Commands
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {commonCommands.map((suggestion, index) => (
              <Button
                key={`common-${index}`}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-left h-auto py-2 px-3"
                onClick={() => onCommandSelect(suggestion.command)}
              >
                <div className="flex items-center gap-2 w-full">
                  {suggestion.icon}
                  <span className="text-xs">{suggestion.command}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {suggestion.category}
                  </Badge>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Tips */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          <div className="font-medium mb-1">💡 Tips:</div>
          <ul className="space-y-1 text-xs">
            <li>• Say "stop listening" to end continuous mode</li>
            <li>• Bulk commands require confirmation</li>
            <li>• Try natural language like "make it brighter"</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};