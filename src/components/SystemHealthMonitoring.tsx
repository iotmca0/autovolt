import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  Server,
  Database,
  Wifi,
  WifiOff,
  Clock,
  MemoryStick,
  HardDrive,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Cpu,
  Network,
  Shield,
  Zap,
  Download,
  BarChart3,
  Monitor,
  Settings,
  Sun,
  Moon,
  Bell,
  BellOff,
  Users,
  UserCheck,
  UserX
} from 'lucide-react';
import { api } from '@/services/api';
import { formatDistanceToNow, format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface SystemMetrics {
  timestamp: string;
  system: {
    hostname: string;
    platform: string;
    distro: string;
    release: string;
    arch: string;
    uptime: number;
  };
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    physicalCores: number;
    speed: number;
    speedMax: number;
    usage: number;
    loadAverage: {
      '1m': number;
      '5m': number;
      '15m': number;
    };
  };
  memory: {
    total: number;
    used: number;
    free: number;
    active: number;
    available: number;
    buffers: number;
    cached: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
    partitions: Array<{
      mount: string;
      type: string;
      size: number;
      used: number;
      available: number;
      use: number;
    }>;
  };
  network: {
    interfaces: Array<any>;
    stats: Array<any>;
    usage: {
      rx: number;
      tx: number;
      total: number;
    };
    sessionStart: string;
  };
  processes: {
    all: number;
    running: number;
    blocked: number;
    sleeping: number;
  };
}

interface ServiceStatus {
  timestamp: string;
  services: {
    database: {
      name: string;
      status: string;
      activeConnections: number;
    };
    mqtt: {
      name: string;
      status: string;
      pendingMessages: number;
      queueSize: number;
    };
    redis: {
      name: string;
      status: string;
    };
    api: {
      name: string;
      status: string;
      activeConnections: number;
      responseTime: number;
      errorRate: number;
    };
  };
}

interface DeviceMetrics {
  timestamp: string;
  summary: {
    total: number;
    online: number;
    offline: number;
    heartbeatHealthy: number;
  };
  devices: Array<{
    id: string;
    name: string;
    macAddress: string;
    status: string;
    lastSeen: string;
    location: string;
    timeSinceLastSeen: number;
  }>;
  alerts: {
    offlineDevices: number;
    staleHeartbeats: number;
  };
}

interface SecurityMetrics {
  timestamp: string;
  alerts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  recentEvents: {
    failedLogins: any[];
    unauthorizedAccess: any[];
    suspiciousActivities: any[];
  };
  certificates: {
    sslExpiry: string | null;
    daysUntilExpiry: number | null;
  };
  systemLogs: {
    lastErrors: any[];
    lastWarnings: any[];
    logSize: number;
  };
}

interface UserMetrics {
  timestamp: string;
  summary: {
    totalUsers: number;
    activeUsers24h: number;
    currentlyOnline: number;
    todaysLogins: number;
  };
  recentActivity: Array<{
    id: string;
    name: string;
    email: string;
    lastLogin: string;
    role: string;
    timeAgo: number;
  }>;
  statistics: {
    loginRate: number;
    averageSessionDuration: number;
    peakConcurrentUsers: number;
  };
}

interface AlertData {
  timestamp: string;
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    value: number;
    threshold: number;
    timestamp: string;
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

interface HistoricalData {
  metric: string;
  period: string;
  data: Array<{
    timestamp: string;
    value: number;
  }>;
}

export const SystemHealthMonitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Data states
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [deviceMetrics, setDeviceMetrics] = useState<DeviceMetrics | null>(null);
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics | null>(null);
  const [userMetrics, setUserMetrics] = useState<UserMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertData | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData | null>(null);
  const [selectedMetric, setSelectedMetric] = useState('cpu');

