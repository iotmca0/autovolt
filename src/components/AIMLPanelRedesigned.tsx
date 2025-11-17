import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain, TrendingUp, AlertTriangle, Wrench, Layers, Activity, 
  RefreshCw, Download, Sparkles, Loader2, CheckCircle, XCircle,
  BarChart3, Clock, DollarSign, Shield, Target, Zap, MapPin, Wifi, WifiOff
} from 'lucide-react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';
import { apiService, aiMlAPI, deviceAPI, AI_ML_BASE_URL, voiceAnalyticsAPI } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

// Empty state component
const EmptyState = ({ icon: Icon, title, description }: any) => (
  <div className='flex flex-col items-center justify-center py-16 px-4'>
    <Icon className='w-16 h-16 text-muted-foreground/40 mb-4' />
    <h3 className='text-lg font-semibold text-foreground mb-2'>{title}</h3>
    <p className='text-sm text-muted-foreground text-center max-w-md'>{description}</p>
  </div>
);

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
  
  // AI/ML state
  const [forecastData, setForecastData] = useState<any>(null);
  const [anomalyData, setAnomalyData] = useState<any>(null);
  const [scheduleData, setScheduleData] = useState<any>(null);

  // Voice analytics state
  const [voiceSummary, setVoiceSummary] = useState<any | null>(null);
  const [voiceSeries, setVoiceSeries] = useState<any[]>([]);

  // Fetch devices and classrooms on mount
  useEffect(() => {
    fetchDevicesAndClassrooms();
    checkAIServiceHealth();
  }, []);

  const checkAIServiceHealth = async () => {
    try {
      await aiMlAPI.health();
      setAiOnline(true);
    } catch (e) {
      setAiOnline(false);
    }
  };

  const fetchDevicesAndClassrooms = async () => {
    try {
      setLoading(true);
      const dashboardRes = await apiService.get('/analytics/dashboard');
      if (dashboardRes.data.devices) {
        setDevices(dashboardRes.data.devices);

        const uniqueClassrooms = [...new Set(
          dashboardRes.data.devices
            .map((d: any) => d.classroom)
            .filter((c: any) => c && c.trim() && c !== 'unassigned')
        )];

        const classroomObjects = uniqueClassrooms.map(name => ({
          id: name as string,
          name: name as string,
          type: (name as string).toLowerCase().includes('lab') ? 'lab' : 'classroom'
        }));

        setClassrooms(classroomObjects);

        if (classroomObjects.length > 0 && !classroom) {
          setClassroom(classroomObjects[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setDevices([]);
      setClassrooms([]);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableDevices = () => devices.filter((d: any) => d && d.classroom === classroom);
  
  const getCurrentClassroom = () => {
    if (!classroom || classrooms.length === 0) return null;
    return classrooms.find(c => c.id === classroom) || classrooms[0];
  };
  
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
  }, [classroom, availableDevices, device]);

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

  // Fetch AI/ML data when tabs are active
  useEffect(() => {
    if (tab === 'forecast' && currentDevice && aiOnline) {
      fetchForecastData();
    }
  }, [tab, currentDevice, aiOnline]);

  useEffect(() => {
    if (tab === 'anomaly' && currentDevice && aiOnline) {
      fetchAnomalyData();
    }
  }, [tab, currentDevice, aiOnline]);

  useEffect(() => {
    if (tab === 'workflow' && currentDevice && aiOnline) {
      fetchScheduleData();
    }
  }, [tab, currentDevice, aiOnline]);

  const fetchForecastData = async () => {
    if (!currentDevice) return;
    
    try {
      setLoading(true);
      // Generate sample historical data for forecasting
      const history = Array.from({ length: 24 }, () => Math.random() * 100 + 50);
      const response = await aiMlAPI.forecast(currentDevice.id, history, 5);
      setForecastData(response.data);
    } catch (error) {
      console.error('Forecast fetch failed:', error);
      setError('Failed to fetch forecast data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnomalyData = async () => {
    if (!currentDevice) return;
    
    try {
      setLoading(true);
      // Generate sample data for anomaly detection
      const values = Array.from({ length: 50 }, () => Math.random() * 100 + 50);
      const response = await aiMlAPI.anomaly(currentDevice.id, values);
      setAnomalyData(response.data);
    } catch (error) {
      console.error('Anomaly fetch failed:', error);
      setError('Failed to fetch anomaly data');
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduleData = async () => {
    if (!currentDevice) return;
    
    try {
      setLoading(true);
      const response = await aiMlAPI.schedule(currentDevice.id, {
        class_schedule: { weekends: false },
        energy_budget: 75
      });
      setScheduleData(response.data);
    } catch (error) {
      console.error('Schedule fetch failed:', error);
      setError('Failed to fetch schedule data');
    } finally {
      setLoading(false);
    }
  };

  // Feature metadata
  const FEATURE_META: Record<string, { title: string; desc: string; action: string; icon: any }> = {
    forecast: {
      title: 'Energy Forecasting',
      desc: 'AI-powered energy consumption predictions',
      action: 'Generate Forecast',
      icon: TrendingUp
    },
    anomaly: {
      title: 'Anomaly Detection',
      desc: 'Detect unusual patterns and failures',
      action: 'Detect Anomalies',
      icon: AlertTriangle
    },
    maintenance: {
      title: 'Predictive Maintenance',
      desc: 'Predict maintenance needs before failures',
      action: 'Check Health',
      icon: Wrench
    },
    workflow: {
      title: 'Smart Automation',
      desc: 'Automated AI workflow for energy management',
      action: 'Run Workflow',
      icon: Layers
    },
    voice: {
      title: 'Voice Analytics',
      desc: 'Voice command insights and statistics',
      action: 'View Analytics',
      icon: Brain
    }
  };

  // Tab configuration
  const TABS = [
    { value: 'forecast', label: 'Forecasting', icon: TrendingUp },
    { value: 'anomaly', label: 'Anomalies', icon: AlertTriangle },
    { value: 'maintenance', label: 'Maintenance', icon: Wrench },
    { value: 'workflow', label: 'Automation', icon: Layers },
    { value: 'voice', label: 'Voice', icon: Brain },
  ];

  if (loading && devices.length === 0) {
    return (
      <div className='w-full min-h-[600px] bg-card shadow-xl rounded-2xl p-8 flex items-center justify-center border border-border'>
        <div className='text-center'>
          <Loader2 className='w-12 h-12 animate-spin text-primary mx-auto mb-4' />
          <p className='text-lg font-medium'>Loading AI/ML Insights...</p>
          <p className='text-sm text-muted-foreground mt-2'>Preparing your intelligent analytics</p>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <Card className='w-full min-h-[600px] flex items-center justify-center border-border shadow-xl'>
        <EmptyState 
          icon={Brain}
          title="No Devices Available"
          description="Please add devices to your system to start using AI/ML insights and analytics."
        />
      </Card>
    );
  }

  return (
    <div className='w-full max-w-full overflow-x-hidden overflow-y-auto'>
      <Card className='shadow-2xl rounded-2xl border-border/50 bg-gradient-to-br from-card via-card to-card/95'>
        <CardHeader className='space-y-4 pb-6'>
          <div className='flex items-start justify-between gap-4 flex-wrap'>
            <div>
              <CardTitle className='text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent flex items-center gap-3'>
                <Brain className='w-8 h-8 text-primary' />
                AI/ML Insights
              </CardTitle>
              <CardDescription className='text-base mt-2'>
                Intelligent energy analytics powered by advanced machine learning
              </CardDescription>
            </div>
            
            {/* Service Status Badge */}
            <Badge 
              variant={aiOnline ? 'default' : 'destructive'}
              className='flex items-center gap-2 px-4 py-2 text-sm font-medium'
            >
              <div className={`w-2 h-2 rounded-full ${aiOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {aiOnline ? 'AI Service Online' : 'AI Service Offline'}
            </Badge>
          </div>

          {/* AI Service Offline Warning */}
          {aiOnline === false && (
            <Alert variant='destructive' className='border-2'>
              <AlertTriangle className='h-5 w-5' />
              <AlertDescription className='ml-2'>
                <strong>AI/ML Service Unavailable:</strong> The AI service at {AI_ML_BASE_URL} is not responding. 
                Please start the service with <code className='bg-black/20 px-2 py-1 rounded'>python ai_ml_service/main.py</code>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>

        <CardContent className='space-y-6'>
          {/* Device Selection Section */}
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-xl border border-border/50'>
            {/* Classroom Selector */}
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Classroom</label>
              <Select value={classroom} onValueChange={setClassroom}>
                <SelectTrigger className='w-full h-11'>
                  <SelectValue placeholder='Select classroom' />
                </SelectTrigger>
                <SelectContent>
                  {classrooms.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className='flex items-center gap-2'>
                        <MapPin className='w-4 h-4' />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Device Selector */}
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Device</label>
              <Select value={device} onValueChange={setDevice} disabled={availableDevices.length === 0}>
                <SelectTrigger className='w-full h-11'>
                  <SelectValue placeholder='Select device' />
                </SelectTrigger>
                <SelectContent>
                  {availableDevices.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      <div className='flex items-center gap-2'>
                        {d.status === 'online' ? (
                          <Wifi className='w-4 h-4 text-green-500' />
                        ) : (
                          <WifiOff className='w-4 h-4 text-red-500' />
                        )}
                        {d.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground invisible'>Actions</label>
              <div className='flex items-center gap-2'>
                <Button
                  variant={autoRefresh ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => {
                    setAutoRefresh(!autoRefresh);
                    toast({
                      title: autoRefresh ? "Auto-refresh Disabled" : "Auto-refresh Enabled",
                      description: autoRefresh ? "Manual refresh only" : "Updates every 30s",
                      duration: 2000,
                    });
                  }}
                  className='flex-1'
                >
                  <Activity className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
                  Auto {autoRefresh ? 'ON' : 'OFF'}
                </Button>
                
                <Button
                  variant='outline'
                  size='sm'
                  onClick={checkAIServiceHealth}
                  className='flex-1'
                >
                  <RefreshCw className='w-4 h-4 mr-2' />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Current Selection Display */}
          {currentDevice && currentClassroom && (
            <Card className='bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20'>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    <div className='p-2 bg-primary/20 rounded-lg'>
                      <MapPin className='w-5 h-5 text-primary' />
                    </div>
                    <div>
                      <p className='text-sm font-medium text-muted-foreground'>Analyzing</p>
                      <p className='text-lg font-bold'>{currentDevice.name} in {currentClassroom.name}</p>
                    </div>
                  </div>
                  <Badge variant={currentDevice.status === 'online' ? 'default' : 'secondary'}>
                    {currentDevice.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs Section */}
          <Tabs value={tab} onValueChange={setTab} className='w-full'>
            <TabsList className='grid w-full grid-cols-5 h-auto p-1 bg-muted/50'>
              {TABS.map(t => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className='flex flex-col items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-md'
                >
                  <t.icon className='w-5 h-5' />
                  <span className='text-xs font-medium'>{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TABS.map(({ value }) => (
              <TabsContent key={value} value={value} className='mt-6 space-y-6'>
                {value === 'voice' ? (
                  <VoiceAnalyticsTab voiceSummary={voiceSummary} voiceSeries={voiceSeries} />
                ) : value === 'forecast' ? (
                  <ForecastTab 
                    data={forecastData} 
                    loading={loading} 
                    onRefresh={fetchForecastData}
                    device={currentDevice}
                  />
                ) : value === 'anomaly' ? (
                  <AnomalyTab 
                    data={anomalyData} 
                    loading={loading} 
                    onRefresh={fetchAnomalyData}
                    device={currentDevice}
                  />
                ) : value === 'workflow' ? (
                  <WorkflowTab 
                    data={scheduleData} 
                    loading={loading} 
                    onRefresh={fetchScheduleData}
                    device={currentDevice}
                  />
                ) : (
                  <div className='text-center py-12'>
                    <EmptyState 
                      icon={FEATURE_META[value].icon}
                      title={`${FEATURE_META[value].title} Coming Soon`}
                      description="AI/ML service integration in progress. Advanced analytics will be available soon."
                    />
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

// Voice Analytics Component
const VoiceAnalyticsTab: React.FC<{ voiceSummary: any; voiceSeries: any[] }> = ({ voiceSummary, voiceSeries }) => {
  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'>
        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Total Commands</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{voiceSummary?.totals?.totalCommands ?? 0}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Users: {voiceSummary?.totals?.uniqueUsers ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold text-green-600'>{voiceSummary?.totals?.successRate ?? 0}%</div>
            <p className='text-xs text-muted-foreground mt-1'>
              {voiceSummary?.totals?.successCount ?? 0} successful
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Unique Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>{voiceSummary?.totals?.uniqueDevices ?? 0}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Avg: {voiceSummary?.totals?.avgLatencyMs ?? 0}ms
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Assistants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>
              {voiceSummary?.byAssistant ? Object.keys(voiceSummary.byAssistant).length : 0}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>Active types</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className='border-border/50 shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BarChart3 className='w-5 h-5' />
            Voice Commands Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='h-80 w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={voiceSeries}>
                <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' opacity={0.3} />
                <XAxis dataKey='bucket' tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey='total' name='Total' fill='#94a3b8' radius={[4, 4, 0, 0]} />
                <Bar dataKey='success' name='Success' fill='#22c55e' radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Forecast Tab Component
const ForecastTab: React.FC<{ data: any; loading: boolean; onRefresh: () => void; device: any }> = ({ 
  data, loading, onRefresh, device 
}) => {
  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-primary' />
        <span className='ml-2'>Generating forecast...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='text-center py-12'>
        <EmptyState 
          icon={TrendingUp}
          title="No Forecast Data"
          description="Click the refresh button to generate energy consumption forecasts."
        />
        <Button onClick={onRefresh} className='mt-4'>
          <RefreshCw className='w-4 h-4 mr-2' />
          Generate Forecast
        </Button>
      </div>
    );
  }

  const forecastData = data.forecast?.map((value: number, index: number) => ({
    period: `+${index + 1}h`,
    forecast: Math.round(value * 100) / 100,
    confidence: data.confidence?.[index] ? Math.round(data.confidence[index] * 100) : 80
  })) || [];

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Next Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-primary'>
              {forecastData[0]?.forecast ?? 0} kWh
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Confidence: {forecastData[0]?.confidence ?? 0}%
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>5-Hour Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {forecastData.length > 0 ? Math.round(forecastData.reduce((sum: number, item: any) => sum + item.forecast, 0) / forecastData.length * 100) / 100 : 0} kWh
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Predicted consumption
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Model Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {data.model_type || 'Simple'}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Forecasting algorithm
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Chart */}
      <Card className='border-border/50 shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <TrendingUp className='w-5 h-5' />
              Energy Consumption Forecast
            </div>
            <Button variant='outline' size='sm' onClick={onRefresh}>
              <RefreshCw className='w-4 h-4 mr-2' />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            AI-powered predictions for {device?.name} energy usage over the next 5 hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='h-80 w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' opacity={0.3} />
                <XAxis dataKey='period' />
                <YAxis />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line 
                  type='monotone' 
                  dataKey='forecast' 
                  stroke='#3b82f6' 
                  strokeWidth={3}
                  name='Predicted (kWh)'
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Anomaly Detection Tab Component
const AnomalyTab: React.FC<{ data: any; loading: boolean; onRefresh: () => void; device: any }> = ({ 
  data, loading, onRefresh, device 
}) => {
  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-primary' />
        <span className='ml-2'>Detecting anomalies...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='text-center py-12'>
        <EmptyState 
          icon={AlertTriangle}
          title="No Anomaly Data"
          description="Click the refresh button to run anomaly detection on recent data."
        />
        <Button onClick={onRefresh} className='mt-4'>
          <RefreshCw className='w-4 h-4 mr-2' />
          Detect Anomalies
        </Button>
      </div>
    );
  }

  const anomalyCount = data.anomalies?.length || 0;
  const totalPoints = data.scores?.length || 0;
  const anomalyRate = totalPoints > 0 ? Math.round((anomalyCount / totalPoints) * 100 * 100) / 100 : 0;

  const chartData = data.scores?.map((score: number, index: number) => ({
    index,
    score: Math.round(score * 1000) / 1000,
    isAnomaly: data.anomalies?.includes(index) || false
  })) || [];

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Anomalies Detected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>{anomalyCount}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Out of {totalPoints} data points
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Anomaly Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>{anomalyRate}%</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Abnormal data percentage
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Threshold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {data.threshold ? Math.round(data.threshold * 1000) / 1000 : 0}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Detection sensitivity
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly Chart */}
      <Card className='border-border/50 shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <AlertTriangle className='w-5 h-5' />
              Anomaly Detection Results
            </div>
            <Button variant='outline' size='sm' onClick={onRefresh}>
              <RefreshCw className='w-4 h-4 mr-2' />
              Re-run Detection
            </Button>
          </CardTitle>
          <CardDescription>
            Machine learning analysis of {device?.name} behavior patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='h-80 w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' opacity={0.3} />
                <XAxis dataKey='index' />
                <YAxis />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line 
                  type='monotone' 
                  dataKey='score' 
                  stroke='#6b7280' 
                  strokeWidth={2}
                  name='Anomaly Score'
                  dot={false}
                />
                {chartData.filter(d => d.isAnomaly).map((point, idx) => (
                  <Line
                    key={`anomaly-${idx}`}
                    type='monotone'
                    data={[point]}
                    stroke='#ef4444'
                    strokeWidth={0}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 6 }}
                    name='Anomaly'
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Workflow/Schedule Tab Component
const WorkflowTab: React.FC<{ data: any; loading: boolean; onRefresh: () => void; device: any }> = ({ 
  data, loading, onRefresh, device 
}) => {
  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-primary' />
        <span className='ml-2'>Optimizing schedule...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='text-center py-12'>
        <EmptyState 
          icon={Layers}
          title="No Schedule Data"
          description="Click the refresh button to generate an optimized energy schedule."
        />
        <Button onClick={onRefresh} className='mt-4'>
          <RefreshCw className='w-4 h-4 mr-2' />
          Generate Schedule
        </Button>
      </div>
    );
  }

  const scheduleData = data.schedule || {};
  const savings = data.energy_savings || 0;

  const scheduleItems = Object.entries(scheduleData).map(([day, config]: [string, any]) => ({
    day: day.charAt(0).toUpperCase() + day.slice(1),
    start: config.start || 'N/A',
    end: config.end || 'N/A',
    priority: config.priority || 'off'
  }));

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Energy Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold text-green-600'>{savings}%</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Potential reduction in consumption
            </p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-lg'>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>Schedule Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>Optimized</div>
            <p className='text-xs text-muted-foreground mt-1'>
              AI-generated energy schedule
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Table */}
      <Card className='border-border/50 shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <Clock className='w-5 h-5' />
              Optimized Schedule for {device?.name}
            </div>
            <Button variant='outline' size='sm' onClick={onRefresh}>
              <RefreshCw className='w-4 h-4 mr-2' />
              Re-optimize
            </Button>
          </CardTitle>
          <CardDescription>
            AI-optimized energy usage schedule based on classroom patterns and energy goals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {scheduleItems.map((item, index) => (
              <div key={index} className='flex items-center justify-between p-3 bg-muted/30 rounded-lg'>
                <div className='flex items-center gap-3'>
                  <div className='w-20 font-medium text-sm'>{item.day}</div>
                  <div className='text-sm text-muted-foreground'>
                    {item.start} - {item.end}
                  </div>
                </div>
                <Badge 
                  variant={
                    item.priority === 'high' ? 'default' :
                    item.priority === 'medium' ? 'secondary' :
                    item.priority === 'low' ? 'outline' : 'destructive'
                  }
                >
                  {item.priority === 'off' ? 'Off' : item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Energy Savings Visualization */}
      <Card className='border-border/50 shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <DollarSign className='w-5 h-5' />
            Energy Savings Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='h-64 w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Optimized Usage', value: 100 - savings, fill: '#22c55e' },
                    { name: 'Energy Saved', value: savings, fill: '#ef4444' }
                  ]}
                  cx='50%'
                  cy='50%'
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey='value'
                >
                  <Cell fill='#22c55e' />
                  <Cell fill='#ef4444' />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIMLPanel;
