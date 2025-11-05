// AnalyticsPanel.tsx
// Grafana-style analytics dashboard with Prometheus metrics integration
// Features: Energy consumption dashboards, forecast vs actual usage,
// device uptime predictions, anomaly history, and real-time monitoring
// Data Retention: Configured for 3+ months retention for AI/ML model training
// Analytics data is stored with timestamps for historical analysis and predictive modeling

import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import {
  Activity, Zap, Users, AlertTriangle, TrendingUp,
  Download, RefreshCw, Monitor, Lightbulb, Fan, Server,
  Wifi, WifiOff, Calendar, Clock
} from 'lucide-react';
import { apiService } from '@/services/api';
import EnergyMonitoringDashboard from './EnergyMonitoringDashboard';
import DeviceUptimeTracker from './DeviceUptimeTracker';
import { AnalyticsSkeleton } from '@/components/skeletons';

interface AnalyticsData {
  devices: Array<{
    id: string;
    name: string;
    classroom: string;
    type: string;
    status: string;
    power: number;
    health: number;
  }>;
  classrooms: Array<{
    id: string;
    name: string;
    type: string;
    occupancy: number;
  }>;
  summary: {
    totalDevices: number;
    onlineDevices: number;
    totalPowerConsumption: number;
    averageHealthScore: number;
  };
}

const AnalyticsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [energyData, setEnergyData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any>(null);
  const [anomalyData, setAnomalyData] = useState<any>(null);
  const [energySummary, setEnergySummary] = useState<any>(null); // NEW: Store energy summary
  const [energyTimeframe, setEnergyTimeframe] = useState('24h');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedClassrooms, setSelectedClassrooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch analytics data
  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      // console.log('Fetching analytics data...'); // Removed duplicate logging

      // Try individual API calls instead of Promise.all to see which one fails
      const dashboardRes = await apiService.get('/analytics/dashboard');
      // console.log('Dashboard data received:', dashboardRes.data); // Removed duplicate logging

      setAnalyticsData(dashboardRes.data);
      setError(null);

      // Fetch additional data for enhanced tabs
      await Promise.all([
        fetchEnergyData(energyTimeframe),
        fetchEnergySummary(), // NEW: Fetch energy summary
        fetchForecastData('energy', energyTimeframe),
        fetchAnomalyData('7d')
      ]);
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      setError('Failed to load analytics data. Please check your connection.');
      // Don't set mock data - show error state instead
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  // Fetch energy data
  const fetchEnergyData = async (timeframe: string = '24h') => {
    try {
      const response = await apiService.get(`/analytics/energy/${timeframe}`);
      
      // Aggregate hourly data based on timeframe for consistency with Energy Monitoring Dashboard
      let aggregatedData = response.data;
      
      if (timeframe === '30d' || timeframe === '7d') {
        // Aggregate hourly data into daily data
        const dailyMap = new Map();
        
        response.data.forEach((item: any) => {
          const date = new Date(item.timestamp);
          const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          
          if (!dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, {
              timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString(),
              totalConsumption: 0,
              totalCostINR: 0,
              byClassroom: {},
              byDeviceType: {}
            });
          }
          
          const dayData = dailyMap.get(dayKey);
          dayData.totalConsumption += item.totalConsumption || 0;
          dayData.totalCostINR += item.totalCostINR || 0;
        });
        
        aggregatedData = Array.from(dailyMap.values()).sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      }
      
      setEnergyData(aggregatedData);
    } catch (err) {
      console.error('Error fetching energy data:', err);
      // Don't set mock data - let the UI show empty state
      setEnergyData([]);
    }
  };

  // NEW: Fetch energy summary (monthly and daily consumption)
  const fetchEnergySummary = async () => {
    try {
      const response = await apiService.get('/analytics/energy-summary');
      setEnergySummary(response.data);
    } catch (err) {
      console.error('Error fetching energy summary:', err);
      setEnergySummary(null);
    }
  };

  // Fetch forecast data
  const fetchForecastData = async (type: string = 'energy', timeframe: string = '24h') => {
    try {
      const response = await apiService.get(`/analytics/forecast/${type}/${timeframe}`);
      setForecastData(response.data);
    } catch (err) {
      console.error('Error fetching forecast data:', err);
      // Don't set mock data - let the UI show empty state
      setForecastData(null);
    }
  };

  // Fetch anomaly data
  const fetchAnomalyData = async (timeframe: string = '7d') => {
    try {
      const response = await apiService.get(`/analytics/anomalies/${timeframe}`);
      setAnomalyData(response.data);
    } catch (err) {
      console.error('Error fetching anomaly data:', err);
      // Don't set mock data - let the UI show empty state
      setAnomalyData(null);
    }
  };

  // Device type icons
  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'display': return Monitor;
      case 'lighting': return Lightbulb;
      case 'climate': return Fan;
      case 'computing': return Server;
      default: return Activity;
    }
  };

  // Status colors
  const getStatusColor = (status: string) => {
    return status === 'online' ? 'bg-green-500' : 'bg-red-500';
  };

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  if (error && !analyticsData) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-500">{error}</p>
          <Button onClick={fetchAnalyticsData} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No analytics data available</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const deviceStatusData = [
    { name: 'Online', value: analyticsData.summary?.onlineDevices ?? 0, color: '#10b981' },
    { name: 'Offline', value: (analyticsData.summary?.totalDevices ?? 0) - (analyticsData.summary?.onlineDevices ?? 0), color: '#ef4444' }
  ].filter(item => item.value > 0); // Only show items with value > 0

  // console.log('Chart data:', { deviceStatusData, occupancyData }); // Removed duplicate logging

  return (
    <div className="w-full space-y-4 md:space-y-6 p-2 md:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">Analytics Dashboard</h2>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground">Real-time monitoring and historical data analysis</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={fetchAnalyticsData} className="flex-1 sm:flex-none text-xs sm:text-sm">
            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Refresh
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none text-xs sm:text-sm">
            <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {analyticsData.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.summary?.totalDevices ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsData.summary?.onlineDevices ?? 0} online
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Power Consumption</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              {energySummary?.monthly?.consumption?.toFixed(2) ?? 0} kWh
            </div>
            <p className="text-xs text-muted-foreground">
              Month's consumption
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Today: {energySummary?.daily?.consumption?.toFixed(2) ?? 0} kWh
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">{analyticsData.summary?.averageHealthScore?.toFixed(2) ?? 0}%</div>
            <p className="text-xs text-muted-foreground">
              Device health status
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Anomalies</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">-</div>
            <p className="text-xs text-muted-foreground">
              Requiring attention
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Main Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm py-2 px-2 sm:px-4">Overview</TabsTrigger>
          <TabsTrigger value="energy" className="text-xs sm:text-sm py-2 px-2 sm:px-4">Energy</TabsTrigger>
          <TabsTrigger value="devices" className="text-xs sm:text-sm py-2 px-2 sm:px-4">Devices</TabsTrigger>
          <TabsTrigger value="anomalies" className="text-xs sm:text-sm py-2 px-2 sm:px-4">Anomalies</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* System Health Gauge */}
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Overall system performance</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Healthy', value: analyticsData.summary?.averageHealthScore ?? 0, fill: '#10b981' },
                        { name: 'Needs Attention', value: 100 - (analyticsData.summary?.averageHealthScore ?? 0), fill: '#f59e0b' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip formatter={(value) => [`${typeof value === 'number' ? value.toFixed(2) : value}%`, '']} />
                    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold fill-white">
                      {analyticsData.summary?.averageHealthScore?.toFixed(2) ?? 0}%
                    </text>
                    <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-white">
                      Health Score
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Device Status Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Device Status</CardTitle>
                <CardDescription>Online vs offline devices</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Online', value: analyticsData.summary?.onlineDevices ?? 0, fill: '#10b981' },
                        { name: 'Offline', value: (analyticsData.summary?.totalDevices ?? 0) - (analyticsData.summary?.onlineDevices ?? 0), fill: '#ef4444' }
                      ].filter(item => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} devices`, '']} />
                    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-xl sm:text-2xl font-bold fill-white">
                      {analyticsData.summary?.totalDevices ?
                        (((analyticsData.summary.onlineDevices ?? 0) / analyticsData.summary.totalDevices) * 100).toFixed(2) : 0}%
                    </text>
                    <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-sm fill-white">
                      Online
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Power Usage Display */}
            <Card>
              <CardHeader>
                <CardTitle>Current Power Usage</CardTitle>
                <CardDescription>Total power consumption across all devices</CardDescription>
              </CardHeader>
              <CardContent className="h-64 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-blue-600 mb-2 break-words px-2">
                    {analyticsData.summary?.totalPowerConsumption?.toFixed(2) ?? 0}
                  </div>
                  <div className="text-xl text-muted-foreground mb-1">Watts</div>
                  <div className="text-sm text-muted-foreground">
                    {analyticsData.devices?.length || 0} devices active
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Device Types Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Device Types Distribution</CardTitle>
              <CardDescription>Breakdown of switches by category</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {analyticsData.devices && analyticsData.devices.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(
                      analyticsData.devices.reduce((acc: any, device: any) => {
                        // Count switches by type instead of devices by type
                        if (device.switches && Array.isArray(device.switches)) {
                          device.switches.forEach((switchItem: any) => {
                            const switchType = switchItem.type || 'unknown';
                            acc[switchType] = (acc[switchType] || 0) + 1;
                          });
                        }
                        return acc;
                      }, {})
                    ).map(([type, count]) => ({
                      type: type.charAt(0).toUpperCase() + type.slice(1), // Capitalize first letter
                      count
                    }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip formatter={(value) => [value, 'Switches']} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No device data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Power Consumers */}
          <Card>
            <CardHeader>
              <CardTitle>Top Power Consumers</CardTitle>
              <CardDescription>Devices using the most power</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.devices
                  ?.filter(device => device.power > 0)
                  ?.sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
                  ?.slice(0, 5)
                  ?.map((device, index) => {
                    const IconComponent = getDeviceIcon(device.type);
                    return (
                      <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                            <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                          </div>
                          <IconComponent className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{device.name ?? 'Unknown Device'}</p>
                            <p className="text-xs text-muted-foreground">{device.classroom ?? 'Unknown'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-base sm:text-lg break-words">{(device.power ?? 0).toFixed(2)}W</p>
                          <Badge variant={device.status === 'online' ? 'default' : 'destructive'} className="text-xs">
                            {device.status ?? 'unknown'}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                {(!analyticsData.devices || analyticsData.devices.filter(d => d.power > 0).length === 0) && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No power consumption data available</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Energy Tab - Comprehensive Energy Monitoring Dashboard */}
        <TabsContent value="energy">
          <EnergyMonitoringDashboard />
        </TabsContent>

        {/* ENERGY TAB OLD CONTENT BELOW (FOR REFERENCE) - DELETE LATER */}
        {false && <TabsContent value="OLD_ENERGY" className="space-y-6">
          {/* Time Range Selector and Filters */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold">Energy Consumption Analytics</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Device Filter */}
              <Select
                value={selectedDevices.length === 0 ? "all" : "selected"}
                onValueChange={(value) => {
                  if (value === "all") {
                    setSelectedDevices([]);
                  } else {
                    setSelectedDevices([]);
                  }
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  {analyticsData?.devices?.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name} ({device.classroom})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Classroom Filter */}
              <Select
                value={selectedClassrooms.length === 0 ? "all" : "selected"}
                onValueChange={(value) => {
                  if (value === "all") {
                    setSelectedClassrooms([]);
                  } else {
                    setSelectedClassrooms([]);
                  }
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Classroom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classrooms</SelectItem>
                  {analyticsData?.devices &&
                    [...new Set(analyticsData.devices.map(d => d.classroom).filter(c => c))].map((classroom) => (
                      <SelectItem key={classroom} value={classroom}>
                        {classroom}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>

              {/* Time Range */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: '24h', label: '24H' },
                  { key: '7d', label: '7D' },
                  { key: '30d', label: '30D' }
                ].map((timeframe) => (
                  <Button
                    key={timeframe.key}
                    variant={energyTimeframe === timeframe.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setEnergyTimeframe(timeframe.key);
                      fetchEnergyData(timeframe.key);
                      fetchForecastData('energy', timeframe.key);
                    }}
                  >
                    {timeframe.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Energy Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Consumption</CardTitle>
                <Zap className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2.4 kWh</div>
                <p className="text-xs text-muted-foreground">
                  Last {energyTimeframe}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Energy Cost</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹186</div>
                <p className="text-xs text-muted-foreground">
                  Estimated cost
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Efficiency Rating</CardTitle>
                <Activity className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">85%</div>
                <p className="text-xs text-muted-foreground">
                  Above average
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Energy Consumption Trend */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Energy Usage Over Time</CardTitle>
                  <CardDescription>
                    {energyTimeframe === '24h' && 'Hourly breakdown of power consumption for the last 24 hours'}
                    {energyTimeframe === '7d' && 'Daily breakdown of power consumption for the last 7 days'}
                    {energyTimeframe === '30d' && 'Daily breakdown of power consumption for the last 30 days'}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {energyTimeframe === '24h' && 'Per Hour'}
                  {energyTimeframe === '7d' && 'Per Day'}
                  {energyTimeframe === '30d' && 'Per Day'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Total Consumption Summary - MOVED TO TOP */}
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border-2 border-blue-300 rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">TOTAL CONSUMPTION</p>
                    <p className="text-3xl font-bold text-blue-600 mt-1">
                      {energyData?.reduce((sum, item) => sum + (item.totalConsumption || 0), 0).toFixed(2) || 0} kWh
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      {energyTimeframe === '24h' ? 'Last 24 hours' : energyTimeframe === '7d' ? 'Last 7 days' : 'Last 30 days'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">TOTAL COST</p>
                    <p className="text-3xl font-bold text-blue-600 mt-1">
                      ₹{energyData?.reduce((sum, item) => sum + (item.totalCostINR || 0), 0).toFixed(2) || 0}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      @ ₹7.00/kWh
                    </p>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground mb-2 italic">
                📈 Chart below shows breakdown by {energyTimeframe === '24h' ? 'hour' : 'day'}. Total is displayed above.
              </p>
              
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={energyData?.map((item: any) => ({
                  ...item,
                  // Show actual consumption from activity logs
                  // Zero consumption means no switches were turned on during that period
                  totalConsumption: item.totalConsumption || 0
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return energyTimeframe === '24h' ?
                        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
                        date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis label={{ value: 'kWh per period', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value: any) => [`${value?.toFixed(2) || 0} kWh`, 'Consumption']}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalConsumption"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                    name="Consumption"
                  />
                </AreaChart>
              </ResponsiveContainer>
              
              {energyData?.every((item: any) => item.totalConsumption === 0) && (
                <div className="text-center mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    ⚠️ No energy consumption recorded for this period. This could mean:
                  </p>
                  <ul className="text-xs text-amber-700 mt-2 space-y-1">
                    <li>• No switches were turned on during these time periods</li>
                    <li>• Devices were offline or not logging activity</li>
                    <li>• This is normal for periods with no device usage</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
              <CardDescription>Energy costs over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={energyData?.map((item: any) => ({
                  ...item,
                  // Show actual costs from activity logs
                  // Zero costs mean no switches were turned on during that period
                  totalCostINR: item.totalCostINR || 0
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return energyTimeframe === '24h' ?
                        date.toLocaleTimeString([], { hour: '2-digit' }) :
                        date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis label={{ value: '₹ per period', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value: any) => [`₹${value?.toFixed(2) || 0}`, 'Cost']}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalCostINR"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    name="Cost (₹)"
                  />
                </LineChart>
              </ResponsiveContainer>
              
              {/* Total Cost Summary */}
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-900 dark:text-red-100">Total Cost for Period</p>
                    <p className="text-xs text-red-700 dark:text-red-300">Sum of all costs shown above</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-red-600">
                      ₹{energyData?.reduce((sum, item) => sum + (item.totalCostINR || 0), 0).toFixed(2) || 0}
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      {energyTimeframe === '24h' ? 'Last 24 hours' : energyTimeframe === '7d' ? 'Last 7 days' : 'Last 30 days'}
                    </p>
                  </div>
                </div>
              </div>
              
              {energyData?.every((item: any) => item.totalCostINR === 0) && (
                <div className="text-center mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  💰 No energy costs incurred during this period - no switches were active.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Forecast vs Actual */}
          {forecastData && (
            <Card>
              <CardHeader>
                <CardTitle>Energy Usage Forecast</CardTitle>
                <CardDescription>AI-powered predictions vs actual consumption over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Main Forecast Chart */}
                  <div>
                    <h4 className="text-lg font-semibold mb-4">Forecast vs Actual Trends</h4>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart
                        data={forecastData.forecast?.map((item: any, index: number) => {
                          const baseTime = new Date();
                          // Create time-based data points for the selected timeframe
                          let timeIncrement;
                          switch (energyTimeframe) {
                            case '24h':
                              timeIncrement = index * 60 * 60 * 1000; // 1 hour intervals
                              break;
                            case '7d':
                              timeIncrement = index * 24 * 60 * 60 * 1000; // 1 day intervals
                              break;
                            case '30d':
                              timeIncrement = index * 24 * 60 * 60 * 1000; // 1 day intervals
                              break;
                            default:
                              timeIncrement = index * 60 * 60 * 1000;
                          }

                          const timestamp = new Date(baseTime.getTime() + timeIncrement);
                          return {
                            ...item,
                            time: timestamp.toISOString(),
                            actual: item.actual || 0, // Show zero if no actual consumption
                            predicted: item.predicted || 0,
                            upperBound: (item.predicted || 0) * 1.15,
                            lowerBound: Math.max(0, (item.predicted || 0) * 0.85),
                            accuracy: item.accuracy || Math.random() * 0.3 + 0.7
                          };
                        })}
                        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="time"
                          type="number"
                          scale="time"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            switch (energyTimeframe) {
                              case '24h':
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              case '7d':
                              case '30d':
                                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                              default:
                                return date.toLocaleTimeString([], { hour: '2-digit' });
                            }
                          }}
                        />
                        <YAxis
                          label={{ value: 'Energy Consumption (kWh)', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip
                          labelFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleString();
                          }}
                          formatter={(value: any, name: string) => [
                            `${value?.toFixed(2) || 0} kWh`,
                            name === 'predicted' ? 'AI Predicted' :
                            name === 'actual' ? 'Actual Usage' :
                            name === 'upperBound' ? 'Upper Confidence' :
                            name === 'lowerBound' ? 'Lower Confidence' : name
                          ]}
                        />
                        <Legend />

                        {/* Confidence interval area */}
                        <Area
                          type="monotone"
                          dataKey="upperBound"
                          stackId="1"
                          stroke="none"
                          fill="#3b82f6"
                          fillOpacity={0.1}
                          name="Confidence Range"
                        />
                        <Area
                          type="monotone"
                          dataKey="lowerBound"
                          stackId="1"
                          stroke="none"
                          fill="white"
                          fillOpacity={1}
                        />

                        {/* Predicted line */}
                        <Line
                          type="monotone"
                          dataKey="predicted"
                          stroke="#3b82f6"
                          strokeWidth={3}
                          strokeDasharray="8 8"
                          name="AI Predicted"
                          dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                          connectNulls={false}
                        />

                        {/* Actual line */}
                        <Line
                          type="monotone"
                          dataKey="actual"
                          stroke="#10b981"
                          strokeWidth={3}
                          name="Actual Usage"
                          dot={{ fill: '#10b981', strokeWidth: 2, r: 5 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Forecast Accuracy & Insights */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Accuracy Metrics */}
                    <Card className="bg-blue-50 dark:bg-blue-950/20">
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-2 break-words px-2">
                            {forecastData.accuracy ? (forecastData.accuracy * 100).toFixed(2) : '87.30'}%
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">
                            Forecast Accuracy
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Based on historical patterns
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Peak Usage Prediction */}
                    <Card className="bg-green-50 dark:bg-green-950/20">
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-2 break-words px-2">
                            {Math.max(...(forecastData.forecast?.map((f: any) => f.predicted) || [0]))?.toFixed(2) || '0.00'}
                          </div>
                          <div className="text-sm text-green-700 dark:text-green-300">
                            Peak Usage Predicted
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Highest consumption forecast
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Savings Potential */}
                    <Card className="bg-purple-50 dark:bg-purple-950/20">
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-purple-600 mb-2 break-words px-2">
                            ₹{forecastData.savings ? forecastData.savings.toFixed(2) : '245.00'}
                          </div>
                          <div className="text-sm text-purple-700 dark:text-purple-300">
                            Potential Savings
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Based on optimization recommendations
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Forecast Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Forecast Details by Time Period</CardTitle>
                      <CardDescription>Detailed breakdown of predictions with accuracy metrics</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={forecastData.forecast?.map((item: any, index: number) => {
                            const baseTime = new Date();
                            let timeIncrement;
                            switch (energyTimeframe) {
                              case '24h':
                                timeIncrement = index * 60 * 60 * 1000;
                                break;
                              case '7d':
                                timeIncrement = index * 24 * 60 * 60 * 1000;
                                break;
                              case '30d':
                                timeIncrement = index * 24 * 60 * 60 * 1000;
                                break;
                              default:
                                timeIncrement = index * 60 * 60 * 1000;
                            }

                            const timestamp = new Date(baseTime.getTime() + timeIncrement);
                            const actual = item.actual || 0;
                            const predicted = item.predicted || 0;
                            const accuracy = actual > 0 ? Math.min(100, Math.max(0, 100 - Math.abs((predicted - actual) / actual) * 100)) : 85;

                            return {
                              time: timestamp.toISOString(),
                              period: energyTimeframe === '24h' ?
                                timestamp.toLocaleTimeString([], { hour: '2-digit' }) :
                                timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                              predicted: predicted,
                              actual: actual,
                              accuracy: accuracy,
                              variance: Math.abs(predicted - actual)
                            };
                          })}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="period"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis yAxisId="usage" orientation="left" />
                          <YAxis yAxisId="accuracy" orientation="right" />
                          <Tooltip
                            formatter={(value: any, name: string) => [
                              name === 'accuracy' ? `${value?.toFixed(2) || 0}%` : `${value?.toFixed(2) || 0} kWh`,
                              name === 'predicted' ? 'Predicted' :
                              name === 'actual' ? 'Actual' :
                              name === 'accuracy' ? 'Accuracy' : name
                            ]}
                          />
                          <Legend />
                          <Bar
                            yAxisId="usage"
                            dataKey="predicted"
                            fill="#3b82f6"
                            name="Predicted"
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar
                            yAxisId="usage"
                            dataKey="actual"
                            fill="#10b981"
                            name="Actual"
                            radius={[2, 2, 0, 0]}
                          />
                          <Line
                            yAxisId="accuracy"
                            type="monotone"
                            dataKey="accuracy"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            name="Accuracy %"
                            dot={{ fill: '#f59e0b', strokeWidth: 2, r: 3 }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Forecast Insights */}
                  <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-600" />
                        AI Forecast Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-blue-800 dark:text-blue-200">Key Findings</h4>
                          <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Peak usage expected at {(() => {
                                const maxIndex = forecastData.forecast?.findIndex((f: any) =>
                                  f.predicted === Math.max(...(forecastData.forecast?.map((f: any) => f.predicted) || [0]))
                                ) || 0;
                                const baseTime = new Date();
                                let timeIncrement;
                                switch (energyTimeframe) {
                                  case '24h':
                                    timeIncrement = maxIndex * 60 * 60 * 1000;
                                    break;
                                  case '7d':
                                    timeIncrement = maxIndex * 24 * 60 * 60 * 1000;
                                    break;
                                  case '30d':
                                    timeIncrement = maxIndex * 24 * 60 * 60 * 1000;
                                    break;
                                  default:
                                    timeIncrement = maxIndex * 60 * 60 * 1000;
                                }
                                return new Date(baseTime.getTime() + timeIncrement).toLocaleString();
                              })()}
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              Average forecast accuracy: {forecastData.accuracy ? (forecastData.accuracy * 100).toFixed(2) : '87.30'}%
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                              Potential energy savings: ₹{forecastData.savings ? forecastData.savings.toFixed(2) : '245.00'} this period
                            </li>
                          </ul>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-semibold text-blue-800 dark:text-blue-200">Recommendations</h4>
                          <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                              Schedule high-consumption activities during off-peak hours
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              Monitor devices during predicted peak periods
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                              Consider load balancing for optimal efficiency
                            </li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {energyData?.every((item: any) => item.totalConsumption === 0) && (
                  <div className="text-center mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      ⚠️ No energy consumption data available for forecasting. Forecast shows zero consumption until device activity is recorded.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Peak Usage Hours */}
          <Card>
            <CardHeader>
              <CardTitle>Peak Usage Hours</CardTitle>
              <CardDescription>Highest consumption periods</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { hour: '6AM', usage: 45 },
                  { hour: '8AM', usage: 78 },
                  { hour: '10AM', usage: 65 },
                  { hour: '12PM', usage: 82 },
                  { hour: '2PM', usage: 95 },
                  { hour: '4PM', usage: 88 },
                  { hour: '6PM', usage: 76 },
                  { hour: '8PM', usage: 68 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${value}%`, 'Usage']} />
                  <Bar dataKey="usage" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>}
        {/* END OF OLD ENERGY TAB CONTENT */}

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
          {/* Device Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
                <Monitor className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsData?.devices?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Connected devices
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Online Devices</CardTitle>
                <Wifi className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsData?.devices?.filter(d => d.status === 'online').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Currently active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Offline Devices</CardTitle>
                <WifiOff className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsData?.devices?.filter(d => d.status === 'offline').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Need attention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Uptime</CardTitle>
                <Activity className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analyticsData?.devices && analyticsData.devices.length > 0
                    ? (() => {
                        const onlineDevices = analyticsData.devices.filter(d => d.status === 'online').length;
                        const totalDevices = analyticsData.devices.length;
                        return totalDevices > 0 ? ((onlineDevices / totalDevices) * 100).toFixed(1) : '0.0';
                      })()
                    : 'N/A'}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Current uptime
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Device Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Device Status Overview</CardTitle>
              <CardDescription>Current status of all connected devices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Online Devices Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Online Devices</span>
                    <span className="font-medium">
                      {analyticsData?.devices?.filter(d => d.status === 'online').length || 0} / {analyticsData?.devices?.length || 0}
                    </span>
                  </div>
                  <Progress
                    value={analyticsData?.devices?.length ?
                      ((analyticsData.devices.filter(d => d.status === 'online').length / analyticsData.devices.length) * 100) : 0
                    }
                    className="h-3"
                  />
                </div>

                {/* Device Types Distribution */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div>
                    <h4 className="text-sm font-medium mb-3">Device Types</h4>
                    {(() => {
                      const switchTypeCounts = analyticsData?.devices?.reduce((acc: Record<string, number>, device: any) => {
                        if (device.switches && Array.isArray(device.switches)) {
                          device.switches.forEach((switchItem: any) => {
                            const switchType = switchItem?.type || 'unknown';
                            acc[switchType] = (acc[switchType] || 0) + 1;
                          });
                        }
                        return acc;
                      }, {} as Record<string, number>) || {};

                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
                      const chartData = Object.entries(switchTypeCounts)
                        .map(([type, count], index) => ({
                          name: type.charAt(0).toUpperCase() + type.slice(1),
                          value: count,
                          fill: colors[index % colors.length]
                        }))
                        .filter(item => item.value > 0);

                      if (chartData.length === 0) {
                        return (
                          <div className="flex items-center justify-center h-48 text-muted-foreground">
                            <div className="text-center text-sm">
                              <p>No device type data</p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value} switches`, 'Count']} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-3">Status Distribution</h4>
                    {(() => {
                      const statusCounts = analyticsData?.devices?.reduce((acc: Record<string, number>, device: any) => {
                        const status = device?.status || 'unknown';
                        acc[status] = (acc[status] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>) || {};

                      const statusColors: Record<string, string> = {
                        'online': '#10b981',
                        'offline': '#ef4444',
                        'maintenance': '#f59e0b',
                        'unknown': '#6b7280'
                      };

                      const chartData = Object.entries(statusCounts)
                        .map(([status, count]) => ({
                          name: status.charAt(0).toUpperCase() + status.slice(1),
                          value: count,
                          fill: statusColors[status] || '#6b7280'
                        }))
                        .filter(item => item.value > 0);

                      if (chartData.length === 0) {
                        return (
                          <div className="flex items-center justify-center h-48 text-muted-foreground">
                            <div className="text-center text-sm">
                              <p>No status data</p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {chartData.map((entry) => (
                                <Cell key={`cell-${entry.name}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value} devices`, 'Count']} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Device Performance by Classroom */}
          <Card>
            <CardHeader>
              <CardTitle>Device Performance by Classroom</CardTitle>
              <CardDescription>Device status and uptime across different classrooms</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Memoize classroom aggregation for performance
                const classroomData = analyticsData?.devices?.reduce((acc, device) => {
                  const classroom = device.classroom || 'Unassigned';
                  const existing = acc.find(item => item.classroom === classroom);
                  if (existing) {
                    existing.total++;
                    if (device.status === 'online') existing.online++;
                  } else {
                    acc.push({
                      classroom,
                      total: 1,
                      online: device.status === 'online' ? 1 : 0
                    });
                  }
                  return acc;
                }, [] as Array<{ classroom: string; total: number; online: number }>) || [];

                if (classroomData.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <div className="text-center">
                        <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No classroom data available</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={classroomData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="classroom" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: any, name: string) => [
                          value,
                          name === 'online' ? 'Online Devices' : 'Total Devices'
                        ]}
                      />
                      <Legend />
                      <Bar dataKey="total" fill="#e5e7eb" name="Total Devices" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="online" fill="#10b981" name="Online Devices" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>

          {/* Device Health Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Device Health Timeline</CardTitle>
              <CardDescription>Device connectivity status (real-time data not available - using estimates)</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsData?.devices && analyticsData.devices.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={(() => {
                    // Generate timeline based on current device status
                    const onlineCount = analyticsData.devices.filter(d => d.status === 'online').length;
                    const totalCount = analyticsData.devices.length;
                    
                    // Create 7 data points representing current status (since we don't have historical data)
                    return Array.from({ length: 7 }, (_, i) => ({
                      time: `${i * 4}:00`,
                      online: onlineCount,
                      total: totalCount,
                    }));
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any, name: string) => [
                        `${value} devices`,
                        name === 'online' ? 'Online' : 'Total'
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#6b7280"
                      strokeWidth={2}
                      name="Total Devices"
                      dot={{ fill: '#6b7280', strokeWidth: 2, r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="online"
                      stroke="#10b981"
                      strokeWidth={3}
                      name="Online Devices"
                      dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No device timeline data available</p>
                    <p className="text-xs mt-1">Devices need to be online to track connectivity history</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Device List with Status */}
          <Card>
            <CardHeader>
              <CardTitle>Device Status Details</CardTitle>
              <CardDescription>Detailed status of all devices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData?.devices?.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        device.status === 'online' ? 'bg-green-500' :
                        device.status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <div>
                        <p className="font-medium">{device.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {device.classroom} • {device.type?.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium capitalize">{device.status}</p>
                      <p className="text-xs text-muted-foreground">
                        Health: {typeof device.health === 'number' ? device.health.toFixed(2) : device.health}%
                      </p>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-muted-foreground">
                    No device data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Device Uptime & Switch Statistics */}
          <DeviceUptimeTracker devices={analyticsData?.devices || []} />
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
          {/* Anomaly Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Anomalies</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{anomalyData?.totalAnomalies || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Last 7 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                <Activity className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{anomalyData?.resolvedAnomalies || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {anomalyData?.totalAnomalies > 0 ? ((anomalyData.resolvedAnomalies / anomalyData.totalAnomalies) * 100).toFixed(2) : '0.00'}% resolution rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Issues</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {(anomalyData?.totalAnomalies || 0) - (anomalyData?.resolvedAnomalies || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Require attention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2.4h</div>
                <p className="text-xs text-muted-foreground">
                  Time to resolve
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Anomaly Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Anomaly Status Overview</CardTitle>
              <CardDescription>Current status of detected anomalies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Resolution Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Resolution Progress</span>
                    <span className="font-medium">
                      {anomalyData?.resolvedAnomalies || 0} / {anomalyData?.totalAnomalies || 0} resolved
                    </span>
                  </div>
                  <Progress
                    value={anomalyData?.totalAnomalies ?
                      ((anomalyData.resolvedAnomalies / anomalyData.totalAnomalies) * 100) : 0
                    }
                    className="h-3"
                  />
                </div>

                {/* Anomaly Types Distribution */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div>
                    <h4 className="text-sm font-medium mb-3">Anomaly Types</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Power Spikes', value: anomalyData?.anomalies?.filter((a: any) => a.type === 'power_spike').length || 0, fill: '#ef4444' },
                            { name: 'Connectivity Loss', value: anomalyData?.anomalies?.filter((a: any) => a.type === 'connectivity_loss').length || 0, fill: '#f97316' },
                            { name: 'Temperature Issues', value: anomalyData?.anomalies?.filter((a: any) => a.type === 'temperature_anomaly').length || 0, fill: '#eab308' },
                            { name: 'Usage Anomalies', value: anomalyData?.anomalies?.filter((a: any) => a.type === 'usage_anomaly').length || 0, fill: '#a855f7' }
                          ].filter(item => item.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#ef4444" />
                          <Cell fill="#f97316" />
                          <Cell fill="#eab308" />
                          <Cell fill="#a855f7" />
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} anomalies`, 'Count']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-3">Severity Distribution</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={[
                          { severity: 'Critical', count: anomalyData?.anomalies?.filter((a: any) => a.severity > 7).length || 0, color: '#ef4444' },
                          { severity: 'High', count: anomalyData?.anomalies?.filter((a: any) => a.severity > 4 && a.severity <= 7).length || 0, color: '#f97316' },
                          { severity: 'Medium', count: anomalyData?.anomalies?.filter((a: any) => a.severity > 2 && a.severity <= 4).length || 0, color: '#eab308' },
                          { severity: 'Low', count: anomalyData?.anomalies?.filter((a: any) => a.severity <= 2).length || 0, color: '#10b981' }
                        ].filter(item => item.count > 0)}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="severity" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value} anomalies`, 'Count']} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {[
                            { severity: 'Critical', count: anomalyData?.anomalies?.filter((a: any) => a.severity > 7).length || 0, color: '#ef4444' },
                            { severity: 'High', count: anomalyData?.anomalies?.filter((a: any) => a.severity > 4 && a.severity <= 7).length || 0, color: '#f97316' },
                            { severity: 'Medium', count: anomalyData?.anomalies?.filter((a: any) => a.severity > 2 && a.severity <= 4).length || 0, color: '#eab308' },
                            { severity: 'Low', count: anomalyData?.anomalies?.filter((a: any) => a.severity <= 2).length || 0, color: '#10b981' }
                          ].filter(item => item.count > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Anomaly Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Anomaly Timeline</CardTitle>
              <CardDescription>Anomalies detected over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={[
                    { date: 'Mon', total: 2, resolved: 1, critical: 0 },
                    { date: 'Tue', total: 4, resolved: 3, critical: 1 },
                    { date: 'Wed', total: 1, resolved: 1, critical: 0 },
                    { date: 'Thu', total: 6, resolved: 4, critical: 2 },
                    { date: 'Fri', total: 3, resolved: 2, critical: 0 },
                    { date: 'Sat', total: 1, resolved: 1, critical: 0 },
                    { date: 'Sun', total: 2, resolved: 1, critical: 1 }
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any, name: string) => [
                      value,
                      name === 'total' ? 'Total Anomalies' :
                      name === 'resolved' ? 'Resolved' : 'Critical'
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#ef4444"
                    strokeWidth={3}
                    name="Total Anomalies"
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="resolved"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Resolved"
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="critical"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="Critical"
                    dot={{ fill: '#dc2626', strokeWidth: 2, r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Anomalies List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Anomalies</CardTitle>
              <CardDescription>Latest detected issues requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {anomalyData?.anomalies?.slice(0, 5).map((anomaly: any) => {
                  const severityColor = anomaly.severity > 7 ? 'bg-red-100 text-red-800 border-red-200' :
                                      anomaly.severity > 4 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                      anomaly.severity > 2 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                      'bg-blue-100 text-blue-800 border-blue-200';

                  const typeIcon = anomaly.type === 'power_spike' ? '⚡' :
                                 anomaly.type === 'connectivity_loss' ? '📶' :
                                 anomaly.type === 'temperature_anomaly' ? '🌡️' :
                                 '📊';

                  return (
                    <div key={anomaly.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{typeIcon}</div>
                        <div>
                          <p className="font-medium">{anomaly.deviceName}</p>
                          <p className="text-sm text-muted-foreground">
                            {anomaly.classroom} • {anomaly.type.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge className={severityColor}>
                          Severity {anomaly.severity}
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {new Date(anomaly.timestamp).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(anomaly.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        <Badge variant={anomaly.resolved ? 'default' : 'destructive'}>
                          {anomaly.resolved ? 'Resolved' : 'Active'}
                        </Badge>
                      </div>
                    </div>
                  );
                }) || (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent anomalies detected
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preventive Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Preventive Insights</CardTitle>
              <CardDescription>Recommendations to prevent future anomalies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Top Recommendations</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      <div>
                        <p className="font-medium text-sm">Power Stabilization</p>
                        <p className="text-xs text-muted-foreground">Install voltage stabilizers for critical devices to prevent power spikes</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                      <div>
                        <p className="font-medium text-sm">Network Monitoring</p>
                        <p className="text-xs text-muted-foreground">Regular network health checks to prevent connectivity issues</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                      <div>
                        <p className="font-medium text-sm">Temperature Control</p>
                        <p className="text-xs text-muted-foreground">Schedule HVAC maintenance and improve ventilation</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Risk Assessment</h4>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart
                      data={[
                        { risk: 'High Risk', devices: 3, color: '#ef4444' },
                        { risk: 'Medium Risk', devices: 8, color: '#f97316' },
                        { risk: 'Low Risk', devices: 12, color: '#10b981' }
                      ]}
                      layout="horizontal"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="risk" type="category" width={80} />
                      <Tooltip formatter={(value) => [`${value} devices`, 'Count']} />
                      <Bar dataKey="devices" radius={[0, 4, 4, 0]}>
                        <Cell fill="#ef4444" />
                        <Cell fill="#f97316" />
                        <Cell fill="#10b981" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsPanel;
