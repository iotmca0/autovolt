import React, { useState, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Cpu,
  Wifi,
  WifiOff,
  Settings,
  Trash2,
  AlertCircle,
  Power,
  Edit,
  RefreshCw,
  Activity,
  Signal,
  Zap
} from 'lucide-react';
import { SwitchControl } from './SwitchControl';
import { Device } from '@/types';

interface DeviceCardProps {
  device: Device;
  onToggleSwitch: (deviceId: string, switchId: string) => void;
  onEditDevice?: (device: Device) => void;
  onDeleteDevice?: (deviceId: string) => void;
  onRestartDevice?: (deviceId: string) => void; // New: Restart action
  showSwitches?: boolean;
  showActions?: boolean;
  compact?: boolean;
  variant?: 'default' | 'compact' | 'expanded'; // New: Card variants
}

export default memo(function DeviceCard({ 
  device, 
  onToggleSwitch, 
  onEditDevice, 
  onDeleteDevice,
  onRestartDevice,
  showSwitches = true, 
  showActions = true, 
  compact = false,
  variant = 'default'
}: DeviceCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const isOnline = device.status === 'online';
  const dashboardOnline = !showActions && isOnline;
  const dashboardOffline = !showActions && !isOnline;
  const deviceOffline = !isOnline;

  // Device type icon
  const getDeviceIcon = () => {
    const iconClass = "w-5 h-5";
    if (device.name.toLowerCase().includes('esp32')) return <Cpu className={iconClass} />;
    if (device.name.toLowerCase().includes('arduino')) return <Zap className={iconClass} />;
    return <Activity className={iconClass} />;
  };

  // Calculate device health score (example: based on switches)
  const getHealthScore = () => {
    if (!isOnline) return 0;
    const onSwitches = device.switches.filter(sw => sw.state).length;
    return device.switches.length > 0 ? (onSwitches / device.switches.length) * 100 : 100;
  };

  const healthScore = getHealthScore();

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        device-card relative overflow-hidden transition-all duration-300
        ${isHovered && isOnline ? 'shadow-lg scale-[1.02]' : 'shadow-md'}
        ${deviceOffline ? 'opacity-70 grayscale' : ''}
        ${dashboardOnline ? 'ring-2 ring-success' : ''}
        ${variant === 'compact' ? 'max-w-xs' : 'max-w-md'}
      `}
      style={{
        minWidth: '250px',
        backgroundColor: dashboardOnline
          ? 'hsl(var(--success) / 0.1)'
          : dashboardOffline
          ? 'hsl(var(--danger) / 0.1)'
          : undefined,
      }}
    >
      {/* Status Indicator with Animation - Top Left */}
      <div className="absolute top-3 left-3 z-10">
        <Badge
          variant={isOnline ? 'secondary' : 'destructive'}
          className={`
            badge-${isOnline ? 'online' : 'offline'}
            text-xs font-medium transition-all duration-200
            ${isHovered ? 'scale-110' : ''}
          `}
        >
          {isOnline ? (
            <>
              <div className="w-2 h-2 bg-success rounded-full mr-1.5 animate-pulse" />
              Online
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 mr-1.5" />
              Offline
            </>
          )}
        </Badge>
      </div>

      {/* Quick Actions - Top Right (shown on hover or always in compact mode) */}
      {showActions && (
        <div 
          className={`
            absolute top-3 right-3 z-10 flex gap-1
            transition-opacity duration-200
            ${!compact && !isHovered ? 'opacity-0' : 'opacity-100'}
          `}
        >
          {/* Edit Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={() => onEditDevice && onEditDevice(device)}
            title="Edit Device"
          >
            <Edit className="h-4 w-4" />
          </Button>

          {/* Restart Button */}
          {isOnline && onRestartDevice && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background hover:text-primary"
              onClick={() => onRestartDevice(device.id)}
              title="Restart Device"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          {/* Delete Button */}
          {onDeleteDevice && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background hover:text-danger"
              onClick={() => onDeleteDevice(device.id)}
              title="Delete Device"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <CardHeader className="pb-3 pt-12">
        <div className="flex items-start gap-3">
          {/* Device Icon */}
          <div className={`
            p-2 rounded-lg transition-colors
            ${isOnline ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
          `}>
            {getDeviceIcon()}
          </div>

          {/* Device Info */}
          <div className="flex-1 min-w-0 max-w-full">
            <CardTitle className="text-lg font-semibold mb-1 truncate" title={device.name}>
              {device.name}
            </CardTitle>
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 min-w-0">
                <Signal className="w-3 h-3 flex-shrink-0" />
                <span className="truncate" title={device.classroom || device.location}>
                  {device.classroom || device.location}
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <Activity className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {new Date(device.lastSeen).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Health Indicator */}
          {isOnline && (
            <div className="flex flex-col items-center gap-1">
              <div className={`
                text-xs font-semibold
                ${healthScore >= 75 ? 'text-success' : healthScore >= 50 ? 'text-warning' : 'text-danger'}
              `}>
                {Math.round(healthScore)}%
              </div>
              <div className="text-[10px] text-muted-foreground">Health</div>
            </div>
          )}
        </div>
      </CardHeader>
      {!compact && (
        <CardContent className="space-y-4">
          {/* Device Details - Cleaner Layout */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-muted-foreground">MAC Address</span>
                <span className="font-mono text-[10px] truncate" title={device.macAddress}>
                  {device.macAddress}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium truncate" title={device.location}>
                  {device.location}
                </span>
              </div>
            </div>
          </div>

          {/* Switches Section with Better Styling */}
          {showSwitches && device.switches.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Switches ({device.switches.length})
                </span>
                <Badge variant="outline" className="text-xs">
                  {device.switches.filter(sw => sw.state).length} Active
                </Badge>
              </div>
              
              <div className="space-y-2">
                {device.switches.map((sw, i) => {
                  const isOn = sw.state;
                  return (
                    <div
                      key={sw.id || `${sw.name}-${sw.gpio ?? sw.relayGpio ?? i}`}
                      className={`
                        flex items-center justify-between p-2 rounded-lg border
                        transition-all duration-200 gap-2
                        ${isOn 
                          ? 'bg-success/10 border-success/20' 
                          : 'bg-muted/50 border-border'
                        }
                      `}
                    >
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <Power className={`w-3 h-3 flex-shrink-0 ${isOn ? 'text-success' : 'text-muted-foreground'}`} />
                          <span className={`text-sm font-medium truncate ${isOn ? 'text-success' : ''}`} title={sw.name}>
                            {sw.name}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="whitespace-nowrap">GPIO {sw.gpio ?? sw.relayGpio}</span>
                          <span>•</span>
                          <span className="truncate">{sw.type}</span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isOn ? 'default' : 'outline'}
                        onClick={() => {
                          const sid = sw.id;
                          if (sid) onToggleSwitch(device.id, sid);
                        }}
                        disabled={!isOnline}
                        className={`flex-shrink-0 min-w-[60px] ${isOn ? 'switch-on' : ''}`}
                      >
                        {isOn ? 'ON' : 'OFF'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PIR Sensor Info - Enhanced */}
          {device.pirEnabled && (
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm font-medium">PIR Sensor</div>
                  <div className="text-xs text-muted-foreground">
                    GPIO {device.pirGpio} • {device.pirAutoOffDelay || 30}s delay
                  </div>
                </div>
              </div>
              <Badge className="badge-info">
                Active
              </Badge>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
});


