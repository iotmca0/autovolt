// DeviceUptimeTracker.tsx
// Tracks ESP32 device uptime/downtime and switch on/off statistics
// Features: Date selection, uptime duration, offline duration, switch toggle counts

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Clock, Power, ToggleLeft, ToggleRight, Activity, Info } from 'lucide-react';
import { apiService } from '@/services/api';

interface Device {
  id: string;
  name: string;
  status: string;
  classroom?: string;
  switches?: Array<{
    id: number;
    name: string;
    state: boolean;
    type?: string;
  }>;
}

interface UptimeStats {
  deviceId: string;
  deviceName: string;
  onlineDuration: number; // in seconds
  offlineDuration: number;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  totalUptime: string;
  totalDowntime: string;
  currentStatus: string; // 'online' or 'offline'
  currentStatusSince?: string | null;
  currentStatusDurationSeconds?: number;
  currentStatusDurationFormatted?: string;
  lastSeen?: string | null;
}

interface SwitchStats {
  switchId: number;
  switchName: string;
  switchType?: string;
  onDuration: number; // in seconds
  offDuration: number;
  toggleCount: number;
  lastOnAt: string | null;
  lastOffAt: string | null;
  lastStateChangeAt: string | null; // When current state started
  totalOnTime: string;
  totalOffTime: string;
  currentState: boolean; // true = ON, false = OFF
  currentStateDuration: string; // Duration in current state
  currentStateDurationSeconds?: number;
  timeframe?: string;
  timeframeName?: string;
}

interface DeviceStatus {
  status: string; // 'online' or 'offline'
  lastSeen: string;
  name: string;
}

