import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, TrendingUp, Zap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from 'recharts';
import { energyAPI } from '@/services/api';

type ViewMode = 'day' | 'month' | 'year';

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  selectedClassroom: string;
  selectedDevice: string;
  todayAnchor?: { consumption?: number; cost?: number } | null;
  monthAnchor?: { consumption?: number; cost?: number } | null;
  electricityRate: number;
}

interface ChartPoint {
  label: string;
  timestamp: string;
  consumption: number;
  cost: number;
}

const EnergyCharts: React.FC<Props> = ({
  viewMode,
  onViewModeChange,
  selectedClassroom,
  selectedDevice,
  todayAnchor,
  monthAnchor,
  electricityRate
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChartPoint[]>([]);

  const isFiltered = selectedClassroom !== 'all' || selectedDevice !== 'all';

  const loadData = async () => {
    try {
      setLoading(true);
      const now = new Date();
      const classroom = selectedClassroom !== 'all' ? selectedClassroom : undefined;
      const deviceId = selectedDevice !== 'all' ? selectedDevice : undefined;

      let raw: ChartPoint[] = [];
      if (viewMode === 'day') {
        const dateStr = now.toISOString().slice(0, 10);
        const res = await energyAPI.hourlyBreakdown(dateStr, classroom, deviceId);
        raw = (res.data?.buckets || []).map((b: any) => ({
          label: String(b.hour).padStart(2, '0'),
          timestamp: b.start,
          consumption: b.consumption_kwh || 0,
          cost: b.cost || 0
        }));
      } else if (viewMode === 'month') {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const res = await energyAPI.monthlyBreakdown(year, month, classroom, deviceId);
        raw = (res.data?.days || []).map((d: any) => ({
          label: String(new Date(d.date).getDate()),
          timestamp: d.date,
          consumption: d.kwh || 0,
          cost: d.cost || 0
        }));
      } else {
        const year = now.getFullYear();
        const res = await energyAPI.yearlyBreakdown(year, classroom);
        raw = (res.data?.months || []).map((m: any) => ({
          label: new Date(year, m.month - 1, 1).toLocaleString('default', { month: 'short' }),
          timestamp: `${year}-${String(m.month).padStart(2, '0')}-01`,
          consumption: m.kwh || 0,
          cost: m.cost || 0
        }));
      }

      // Normalize to anchors so cards and charts match (for Day/Month)
      const totals = raw.reduce((acc, p) => {
        acc.kwh += p.consumption;
        acc.cost += p.cost;
        return acc;
      }, { kwh: 0, cost: 0 });

      let refKwh = totals.kwh;
      let refCost = totals.cost;
      if (viewMode === 'day' && todayAnchor) {
        refKwh = todayAnchor.consumption ?? totals.kwh;
        refCost = todayAnchor.cost ?? totals.cost;
      }
      if (viewMode === 'month' && monthAnchor) {
        refKwh = monthAnchor.consumption ?? totals.kwh;
        refCost = monthAnchor.cost ?? totals.cost;
      }

      const kwhScale = totals.kwh > 0 && refKwh > 0 ? refKwh / totals.kwh : 1;
      const costScale = totals.cost > 0 && refCost > 0 ? refCost / totals.cost : 1;

      const adjusted = raw.map(p => ({
        ...p,
        consumption: Math.abs(kwhScale - 1) > 0.02 ? p.consumption * kwhScale : p.consumption,
        cost: Math.abs(costScale - 1) > 0.02 ? p.cost * costScale : p.cost
      }));

      setData(adjusted);
    } catch (e) {
      console.error('[EnergyCharts] Failed to load data:', e);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedClassroom, selectedDevice, todayAnchor?.consumption, monthAnchor?.consumption]);

  const title = useMemo(() => {
    if (viewMode === 'day') return '24h Energy & Cost';
    if (viewMode === 'month') return 'Daily Energy & Cost (This Month)';
    return 'Monthly Energy & Cost (This Year)';
  }, [viewMode]);

  const subtitle = useMemo(() => {
    if (viewMode === 'day') return 'Today’s hour-by-hour power usage and bill';
    if (viewMode === 'month') return 'Per-day breakdown for the current month';
    return 'Per-month breakdown for the current year';
  }, [viewMode]);

  // Totals + derived metrics (computed after scaling so matches visual)
  const totals = useMemo(() => {
    const totalKwh = data.reduce((s, p) => s + p.consumption, 0);
    const totalCost = data.reduce((s, p) => s + p.cost, 0);
    const avgPerUnit = data.length > 0 ? totalKwh / data.length : 0; // hour/day/month depending on view
    return {
      kwh: totalKwh,
      cost: totalCost,
      avg: avgPerUnit
    };
  }, [data]);

  // Friendly unit label for average
  const avgLabel = viewMode === 'day' ? 'avg / hour' : viewMode === 'month' ? 'avg / day' : 'avg / month';

  // Custom themed tooltip component (shared)
  const ThemedTooltip = ({ active, payload, label, mode }: any) => {
    if (!active || !payload || !payload.length) return null;
    // Find consumption & cost values
    const point: any = payload[0].payload;
    return (
      <div className="rounded-lg shadow-xl border bg-[hsl(var(--card))] backdrop-blur-sm px-3 py-2 text-xs space-y-1">
        <div className="font-semibold text-[hsl(var(--foreground))] text-sm border-b pb-1">{label}</div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-blue-600 dark:text-blue-400 font-medium">{point.consumption.toFixed(3)} kWh</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">₹{point.cost.toFixed(2)}</span>
        </div>
        {mode === 'energy' && (
          <div className="text-[10px] text-muted-foreground">Cost/kWh ≈ ₹{(point.cost / (point.consumption || 1)).toFixed(2)}</div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              {title}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm mt-2">{subtitle}</CardDescription>
          </div>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <Button variant={viewMode==='day'?'default':'ghost'} size="sm" onClick={() => onViewModeChange('day')}>Day</Button>
            <Button variant={viewMode==='month'?'default':'ghost'} size="sm" onClick={() => onViewModeChange('month')}>Month</Button>
            <Button variant={viewMode==='year'?'default':'ghost'} size="sm" onClick={() => onViewModeChange('year')}>Year</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-72 gap-2">
            <Activity className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading chart…</p>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="mb-4 flex justify-center">
              <div className="p-4 rounded-full bg-muted/30">
                <TrendingUp className="w-12 h-12 opacity-30" />
              </div>
            </div>
            <p className="text-lg font-medium mb-1">No data available</p>
            <p className="text-sm">Historical energy data will appear here</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Energy (kWh) */}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data}>
                <defs>
                  <linearGradient id="kwh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} angle={viewMode==='year'?0:-45} textAnchor={viewMode==='year'?'middle':'end'} height={viewMode==='year'?30:60} />
                <YAxis label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 12 }} />
                <Tooltip content={<ThemedTooltip mode="energy" />} />
                <Legend formatter={(v) => v==='consumption'?'Energy (kWh)': v==='cost'?'Cost (₹)': v} />
                <Bar dataKey="consumption" name="consumption" fill="url(#kwh)" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Cost (₹) */}
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} angle={viewMode==='year'?0:-45} textAnchor={viewMode==='year'?'middle':'end'} height={viewMode==='year'?30:60} />
                <YAxis label={{ value: 'Cost (₹)', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 12 }} />
                <Tooltip content={<ThemedTooltip mode="cost" />} />
                <Legend />
                <Line type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} name="cost" />
              </LineChart>
            </ResponsiveContainer>

            {/* View Totals Footer */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-muted/40 border">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Total {viewMode === 'day' ? 'Day' : viewMode === 'month' ? 'Month' : 'Year'} Consumption</span>
                <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {totals.kwh.toFixed(3)} kWh
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Cost</span>
                <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  ₹{totals.cost.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{avgLabel}</span>
                <span className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
                  {totals.avg.toFixed(3)} kWh
                </span>
              </div>
            </div>
            {isFiltered && (
              <div className="text-[10px] mt-1 text-muted-foreground">Filtered totals reflect selected classroom/device.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyCharts;
