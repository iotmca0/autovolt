// DeviceUptimeTracker.tsx
// Tracks ESP32 device uptime/downtime and switch on/off statistics
// Features: Date selection, uptime duration, offline duration, switch toggle counts

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Clock, Power, ToggleLeft, ToggleRight, Activity } from 'lucide-react';
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
  lastOnlineAt: string;
  lastOfflineAt: string;
  totalUptime: string;
  totalDowntime: string;
  currentStatus: string; // 'online' or 'offline'
}

interface SwitchStats {
  switchId: number;
  switchName: string;
  onDuration: number; // in seconds
  offDuration: number;
  toggleCount: number;
  lastOnAt: string;
  lastOffAt: string;
  totalOnTime: string;
  totalOffTime: string;
}

export function DeviceUptimeTracker({ devices }: { devices: Device[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [uptimeStats, setUptimeStats] = useState<UptimeStats[]>([]);
  const [switchStats, setSwitchStats] = useState<SwitchStats[]>([]);
  const [loading, setLoading] = useState(false);

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
  const formatTimestamp = (timestamp: string): string => {
    if (!timestamp || timestamp === 'N/A') return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate time elapsed since timestamp
  const getTimeSince = (timestamp: string): string => {
    if (!timestamp || timestamp === 'N/A') return 'Unknown';
    const now = new Date();
    const past = new Date(timestamp);
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
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.get(`/analytics/switch-stats`, {
        params: {
          date: selectedDate,
          deviceId: selectedDevice
        }
      });
      setSwitchStats(response.data.switchStats || []);
    } catch (error) {
      console.error('Error fetching switch stats:', error);
      setSwitchStats([]);
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
  }, [selectedDate, selectedDevice]);

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
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
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
                
                return (
                  <div key={stat.deviceId} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-lg">{stat.deviceName}</h4>
                      <Badge variant={isOnline ? 'default' : 'destructive'}>
                        {isOnline ? '● Online' : '○ Offline'}
                      </Badge>
                    </div>

                    {/* Show ONLY Online card if device is online, or ONLY Offline card if offline */}
                    {isOnline ? (
                      <div className="p-4 bg-green-50 dark:bg-green-950 border-2 border-green-500 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-base font-semibold text-green-700 dark:text-green-300">
                            Device is Currently ONLINE
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Came Online:</span>
                            <span className="text-sm font-medium">
                              {formatTimestamp(stat.lastOnlineAt) !== 'N/A' 
                                ? formatTimestamp(stat.lastOnlineAt)
                                : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Online For:</span>
                            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {stat.totalUptime}
                            </span>
                          </div>
                          <div className="text-xs text-center text-muted-foreground mt-2 p-2 bg-green-100 dark:bg-green-900 rounded">
                            {formatTimestamp(stat.lastOnlineAt) !== 'N/A'
                              ? `Online since ${getTimeSince(stat.lastOnlineAt)}`
                              : 'No downtime recorded'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-red-50 dark:bg-red-950 border-2 border-red-500 rounded-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-4 h-4 bg-red-500 rounded-full" />
                          <span className="text-base font-semibold text-red-700 dark:text-red-300">
                            Device is Currently OFFLINE
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Went Offline:</span>
                            <span className="text-sm font-medium">
                              {formatTimestamp(stat.lastOfflineAt) !== 'N/A'
                                ? formatTimestamp(stat.lastOfflineAt)
                                : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Offline For:</span>
                            <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {stat.totalDowntime}
                            </span>
                          </div>
                          <div className="text-xs text-center text-muted-foreground mt-2 p-2 bg-red-100 dark:bg-red-900 rounded">
                            {formatTimestamp(stat.lastOfflineAt) !== 'N/A'
                              ? `Offline since ${getTimeSince(stat.lastOfflineAt)}`
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
            </CardTitle>
            <CardDescription>
              Detailed switch activity for {devices.find(d => d.id === selectedDevice)?.name || 'selected device'} on {new Date(selectedDate).toLocaleDateString()}
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
                {switchStats.map((stat) => (
                  <div key={stat.switchId} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{stat.switchName}</h4>
                      <Badge variant="outline">
                        {stat.toggleCount} toggle{stat.toggleCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* On Duration */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Power className="h-4 w-4 text-blue-500" />
                          <span className="text-xs font-medium">On Duration</span>
                        </div>
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {stat.totalOnTime}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {formatTimestamp(stat.lastOnAt) !== 'N/A'
                            ? `${getTimeSince(stat.lastOnAt)}`
                            : 'Unknown'}
                        </div>
                      </div>

                      {/* Off Duration */}
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Power className="h-4 w-4 text-gray-500" />
                          <span className="text-xs font-medium">Off Duration</span>
                        </div>
                        <div className="text-xl font-bold text-gray-600 dark:text-gray-400">
                          {stat.totalOffTime}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {formatTimestamp(stat.lastOffAt) !== 'N/A'
                            ? `${getTimeSince(stat.lastOffAt)}`
                            : 'Unknown'}
                        </div>
                      </div>

                      {/* Toggle Count */}
                      <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <ToggleRight className="h-4 w-4 text-purple-500" />
                          <span className="text-xs font-medium">Toggle Count</span>
                        </div>
                        <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                          {stat.toggleCount}x
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Total switches
                        </div>
                      </div>
                    </div>

                    {/* On/Off Percentage Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>On Time Percentage</span>
                        <span className="font-medium">
                          {stat.onDuration + stat.offDuration > 0
                            ? ((stat.onDuration / (stat.onDuration + stat.offDuration)) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DeviceUptimeTracker;
