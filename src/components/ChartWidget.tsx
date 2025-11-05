import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WidgetProps } from '@/components/DashboardGrid';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

/**
 * Chart types
 */
export type ChartType = 'line' | 'area' | 'bar' | 'pie';

/**
 * Chart data point
 */
export interface ChartDataPoint {
  name: string;
  value?: number;
  [key: string]: string | number | undefined;
}

/**
 * Chart widget props
 */
interface ChartWidgetProps extends WidgetProps {
  title: string;
  description?: string;
  data: ChartDataPoint[];
  type?: ChartType;
  dataKeys?: string[];
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  allowTypeChange?: boolean;
  onExport?: () => void;
}

/**
 * Modern gradient colors with tech-visual appeal
 */
const DEFAULT_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Green
];

const GRADIENT_COLORS = [
  { start: '#3b82f6', end: '#1d4ed8' }, // Blue gradient
  { start: '#8b5cf6', end: '#6d28d9' }, // Purple gradient
  { start: '#ec4899', end: '#be185d' }, // Pink gradient
  { start: '#f59e0b', end: '#d97706' }, // Amber gradient
  { start: '#10b981', end: '#059669' }, // Green gradient
];

/**
 * Enhanced custom tooltip with modern styling
 */
function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-4 min-w-[200px]">
      <p className="text-sm font-semibold mb-2 text-foreground border-b border-border/30 pb-2">
        {label}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full shadow-sm" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {entry.name}:
              </span>
            </div>
            <span className="text-sm font-bold" style={{ color: entry.color }}>
              {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Chart widget component
 */
export function ChartWidget({
  title,
  description,
  data,
  type: initialType = 'line',
  dataKeys = ['value'],
  colors = DEFAULT_COLORS,
  showLegend = true,
  showGrid = true,
  allowTypeChange = true,
  onExport,
  isEditing,
}: ChartWidgetProps) {
  const [chartType, setChartType] = useState<ChartType>(initialType);

  // Export chart data as CSV
  const handleExport = () => {
    if (onExport) {
      onExport();
      return;
    }

    // Default CSV export
    const headers = ['name', ...dataKeys];
    const rows = data.map((point) =>
      headers.map((key) => point[key] || '').join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render chart based on type
  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`lineGradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].start} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].end} stopOpacity={0.3} />
                  </linearGradient>
                ))}
              </defs>
              {showGrid && (
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="hsl(var(--border))" 
                  opacity={0.2}
                  vertical={false}
                />
              )}
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }} />
              {showLegend && (
                <Legend 
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  iconType="circle"
                />
              )}
              {dataKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                  strokeWidth={3}
                  dot={{ 
                    r: 4, 
                    fill: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
                    strokeWidth: 2,
                    stroke: 'hsl(var(--background))'
                  }}
                  activeDot={{ 
                    r: 6,
                    fill: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
                    stroke: 'hsl(var(--background))',
                    strokeWidth: 3
                  }}
                  animationDuration={1000}
                  animationBegin={index * 100}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`areaGradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].start} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].end} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              {showGrid && (
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="hsl(var(--border))" 
                  opacity={0.2}
                  vertical={false}
                />
              )}
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '5 5' }} />
              {showLegend && (
                <Legend 
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  iconType="circle"
                />
              )}
              {dataKeys.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                  strokeWidth={2.5}
                  fill={`url(#areaGradient-${key})`}
                  animationDuration={1200}
                  animationBegin={index * 100}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`barGradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].start} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].end} stopOpacity={0.7} />
                  </linearGradient>
                ))}
              </defs>
              {showGrid && (
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="hsl(var(--border))" 
                  opacity={0.2}
                  vertical={false}
                />
              )}
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.1 }} />
              {showLegend && (
                <Legend 
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  iconType="square"
                />
              )}
              {dataKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`url(#barGradient-${key})`}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={60}
                  animationDuration={800}
                  animationBegin={index * 100}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((entry, index) => (
                  <linearGradient key={`gradient-${index}`} id={`pieGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].start} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={GRADIENT_COLORS[index % GRADIENT_COLORS.length].end} stopOpacity={0.7} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={data}
                dataKey={dataKeys[0]}
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="80%"
                innerRadius="50%"
                paddingAngle={3}
                animationDuration={1000}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1 }}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={`url(#pieGradient-${index})`}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {showLegend && (
                <Legend 
                  wrapperStyle={{ fontSize: '12px' }}
                  iconType="circle"
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="h-full flex flex-col border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            {description && (
              <CardDescription className="text-xs mt-1.5 text-muted-foreground">{description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {allowTypeChange && !isEditing && (
              <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                <SelectTrigger className="h-8 w-24 border-border/50 bg-background/50 hover:bg-background transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border/50">
                  <SelectItem value="line">Line</SelectItem>
                  <SelectItem value="area">Area</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="pie">Pie</SelectItem>
                </SelectContent>
              </Select>
            )}
            {!isEditing && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={handleExport}
                title="Export data"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <div className="h-full min-h-[200px]">
          {renderChart()}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Energy consumption chart widget
 */
export function EnergyChartWidget(props: WidgetProps) {
  const data: ChartDataPoint[] = [
    { name: 'Mon', consumption: 245, cost: 42 },
    { name: 'Tue', consumption: 287, cost: 49 },
    { name: 'Wed', consumption: 312, cost: 53 },
    { name: 'Thu', consumption: 298, cost: 51 },
    { name: 'Fri', consumption: 265, cost: 45 },
    { name: 'Sat', consumption: 198, cost: 34 },
    { name: 'Sun', consumption: 221, cost: 38 },
  ];

  return (
    <ChartWidget
      title="Energy Consumption"
      description="Last 7 days"
      data={data}
      dataKeys={['consumption', 'cost']}
      type="area"
      {...props}
    />
  );
}

/**
 * Device status chart widget
 */
export function DeviceStatusChartWidget(props: WidgetProps) {
  const data: ChartDataPoint[] = [
    { name: 'Online', value: 124 },
    { name: 'Offline', value: 18 },
    { name: 'Error', value: 7 },
    { name: 'Maintenance', value: 3 },
  ];

  return (
    <ChartWidget
      title="Device Status"
      description="Current distribution"
      data={data}
      type="pie"
      allowTypeChange={false}
      {...props}
    />
  );
}

/**
 * Temperature trend chart widget
 */
export function TemperatureTrendWidget(props: WidgetProps) {
  const data: ChartDataPoint[] = [
    { name: '00:00', temp: 22.3, humidity: 45 },
    { name: '04:00', temp: 21.8, humidity: 48 },
    { name: '08:00', temp: 23.1, humidity: 42 },
    { name: '12:00', temp: 25.4, humidity: 38 },
    { name: '16:00', temp: 26.2, humidity: 35 },
    { name: '20:00', temp: 24.1, humidity: 40 },
    { name: '24:00', temp: 22.7, humidity: 44 },
  ];

  return (
    <ChartWidget
      title="Temperature & Humidity"
      description="Last 24 hours"
      data={data}
      dataKeys={['temp', 'humidity']}
      type="line"
      {...props}
    />
  );
}

/**
 * Response time chart widget
 */
export function ResponseTimeChartWidget(props: WidgetProps) {
  const data: ChartDataPoint[] = [
    { name: '00:00', response: 145 },
    { name: '04:00', response: 132 },
    { name: '08:00', response: 189 },
    { name: '12:00', response: 221 },
    { name: '16:00', response: 198 },
    { name: '20:00', response: 167 },
    { name: '24:00', response: 142 },
  ];

  return (
    <ChartWidget
      title="Response Time"
      description="Average (ms)"
      data={data}
      type="bar"
      {...props}
    />
  );
}
