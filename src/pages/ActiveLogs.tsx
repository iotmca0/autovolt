import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Activity,
  Monitor,
  Download,
  Calendar as CalendarIcon,
  RefreshCw,
  Trash2,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/services/api';
import { ActivityLog } from '@/types';

// Minimal "any" type for other log kinds so this file compiles without needing full project types
type AnyLog = any;

type LogType = 'activities' | 'manual-switches' | 'web-switches' | 'schedule-switches' | 'device-status';

interface LogStats {
  activities: { total: number; today: number };
  manualSwitches?: { total: number; today: number };
  webSwitches: { total: number; today: number };
  scheduleSwitches: { total: number; today: number };
  deviceStatus: { total: number; today: number };
}

function safe<T = unknown, D = null>(obj: T, path: string, defaultValue: D = null as D): any {
  try {
    return path.split('.').reduce((current: any, key) => current?.[key], obj) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function safeFormatDate(timestamp: string | number | Date | undefined | null, formatString: string): string {
  if (!timestamp) return '-';
  try {
    const d = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : (timestamp as Date);
    if (isNaN(d.getTime())) return '-';
    return format(d, formatString);
  } catch {
    return '-';
  }
}

const ActiveLogsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LogType>('activities');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<LogStats | null>(null);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [manualSwitchLogs, setManualSwitchLogs] = useState<AnyLog[]>([]);
  const [webSwitchLogs, setWebSwitchLogs] = useState<AnyLog[]>([]);
  const [scheduleSwitchLogs, setScheduleSwitchLogs] = useState<AnyLog[]>([]);
  const [deviceStatusLogs, setDeviceStatusLogs] = useState<AnyLog[]>([]);

  const [paginationMeta, setPaginationMeta] = useState({ total: 0, totalPages: 1, currentPage: 1, limit: 50 });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [showCalendar, setShowCalendar] = useState(false);

  const [devices, setDevices] = useState<Array<{ id: string; name: string; status: string }>>([]);

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    // when tab changes reset page and refresh
    setCurrentPage(1);
    loadStats();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(loadData, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, deviceFilter, dateRange, currentPage, itemsPerPage]);

  const loadDevices = async () => {
    try {
      const res = await api.get('/device-categories/categories?showAllDevices=true');
      if (res.data && res.data.allDevices) setDevices(res.data.allDevices);
    } catch (err) {
      console.error('loadDevices', err);
      setDevices([]);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      let endpoint = '/logs/activities';
      switch (activeTab) {
        case 'activities': endpoint = '/logs/activities'; break;
        case 'manual-switches': endpoint = '/logs/manual-switches'; break;
        case 'web-switches': endpoint = '/logs/web-switches'; break;
        case 'schedule-switches': endpoint = '/logs/schedule-switches'; break;
        case 'device-status': endpoint = '/logs/device-status'; break;
      }

      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (deviceFilter !== 'all') params.set('deviceId', deviceFilter);
      if (dateRange.from) params.set('startDate', dateRange.from.toISOString());
      if (dateRange.to) params.set('endDate', dateRange.to.toISOString());
      params.set('page', String(currentPage));
      params.set('limit', String(itemsPerPage));

      const res = await api.get(`${endpoint}?${params.toString()}`);
      const data = res.data.logs || res.data.data || res.data;

      if (res.data && typeof res.data.total !== 'undefined') {
        setPaginationMeta({
          total: res.data.total,
          totalPages: res.data.totalPages || Math.max(1, Math.ceil(res.data.total / itemsPerPage)),
          currentPage: res.data.page || currentPage,
          limit: res.data.limit || itemsPerPage
        });
      }

      switch (activeTab) {
        case 'activities': setActivityLogs(Array.isArray(data) ? data : []); break;
        case 'manual-switches': setManualSwitchLogs(Array.isArray(data) ? data : []); break;
        case 'web-switches': setWebSwitchLogs(Array.isArray(data) ? data : []); break;
        case 'schedule-switches': setScheduleSwitchLogs(Array.isArray(data) ? data : []); break;
        case 'device-status': setDeviceStatusLogs(Array.isArray(data) ? data : []); break;
      }
    } catch (err) {
      console.error('loadData', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await api.get('/logs/stats');
      setStats(res.data || {
        activities: { total: 0, today: 0 },
        webSwitches: { total: 0, today: 0 },
        scheduleSwitches: { total: 0, today: 0 },
        deviceStatus: { total: 0, today: 0 }
      });
    } catch (err) {
      console.error('loadStats', err);
      setStats({
        activities: { total: 0, today: 0 },
        webSwitches: { total: 0, today: 0 },
        scheduleSwitches: { total: 0, today: 0 },
        deviceStatus: { total: 0, today: 0 }
      });
    }
  };

  const exportToExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('type', activeTab);
      const res = await api.post(`/logs/export/excel?${params.toString()}`, {}, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}-logs-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('exportToExcel', err);
    } finally {
      setIsExporting(false);
    }
  };

  const showAllLogs = () => {
    // If backend returned a total, use it; otherwise fall back to a large limit
    const newLimit = paginationMeta.total && paginationMeta.total > 0 ? paginationMeta.total : 10000;
    setItemsPerPage(newLimit);
    setCurrentPage(1);
  };

  const loadMoreLogs = () => {
    // increase items per page in chunks (helps user progressively load more)
    setItemsPerPage((prev) => Math.min(prev + 50, paginationMeta.total || prev + 50));
    // keep current page at 1 so we fetch a larger page from start
    setCurrentPage(1);
  };

  const goToPrevPage = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((p) => Math.min(p + 1, paginationMeta.totalPages || p + 1));
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateRange({});
    setDeviceFilter('all');
    setCurrentPage(1);
  };

  const filteredData = useMemo(() => {
    switch (activeTab) {
      case 'activities': return activityLogs as AnyLog[];
      case 'manual-switches': return manualSwitchLogs;
      case 'web-switches': return webSwitchLogs;
      case 'schedule-switches': return scheduleSwitchLogs;
      case 'device-status': return deviceStatusLogs;
      default: return [];
    }
  }, [activeTab, activityLogs, manualSwitchLogs, webSwitchLogs, scheduleSwitchLogs, deviceStatusLogs]);

  const totalPages = paginationMeta.totalPages;
  const totalEntries = paginationMeta.total;

  return (
    <div className="w-full max-w-7xl mx-auto mt-4 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Activity Logs</p>
                <p className="text-2xl font-bold">{safe(stats, 'activities.total', 0)}</p>
                <p className="text-xs text-muted-foreground">{safe(stats, 'activities.today', 0)} today</p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Manual Switches</p>
                <p className="text-2xl font-bold">{safe(stats, 'manualSwitches.total', 0)}</p>
                <p className="text-xs text-muted-foreground">{safe(stats, 'manualSwitches.today', 0)} today</p>
              </div>
              <Activity className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Web Switches</p>
                <p className="text-2xl font-bold">{safe(stats, 'webSwitches.total', 0)}</p>
                <p className="text-xs text-muted-foreground">{safe(stats, 'webSwitches.today', 0)} today</p>
              </div>
              <Monitor className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Schedule Switches</p>
                <p className="text-2xl font-bold">{safe(stats, 'scheduleSwitches.total', 0)}</p>
                <p className="text-xs text-muted-foreground">{safe(stats, 'scheduleSwitches.today', 0)} today</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Device Status</p>
                <p className="text-2xl font-bold">{safe(stats, 'deviceStatus.total', 0)}</p>
                <p className="text-xs text-muted-foreground">{safe(stats, 'deviceStatus.today', 0)} today</p>
              </div>
              <Monitor className="h-8 w-8 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Enhanced Logs
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportToExcel} disabled={isExporting}>
                <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-spin' : ''}`} />
                Export All Excel
              </Button>
              <Button variant="outline" size="sm" onClick={showAllLogs} disabled={isLoading || (paginationMeta.total === 0)}>
                <Activity className="h-4 w-4 mr-2" />
                Show All
              </Button>
              <Button variant="outline" size="sm" onClick={loadMoreLogs} disabled={isLoading || (paginationMeta.currentPage >= paginationMeta.totalPages && paginationMeta.totalPages <= 1)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Load more
              </Button>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <Input placeholder="Search logs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="lg:col-span-2" />

              <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>{format(dateRange.from, 'LLL dd')} - {format(dateRange.to, 'LLL dd')}</>
                      ) : (
                        format(dateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      'Date range'
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={dateRange.from ? (dateRange as { from: Date; to?: Date }) : undefined}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              <Select value={deviceFilter} onValueChange={setDeviceFilter}>
                <SelectTrigger className="min-w-[200px] w-full">
                  <SelectValue placeholder="Select Device" />
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="all">All Devices</SelectItem>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id} className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-sm truncate">{device.name}</span>
                        <Badge variant={device.status === 'online' ? 'default' : 'secondary'} className="text-xs px-2 py-0.5 flex-shrink-0">
                          {device.status}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LogType)}>
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-1">
              <TabsTrigger value="activities" className="flex items-center gap-1 text-xs md:text-sm px-2 py-1.5">
                <span className="hidden md:inline">Activity Logs</span>
                <span className="md:hidden">Activity</span>
              </TabsTrigger>
              <TabsTrigger value="manual-switches" className="flex items-center gap-1 text-xs md:text-sm px-2 py-1.5">
                <span className="hidden md:inline">Manual Switches</span>
                <span className="md:hidden">Manual</span>
              </TabsTrigger>
              <TabsTrigger value="web-switches" className="flex items-center gap-1 text-xs md:text-sm px-2 py-1.5">
                <span className="hidden md:inline">Web Switches</span>
                <span className="md:hidden">Web</span>
              </TabsTrigger>
              <TabsTrigger value="schedule-switches" className="flex items-center gap-1 text-xs md:text-sm px-2 py-1.5">
                <span className="hidden md:inline">Schedule Switches</span>
                <span className="md:hidden">Schedule</span>
              </TabsTrigger>
              <TabsTrigger value="device-status" className="flex items-center gap-1 text-xs md:text-sm px-2 py-1.5">
                <span className="hidden md:inline">Device Status</span>
                <span className="md:hidden">Status</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activities">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="animate-spin w-6 h-6 mr-2" /> Loading activity logs...
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No activity logs found.</div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Time</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Action</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Device/Switch</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden md:table-cell">User/Source</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden lg:table-cell">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map((log) => (
                        <tr key={log.id || Math.random()} className="border-b hover:bg-muted/50">
                          <td className="px-2 md:px-4 py-2 whitespace-nowrap text-xs md:text-sm">{safeFormatDate(log.timestamp, 'MMM dd, HH:mm:ss')}</td>
                          <td className="px-2 md:px-4 py-2">
                            {(() => {
                              const state = (log as any).newState ? String((log as any).newState).toLowerCase() : (log.action === 'on' ? 'on' : log.action === 'off' ? 'off' : undefined);
                              return <Badge variant={state === 'on' ? 'default' : 'secondary'} className="text-xs whitespace-nowrap">{state === 'on' ? '🟢 ON' : state === 'off' ? '🔴 OFF' : (log.action || 'unknown').toUpperCase()}</Badge>;
                          })()}
                          </td>
                          <td className="px-2 md:px-4 py-2">
                            <div className="min-w-0">
                              <div className="font-medium text-xs md:text-sm truncate">{log.deviceName || '-'}</div>
                              {log.switchName && <div className="text-xs text-muted-foreground truncate">{log.switchName}</div>}
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-2 hidden md:table-cell">
                            <div className="min-w-0">
                              {(() => {
                                const tb = (log as any).triggeredBy as string | undefined;
                                const ctx = (log as any).context || {};
                                let label: string | null = null;
                                if (tb === 'user') {
                                  label = (log as any).userName || 'Web User';
                                } else if (tb === 'schedule') {
                                  label = ctx.scheduleName || 'Schedule';
                                } else if (tb === 'pir') {
                                  label = 'PIR Sensor';
                                } else if (tb === 'manual_switch') {
                                  label = 'Manual Switch';
                                } else if (tb === 'voice_assistant') {
                                  label = 'Voice Assistant';
                                } else if (tb === 'monitoring') {
                                  label = 'Monitoring';
                                }
                                return (
                                  <>
                                    {label && <div className="font-medium text-xs md:text-sm truncate">{label}</div>}
                                    <div className="text-xs"><Badge variant="outline" className="text-xs">{tb || 'unknown'}</Badge></div>
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-2 text-xs text-muted-foreground hidden lg:table-cell truncate">{log.location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual-switches">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="animate-spin w-6 h-6 mr-2" /> Loading manual switch logs...
                </div>
              ) : manualSwitchLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No manual switch logs found.</div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Time</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Device</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Switch</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden md:table-cell">GPIO Pin</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Action</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden lg:table-cell">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualSwitchLogs.map((log) => (
                        <tr key={log.id || Math.random()} className="border-b hover:bg-muted/50">
                          <td className="px-2 md:px-4 py-2 whitespace-nowrap text-xs md:text-sm">{safeFormatDate(log.timestamp, 'MMM dd, HH:mm:ss')}</td>
                          <td className="px-2 md:px-4 py-2"><div className="font-medium text-xs md:text-sm truncate">{log.deviceName || 'Unknown Device'}</div></td>
                          <td className="px-2 md:px-4 py-2"><div className="flex items-center gap-1 md:gap-2 min-w-0"><Monitor className="w-3 h-3 md:w-4 md:h-4 text-yellow-600 flex-shrink-0" /><span className="font-medium text-xs md:text-sm truncate">{log.switchName || 'Unknown Switch'}</span></div></td>
                          <td className="px-2 md:px-4 py-2 hidden md:table-cell"><Badge variant="outline" className="font-mono text-xs">GPIO {log.gpioPin ?? 'N/A'}</Badge></td>
                          <td className="px-2 md:px-4 py-2">
                            {(() => {
                              const state = log?.newState ? String(log.newState).toLowerCase() : (log.action === 'manual_on' || log.action === 'manual_toggle' ? 'on' : log.action === 'manual_off' ? 'off' : undefined);
                              return <Badge variant={state === 'on' ? 'default' : 'secondary'} className="text-xs whitespace-nowrap">{state === 'on' ? '🟢 ON' : state === 'off' ? '🔴 OFF' : (log.action || 'unknown')}</Badge>;
                            })()}
                          </td>
                          <td className="px-2 md:px-4 py-2 text-muted-foreground text-xs hidden lg:table-cell truncate">{log.location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="web-switches">
              {webSwitchLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No web switch logs found.</div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Time</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Device</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Switch</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden md:table-cell">User</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Action</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden lg:table-cell">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webSwitchLogs.map((log) => (
                        <tr key={log.id || Math.random()} className="border-b hover:bg-muted/50">
                          <td className="px-2 md:px-4 py-2 whitespace-nowrap text-xs md:text-sm">{safeFormatDate(log.timestamp, 'MMM dd, HH:mm:ss')}</td>
                          <td className="px-2 md:px-4 py-2"><div className="font-medium text-xs md:text-sm truncate">{log.deviceName || 'Unknown Device'}</div></td>
                          <td className="px-2 md:px-4 py-2"><div className="flex items-center gap-1 md:gap-2 min-w-0"><Monitor className="w-3 h-3 md:w-4 md:h-4 text-green-600 flex-shrink-0" /><span className="font-medium text-xs md:text-sm truncate">{log.switchName || 'Unknown Switch'}</span></div></td>
                          <td className="px-2 md:px-4 py-2 hidden md:table-cell"><div className="font-medium text-xs md:text-sm truncate">{log.userName || 'Unknown User'}</div>{log.ipAddress && <div className="text-xs text-muted-foreground truncate">{log.ipAddress}</div>}</td>
                          <td className="px-2 md:px-4 py-2"><Badge variant="outline" className={`text-xs whitespace-nowrap ${log.newState === 'on' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{log.newState === 'on' ? '🟢 ON' : '🔴 OFF'}</Badge></td>
                          <td className="px-2 md:px-4 py-2 text-muted-foreground text-xs hidden lg:table-cell truncate">{log.location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="schedule-switches">
              {scheduleSwitchLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No schedule switch logs found.</div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Time</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Device</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Switch</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden md:table-cell">Schedule</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Action</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden lg:table-cell">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleSwitchLogs.map((log) => (
                        <tr key={log.id || Math.random()} className="border-b hover:bg-muted/50">
                          <td className="px-2 md:px-4 py-2 whitespace-nowrap text-xs md:text-sm">{safeFormatDate(log.timestamp, 'MMM dd, HH:mm:ss')}</td>
                          <td className="px-2 md:px-4 py-2"><div className="font-medium text-xs md:text-sm truncate">{log.deviceName || 'Unknown Device'}</div></td>
                          <td className="px-2 md:px-4 py-2"><div className="flex items-center gap-1 md:gap-2 min-w-0"><Clock className="w-3 h-3 md:w-4 md:h-4 text-purple-600 flex-shrink-0" /><span className="font-medium text-xs md:text-sm truncate">{log.switchName || 'Unknown Switch'}</span></div></td>
                          <td className="px-2 md:px-4 py-2 hidden md:table-cell"><div className="font-medium text-xs md:text-sm truncate">{log.scheduleName || 'Unknown Schedule'}</div><div className="text-xs text-muted-foreground truncate">Trigger: {safeFormatDate(log.triggerTime, 'MMM dd, HH:mm')}</div></td>
                          <td className="px-2 md:px-4 py-2"><Badge variant="outline" className={`text-xs whitespace-nowrap ${log.newState === 'on' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{log.newState === 'on' ? '🟢 ON' : '🔴 OFF'}</Badge></td>
                          <td className="px-2 md:px-4 py-2 text-muted-foreground text-xs hidden lg:table-cell truncate">{log.location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="device-status">
              {deviceStatusLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No device status logs found.</div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Time</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Device</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm">Online Status</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden md:table-cell">Signal/Temp</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden md:table-cell">Switches</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden lg:table-cell">Alerts</th>
                        <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm hidden lg:table-cell">Response Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceStatusLogs.map((log) => (
                        <tr key={log.id || Math.random()} className="border-b hover:bg-muted/50">
                          <td className="px-2 md:px-4 py-2 whitespace-nowrap text-xs md:text-sm">{safeFormatDate(log.timestamp, 'MMM dd, HH:mm:ss')}</td>
                          <td className="px-2 md:px-4 py-2"><div><div className="font-medium text-xs md:text-sm truncate">{log.deviceName || '-'}</div>{log.deviceMac && <div className="text-xs text-muted-foreground truncate">{log.deviceMac}</div>}</div></td>
                          <td className="px-2 md:px-4 py-2"><Badge variant={safe(log, 'deviceStatus.isOnline', false) ? 'default' : 'destructive'} className="text-xs whitespace-nowrap">{safe(log, 'deviceStatus.isOnline', false) ? <>🟢 Online</> : <>🔴 Offline</>}</Badge></td>
                          <td className="px-2 md:px-4 py-2 text-xs hidden md:table-cell"><div>{safe(log, 'deviceStatus.wifiSignalStrength') && <div className="truncate">Signal: {safe(log, 'deviceStatus.wifiSignalStrength')}dBm</div>}{safe(log, 'deviceStatus.temperature') && <div className="truncate">Temp: {safe(log, 'deviceStatus.temperature')}°C</div>}</div></td>
                          <td className="px-2 md:px-4 py-2 text-xs hidden md:table-cell">{log.summary && <div><div>On: {safe(log, 'summary.totalSwitchesOn', 0)}</div><div>Off: {safe(log, 'summary.totalSwitchesOff', 0)}</div></div>}</td>
                          <td className="px-2 md:px-4 py-2 hidden lg:table-cell">{log.alerts && log.alerts.length > 0 ? <Badge variant="destructive" className="text-xs">{log.alerts.length} Alert{log.alerts.length > 1 ? 's' : ''}</Badge> : <Badge variant="default" className="text-xs">No Alerts</Badge>}</td>
                          <td className="px-2 md:px-4 py-2 text-xs hidden lg:table-cell">{safe(log, 'deviceStatus.responseTime') ? `${safe(log, 'deviceStatus.responseTime')}ms` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Pagination controls */}
          <div className="mt-4">
            <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={goToPrevPage} disabled={currentPage <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div className="text-sm text-muted-foreground whitespace-nowrap">Page {currentPage} of {paginationMeta.totalPages || 1}</div>

                <Button variant="ghost" size="sm" onClick={goToNextPage} disabled={currentPage >= (paginationMeta.totalPages || 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>

                <div className="ml-2 md:ml-4 flex items-center gap-2">
                  <label className="text-sm text-muted-foreground whitespace-nowrap">Per page</label>
                  <select className="bg-transparent border border-border rounded px-2 py-1 text-sm" value={itemsPerPage} onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>

              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {paginationMeta.total > 0 ? (
                  (() => {
                    const start = (currentPage - 1) * itemsPerPage + 1;
                    const end = Math.min(start + itemsPerPage - 1, paginationMeta.total);
                    return (<>{start} - {end} of {paginationMeta.total}</>);
                  })()
                ) : (
                  <>{0} of {0}</>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ActiveLogsPage;
