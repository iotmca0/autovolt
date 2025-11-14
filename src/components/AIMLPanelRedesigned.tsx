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

  // Empty state component
  const EmptyState = ({ icon: Icon, title, description }: any) => (
    <div className='flex flex-col items-center justify-center py-16 px-4'>
      <Icon className='w-16 h-16 text-muted-foreground/40 mb-4' />
      <h3 className='text-lg font-semibold text-foreground mb-2'>{title}</h3>
      <p className='text-sm text-muted-foreground text-center max-w-md'>{description}</p>
    </div>
  );

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

export default AIMLPanel;