  useEffect(() => {
    fetchAllData();

    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchAllData();
      }, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const [
        metricsRes,
        servicesRes,
        devicesRes,
        securityRes,
        usersRes,
        alertsRes
      ] = await Promise.all([
        api.get('/system-health/metrics'),
        api.get('/system-health/services'),
        api.get('/system-health/devices'),
        api.get('/system-health/security'),
        api.get('/system-health/users'),
        api.get('/system-health/alerts')
      ]);

      setSystemMetrics(metricsRes.data);
      setServiceStatus(servicesRes.data);
      setDeviceMetrics(devicesRes.data);
      setSecurityMetrics(securityRes.data);
      setUserMetrics(usersRes.data);
      setAlerts(alertsRes.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching health data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoricalData = async (metric: string) => {
    try {
      const response = await api.get(`/system-health/history?metric=${metric}&hours=24`);
      setHistoricalData(response.data);
    } catch (error) {
      console.error('Error fetching historical data:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistoricalData(selectedMetric);
    }
  }, [activeTab, selectedMetric]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'ok':
      case 'connected':
      case 'running':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'error':
      case 'disconnected':
      case 'offline':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'ok':
      case 'connected':
      case 'running':
      case 'online':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
      case 'disconnected':
      case 'offline':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const exportReport = async (format: 'excel' | 'json' = 'excel') => {
    try {
      const response = await api.post('/system-health/export', { format }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `system-health-report.${format === 'excel' ? 'xlsx' : 'json'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const criticalAlerts = alerts?.alerts.filter(a => a.severity === 'critical') || [];
  const hasCriticalIssues = criticalAlerts.length > 0;

  if (loading && !systemMetrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            System Health Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading comprehensive system health...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="w-8 h-8 text-blue-600" />
            System Health Monitoring
          </h1>
          <p className="text-muted-foreground">Comprehensive real-time system monitoring and analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          >
            {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAllData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {hasCriticalIssues && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Critical System Alerts:</strong> {criticalAlerts.length} critical issue(s) detected.
            {criticalAlerts.map(alert => (
              <div key={alert.id} className="mt-1 text-sm">
                • {alert.title}: {alert.message}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Export Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => exportReport('excel')}>
          <Download className="w-4 h-4 mr-2" />
          Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportReport('json')}>
          <Download className="w-4 h-4 mr-2" />
          Export JSON
        </Button>
        <span className="text-sm text-muted-foreground ml-4">
          Last updated: {formatDistanceToNow(lastUpdate)} ago
        </span>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Core Health Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Server Uptime</p>
                    <p className="text-2xl font-bold">{systemMetrics ? formatUptime(systemMetrics.system.uptime) : 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">
                      Since {systemMetrics ? format(new Date(Date.now() - systemMetrics.system.uptime * 1000), 'MMM dd, HH:mm') : 'N/A'}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">CPU Usage</p>
                    <p className="text-2xl font-bold">{systemMetrics?.cpu.usage || 0}%</p>
                    <p className="text-xs text-muted-foreground">
                      Load: {systemMetrics?.cpu.loadAverage['1m'] || 0}
                    </p>
                  </div>
                  <Cpu className="h-8 w-8 text-blue-600" />
                </div>
                <Progress value={systemMetrics?.cpu.usage || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Memory Usage</p>
                    <p className="text-2xl font-bold">{systemMetrics?.memory.usage || 0}%</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(systemMetrics?.memory.used || 0)} / {formatBytes(systemMetrics?.memory.total || 0)}
                    </p>
                  </div>
                  <MemoryStick className="h-8 w-8 text-green-600" />
                </div>
                <Progress value={systemMetrics?.memory.usage || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Disk Usage</p>
                    <p className="text-2xl font-bold">{systemMetrics?.disk.usage || 0}%</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(systemMetrics?.disk.used || 0)} / {formatBytes(systemMetrics?.disk.total || 0)}
                    </p>
                  </div>
                  <HardDrive className="h-8 w-8 text-orange-600" />
                </div>
                <Progress value={systemMetrics?.disk.usage || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Network Usage</p>
                    <p className="text-2xl font-bold">{systemMetrics?.network.usage?.total || 0} GB</p>
                    <p className="text-xs text-muted-foreground">
                      ↑ {systemMetrics?.network.usage?.tx || 0} GB ↓ {systemMetrics?.network.usage?.rx || 0} GB
                    </p>
                  </div>
                  <Network className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Service Health */}
          <Card>
            <CardHeader>
              <CardTitle>Service Health</CardTitle>
              <CardDescription>Status of critical system services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Database Service */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{serviceStatus?.services?.database?.name || 'Database'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(serviceStatus?.services?.database?.status || 'unknown')}
                      <Badge className={getStatusColor(serviceStatus?.services?.database?.status || 'unknown')}>
                        {(serviceStatus?.services?.database?.status || 'UNKNOWN').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Connections: {serviceStatus?.services?.database?.activeConnections || 0}</p>
                  </div>
                </div>

                {/* MQTT Service */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{serviceStatus?.services?.mqtt?.name || 'MQTT'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(serviceStatus?.services?.mqtt?.status || 'unknown')}
                      <Badge className={getStatusColor(serviceStatus?.services?.mqtt?.status || 'unknown')}>
                        {(serviceStatus?.services?.mqtt?.status || 'UNKNOWN').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Queue: {serviceStatus?.services?.mqtt?.pendingMessages || 0}</p>
                  </div>
                </div>

                {/* Redis Service */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{serviceStatus?.services?.redis?.name || 'Redis'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(serviceStatus?.services?.redis?.status || 'unknown')}
                      <Badge className={getStatusColor(serviceStatus?.services?.redis?.status || 'unknown')}>
                        {(serviceStatus?.services?.redis?.status || 'UNKNOWN').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* API Service */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{serviceStatus?.services?.api?.name || 'API'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(serviceStatus?.services?.api?.status || 'unknown')}
                      <Badge className={getStatusColor(serviceStatus?.services?.api?.status || 'unknown')}>
                        {(serviceStatus?.services?.api?.status || 'UNKNOWN').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Connections: {serviceStatus?.services?.api?.activeConnections || 0}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Device Status */}
          <Card>
            <CardHeader>
              <CardTitle>IoT Device Status</CardTitle>
              <CardDescription>Connected device monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{deviceMetrics?.summary.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Devices</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{deviceMetrics?.summary.online || 0}</p>
                  <p className="text-sm text-muted-foreground">Online</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{deviceMetrics?.summary.offline || 0}</p>
                  <p className="text-sm text-muted-foreground">Offline</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">{deviceMetrics?.alerts.offlineDevices || 0}</p>
                  <p className="text-sm text-muted-foreground">Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>Current system warnings and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts?.alerts.length ? (
                <div className="space-y-2">
                  {alerts.alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <AlertCircle className={`w-5 h-5 ${
                          alert.severity === 'critical' ? 'text-red-600' :
                          alert.severity === 'high' ? 'text-orange-600' :
                          'text-yellow-600'
                        }`} />
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                        </div>
                      </div>
                      <Badge variant={
                        alert.severity === 'critical' ? 'destructive' :
                        alert.severity === 'high' ? 'default' :
                        'secondary'
                      }>
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-600" />
                  <p>All systems operational</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  CPU Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Manufacturer</p>
                    <p className="font-medium">{systemMetrics?.cpu.manufacturer}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Model</p>
                    <p className="font-medium">{systemMetrics?.cpu.brand}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cores</p>
                    <p className="font-medium">{systemMetrics?.cpu.cores} ({systemMetrics?.cpu.physicalCores} physical)</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Speed</p>
                    <p className="font-medium">{systemMetrics?.cpu.speed} GHz (max: {systemMetrics?.cpu.speedMax} GHz)</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Load Average</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 border rounded">
                      <p className="text-xs text-muted-foreground">1m</p>
                      <p className="font-medium">{systemMetrics?.cpu.loadAverage['1m']}</p>
                    </div>
                    <div className="text-center p-2 border rounded">
                      <p className="text-xs text-muted-foreground">5m</p>
                      <p className="font-medium">{systemMetrics?.cpu.loadAverage['5m']}</p>
                    </div>
                    <div className="text-center p-2 border rounded">
                      <p className="text-xs text-muted-foreground">15m</p>
                      <p className="font-medium">{systemMetrics?.cpu.loadAverage['15m']}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Memory Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MemoryStick className="w-5 h-5" />
                  Memory Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="font-medium">{formatBytes(systemMetrics?.memory.total || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Used</p>
                    <p className="font-medium">{formatBytes(systemMetrics?.memory.used || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Free</p>
                    <p className="font-medium">{formatBytes(systemMetrics?.memory.free || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Available</p>
                    <p className="font-medium">{formatBytes(systemMetrics?.memory.available || 0)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Memory Usage</p>
                  <Progress value={systemMetrics?.memory.usage || 0} className="h-3" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Buffers: {formatBytes(systemMetrics?.memory.buffers || 0)} |
                    Cached: {formatBytes(systemMetrics?.memory.cached || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Disk Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Disk Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemMetrics?.disk.partitions.map((partition, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{partition.mount}</p>
                        <Badge variant="outline">{partition.type}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                        <div>
                          <p className="text-muted-foreground">Size</p>
                          <p className="font-medium">{formatBytes(partition.size)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Used</p>
                          <p className="font-medium">{formatBytes(partition.used)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Available</p>
                          <p className="font-medium">{formatBytes(partition.available)}</p>
                        </div>
                      </div>
                      <Progress value={partition.use} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">{partition.use}% used</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Network Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="w-5 h-5" />
                  Network Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemMetrics?.network.interfaces.slice(0, 3).map((iface, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{iface.iface}</p>
                        <Badge className={getStatusColor(iface.operstate)}>
                          {iface.operstate}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">IP4</p>
                          <p className="font-medium">{iface.ip4 || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">MAC</p>
                          <p className="font-medium">{iface.mac}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Database Service */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  {serviceStatus?.services?.database?.name || 'Database'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusIcon(serviceStatus?.services?.database?.status || 'unknown')}
                  <Badge className={getStatusColor(serviceStatus?.services?.database?.status || 'unknown')}>
                    {(serviceStatus?.services?.database?.status || 'UNKNOWN').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Active Connections</p>
                    <p className="font-medium">{serviceStatus?.services?.database?.activeConnections || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* MQTT Service */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="w-5 h-5" />
                  {serviceStatus?.services?.mqtt?.name || 'MQTT'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusIcon(serviceStatus?.services?.mqtt?.status || 'unknown')}
                  <Badge className={getStatusColor(serviceStatus?.services?.mqtt?.status || 'unknown')}>
                    {(serviceStatus?.services?.mqtt?.status || 'UNKNOWN').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Pending Messages</p>
                    <p className="font-medium">{serviceStatus?.services?.mqtt?.pendingMessages || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Queue Size</p>
                    <p className="font-medium">{serviceStatus?.services?.mqtt?.queueSize || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Redis Service */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  {serviceStatus?.services?.redis?.name || 'Redis'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusIcon(serviceStatus?.services?.redis?.status || 'unknown')}
                  <Badge className={getStatusColor(serviceStatus?.services?.redis?.status || 'unknown')}>
                    {(serviceStatus?.services?.redis?.status || 'UNKNOWN').toUpperCase()}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* API Service */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  {serviceStatus?.services?.api?.name || 'API'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusIcon(serviceStatus?.services?.api?.status || 'unknown')}
                  <Badge className={getStatusColor(serviceStatus?.services?.api?.status || 'unknown')}>
                    {(serviceStatus?.services?.api?.status || 'UNKNOWN').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Active Connections</p>
                    <p className="font-medium">{serviceStatus?.services?.api?.activeConnections || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Response Time</p>
                    <p className="font-medium">{serviceStatus?.services?.api?.responseTime || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Error Rate</p>
                    <p className="font-medium">{serviceStatus?.services?.api?.errorRate || 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{userMetrics?.summary.totalUsers || 0}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{userMetrics?.summary.activeUsers24h || 0}</p>
                <p className="text-sm text-muted-foreground">Active (24h)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{userMetrics?.summary.currentlyOnline || 0}</p>
                <p className="text-sm text-muted-foreground">Currently Online</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{userMetrics?.summary.todaysLogins || 0}</p>
                <p className="text-sm text-muted-foreground">Today's Logins</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent User Activity</CardTitle>
                <CardDescription>Latest user login/logout events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {userMetrics?.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <UserCheck className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium">{activity.name}</p>
                          <p className="text-sm text-muted-foreground">{activity.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">{activity.role}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(activity.lastLogin))} ago
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Statistics</CardTitle>
                <CardDescription>Login patterns and session metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{userMetrics?.statistics.loginRate || 0}</p>
                    <p className="text-sm text-muted-foreground">Logins/Hour</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{userMetrics?.statistics.averageSessionDuration || 0}m</p>
                    <p className="text-sm text-muted-foreground">Avg Session</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{userMetrics?.statistics.peakConcurrentUsers || 0}</p>
                    <p className="text-sm text-muted-foreground">Peak Concurrent</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{userMetrics?.summary.todaysLogins || 0}</p>
                    <p className="text-sm text-muted-foreground">Today</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{deviceMetrics?.summary.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total Devices</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{deviceMetrics?.summary.online || 0}</p>
                <p className="text-sm text-muted-foreground">Online</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{deviceMetrics?.summary.offline || 0}</p>
                <p className="text-sm text-muted-foreground">Offline</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{deviceMetrics?.summary.heartbeatHealthy || 0}</p>
                <p className="text-sm text-muted-foreground">Healthy Heartbeat</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Device List</CardTitle>
              <CardDescription>Real-time device status and connectivity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {deviceMetrics?.devices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(device.status)}
                      <div>
                        <p className="font-medium">{device.name}</p>
                        <p className="text-sm text-muted-foreground">{device.macAddress}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(device.status)}>
                        {device.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {device.timeSinceLastSeen ? `${device.timeSinceLastSeen}s ago` : 'Never'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{securityMetrics?.alerts.critical || 0}</p>
                <p className="text-sm text-muted-foreground">Critical Alerts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{securityMetrics?.alerts.high || 0}</p>
                <p className="text-sm text-muted-foreground">High Alerts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{securityMetrics?.alerts.medium || 0}</p>
                <p className="text-sm text-muted-foreground">Medium Alerts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{securityMetrics?.alerts.low || 0}</p>
                <p className="text-sm text-muted-foreground">Low Alerts</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Recent Failed Logins</h4>
                  {securityMetrics?.recentEvents.failedLogins.length ? (
                    <div className="space-y-1">
                      {securityMetrics.recentEvents.failedLogins.map((event, index) => (
                        <p key={index} className="text-sm text-muted-foreground">
                          {event.timestamp} - {event.ip} ({event.attempts} attempts)
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent failed logins</p>
                  )}
                </div>

                <div>
                  <h4 className="font-medium mb-2">Unauthorized Access Attempts</h4>
                  {securityMetrics?.recentEvents.unauthorizedAccess.length ? (
                    <div className="space-y-1">
                      {securityMetrics.recentEvents.unauthorizedAccess.map((event, index) => (
                        <p key={index} className="text-sm text-muted-foreground">
                          {event.timestamp} - {event.resource} from {event.ip}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No unauthorized access attempts</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpu">CPU Usage</SelectItem>
                <SelectItem value="memory">Memory Usage</SelectItem>
                <SelectItem value="disk">Disk Usage</SelectItem>
                <SelectItem value="network_rx">Network RX</SelectItem>
                <SelectItem value="network_tx">Network TX</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => fetchHistoricalData(selectedMetric)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                  <BarChart3 className="w-5 h-5 text-primary" />
                </div>
                Historical Data - {selectedMetric.toUpperCase()}
              </CardTitle>
              <CardDescription>{historicalData?.period || '24 hours'} trend with real-time data</CardDescription>
            </CardHeader>
            <CardContent>
              {historicalData?.data && historicalData.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={historicalData.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.1}/>
                      </linearGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="hsl(var(--border))" 
                      opacity={0.2}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => format(new Date(value), 'HH:mm')}
                      interval="preserveStartEnd"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                      tickLine={false}
                    />
                    <YAxis
                      label={{ 
                        value: selectedMetric.includes('network') ? 'Bytes/s' : 'Percentage (%)', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { fill: '#3b82f6', fontSize: 12, fontWeight: 600 }
                      }}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                      tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={(value) => format(new Date(value), 'MMM dd, HH:mm:ss')}
                      formatter={(value: number) => [
                        `${value.toFixed(2)}${selectedMetric.includes('network') ? ' B/s' : '%'}`,
                        selectedMetric.toUpperCase().replace('_', ' ')
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
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      fill="url(#historicalGradient)"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ 
                        r: 6, 
                        fill: '#3b82f6',
                        stroke: 'hsl(var(--background))',
                        strokeWidth: 3,
                        filter: 'url(#glow)'
                      }}
                      animationDuration={1200}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No historical data available for {selectedMetric}</p>
                    <p className="text-sm text-muted-foreground mt-2">Data will appear as the system collects metrics over time</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemHealthMonitoring;
