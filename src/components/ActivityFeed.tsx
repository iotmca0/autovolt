import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import socketService from '@/services/socket';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Plus,
  Edit,
  Trash2,
  Power,
  Users,
  Bell,
  AlertCircle,
  CheckCircle,
  Info,
  Calendar,
} from 'lucide-react';

/**
 * Activity event types
 */
export interface ActivityEvent {
  id: string;
  type:
    | 'device_created'
    | 'device_updated'
    | 'device_deleted'
    | 'device_connected'
    | 'device_disconnected'
    | 'switch_changed'
    | 'user_joined'
    | 'user_left'
    | 'schedule_created'
    | 'schedule_executed'
    | 'system_alert'
    | 'notification';
  title: string;
  description?: string;
  user?: {
    id: string;
    name: string;
    avatar?: string;
  };
  timestamp: Date;
  metadata?: Record<string, any>;
  severity?: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Activity Feed Props
 */
interface ActivityFeedProps {
  /**
   * Maximum number of activities to display
   */
  maxItems?: number;
  
  /**
   * Filter by event types
   */
  filterTypes?: ActivityEvent['type'][];
  
  /**
   * Show live updates indicator
   */
  showLiveIndicator?: boolean;
  
  /**
   * Enable real-time updates
   */
  realtime?: boolean;
}

/**
 * Activity Feed Component
 * Displays real-time activity stream
 */
export function ActivityFeed({
  maxItems = 50,
  filterTypes,
  showLiveIndicator = true,
  realtime = true,
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLive, setIsLive] = useState(realtime);
  const [unreadCount, setUnreadCount] = useState(0);

  // Add activity to feed
  const addActivity = (activity: ActivityEvent) => {
    setActivities((prev) => {
      const filtered = filterTypes
        ? [...prev].filter((a) => !filterTypes.includes(a.type))
        : prev;
      
      const updated = [activity, ...filtered].slice(0, maxItems);
      
      // Increment unread if not currently viewing
      if (!document.hasFocus()) {
        setUnreadCount((c) => c + 1);
      }
      
      return updated;
    });
  };

  // Handle real-time events
  useEffect(() => {
    if (!realtime || !isLive) return;

    const handleDeviceNotification = (data: any) => {
      const activity: ActivityEvent = {
        id: `${data.type}-${Date.now()}`,
        type: data.type,
        title: data.message,
        description: data.deviceName ? `Device: ${data.deviceName}` : undefined,
        timestamp: new Date(data.timestamp),
        severity: data.severity || 'info',
        metadata: data,
      };
      addActivity(activity);
    };

    const handleDeviceConnected = (data: any) => {
      addActivity({
        id: `connected-${data.deviceId}-${Date.now()}`,
        type: 'device_connected',
        title: `${data.deviceName} connected`,
        description: data.location,
        timestamp: new Date(),
        severity: 'success',
        metadata: data,
      });
    };

    const handleDeviceDisconnected = (data: any) => {
      addActivity({
        id: `disconnected-${data.deviceId}-${Date.now()}`,
        type: 'device_disconnected',
        title: `${data.deviceName} disconnected`,
        description: data.location,
        timestamp: new Date(),
        severity: 'warning',
        metadata: data,
      });
    };

    const handleSwitchChanged = (data: any) => {
      addActivity({
        id: `switch-${data.switchId}-${Date.now()}`,
        type: 'switch_changed',
        title: `${data.switchName} turned ${data.newState ? 'ON' : 'OFF'}`,
        description: `On device: ${data.deviceName}`,
        timestamp: new Date(),
        severity: 'info',
        metadata: data,
      });
    };

    socketService.on('device_notification', handleDeviceNotification);
    socketService.on('device_connected', handleDeviceConnected);
    socketService.on('device_disconnected', handleDeviceDisconnected);
    socketService.on('switch_result', handleSwitchChanged);

    // Custom activity events
    socketService.on('activity:event', addActivity);

    return () => {
      socketService.off('device_notification', handleDeviceNotification);
      socketService.off('device_connected', handleDeviceConnected);
      socketService.off('device_disconnected', handleDeviceDisconnected);
      socketService.off('switch_result', handleSwitchChanged);
      socketService.off('activity:event', addActivity);
    };
  }, [realtime, isLive, filterTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear unread count when focused
  useEffect(() => {
    const handleFocus = () => setUnreadCount(0);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Get icon for activity type
  const getActivityIcon = (type: ActivityEvent['type']) => {
    const icons = {
      device_created: Plus,
      device_updated: Edit,
      device_deleted: Trash2,
      device_connected: Power,
      device_disconnected: Power,
      switch_changed: Power,
      user_joined: Users,
      user_left: Users,
      schedule_created: Calendar,
      schedule_executed: Calendar,
      system_alert: AlertCircle,
      notification: Bell,
    };
    return icons[type] || Activity;
  };

  // Get color for severity
  const getSeverityColor = (severity?: ActivityEvent['severity']) => {
    const colors = {
      info: 'text-blue-500 bg-blue-500/10',
      warning: 'text-yellow-500 bg-yellow-500/10',
      error: 'text-red-500 bg-red-500/10',
      success: 'text-green-500 bg-green-500/10',
    };
    return colors[severity || 'info'];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unreadCount} new
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Real-time updates from your system</CardDescription>
          </div>
          
          {showLiveIndicator && (
            <button
              onClick={() => setIsLive(!isLive)}
              className="flex items-center gap-2 text-sm"
              aria-label={isLive ? 'Pause live updates' : 'Resume live updates'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}
                aria-hidden="true"
              />
              <span>{isLive ? 'Live' : 'Paused'}</span>
            </button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {activities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No recent activity</p>
              <p className="text-sm">Activity will appear here as it happens</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <div
                    key={activity.id}
                    className="flex gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${getSeverityColor(
                        activity.severity
                      )}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm leading-tight break-words">
                            {activity.title}
                          </p>
                          {activity.description && (
                            <p className="text-sm text-muted-foreground mt-1 break-words">
                              {activity.description}
                            </p>
                          )}
                          {activity.user && (
                            <div className="flex items-center gap-2 mt-2 min-w-0">
                              <Avatar className="h-5 w-5 flex-shrink-0">
                                <AvatarImage src={activity.user.avatar} />
                                <AvatarFallback className="text-xs">
                                  {activity.user.name[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground truncate" title={activity.user.name}>
                                {activity.user.name}
                              </span>
                            </div>
                          )}
                        </div>
                        <time className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                        </time>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
