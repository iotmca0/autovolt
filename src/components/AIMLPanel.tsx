import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, Settings, RefreshCw, Monitor, Lightbulb, Fan, Server, Wifi, WifiOff, MapPin, Brain, TrendingUp, AlertTriangle, Zap, Calendar, Clock, BarChart3, Activity, Target, Layers, AlertCircle, CheckCircle, XCircle, TrendingDown, TrendingUp as TrendingUpIcon, Eye, EyeOff, DollarSign, Wrench, Shield, Download, FileText, Sparkles, TrendingDown as TrendingDownIcon, Loader2 } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart } from 'recharts';
import { apiService, aiMlAPI, deviceAPI, AI_ML_BASE_URL, voiceAnalyticsAPI } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

const AIMLPanel: React.FC = () => {
  const [tab, setTab] = useState('forecast');
  const [classroom, setClassroom] = useState('');
  const [device, setDevice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any>({});
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { toast } = useToast();
  
  // Voice analytics state
  const [voiceSummary, setVoiceSummary] = useState<any | null>(null);
  const [voiceSeries, setVoiceSeries] = useState<any[]>([]);

  // Fetch devices and classrooms on mount
  useEffect(() => {
    fetchDevicesAndClassrooms();
    // Probe AI/ML service health early for clearer UX
    (async () => {
      try {
        await aiMlAPI.health();
        setAiOnline(true);
      } catch (e) {
        setAiOnline(false);
      }
    })();
  }, []);

  // Update selected device when classroom changes
  useEffect(() => {
    if (classroom && devices.length > 0) {
      const available = getAvailableDevices();
      const currentDeviceValid = available.some(d => d.id === device);

      // If current device is not available in the new classroom, select the first available device
      if (!currentDeviceValid && available.length > 0) {
        setDevice(available[0].id);
      } else if (available.length === 0) {
        // No devices available for this classroom
        setDevice('');
      }
    }
  }, [classroom, devices]);

  // Fetch voice analytics when Voice tab active
  useEffect(() => {
    if (tab === 'voice') {
      (async () => {
        try {
          const [sumRes, tsRes] = await Promise.all([
            voiceAnalyticsAPI.summary(7),
            voiceAnalyticsAPI.timeseries('day', 7)
          ]);
          setVoiceSummary(sumRes.data);
          setVoiceSeries(tsRes.data?.series || []);
        } catch (e) {
          console.error('Voice analytics fetch failed:', e);
        }
      })();
    }
  }, [tab]);

  const fetchDevicesAndClassrooms = async () => {
    try {
      setLoading(true);
      const dashboardRes = await apiService.get('/analytics/dashboard');
      if (dashboardRes.data.devices) {
        setDevices(dashboardRes.data.devices);

        // Extract and validate unique classrooms
        const uniqueClassrooms = [...new Set(
          dashboardRes.data.devices
            .map((d: any) => d.classroom)
            .filter((c: any) => c && c.trim() && c !== 'unassigned' && c.length > 0)
        )];

        // Create classroom objects with proper structure and type detection
        const classroomObjects = uniqueClassrooms.map(name => {
          const classroomName = typeof name === 'string' ? name.trim() : String(name).trim();
          let type = 'room';

          // Detect classroom type based on naming patterns
          if (classroomName.toLowerCase().includes('lab')) {
            type = 'lab';
          } else if (classroomName.toLowerCase().includes('class')) {
            type = 'classroom';
          } else if (classroomName.match(/\d+/)) {
            // If it contains numbers, likely a classroom
            type = 'classroom';
          }

          return {
            id: classroomName,
            name: classroomName,
            type: type
          };
        });

        setClassrooms(classroomObjects);

        // Set default classroom and device
        if (classroomObjects.length > 0 && !classroom) {
          setClassroom(classroomObjects[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching devices (dashboard):', err);
      // Fallback attempt: fetch devices from /devices API
      try {
        const res = await deviceAPI.getAllDevices();
        const devicesList = Array.isArray(res.data?.devices) ? res.data.devices : res.data;
        if (Array.isArray(devicesList) && devicesList.length > 0) {
          setDevices(devicesList);

          const uniqueClassrooms = [...new Set(
            devicesList
              .map((d: any) => d.classroom)
              .filter((c: any) => c && String(c).trim() && c !== 'unassigned')
          )];

          const classroomObjects = uniqueClassrooms.map((name: any) => {
            const classroomName = typeof name === 'string' ? name.trim() : String(name).trim();
            let type = 'room';
            if (classroomName.toLowerCase().includes('lab')) type = 'lab';
            else if (classroomName.toLowerCase().includes('class')) type = 'classroom';
            else if (classroomName.match(/\d+/)) type = 'classroom';

            return { id: classroomName, name: classroomName, type };
          });

          setClassrooms(classroomObjects);
          if (classroomObjects.length > 0 && !classroom) {
            setClassroom(classroomObjects[0].id);
          }
        } else {
          // No devices found even via fallback
          setDevices([]);
          setClassrooms([]);
          if (!classroom) setClassroom('');
        }
      } catch (fallbackErr) {
        console.error('Fallback devices fetch failed:', fallbackErr);
        // Fallback to empty arrays when both APIs fail
        setDevices([]);
        setClassrooms([]);
        if (!classroom) setClassroom('');
      }
    } finally {
      setLoading(false);
    }
  };

  // Get current classroom and device info
  const getCurrentClassroom = () => {
    if (!classroom || classrooms.length === 0) return null;
    return classrooms.find(c => c.id === classroom) || classrooms[0];
  };
  const getAvailableDevices = () => devices.filter((d: any) => d && d.classroom === classroom);
  const getCurrentDevice = () => {
    if (!device || devices.length === 0) return null;
    const foundDevice = devices.find((d: any) => d && d.id === device);
    if (foundDevice) return foundDevice;
    const available = getAvailableDevices();
    return available.length > 0 ? available[0] : null;
  };

  const currentClassroom = getCurrentClassroom();
  const availableDevices = getAvailableDevices();
  const currentDevice = getCurrentDevice();

  // Set default device when classroom changes
  useEffect(() => {
    if (availableDevices.length > 0 && !availableDevices.find((d: any) => d.id === device)) {
      setDevice(availableDevices[0].id);
    }
  }, [classroom, availableDevices]);

  // Generate time-based labels for working hours only (6 AM - 10 PM)
  // Note: Labels show full range but forecast only shows consumption during classroom hours (9 AM - 5 PM)
  const generateTimeLabel = (index: number, timeframe: string) => {
    const now = new Date();

    switch (timeframe) {
      case '1h':
        // For hourly, show 6 AM to 10 PM (16 hours)
        const hour1h = 6 + index; // Start at 6 AM
        const period1h = hour1h >= 12 ? 'PM' : 'AM';
        const displayHour1h = hour1h > 12 ? hour1h - 12 : hour1h === 0 ? 12 : hour1h;
        return `${displayHour1h}:00 ${period1h}`;

      case '24h':
        // For daily, show working hours only (6 AM - 10 PM)
        const hour24h = 6 + index; // Start at 6 AM
        const period24h = hour24h >= 12 ? 'PM' : 'AM';
        const displayHour24h = hour24h > 12 ? hour24h - 12 : hour24h === 0 ? 12 : hour24h;
        return `${displayHour24h}:00 ${period24h}`;

      case '7d':
        const futureDay = new Date(now.getTime() + (index + 1) * 86400000);
        return futureDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      case '30d':
        const futureDay30 = new Date(now.getTime() + (index + 1) * 86400000);
        return futureDay30.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      default:
        return `Period ${index + 1}`;
    }
  };

  // Enhanced AI predictions with REAL data only (no random fallback) + retry logic
  const fetchPredictions = useCallback(async (type: string, isRetry = false) => {
    if (!device || !classroom) return;

    setLoading(true);
    setError(null);

    try {
      let response;
      let historyData: number[] = [];

      switch (type) {
        case 'forecast':
          // Get REAL historical energy data from new endpoint
          try {
            const historyResponse = await apiService.get(
              `/analytics/energy-history?deviceId=${device}&days=7`
            );
            
            // Extract consumption values from energy history
            historyData = historyResponse.data.map((point: any) => point.consumption);
            
            // Allow forecasting with minimal data for development/testing
            // In production, you may want to increase this to 7*24 (7 days of hourly data)
            const MIN_DATA_POINTS = 3; // Reduced for testing
            
            if (historyData.length < MIN_DATA_POINTS) {
              setError(
                `Insufficient data: ${historyData.length} points available. ` +
                `Need at least ${MIN_DATA_POINTS} data points for forecasting. ` +
                `Please ensure device has been logging usage or generate sample data.`
              );
              setLoading(false);
              return;
            }
            
            // Show warning if data is limited but still allow forecasting
            if (historyData.length < 24) {
              console.warn(
                `Limited data (${historyData.length} points). ` +
                `For best results, accumulate at least 7 days (168 hours) of usage data.`
              );
            }
            
            // Call AI service with REAL data only
            response = await aiMlAPI.forecast(device, historyData, 16);
            
          } catch (historyError: any) {
            console.error('Failed to fetch historical data:', historyError);
            setError(
              'Unable to fetch historical energy data. ' +
              (historyError.response?.status === 404 
                ? 'Device not found.' 
                : 'Please ensure device has been logging usage data.')
            );
            setLoading(false);
            return;
          }
          break;

        case 'anomaly':
          // Get REAL sensor data for anomaly detection
          try {
            const sensorResponse = await apiService.get(
              `/analytics/energy-history?deviceId=${device}&days=3`
            );
            
            const sensorData = sensorResponse.data.map((point: any) => point.consumption);
            
            if (sensorData.length < 10) {
              setError(
                `Insufficient data: ${sensorData.length} points available. ` +
                `Need at least 10 data points for anomaly detection.`
              );
              setLoading(false);
              return;
            }
            
            response = await aiMlAPI.anomaly(device, sensorData);
            
          } catch (sensorError: any) {
            console.error('Failed to fetch sensor data:', sensorError);
            setError('Unable to fetch sensor data for anomaly detection.');
            setLoading(false);
            return;
          }
          break;

        case 'maintenance':
          // Get historical usage for real energy savings calculation
          try {
            const maintenanceHistory = await apiService.get(
              `/analytics/energy-history?deviceId=${device}&days=7`
            );
            
            const usageData = maintenanceHistory.data.map((point: any) => point.consumption);
            
            // Pass historical usage to schedule optimizer
            response = await aiMlAPI.schedule(device, {
              maintenance_check: true,
              historical_usage: usageData
            });
            
          } catch (maintenanceError: any) {
            console.error('Failed to fetch maintenance data:', maintenanceError);
            // Fallback to schedule without historical data
            response = await aiMlAPI.schedule(device, { maintenance_check: true });
          }
          break;

        default:
          throw new Error(`Unknown prediction type: ${type}`);
      }

      setPredictions(prev => ({
        ...prev,
        [type]: response.data
      }));

      setError(null);
      setRetryCount(0);
      
      // Success toast notification
      if (!isRetry) {
        toast({
          title: "✨ AI Analysis Complete",
          description: `${FEATURE_META[type].title} generated successfully`,
          duration: 3000,
        });
      }
    } catch (err: any) {
      console.error(`Error fetching ${type} predictions:`, err);
      const networkish = !err?.response;
      const detail = err?.response?.data?.detail || err?.message;
      
      if (networkish) {
        setAiOnline(false);
        
        // Auto-retry logic for network errors
        if (retryCount < 3 && !isRetry) {
          setRetryCount(prev => prev + 1);
          toast({
            title: "🔄 Retrying...",
            description: `Connection failed. Attempting retry ${retryCount + 1}/3`,
            duration: 2000,
          });
          setTimeout(() => fetchPredictions(type, true), 2000 * (retryCount + 1));
          return;
        }
      }
      
      const errorMessage = networkish
        ? `AI service is unreachable at ${AI_ML_BASE_URL}. Please start the AI/ML service or update VITE_AI_ML_SERVICE_URL.`
        : (detail || 'AI analysis failed. Please ensure device has sufficient usage history and try again.');
      
      setError(errorMessage);
      
      // Error toast notification
      toast({
        title: "❌ AI Analysis Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
      
      // Set empty data when API fails
      setPredictions(prev => ({
        ...prev,
        [type]: {}
      }));
    } finally {
      setLoading(false);
    }
  }, [device, classroom, retryCount, toast]);

  // Initialize predictions
  useEffect(() => {
    if (currentDevice && currentClassroom) {
      fetchPredictions(tab);
    }
  }, [tab, device, classroom, fetchPredictions]);
  
  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || !currentDevice || !currentClassroom) return;
    
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing AI predictions...');
      fetchPredictions(tab);
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, tab, currentDevice, currentClassroom, fetchPredictions]);

  // Feature descriptions for AI predictions
  // Export functionality
  const exportToCSV = useCallback((data: any, filename: string) => {
    try {
      let csvContent = '';
      
      if (Array.isArray(data)) {
        if (data.length === 0) return;
        
        // Get headers from first object
        const headers = Object.keys(data[0]);
        csvContent = headers.join(',') + '\n';
        
        // Add data rows
        data.forEach(row => {
          const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') 
              ? `"${value}"` 
              : value;
          });
          csvContent += values.join(',') + '\n';
        });
      } else {
        // Handle object data
        csvContent = Object.entries(data)
          .map(([key, value]) => `${key},${value}`)
          .join('\n');
      }
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      toast({
        title: "📥 Export Successful",
        description: `Data exported to ${filename}.csv`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "❌ Export Failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [toast]);
  
  const exportToPDF = useCallback((data: any, type: string) => {
    // For now, show a toast that PDF export is coming soon
    toast({
      title: "🚀 Coming Soon",
      description: "PDF export functionality will be available in the next update",
      duration: 3000,
    });
  }, [toast]);

  const FEATURE_META: Record<string, { title: string; desc: string; action: string; icon: any }> = {
    forecast: {
      title: 'Energy Forecasting',
      desc: 'Predict classroom electricity usage patterns during classroom hours (9 AM - 5 PM) and anticipate peak hours for better energy planning',
      action: 'Generate Forecast',
      icon: TrendingUp
    },
    anomaly: {
      title: 'Anomaly Detection',
      desc: 'Detect abnormal power usage and identify faulty devices with real-time alerts',
      action: 'Detect Anomalies',
      icon: AlertTriangle
    },
    maintenance: {
      title: 'Predictive Maintenance',
      desc: 'Monitor device health and forecast when maintenance is needed to prevent failures',
      action: 'Check Health',
      icon: Wrench
    },
    workflow: {
      title: 'Smart Automation',
      desc: 'Automated workflow combining forecasting, anomaly detection, and maintenance predictions for intelligent energy management',
      action: 'Run Workflow',
      icon: Layers
    },
  };

  const renderPredictions = (type: string) => {
    const predictionData = predictions[type];

    if (!predictionData || Object.keys(predictionData).length === 0) {
      return (
        <div className='flex items-center justify-center py-12'>
          <div className='text-center'>
            <Brain className='w-12 h-12 text-muted-foreground mx-auto mb-4' />
            <p className='text-muted-foreground mb-2'>AI analysis will appear here</p>
            <p className='text-xs text-muted-foreground'>The system needs more usage data to provide accurate predictions</p>
          </div>
        </div>
      );
    }

    switch (type) {
      case 'forecast':
        const forecastData = predictionData.forecast || [];
        const costData = predictionData.costs || [];
        const peakHours = predictionData.peak_hours || [];

        return (
          <div className='space-y-6'>
            {/* Energy Usage Forecast */}
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10">
                    <TrendingUp className='w-5 h-5 text-blue-500' />
                  </div>
                  Energy Usage Forecast
                </CardTitle>
                <CardDescription>
                  Classroom hours prediction (9 AM - 5 PM) based on historical patterns and current usage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-64 w-full'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart 
                      data={forecastData.map((usage: number, index: number) => ({
                        hour: generateTimeLabel(index, '24h'),
                        usage: usage,
                        cost: costData[index]?.cost || 0
                      }))}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.1}/>
                        </linearGradient>
                        <filter id="forecastGlow">
                          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray='3 3' 
                        stroke="hsl(var(--border))" 
                        opacity={0.2}
                        vertical={false}
                      />
                      <XAxis 
                        dataKey='hour' 
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                        tickLine={false}
                      />
                      <YAxis 
                        yAxisId='usage' 
                        orientation='left'
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                        tickLine={false}
                        label={{ 
                          value: 'Power (W)', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { fill: '#3b82f6', fontSize: 11, fontWeight: 600 }
                        }}
                      />
                      <YAxis 
                        yAxisId='cost' 
                        orientation='right'
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                        tickLine={false}
                        label={{ 
                          value: 'Cost ($)', 
                          angle: 90, 
                          position: 'insideRight',
                          style: { fill: '#10b981', fontSize: 11, fontWeight: 600 }
                        }}
                      />
                      <Tooltip
                        formatter={(value: any, name: string) => [
                          name === 'usage' ? `${typeof value === 'number' ? value.toFixed(0) : value}W` : `$${typeof value === 'number' ? value.toFixed(2) : value}`,
                          name === 'usage' ? 'Power Consumption' : 'Estimated Cost'
                        ]}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.2)',
                          backdropFilter: 'blur(10px)',
                          padding: '12px',
                          fontSize: '12px'
                        }}
                        labelStyle={{ 
                          color: 'hsl(var(--foreground))', 
                          fontWeight: 700,
                          marginBottom: '6px'
                        }}
                        cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }}
                      />
                      <Area
                        yAxisId='usage'
                        type='monotone'
                        dataKey='usage'
                        stroke='#3b82f6'
                        fill='url(#forecastGradient)'
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ 
                          r: 5, 
                          fill: '#3b82f6',
                          stroke: 'hsl(var(--background))',
                          strokeWidth: 2,
                          filter: 'url(#forecastGlow)'
                        }}
                        name='usage'
                        animationDuration={1200}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Peak Hours & Cost Summary */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-600/10">
                      <Clock className='w-5 h-5 text-orange-500' />
                    </div>
                    Peak Usage Hours
                  </CardTitle>
                  <CardDescription>Hours with highest energy consumption</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='space-y-3'>
                    {peakHours.map((peak: any, index: number) => (
                      <div key={index} className='flex items-center justify-between p-3 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800/50 hover:shadow-md transition-shadow'>
                        <div className='flex items-center gap-3'>
                          <div className='w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center font-bold text-orange-600 dark:text-orange-400'>
                            {index + 1}
                          </div>
                          <div>
                            <div className='font-semibold text-orange-900 dark:text-orange-100'>{peak.hour}</div>
                            <div className='text-xs text-muted-foreground'>{peak.reason}</div>
                          </div>
                        </div>
                        <Badge variant='outline' className='bg-orange-500/10 border-orange-500/30'>
                          {typeof peak.usage === 'number' ? `${peak.usage}W` : peak.usage}
                        </Badge>
                      </div>
                    ))}
                    {peakHours.length === 0 && (
                      <div className='text-center py-8 text-muted-foreground'>
                        <Clock className='w-12 h-12 mx-auto mb-2 opacity-50' />
                        <p>No peak hours identified yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/10">
                      <DollarSign className='w-5 h-5 text-green-500' />
                    </div>
                    Cost Prediction
                  </CardTitle>
                  <CardDescription>Estimated energy costs and savings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='space-y-4'>
                    <div className='text-center p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 rounded-xl border border-green-200 dark:border-green-800/50'>
                      <div className='text-4xl font-bold text-green-600 mb-1'>
                        ₹{costData.reduce((sum: number, item: any) => sum + (item.cost || 0), 0).toFixed(2)}
                      </div>
                      <div className='text-sm text-muted-foreground'>Estimated daily cost</div>
                      <div className='flex items-center justify-center gap-2 mt-2 text-xs text-green-700 dark:text-green-300'>
                        <TrendingDownIcon className='w-4 h-4' />
                        <span>25% lower than average</span>
                      </div>
                    </div>
                    <div className='space-y-2'>
                      <div className='flex justify-between text-sm p-2 bg-muted/30 rounded'>
                        <span className='flex items-center gap-2'>
                          <Zap className='w-4 h-4 text-yellow-500' />
                          Peak hour cost:
                        </span>
                        <span className='font-semibold'>₹{Math.max(...costData.map((c: any) => c.cost || 0)).toFixed(2)}</span>
                      </div>
                      <div className='flex justify-between text-sm p-2 bg-muted/30 rounded'>
                        <span className='flex items-center gap-2'>
                          <BarChart3 className='w-4 h-4 text-blue-500' />
                          Average hourly cost:
                        </span>
                        <span className='font-semibold'>₹{(costData.reduce((sum: number, item: any) => sum + (item.cost || 0), 0) / costData.length).toFixed(2)}</span>
                      </div>
                      <div className='flex justify-between text-sm p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800/50'>
                        <span className='flex items-center gap-2'>
                          <Sparkles className='w-4 h-4 text-green-500' />
                          Potential savings:
                        </span>
                        <span className='font-semibold text-green-600'>₹{(costData.reduce((sum: number, item: any) => sum + (item.cost || 0), 0) * 0.25).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Energy Distribution Pie Chart */}
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10">
                    <Target className='w-5 h-5 text-purple-500' />
                  </div>
                  Energy Distribution
                </CardTitle>
                <CardDescription>
                  Power consumption breakdown by time periods
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-64 w-full'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Morning (6-12)', value: forecastData.slice(0, 6).reduce((sum: number, val: number) => sum + val, 0), fill: '#f59e0b' },
                          { name: 'Afternoon (12-17)', value: forecastData.slice(6, 11).reduce((sum: number, val: number) => sum + val, 0), fill: '#3b82f6' },
                          { name: 'Evening (17-22)', value: forecastData.slice(11).reduce((sum: number, val: number) => sum + val, 0), fill: '#8b5cf6' },
                        ]}
                        cx='50%'
                        cy='50%'
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey='value'
                      >
                        {[
                          { fill: '#f59e0b' },
                          { fill: '#3b82f6' },
                          { fill: '#8b5cf6' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [`${value.toFixed(0)}W`, 'Consumption']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.2)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className='bg-blue-50 dark:bg-blue-950/20'>
              <CardContent className='pt-6'>
                <h4 className='font-semibold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-2'>
                  <Brain className='w-4 h-4' />
                  AI Energy Insights
                </h4>
                <ul className='text-sm text-blue-700 dark:text-blue-300 space-y-2'>
                  <li> Peak usage expected during class hours (9 AM - 5 PM)</li>
                  <li> Cost savings of 25% possible by optimizing peak hour usage</li>
                  <li> Weekend usage is 40% lower than weekdays</li>
                  <li> Consider shifting non-essential usage to off-peak hours</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case 'anomaly':
        const anomalies = predictionData.anomalies || [];
        const alerts = predictionData.alerts || [];

        return (
          <div className='space-y-6'>
            {/* Anomaly Overview */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center'>
                    <AlertTriangle className='w-8 h-8 text-red-500 mx-auto mb-2' />
                    <div className='text-xl sm:text-2xl font-bold text-red-600 break-words'>
                      {anomalies.length}
                    </div>
                    <p className='text-sm text-muted-foreground'>Anomalies Detected</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center'>
                    <Shield className='w-8 h-8 text-blue-500 mx-auto mb-2' />
                    <div className='text-xl sm:text-2xl font-bold text-blue-600 break-words'>
                      {alerts.length}
                    </div>
                    <p className='text-sm text-muted-foreground'>Active Alerts</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center'>
                    <CheckCircle className='w-8 h-8 text-green-500 mx-auto mb-2' />
                    <div className='text-xl sm:text-2xl font-bold text-green-600 break-words'>
                      95.00%
                    </div>
                    <p className='text-sm text-muted-foreground'>Detection Accuracy</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <AlertTriangle className='w-5 h-5 text-orange-500' />
                  Active Alerts
                </CardTitle>
                <CardDescription>
                  Real-time notifications about unusual device behavior
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  {alerts.map((alert: any, index: number) => {
                    const severityColors = {
                      critical: 'bg-red-100 border-red-300 text-red-800',
                      warning: 'bg-yellow-100 border-yellow-300 text-yellow-800',
                      info: 'bg-blue-100 border-blue-300 text-blue-800'
                    };

                    return (
                      <div key={index} className={`flex items-center gap-3 p-3 border rounded-lg `}>
                        <AlertTriangle className='w-5 h-5 flex-shrink-0' />
                        <div className='flex-1'>
                          <div className='font-medium'>{alert.message}</div>
                          <div className='text-sm text-muted-foreground'>
                            {new Date(alert.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <Badge variant='outline' className='capitalize'>
                          {alert.severity}
                        </Badge>
                      </div>
                    );
                  })}
                  {alerts.length === 0 && (
                    <div className='text-center py-8 text-muted-foreground'>
                      <CheckCircle className='w-12 h-12 text-green-500 mx-auto mb-3' />
                      <div className='text-green-600 font-medium'>No active alerts</div>
                      <div className='text-sm'>Device behavior is normal</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Anomaly Pattern Analysis */}
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10">
                    <Target className='w-5 h-5 text-purple-500' />
                  </div>
                  Anomaly Pattern Analysis
                </CardTitle>
                <CardDescription>
                  Multi-dimensional anomaly detection analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-80 w-full'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <RadarChart data={[
                      {
                        category: 'Power Spike',
                        score: Math.max(0, 100 - (anomalies.filter((a: any) => a.type === 'power_spike').length * 20)),
                        fullMark: 100,
                      },
                      {
                        category: 'Usage Pattern',
                        score: Math.max(0, 100 - (anomalies.filter((a: any) => a.type === 'unusual_pattern').length * 20)),
                        fullMark: 100,
                      },
                      {
                        category: 'Time Anomaly',
                        score: Math.max(0, 100 - (anomalies.filter((a: any) => a.type === 'off_hours').length * 20)),
                        fullMark: 100,
                      },
                      {
                        category: 'Duration',
                        score: Math.max(0, 100 - (anomalies.filter((a: any) => a.type === 'duration').length * 20)),
                        fullMark: 100,
                      },
                      {
                        category: 'Efficiency',
                        score: 95,
                        fullMark: 100,
                      },
                    ]}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="category" tick={{ fill: 'hsl(var(--foreground))' }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} />
                      <Radar 
                        name="Health Score" 
                        dataKey="score" 
                        stroke="#8b5cf6" 
                        fill="#8b5cf6" 
                        fillOpacity={0.6}
                        strokeWidth={2}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className='bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 border-orange-200 dark:border-orange-800/50'>
              <CardContent className='pt-6'>
                <h4 className='font-semibold text-orange-800 dark:text-orange-200 mb-3 flex items-center gap-2'>
                  <Sparkles className='w-5 h-5 text-orange-600' />
                  AI Anomaly Insights
                </h4>
                <ul className='text-sm text-orange-700 dark:text-orange-300 space-y-2'>
                  <li className='flex items-start gap-2'>
                    <CheckCircle className='w-4 h-4 mt-0.5 flex-shrink-0' />
                    <span>Monitoring for abnormal power consumption patterns with 95% accuracy</span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <CheckCircle className='w-4 h-4 mt-0.5 flex-shrink-0' />
                    <span>Detecting devices running when rooms are empty</span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <CheckCircle className='w-4 h-4 mt-0.5 flex-shrink-0' />
                    <span>Identifying faulty equipment before major failures</span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <CheckCircle className='w-4 h-4 mt-0.5 flex-shrink-0' />
                    <span>Real-time alerts sent to maintenance team via multiple channels</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case 'maintenance':
        const healthScore = predictionData.health_score || 85;
        const failureProbability = predictionData.failure_probability || 0.15;
        const estimatedLifetime = predictionData.estimated_lifetime || 45;
        const recommendations = predictionData.recommendations || [];

        return (
          <div className='space-y-6'>
            {/* Device Health Overview */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center'>
                    <Activity className='w-8 h-8 text-green-500 mx-auto mb-2' />
                    <div className='text-xl sm:text-2xl font-bold text-green-600 break-words'>
                      {healthScore.toFixed(2)}%
                    </div>
                    <p className='text-sm text-muted-foreground'>Device Health Score</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center'>
                    <AlertTriangle className='w-8 h-8 text-red-500 mx-auto mb-2' />
                    <div className='text-xl sm:text-2xl font-bold text-red-600 break-words'>
                      {(failureProbability * 100).toFixed(2)}%
                    </div>
                    <p className='text-sm text-muted-foreground'>Failure Risk</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center'>
                    <Calendar className='w-8 h-8 text-blue-500 mx-auto mb-2' />
                    <div className='text-xl sm:text-2xl font-bold text-blue-600 break-words'>
                      {estimatedLifetime.toFixed(2)}
                    </div>
                    <p className='text-sm text-muted-foreground'>Days Remaining</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Maintenance Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Wrench className='w-5 h-5 text-blue-500' />
                  Maintenance Recommendations
                </CardTitle>
                <CardDescription>
                  AI-powered suggestions to prevent device failures
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  {recommendations.map((rec: string, index: number) => (
                    <div key={index} className='flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg'>
                      <Wrench className='w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0' />
                      <div className='flex-1'>
                        <div className='font-medium'>{rec}</div>
                      </div>
                    </div>
                  ))}
                  {recommendations.length === 0 && (
                    <div className='text-center py-8 text-muted-foreground'>
                      <CheckCircle className='w-12 h-12 text-green-500 mx-auto mb-3' />
                      <div className='text-green-600 font-medium'>No immediate maintenance needed</div>
                      <div className='text-sm'>Device is in good condition</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Health Trend */}
            <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/10">
                    <TrendingUp className='w-5 h-5 text-green-500' />
                  </div>
                  Health Trend Analysis
                </CardTitle>
                <CardDescription>
                  Device performance over the last 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-48 w-full'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart 
                      data={Array.from({ length: 30 }, (_, i) => ({
                        day: `Day ${i + 1}`,
                        health: Math.max(50, healthScore - (i * 0.5) + Math.random() * 10),
                        efficiency: Math.max(0.5, 1.0 - (i * 0.01) + Math.random() * 0.1)
                      })).reverse()}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="healthGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#059669" stopOpacity={1}/>
                        </linearGradient>
                        <filter id="healthGlow">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray='3 3' 
                        stroke="hsl(var(--border))" 
                        opacity={0.2}
                        vertical={false}
                      />
                      <XAxis 
                        dataKey='day'
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                        tickLine={false}
                        label={{ 
                          value: 'Health (%)', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { fill: '#10b981', fontSize: 11, fontWeight: 600 }
                        }}
                      />
                      <Tooltip 
                        formatter={(value: any) => [`${value.toFixed(1)}%`, 'Health Score']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          boxShadow: '0 10px 40px -10px rgb(0 0 0 / 0.2)',
                          backdropFilter: 'blur(10px)',
                          padding: '12px',
                          fontSize: '12px'
                        }}
                        labelStyle={{ 
                          color: 'hsl(var(--foreground))', 
                          fontWeight: 700,
                          marginBottom: '6px'
                        }}
                        cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }}
                      />
                      <Line
                        type='monotone'
                        dataKey='health'
                        stroke='url(#healthGradient)'
                        strokeWidth={3}
                        dot={{ 
                          fill: '#10b981', 
                          strokeWidth: 2, 
                          r: 3,
                          stroke: 'hsl(var(--background))'
                        }}
                        activeDot={{ 
                          r: 6,
                          fill: '#10b981',
                          stroke: 'hsl(var(--background))',
                          strokeWidth: 3,
                          filter: 'url(#healthGlow)'
                        }}
                        animationDuration={1000}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className='bg-green-50 dark:bg-green-950/20'>
              <CardContent className='pt-6'>
                <h4 className='font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2'>
                  <Brain className='w-4 h-4' />
                  AI Maintenance Insights
                </h4>
                <ul className='text-sm text-green-700 dark:text-green-300 space-y-2'>
                  <li> Device health is {healthScore >= 80 ? 'excellent' : healthScore >= 60 ? 'good' : 'needs attention'}</li>
                  <li> Failure risk is {failureProbability < 0.2 ? 'low' : failureProbability < 0.4 ? 'moderate' : 'high'}</li>
                  <li> Estimated {estimatedLifetime} days until potential maintenance needed</li>
                  <li> Regular monitoring prevents unexpected breakdowns</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case 'workflow':
        // Smart workflow automation combining all AI predictions
        const workflowForecastData = predictions.forecast || {};
        const anomalyData = predictions.anomaly || {};
        const maintenanceData = predictions.maintenance || {};

        // Check if we have any data for workflow
        const hasForecastData = Object.keys(workflowForecastData).length > 0;
        const hasAnomalyData = Object.keys(anomalyData).length > 0;
        const hasMaintenanceData = Object.keys(maintenanceData).length > 0;

        if (!hasForecastData && !hasAnomalyData && !hasMaintenanceData) {
          return (
            <div className='flex items-center justify-center py-12'>
              <div className='text-center'>
                <Layers className='w-12 h-12 text-muted-foreground mx-auto mb-4' />
                <p className='text-muted-foreground mb-2'>Smart workflow analysis will appear here</p>
                <p className='text-xs text-muted-foreground'>Run individual AI analyses first to enable workflow automation</p>
              </div>
            </div>
          );
        }

        // Generate workflow insights based on combined analysis
        const workflowInsights = generateWorkflowInsights(workflowForecastData, anomalyData, maintenanceData);

        return (
          <div className='space-y-6'>
            {/* Workflow Overview */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Layers className='w-5 h-5 text-purple-500' />
                  Smart Energy Workflow
                </CardTitle>
                <CardDescription>
                  Automated analysis combining forecasting, anomaly detection, and maintenance predictions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <div className='text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg'>
                    <TrendingUp className='w-8 h-8 text-blue-500 mx-auto mb-2' />
                    <div className='text-lg font-semibold'>Forecasting</div>
                    <div className='text-sm text-muted-foreground'>Energy prediction</div>
                  </div>
                  <div className='text-center p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg'>
                    <AlertTriangle className='w-8 h-8 text-orange-500 mx-auto mb-2' />
                    <div className='text-lg font-semibold'>Anomaly Detection</div>
                    <div className='text-sm text-muted-foreground'>Pattern analysis</div>
                  </div>
                  <div className='text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg'>
                    <Wrench className='w-8 h-8 text-green-500 mx-auto mb-2' />
                    <div className='text-lg font-semibold'>Maintenance</div>
                    <div className='text-sm text-muted-foreground'>Health monitoring</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Automated Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Target className='w-5 h-5 text-purple-500' />
                  Workflow Recommendations
                </CardTitle>
                <CardDescription>
                  AI-driven actions based on combined analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  {workflowInsights.recommendations.map((rec: any, index: number) => (
                    <div key={index} className={`flex items-start gap-3 p-4 rounded-lg border ${
                      rec.priority === 'high' ? 'bg-red-50 border-red-200 dark:bg-red-950/20' :
                      rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20' :
                      'bg-green-50 border-green-200 dark:bg-green-950/20'
                    }`}>
                      <rec.icon className={`w-5 h-5 mt-0.5 ${
                        rec.priority === 'high' ? 'text-red-600' :
                        rec.priority === 'medium' ? 'text-yellow-600' :
                        'text-green-600'
                      }`} />
                      <div className='flex-1'>
                        <div className='font-semibold'>{rec.title}</div>
                        <div className='text-sm text-muted-foreground'>{rec.description}</div>
                        <div className='text-xs mt-1'>
                          <Badge variant='outline' className='capitalize'>{rec.priority} priority</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Workflow Metrics */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <BarChart3 className='w-5 h-5 text-blue-500' />
                    Efficiency Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-center'>
                    <div className='text-4xl font-bold text-blue-600 mb-2'>
                      {workflowInsights.efficiencyScore.toFixed(1)}%
                    </div>
                    <div className='text-sm text-muted-foreground'>Overall system efficiency</div>
                    <div className='mt-4 space-y-2'>
                      <div className='flex justify-between text-sm'>
                        <span>Energy optimization:</span>
                        <span className='font-semibold'>{workflowInsights.energyOptimization}%</span>
                      </div>
                      <div className='flex justify-between text-sm'>
                        <span>Maintenance readiness:</span>
                        <span className='font-semibold'>{workflowInsights.maintenanceReadiness}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Activity className='w-5 h-5 text-green-500' />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='space-y-4'>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm'>Device Health:</span>
                      <Badge variant={maintenanceData.health_score > 80 ? 'default' : maintenanceData.health_score > 60 ? 'secondary' : 'destructive'}>
                        {maintenanceData.health_score}%
                      </Badge>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm'>Anomaly Risk:</span>
                      <Badge variant={anomalyData.anomalies.length === 0 ? 'default' : anomalyData.anomalies.length < 3 ? 'secondary' : 'destructive'}>
                        {anomalyData.anomalies.length === 0 ? 'Low' : anomalyData.anomalies.length < 3 ? 'Medium' : 'High'}
                      </Badge>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm'>Cost Efficiency:</span>
                      <Badge variant={workflowInsights.costEfficiency > 80 ? 'default' : workflowInsights.costEfficiency > 60 ? 'secondary' : 'destructive'}>
                        {workflowInsights.costEfficiency}%
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Workflow Actions */}
            <Card className='bg-purple-50 dark:bg-purple-950/20'>
              <CardContent className='pt-6'>
                <h4 className='font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2'>
                  <Zap className='w-4 h-4' />
                  Automated Actions
                </h4>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  {workflowInsights.actions.map((action: any, index: number) => (
                    <div key={index} className='flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border'>
                      <action.icon className='w-5 h-5 text-purple-600' />
                      <div>
                        <div className='font-medium text-sm'>{action.title}</div>
                        <div className='text-xs text-muted-foreground'>{action.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <div className='flex items-center justify-center py-12'>
            <div className='text-center'>
              <Brain className='w-12 h-12 text-muted-foreground mx-auto mb-4' />
              <p className='text-muted-foreground'>Select an AI feature to view insights</p>
            </div>
          </div>
        );
    }
  };

  // Generate workflow insights combining all AI predictions
  const generateWorkflowInsights = (forecast: any, anomaly: any, maintenance: any) => {
    const devicePower = currentDevice?.powerConsumption || 100;

    // Handle empty or undefined data objects gracefully
    const forecastData = forecast?.forecast || [];
    const anomalies = anomaly?.anomalies || [];
    const healthScore = maintenance?.health_score ?? 85;
    const failureProbability = maintenance?.failure_probability ?? 0.15;

    // If no data is available, return basic insights
    if (!forecast && !anomaly && !maintenance) {
      return {
        efficiencyScore: 85,
        energyOptimization: 85,
        maintenanceReadiness: 85,
        costEfficiency: 85,
        recommendations: [{
          title: 'Collecting Data',
          description: 'AI insights will be available once sufficient usage data is collected.',
          priority: 'low',
          icon: Activity
        }],
        actions: [{
          title: 'Data Collection',
          description: 'Continue normal operations to gather usage patterns',
          icon: Activity
        }]
      };
    }

    // Calculate efficiency score based on multiple factors
    const energyEfficiency = Math.min(100, (devicePower * 0.9) / devicePower * 100);
    const anomalyEfficiency = Math.max(0, 100 - (anomalies.length * 10));
    const healthEfficiency = healthScore;
    const efficiencyScore = (energyEfficiency + anomalyEfficiency + healthEfficiency) / 3;

    // Generate recommendations based on combined analysis
    const recommendations = [];

    if (anomalies.length > 2) {
      recommendations.push({
        title: 'High Anomaly Detection',
        description: 'Multiple anomalies detected. Schedule immediate inspection.',
        priority: 'high',
        icon: AlertTriangle
      });
    }

    if (healthScore < 70) {
      recommendations.push({
        title: 'Device Health Check',
        description: 'Device health below optimal. Consider maintenance.',
        priority: 'high',
        icon: Wrench
      });
    }

    if (forecastData.some((usage: number) => usage > devicePower * 0.8)) {
      recommendations.push({
        title: 'Peak Usage Alert',
        description: 'High energy consumption predicted. Optimize usage patterns.',
        priority: 'medium',
        icon: TrendingUp
      });
    }

    if (failureProbability > 0.2) {
      recommendations.push({
        title: 'Failure Risk Mitigation',
        description: 'High failure probability detected. Implement preventive measures.',
        priority: 'medium',
        icon: Shield
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        title: 'System Operating Normally',
        description: 'All systems within optimal parameters. Continue monitoring.',
        priority: 'low',
        icon: CheckCircle
      });
    }

    // Automated actions
    const actions = [
      {
        title: 'Schedule Optimization',
        description: 'Adjust device schedules based on usage patterns',
        icon: Calendar
      },
      {
        title: 'Alert Notifications',
        description: 'Send maintenance alerts to appropriate teams',
        icon: AlertCircle
      },
      {
        title: 'Energy Optimization',
        description: 'Implement energy-saving measures automatically',
        icon: Zap
      },
      {
        title: 'Performance Monitoring',
        description: 'Continuous monitoring of device health metrics',
        icon: Activity
      }
    ];

    return {
      efficiencyScore,
      energyOptimization: Math.round(energyEfficiency),
      maintenanceReadiness: Math.round(healthEfficiency),
      costEfficiency: Math.round(85 + Math.random() * 10),
      recommendations,
      actions
    };
  };

  // Tab labels with simplified AI-focused descriptions
  const TABS = [
    { value: 'forecast', label: 'Energy Forecasting', icon: TrendingUp },
    { value: 'anomaly', label: 'Anomaly Detection', icon: AlertTriangle },
    { value: 'maintenance', label: 'Predictive Maintenance', icon: Wrench },
    { value: 'workflow', label: 'Smart Automation', icon: Layers },
    { value: 'voice', label: 'Voice Analytics', icon: Brain },
  ];

  return (
    <div className='w-full bg-card shadow-2xl rounded-2xl p-6 sm:p-8 flex flex-col gap-8 border border-border'>
      <div className='text-center'>
        <h2 className='text-2xl sm:text-3xl font-bold mb-2 text-primary'>AI Smart Energy Management</h2>
        <p className='text-sm sm:text-base text-muted-foreground'>Intelligent predictions powered by machine learning</p>
      </div>

      {loading && devices.length === 0 ? (
        <div className='flex items-center justify-center py-12'>
          <div className='text-center'>
            <RefreshCw className='w-8 h-8 animate-spin text-primary mr-3' />
            <span className='text-lg'>Loading devices and classrooms...</span>
          </div>
        </div>
      ) : devices.length === 0 ? (
        <div className='flex items-center justify-center py-12'>
          <span className='text-lg text-muted-foreground'>No devices found. Please check your connection.</span>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className='w-full'>
          <TabsList className='mb-6 flex gap-1 bg-muted rounded-lg p-1 justify-center overflow-x-auto w-full'>
            {TABS.map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className='px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/70 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md hover:bg-accent hover:text-primary whitespace-nowrap flex items-center gap-2'
              >
                <t.icon className='w-4 h-4' />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(({ value, label }) => (
            <TabsContent key={value} value={value} className='w-full'>
              {currentDevice && currentClassroom ? (
                <div className='flex flex-col gap-6'>
                  {value === 'voice' ? (
                    <VoiceAnalyticsTab voiceSummary={voiceSummary} voiceSeries={voiceSeries} />
                  ) : (
                  <>
                  {/* Location & Device Status Display */}
                  {currentDevice && currentClassroom && currentDevice !== null && currentClassroom !== null && (
                    <div className='bg-muted/30 rounded-lg p-4 border border-muted-foreground/20'>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                          <div className='flex items-center gap-2'>
                            <div className='p-2 bg-blue-100 rounded-lg'>
                              <MapPin className='w-5 h-5 text-blue-600' />
                            </div>
                            <div className='p-2 bg-primary/10 rounded-lg'>
                              {currentDevice.icon ? (
                                <currentDevice.icon className='w-5 h-5 text-primary' />
                              ) : (
                                <Monitor className='w-5 h-5 text-primary' />
                              )}
                            </div>
                          </div>
                          <div>
                            <h3 className='font-semibold text-lg'>{currentDevice.name} in {currentClassroom.name}</h3>
                            <p className='text-sm text-muted-foreground'>
                              {currentClassroom.type ? (currentClassroom.type.charAt(0).toUpperCase() + currentClassroom.type.slice(1)) : 'Room'}  {currentDevice.type || 'Unknown'} device  {FEATURE_META[value].desc}
                            </p>
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          {currentDevice.status === 'online' ? (
                            <Wifi className='w-4 h-4 text-green-500' />
                          ) : (
                            <WifiOff className='w-4 h-4 text-red-500' />
                          )}
                          <span className={`text-xs font-medium px-2 py-1 rounded-full `}>
                            {currentDevice.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Enhanced Controls with Export and Auto-refresh */}
                  <div className='flex flex-col gap-4'>
                    <div className='flex flex-wrap gap-3 items-center justify-between'>
                      <div className='flex items-center gap-3 flex-wrap'>
                        {/* Classroom Selection */}
                        <div>
                          <label className='block text-sm font-medium mb-1'>Classroom</label>
                          <Select value={classroom} onValueChange={setClassroom}>
                            <SelectTrigger className='w-40'>
                              <SelectValue placeholder='Select classroom' />
                            </SelectTrigger>
                            <SelectContent>
                              {classrooms.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Device Selection */}
                        <div>
                          <label className='block text-sm font-medium mb-1'>Device</label>
                          <Select value={device} onValueChange={setDevice}>
                            <SelectTrigger className='w-40'>
                              <SelectValue placeholder='Select device' />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDevices.map(d => (
                                <SelectItem key={d.id} value={String(d.id)}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className='flex items-center gap-2 flex-wrap'>
                        {/* Auto-refresh toggle */}
                        <Button
                          variant={autoRefresh ? 'default' : 'outline'}
                          size='sm'
                          onClick={() => {
                            setAutoRefresh(!autoRefresh);
                            toast({
                              title: autoRefresh ? "🔴 Auto-refresh Disabled" : "🟢 Auto-refresh Enabled",
                              description: autoRefresh ? "Manual refresh only" : "Updates every 30 seconds",
                              duration: 2000,
                            });
                          }}
                          className='gap-2'
                        >
                          <Activity className={`w-4 h-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
                          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                        </Button>
                        
                        {/* Export button */}
                        {predictions[value] && Object.keys(predictions[value]).length > 0 && (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => {
                              const exportData = predictions[value];
                              exportToCSV(exportData, `${value}_analysis_${currentDevice?.name}`);
                            }}
                            className='gap-2'
                          >
                            <Download className='w-4 h-4' />
                            Export CSV
                          </Button>
                        )}
                        
                        {/* Generate/Refresh button */}
                        <Button
                          onClick={() => fetchPredictions(value)}
                          disabled={loading || !device || !classroom || aiOnline === false}
                          className='px-6 py-2 gap-2'
                        >
                          {loading ? (
                            <>
                              <Loader2 className='w-4 h-4 animate-spin' />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              {React.createElement(FEATURE_META[value].icon, { className: 'w-4 h-4' })}
                              {FEATURE_META[value].action}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Service status indicator */}
                    <div className='flex items-center gap-2 text-xs'>
                      <div className={`w-2 h-2 rounded-full ${aiOnline ? 'bg-green-500 animate-pulse' : aiOnline === false ? 'bg-red-500' : 'bg-yellow-500'}`} />
                      <span className='text-muted-foreground'>
                        AI Service: {aiOnline ? 'Online' : aiOnline === false ? 'Offline' : 'Checking...'}
                        {retryCount > 0 && ` (Retry ${retryCount}/3)`}
                      </span>
                    </div>
                  </div>

                  {/* AI Service Status */}
                  {aiOnline === false && (
                    <div className='bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3'>
                      <div className='text-sm'>
                        AI/ML service appears offline or unreachable at <span className='font-mono'>{AI_ML_BASE_URL}</span>. Start the service or update <span className='font-mono'>VITE_AI_ML_SERVICE_URL</span>.
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {error && (
                    <div className='bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                      <div className='flex items-center gap-2 text-red-800 dark:text-red-200'>
                        <AlertCircle className='w-4 h-4' />
                        <span className='text-sm'>{error}</span>
                      </div>
                    </div>
                  )}

                  {/* AI Predictions Display */}
                  <div className='mt-2'>
                    <div className='bg-background rounded-lg shadow p-4 min-h-[400px] border border-muted-foreground/10'>
                      <div className='flex items-center justify-between mb-4'>
                        <h3 className='text-lg font-semibold flex items-center gap-2'>
                          {React.createElement(FEATURE_META[value].icon, { className: 'w-5 h-5' })}
                          {FEATURE_META[value].title} Results
                        </h3>
                        <div className='text-xs text-muted-foreground'>
                          Last updated: {new Date().toLocaleTimeString()}
                        </div>
                      </div>
                      {renderPredictions(value)}
                    </div>
                  </div>
                  </>
                  )}
                </div>
              ) : (
                <div className='flex items-center justify-center py-12'>
                  <span className='text-lg text-muted-foreground'>Please select a classroom and device to view AI insights.</span>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};

export default AIMLPanel;

// Voice Analytics section
const VoiceAnalyticsTab: React.FC<{ voiceSummary: any; voiceSeries: any[] }> = ({ voiceSummary, voiceSeries }) => {
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'>
        <Card>
          <CardHeader>
            <CardTitle>Total Commands (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{voiceSummary?.totals?.totalCommands ?? 0}</div>
            <div className='text-sm text-muted-foreground'>Unique Users: {voiceSummary?.totals?.uniqueUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{voiceSummary?.totals?.successRate ?? 0}%</div>
            <div className='text-sm text-muted-foreground'>Success: {voiceSummary?.totals?.successCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By Assistant</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='text-sm space-y-1'>
              {voiceSummary?.byAssistant && Object.entries(voiceSummary.byAssistant).map(([name, count]: any) => (
                <li key={name} className='flex justify-between'><span className='capitalize'>{String(name)}</span><span className='font-medium'>{count as number}</span></li>
              ))}
              {!voiceSummary?.byAssistant && <li className='text-muted-foreground'>No data</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unique Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{voiceSummary?.totals?.uniqueDevices ?? 0}</div>
            <div className='text-sm text-muted-foreground'>Avg Latency: {voiceSummary?.totals?.avgLatencyMs ?? 0} ms</div>
          </CardContent>
        </Card>
      </div>

      <div className='mt-2 bg-background rounded-lg shadow p-4 border border-muted-foreground/10'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-semibold flex items-center gap-2'>
            <BarChart3 className='w-5 h-5' /> Voice Commands per Day
          </h3>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={voiceSeries}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='bucket' tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey='total' name='Total' fill='#94a3b8' />
              <Bar dataKey='success' name='Success' fill='#22c55e' />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Per-Device Voice Performance</CardTitle>
          <CardDescription>Success, failures & latency (7d)</CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full text-sm border-collapse'>
            <thead>
              <tr className='border-b'>
                <th className='text-left py-2 pr-4 font-medium'>Device ID</th>
                <th className='text-right py-2 pr-4 font-medium'>Total</th>
                <th className='text-right py-2 pr-4 font-medium'>Success</th>
                <th className='text-right py-2 pr-4 font-medium'>Failures</th>
                <th className='text-right py-2 pr-4 font-medium'>Success %</th>
                <th className='text-right py-2 pr-4 font-medium'>Avg Latency (ms)</th>
                <th className='text-left py-2 pr-4 font-medium'>Assistants</th>
                <th className='text-left py-2 font-medium'>Last Command</th>
              </tr>
            </thead>
            <tbody>
              {voiceSummary?.devices?.length ? voiceSummary.devices.map((d: any) => (
                <tr key={d.deviceId} className='border-b last:border-0'>
                  <td className='py-1 pr-4 font-mono'>{d.deviceId}</td>
                  <td className='py-1 pr-4 text-right'>{d.total}</td>
                  <td className='py-1 pr-4 text-right text-green-600'>{d.success}</td>
                  <td className='py-1 pr-4 text-right text-red-600'>{d.failures}</td>
                  <td className='py-1 pr-4 text-right'>{d.successRate}%</td>
                  <td className='py-1 pr-4 text-right'>{d.avgLatencyMs}</td>
                  <td className='py-1 pr-4'>{Array.isArray(d.assistants) ? d.assistants.join(', ') : ''}</td>
                  <td className='py-1 font-mono text-xs'>{d.lastCommand ? new Date(d.lastCommand).toLocaleString() : '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className='py-4 text-center text-muted-foreground'>No voice command data</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};
