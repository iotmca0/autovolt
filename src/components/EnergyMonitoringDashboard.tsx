// EnergyMonitoringDashboard.tsx
// Responsive Energy Monitoring Dashboard similar to smart power usage apps
// Features: Real-time monitoring, historical data, calendar view, runtime tracking
// Supports both desktop and mobile layouts with automatic adaptation

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar as CalendarIcon, Clock, Zap, TrendingUp, TrendingDown, Activity,
  ChevronLeft, ChevronRight, Info, Settings
} from 'lucide-react';
import { apiService, energyAPI } from '@/services/api';
import { cn } from '@/lib/utils';
import PowerSettings from './PowerSettings';
import EnergyCharts from '@/components/EnergyCharts';

interface DailySummary {
  date: string;
  consumption: number;
  cost: number;
  runtime: number;
  category: 'low' | 'medium' | 'high';
}

interface CalendarViewData {
  month: string;
  year: number;
  days: DailySummary[];
  totalCost: number;
  totalConsumption: number;
}

const EnergyMonitoringDashboard: React.FC = () => {
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPowerSettings, setShowPowerSettings] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('all');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [todayData, setTodayData] = useState<any>(null);
  const [monthData, setMonthData] = useState<any>(null);
  // Anchors actually used for cards and chart normalization (respect filters)
  const [displayToday, setDisplayToday] = useState<any>(null);
  const [displayMonth, setDisplayMonth] = useState<any>(null);
  const [fallbackInfo, setFallbackInfo] = useState<{daily?: boolean; monthly?: boolean}>({});
  const [calendarData, setCalendarData] = useState<CalendarViewData | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [electricityPrice, setElectricityPrice] = useState<number>(7.5);

  // Fetch electricity price from power settings
  const fetchElectricityPrice = async () => {
    try {
      const response = await apiService.get('/settings/power/price');
      if (response.data && typeof response.data.price === 'number') {
        setElectricityPrice(response.data.price);
      }
    } catch (error) {
      console.error('Error fetching electricity price:', error);
      // Keep default value of 7.5
    }
  };

  // Fetch summary data (global) and compute display anchors that respect filters
  const fetchSummaryAnchors = async () => {
    try {
      const response = await energyAPI.summary();
      const daily = response.data.daily;
      const monthly = response.data.monthly;
      setTodayData(daily);
      setMonthData(monthly);
      setFallbackInfo(response.data.fallback || {});

      const isFiltered = selectedClassroom !== 'all' || selectedDevice !== 'all';
      const now = new Date();
      if (!isFiltered) {
        setDisplayToday(daily);
        setDisplayMonth(monthly);
      } else {
        // Derive filtered anchors from breakdown endpoints so cards match charts
        const dateStr = now.toISOString().slice(0, 10);
        const [hourly, monthlyBreak] = await Promise.all([
          energyAPI.hourlyBreakdown(dateStr, selectedClassroom !== 'all' ? selectedClassroom : undefined, selectedDevice !== 'all' ? selectedDevice : undefined),
          energyAPI.monthlyBreakdown(now.getFullYear(), now.getMonth() + 1, selectedClassroom !== 'all' ? selectedClassroom : undefined, selectedDevice !== 'all' ? selectedDevice : undefined)
        ]);
        const buckets = (hourly.data?.buckets || []) as Array<{ consumption_kwh?: number; cost?: number }>;
        const filteredDayConsumption = buckets.reduce((sum, b) => sum + (b.consumption_kwh || 0), 0);
        const filteredDayCost = buckets.reduce((sum, b) => sum + (b.cost || 0), 0);
        setDisplayToday({
          consumption: filteredDayConsumption,
          cost: filteredDayCost,
          runtime: 0,
          onlineDevices: daily?.onlineDevices ?? 0
        });
        setDisplayMonth({
          consumption: monthlyBreak.data?.total_kwh || 0,
          cost: monthlyBreak.data?.total_cost || 0,
          runtime: monthly?.runtime ?? 0,
          onlineDevices: monthly?.onlineDevices ?? 0
        });
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  // Charts removed: no chart data fetching

  // Fetch calendar view data (real data only, no mock data)
  const fetchCalendarData = async (date: Date) => {
    try {
      const year = date.getFullYear();
      const month = date.getMonth();
      console.log('[Calendar] Fetching data for:', year, month + 1, '| Date object:', date);
      const response = await apiService.get(`/analytics/energy-calendar/${year}/${month + 1}`);
      console.log('[Calendar] Received data:', response.data);
      setCalendarData(response.data);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      // Set to null if API fails - will show error message to user
      setCalendarData(null);
    }
  };

  // Fetch devices and classrooms (includes all devices - new ones will be automatically included)
  const fetchDevicesAndClassrooms = async () => {
    try {
      const response = await apiService.get('/analytics/dashboard');
      setDevices(response.data.devices || []);
      const uniqueClassrooms = [...new Set(response.data.devices?.map((d: any) => d.classroom).filter((c: any) => c))];
      setClassrooms(uniqueClassrooms as string[]);
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchElectricityPrice(),
        fetchDevicesAndClassrooms()
      ]);
      // Fetch anchors (charts removed)
      await fetchSummaryAnchors();
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    // Refetch anchors when filters change (charts removed)
    fetchSummaryAnchors();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, selectedClassroom]);

  useEffect(() => {
    if (showCalendar) {
      fetchCalendarData(currentDate);
    }
  }, [showCalendar, currentDate]);

  // Calculate runtime in hours and minutes
  const formatRuntime = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Get color for calendar day based on consumption (including zero/no data)
  const getCategoryColor = (consumption: number, category: 'low' | 'medium' | 'high') => {
    // Show gray for zero consumption (no data for that day)
    if (consumption === 0) {
      return 'bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600';
    }
    
    switch (category) {
      case 'low': return 'bg-blue-500 hover:bg-blue-600';
      case 'medium': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'high': return 'bg-red-500 hover:bg-red-600';
    }
  };

  // Navigate calendar months
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(currentDate.getMonth() - 1);
    } else {
      newDate.setMonth(currentDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  // Charts removed: no formatted chart data

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-6">
      {/* Power Settings Modal */}
      <PowerSettings 
        isOpen={showPowerSettings} 
        onClose={() => {
          setShowPowerSettings(false);
          // Reload electricity price and data after settings change
          fetchElectricityPrice();
          fetchSummaryAnchors();
          // Refresh calendar if it's open
          if (showCalendar) {
            fetchCalendarData(currentDate);
          }
        }} 
      />

      {/* Header with Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-primary">Energy Monitoring</h2>
          <p className="text-sm text-muted-foreground">Real-time and historical power usage tracking</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Select Device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="truncate">{device.name}</span>
                    <span className="text-[10px] shrink-0">
                      {device.status === 'online' ? '🟢' : '⚪'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Select Classroom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classrooms</SelectItem>
              {classrooms.map((classroom) => (
                <SelectItem key={classroom} value={classroom}>
                  {classroom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showPowerSettings ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowPowerSettings(!showPowerSettings)}
            className="flex-shrink-0"
            title="Power Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <Button
            variant={showCalendar ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex-shrink-0"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Selected Device Info Banner - Shows when filtering by offline device */}
      {selectedDevice !== 'all' && devices.find(d => d.id === selectedDevice)?.status === 'offline' && (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-300">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  Viewing offline device: {devices.find(d => d.id === selectedDevice)?.name}
                </p>
                <p className="text-amber-800 dark:text-amber-200 mt-1">
                  Historical power consumption data is being displayed. Real-time tracking will resume when the device comes back online.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Today's Usage */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              Today's Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl md:text-3xl font-bold text-blue-600">
              {(displayToday?.consumption ?? todayData?.consumption)?.toFixed(3) || '0.000'} kWh
            </div>
            <div className="text-xs text-muted-foreground">
              Cost: ₹{(displayToday?.cost ?? todayData?.cost)?.toFixed(2) || '0.00'}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {todayData?.onlineDevices || 0} devices online
              </Badge>
              {fallbackInfo?.daily && (
                <Badge variant="secondary" className="text-[10px]">reconstructed</Badge>
              )}
              {(selectedClassroom !== 'all' || selectedDevice !== 'all') && (
                <Badge variant="secondary" className="text-[10px]">filtered</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* This Month's Usage */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl md:text-3xl font-bold text-green-600">
              {(displayMonth?.consumption ?? monthData?.consumption)?.toFixed(3) || '0.000'} kWh
            </div>
            <div className="text-xs text-muted-foreground">
              Cost: ₹{(displayMonth?.cost ?? monthData?.cost)?.toFixed(2) || '0.00'}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Avg. efficiency: 85%
              </Badge>
              {fallbackInfo?.monthly && (
                <Badge variant="secondary" className="text-[10px]">reconstructed</Badge>
              )}
              {(selectedClassroom !== 'all' || selectedDevice !== 'all') && (
                <Badge variant="secondary" className="text-[10px]">filtered</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bill This Month */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-600" />
              Bill This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl md:text-3xl font-bold text-purple-600">
              ₹{(displayMonth?.cost ?? monthData?.cost)?.toFixed(2) || '0.00'}
            </div>
            <div className="text-xs text-muted-foreground">
              Rate: ₹{electricityPrice.toFixed(2)}/kWh
            </div>
            <Badge variant="outline" className="text-xs">
              {(((displayMonth?.cost ?? monthData?.cost) || 0) / 30).toFixed(2)} ₹/day avg
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Modal Overlay */}
      {showCalendar && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => setShowCalendar(false)}
        >
          <div 
            className="w-full max-w-[95vw] sm:max-w-3xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {!calendarData && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6">
                  <div className="text-center text-red-600">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-semibold">Unable to load calendar data</p>
                    <p className="text-sm text-red-500 mt-2">
                      Please ensure the backend server is running and the calendar endpoint is available.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {calendarData && (
              <Card>
                <CardHeader className="pb-3 px-3 sm:px-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <CalendarIcon className="h-4 w-4" />
                      {calendarData.month} {calendarData.year}
                    </CardTitle>
                    <div className="flex gap-1 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')} title="Previous Month" className="h-8 w-8 p-0 sm:h-9 sm:px-3 sm:w-auto">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setCurrentDate(new Date())} 
                        title="Go to Current Month"
                        className="text-xs px-2 h-8 sm:h-9"
                      >
                        Today
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigateMonth('next')} title="Next Month" className="h-8 w-8 p-0 sm:h-9 sm:px-3 sm:w-auto">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowCalendar(false)} title="Close Calendar" className="h-8 w-8 p-0 sm:h-9 sm:px-3 sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs hidden sm:block">Daily energy consumption from power tracking system</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 px-3 sm:px-6">
            {/* Calendar Legend */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 p-2 bg-muted rounded-lg text-[10px] sm:text-xs">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gray-300 dark:bg-gray-700 rounded"></div>
                <span className="text-[10px] sm:text-xs">No Data</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-500 rounded"></div>
                <span className="text-[10px] sm:text-xs">≤1 kWh</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-yellow-500 rounded"></div>
                <span className="text-[10px] sm:text-xs">1-2 kWh</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded"></div>
                <span className="text-[10px] sm:text-xs">&gt;2 kWh</span>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-[9px] sm:text-[10px] font-semibold p-0.5 sm:p-1 text-muted-foreground">
                  {day}
                </div>
              ))}
              
              {/* Empty cells for padding */}
              {Array.from({ length: new Date(calendarData.year, currentDate.getMonth(), 1).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square"></div>
              ))}
              
              {/* Calendar days */}
              {calendarData.days.map((day, index) => (
                <div
                  key={index}
                  className={cn(
                    "aspect-square rounded flex flex-col items-center justify-center cursor-pointer transition-all",
                    getCategoryColor(day.consumption, day.category),
                    "text-white text-[9px] sm:text-[10px] font-semibold group relative"
                  )}
                  title={`${day.consumption.toFixed(2)} kWh - ₹${day.cost.toFixed(2)}${day.consumption === 0 ? ' (No data)' : ''}`}
                >
                  <span className="text-[10px] sm:text-[11px]">{new Date(day.date).getDate()}</span>
                  <span className="text-[8px] sm:text-[9px] opacity-75">
                    {day.consumption === 0 ? '-' : day.consumption.toFixed(1)}
                  </span>
                  
                  {/* Hover/Touch tooltip */}
                  <div className="absolute bottom-full mb-1 sm:mb-2 hidden group-hover:block bg-black text-white text-[10px] sm:text-xs rounded p-1.5 sm:p-2 whitespace-nowrap z-10 shadow-lg">
                    <div>{day.consumption.toFixed(2)} kWh</div>
                    <div>₹{day.cost.toFixed(2)}</div>
                    <div>{formatRuntime(day.runtime)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Month Summary */}
            <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg">
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Total Consumption</div>
                <div className="text-base sm:text-xl font-bold">{calendarData.totalConsumption.toFixed(2)} kWh</div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Total Cost</div>
                <div className="text-base sm:text-xl font-bold">₹{calendarData.totalCost.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
            )}
          </div>
        </div>
      )}

      {/* Interactive Multi-Period Energy Charts */}
      <EnergyCharts
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedClassroom={selectedClassroom}
        selectedDevice={selectedDevice}
        todayAnchor={displayToday}
        monthAnchor={displayMonth}
        electricityRate={electricityPrice}
      />

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                How to use this dashboard:
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                <li>Toggle between Day, Month, and Year views to see different time periods</li>
                <li>Click the calendar icon to see a monthly overview with color-coded consumption</li>
                <li>Hover over any bar or calendar day to see detailed information</li>
                <li>Use device and classroom filters to analyze specific areas</li>
                <li>Data updates automatically every 30 seconds for real-time monitoring</li>
                <li className="font-medium text-blue-900 dark:text-blue-100">
                  <strong>Offline devices:</strong> Historical power consumption data is preserved and shown in charts even when devices are offline (marked with ○)
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnergyMonitoringDashboard;