export function DeviceUptimeTracker({ devices }: { devices: Device[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<'day' | 'month'>('day');
  const [uptimeStats, setUptimeStats] = useState<UptimeStats[]>([]);
  const [switchStats, setSwitchStats] = useState<SwitchStats[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Format duration in seconds to human-readable format
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  // Format timestamp to readable format
  const formatTimestamp = (timestamp?: string | null): string => {
    if (!timestamp || timestamp === 'N/A') return 'N/A';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate time elapsed since timestamp
  const getTimeSince = (timestamp?: string | null): string => {
    if (!timestamp || timestamp === 'N/A') return 'Unknown';
    const now = new Date();
  const past = new Date(timestamp);
  if (Number.isNaN(past.getTime())) return 'Unknown';
    const diffMs = now.getTime() - past.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  // Fetch uptime/downtime statistics
  const fetchUptimeStats = async () => {
    setLoading(true);
    try {
      const response = await apiService.get(`/analytics/device-uptime`, {
        params: {
          date: selectedDate,
          deviceId: selectedDevice !== 'all' ? selectedDevice : undefined
        }
      });
      setUptimeStats(response.data.uptimeStats || []);
    } catch (error) {
      console.error('Error fetching uptime stats:', error);
      setUptimeStats([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch switch statistics
  const fetchSwitchStats = async () => {
    if (selectedDevice === 'all') {
      setSwitchStats([]);
      setDeviceStatus(null);
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.get(`/analytics/switch-stats`, {
        params: {
          date: selectedDate,
          deviceId: selectedDevice,
          timeframe: timeframe
        }
      });
      setSwitchStats(response.data.switchStats || []);
      setDeviceStatus(response.data.deviceStatus || null);
    } catch (error) {
      console.error('Error fetching switch stats:', error);
      setSwitchStats([]);
      setDeviceStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate) {
      fetchUptimeStats();
      if (selectedDevice !== 'all') {
        fetchSwitchStats();
      } else {
        setSwitchStats([]);
      }
    }
  }, [selectedDate, selectedDevice, timeframe]);

  // Auto-refresh every 30 seconds when enabled
  useEffect(() => {
    if (!autoRefresh || selectedDevice === 'all') return;

    const interval = setInterval(() => {
      console.log('[Auto-refresh] Updating switch stats...');
      fetchSwitchStats();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedDevice, selectedDate, timeframe]);

  return (
    <div className="space-y-6">
      {/* Header with Date and Device Selector */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Device Uptime & Switch Statistics
              </CardTitle>
              <CardDescription>
                Track ESP32 uptime/downtime and switch on/off activity
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={timeframe} onValueChange={(value: 'day' | 'month') => setTimeframe(value)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <input
                  type={timeframe === 'month' ? 'month' : 'date'}
                  value={timeframe === 'month' ? selectedDate.substring(0, 7) : selectedDate}
                  onChange={(e) => {
                    if (timeframe === 'month') {
                      setSelectedDate(e.target.value + '-01');
                    } else {
                      setSelectedDate(e.target.value);
                    }
                  }}
                  max={timeframe === 'month' 
                    ? new Date().toISOString().substring(0, 7)
                    : new Date().toISOString().split('T')[0]}
                  className="px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDevice !== 'all' && (
                <Button
                  variant={autoRefresh ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="flex items-center gap-2"
                >
                  <Clock className="h-4 w-4" />
                  {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchUptimeStats();
                  if (selectedDevice !== 'all') fetchSwitchStats();
                }}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Device Uptime/Downtime Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5 text-green-500" />
            Device Uptime/Downtime Report
          </CardTitle>
          <CardDescription>
            Shows how long ESP32 devices were online/offline on {new Date(selectedDate).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading statistics...</div>
          ) : uptimeStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No uptime data available for the selected date
            </div>
          ) : (
            <div className="space-y-4">
              {uptimeStats.map((stat) => {
                // Determine current status based on which duration is being tracked
                const isOnline = stat.currentStatus === 'online';
                const currentStatusSince = stat.currentStatusSince || (isOnline ? stat.lastOnlineAt : stat.lastOfflineAt);
                const currentStatusDurationDisplay = stat.currentStatusDurationFormatted
                  || (isOnline ? stat.totalUptime : stat.totalDowntime)
                  || 'Unknown';
                
                return (
                  <div key={stat.deviceId} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-lg truncate" title={stat.deviceName}>{stat.deviceName}</h4>
                      <Badge variant={isOnline ? 'default' : 'destructive'} className="flex-shrink-0">
                        {isOnline ? '● Online' : '○ Offline'}
                      </Badge>
                    </div>

                    {/* Show ONLY Online card if device is online, or ONLY Offline card if offline */}
                    {isOnline ? (
                      <div className="p-4 bg-green-50 dark:bg-green-950 border-2 border-green-500 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                          <span className="text-base font-semibold text-green-700 dark:text-green-300">
                            Device is Currently ONLINE
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-muted-foreground flex-shrink-0">Came Online:</span>
                            <span className="text-sm font-medium truncate" title={currentStatusSince ? formatTimestamp(currentStatusSince) : 'Unknown'}>
                              {currentStatusSince && formatTimestamp(currentStatusSince) !== 'N/A' 
                                ? formatTimestamp(currentStatusSince)
                                : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-muted-foreground flex-shrink-0">Online For:</span>
                            <span className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 break-words">
                              {currentStatusDurationDisplay}
                            </span>
                          </div>
                          <div className="text-xs text-center text-muted-foreground mt-2 p-2 bg-green-100 dark:bg-green-900 rounded break-words">
                            {currentStatusSince && formatTimestamp(currentStatusSince) !== 'N/A'
                              ? `Online since ${getTimeSince(currentStatusSince)}`
                              : 'No downtime recorded'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-red-50 dark:bg-red-950 border-2 border-red-500 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0" />
                          <span className="text-base font-semibold text-red-700 dark:text-red-300">
                            Device is Currently OFFLINE
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-muted-foreground flex-shrink-0">Went Offline:</span>
                            <span className="text-sm font-medium truncate" title={currentStatusSince ? formatTimestamp(currentStatusSince) : 'Unknown'}>
                              {currentStatusSince && formatTimestamp(currentStatusSince) !== 'N/A'
                                ? formatTimestamp(currentStatusSince)
                                : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-muted-foreground">Offline For:</span>
                            <span className="text-2xl font-bold text-red-600 dark:text-red-400 break-words">
                              {currentStatusDurationDisplay}
                            </span>
                          </div>
                          <div className="text-xs text-center text-muted-foreground mt-2 p-2 bg-red-100 dark:bg-red-900 rounded">
                            {currentStatusSince && formatTimestamp(currentStatusSince) !== 'N/A'
                              ? `Offline since ${getTimeSince(currentStatusSince)}`
                              : 'Connection lost'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Optional: Show uptime percentage only if there's historical data */}
                    {stat.onlineDuration + stat.offlineDuration > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Today's Uptime</span>
                          <span className="font-medium">
                            {((stat.onlineDuration / (stat.onlineDuration + stat.offlineDuration)) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-green-500 h-full transition-all"
                            style={{
                              width: `${(stat.onlineDuration / (stat.onlineDuration + stat.offlineDuration)) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Switch On/Off Statistics (only when a device is selected) */}
      {selectedDevice !== 'all' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ToggleLeft className="h-5 w-5 text-blue-500" />
              Switch On/Off Statistics
              {autoRefresh && selectedDevice !== 'all' && (
                <Badge variant="outline" className="ml-2 animate-pulse">
                  <Clock className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {timeframe === 'month' 
                ? `Monthly statistics for ${devices.find(d => d.id === selectedDevice)?.name || 'selected device'} - ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
                : `Daily statistics for ${devices.find(d => d.id === selectedDevice)?.name || 'selected device'} - ${new Date(selectedDate).toLocaleDateString()}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading switch statistics...</div>
            ) : switchStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No switch activity data available for the selected date
              </div>
            ) : (
              <div className="space-y-4">
                {/* OFFLINE DEVICE WARNING - Show if device is offline */}
                {deviceStatus && deviceStatus.status === 'offline' && (
                  <div className="p-4 bg-red-50 dark:bg-red-950 border-2 border-red-500 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white font-bold text-sm">!</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-red-700 dark:text-red-300 text-lg mb-2">
                          ⚠️ Device is Currently OFFLINE
                        </h4>
                        <p className="text-red-600 dark:text-red-400 text-sm mb-2">
                          <strong>{deviceStatus.name}</strong> is offline. The switch states shown below are the <strong>last known states</strong> before the device went offline.
                        </p>
                        <p className="text-red-600 dark:text-red-400 text-sm">
                          Last seen: <strong>{deviceStatus.lastSeen ? formatTimestamp(deviceStatus.lastSeen) : 'Unknown'}</strong>
                          {deviceStatus.lastSeen && ` (${getTimeSince(deviceStatus.lastSeen)})`}
                        </p>
                        <p className="text-red-600 dark:text-red-400 text-xs mt-2 italic">
                          Note: If any switches show as "ON", they may not actually be ON right now. The device needs to come back online to update the real-time status.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {switchStats.map((stat) => {
                  const isOn = stat.currentState;
                  const isDeviceOffline = deviceStatus && deviceStatus.status === 'offline';
                  const statusColor = isOn ? 'blue' : 'gray';
                  const statusText = isOn ? 'ON' : 'OFF';
                  // Current state duration - how long switch has been in CURRENT state (ON or OFF)
                  const currentDuration = stat.currentStateDuration || '0s';
                  // When did the CURRENT state start (most recent state change)
                  const lastChangeTime = stat.lastStateChangeAt;
                  
                  return (
                    <div key={stat.switchId} className={`p-4 border-2 rounded-lg space-y-3 ${
                      isDeviceOffline
                        ? 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800'
                        : isOn 
                          ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800' 
                          : 'border-gray-300 bg-gray-50 dark:bg-gray-900/30 dark:border-gray-700'
                    }`}>
                      {/* Header with Switch Name and Current Status */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="flex flex-col">
                            <h4 className="font-semibold text-lg truncate" title={stat.switchName}>{stat.switchName}</h4>
                            {stat.switchType && (
                              <span className="text-xs text-muted-foreground capitalize">{stat.switchType}</span>
                            )}
                          </div>
                          <Badge 
                            variant={isOn ? "default" : "secondary"}
                            className={`flex-shrink-0 ${
                              isDeviceOffline 
                                ? 'bg-red-500 text-white' 
                                : isOn 
                                  ? 'bg-blue-500 text-white' 
                                  : 'bg-gray-500 text-white'
                            }`}
                          >
                            {isDeviceOffline ? `⚠️ Last: ${statusText}` : `● ${statusText}`}
                          </Badge>
                        </div>
                        {stat.toggleCount > 0 && (
                          <Badge variant="outline" className="font-normal flex-shrink-0 whitespace-nowrap">
                            <ToggleRight className="h-3 w-3 mr-1" />
                            {stat.toggleCount} toggle{stat.toggleCount !== 1 ? 's' : ''} {timeframe === 'month' ? 'this month' : 'today'}
                          </Badge>
                        )}
                      </div>

                      {/* Current State Duration - Prominent Display */}
                      <div className={`p-4 rounded-lg ${
                        isOn
                          ? 'bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700'
                          : 'bg-gray-100 dark:bg-gray-800/40 border border-gray-300 dark:border-gray-600'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Power className={`h-5 w-5 ${isOn ? 'text-blue-600' : 'text-gray-600'}`} />
                              <span className="text-sm font-medium text-muted-foreground">
                                {isOn ? 'Currently ON for' : 'Currently OFF for'}
                              </span>
                              <Info 
                                className="h-3 w-3 text-muted-foreground cursor-help" 
                                title={isOn 
                                  ? "How long this switch has been continuously ON since its last state change"
                                  : "How long this switch has been continuously OFF since its last state change"
                                }
                              />
                            </div>
                            <div className={`text-3xl font-bold ${
                              isOn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              {currentDuration}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Continuous {isOn ? 'ON' : 'OFF'} duration
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground mb-1">
                              State changed at
                            </div>
                            <div className="text-sm font-medium">
                              {formatTimestamp(lastChangeTime) !== 'N/A'
                                ? formatTimestamp(lastChangeTime)
                                : 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatTimestamp(lastChangeTime) !== 'N/A'
                                ? `(${getTimeSince(lastChangeTime)} ago)`
                                : ''}
                            </div>
                          </div>
                        </div>
                      </div>                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-white dark:bg-gray-800 border rounded-lg">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs text-muted-foreground">Total ON Time {timeframe === 'month' ? 'This Month' : 'Today'}</span>
                            <Info 
                              className="h-3 w-3 text-muted-foreground cursor-help" 
                              title="Cumulative time this switch was ON during the selected time period"
                            />
                          </div>
                          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{stat.totalOnTime}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {stat.onDuration > 0 ? `${Math.floor(stat.onDuration)} seconds total` : 'No ON activity'}
                          </div>
                        </div>
                        <div className="p-3 bg-white dark:bg-gray-800 border rounded-lg">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs text-muted-foreground">Total OFF Time {timeframe === 'month' ? 'This Month' : 'Today'}</span>
                            <Info 
                              className="h-3 w-3 text-muted-foreground cursor-help" 
                              title="Cumulative time this switch was OFF during the selected time period"
                            />
                          </div>
                          <div className="text-lg font-semibold text-gray-600 dark:text-gray-400">{stat.totalOffTime}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {stat.offDuration > 0 ? `${Math.floor(stat.offDuration)} seconds total` : 'No OFF activity'}
                          </div>
                        </div>
                      </div>

                      {/* On/Off Percentage Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">ON Time Percentage</span>
                          <span className="font-semibold">
                            {stat.onDuration + stat.offDuration > 0
                              ? ((stat.onDuration / (stat.onDuration + stat.offDuration)) * 100).toFixed(1)
                              : 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full transition-all"
                            style={{
                              width: `${stat.onDuration + stat.offDuration > 0
                                ? (stat.onDuration / (stat.onDuration + stat.offDuration)) * 100
                                : 0}%`
                            }}
                          />
                        </div>
                      </div>

                      {/* Recent Activity Summary */}
                      <div className="pt-2 border-t">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Recent Activity</div>
                        <div className="space-y-1 text-xs">
                          {stat.lastOnAt && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Last turned ON:</span>
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                {formatTimestamp(stat.lastOnAt)} ({getTimeSince(stat.lastOnAt)})
                              </span>
                            </div>
                          )}
                          {stat.lastOffAt && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Last turned OFF:</span>
                              <span className="font-medium text-gray-600 dark:text-gray-400">
                                {formatTimestamp(stat.lastOffAt)} ({getTimeSince(stat.lastOffAt)})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DeviceUptimeTracker;
