// CostVersionManager.tsx
// Electricity Rate Management Component
// Features: View rate history, create new rates, trigger recalculation
// Supports global and classroom-specific rates with effective date versioning

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  DollarSign, 
  Plus, 
  Calendar, 
  RefreshCw, 
  Info, 
  AlertTriangle,
  CheckCircle2,
  Building2,
  Globe
} from 'lucide-react';
import { apiService } from '@/services/api';

interface CostVersion {
  id: string;
  cost_per_kwh: number;
  effective_from: string;
  effective_until: string | null;
  classroom: string | null;
  scope: 'global' | 'classroom' | 'device';
  notes?: string;
  created_by: {
    user_id?: string;
    username: string;
  };
  created_at: string;
}

interface CostVersionManagerProps {
  classroom?: string;
}

const CostVersionManager: React.FC<CostVersionManagerProps> = ({ classroom }) => {
  const [versions, setVersions] = useState<CostVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRecalcDialog, setShowRecalcDialog] = useState(false);
  
  // Create form state
  const [newCostPerKwh, setNewCostPerKwh] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [selectedClassroom, setSelectedClassroom] = useState(classroom || '');
  const [notes, setNotes] = useState('');
  const [isGlobal, setIsGlobal] = useState(true);
  
  // Recalculation state
  const [recalcStartDate, setRecalcStartDate] = useState('');
  const [recalcEndDate, setRecalcEndDate] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<any>(null);
  
  // Classrooms for dropdown
  const [classrooms, setClassrooms] = useState<string[]>([]);

  useEffect(() => {
    fetchVersions();
    fetchClassrooms();
  }, [classroom]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const queryParams = classroom ? `?classroom=${classroom}` : '';
      const response = await apiService.get(`/api/power-analytics/cost-versions${queryParams}`);
      setVersions(response.data.versions || []);
    } catch (error) {
      console.error('Error fetching cost versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassrooms = async () => {
    try {
      const response = await apiService.get('/api/devices');
      const uniqueClassrooms = [...new Set(response.data.map((d: any) => d.classroom).filter(Boolean))];
      setClassrooms(uniqueClassrooms as string[]);
    } catch (error) {
      console.error('Error fetching classrooms:', error);
    }
  };

  const handleCreateVersion = async () => {
    try {
      const payload = {
        cost_per_kwh: parseFloat(newCostPerKwh),
        effective_from: effectiveFrom,
        classroom: isGlobal ? null : selectedClassroom,
        notes
      };

      await apiService.post('/api/power-analytics/cost-versions', payload);
      
      // Reset form
      setNewCostPerKwh('');
      setEffectiveFrom('');
      setNotes('');
      setIsGlobal(true);
      setSelectedClassroom('');
      setShowCreateDialog(false);
      
      // Refresh list
      await fetchVersions();
      
      // Show success message
      alert('New electricity rate created successfully!');
    } catch (error) {
      console.error('Error creating cost version:', error);
      alert('Failed to create new rate. Please try again.');
    }
  };

  const handleRecalculate = async () => {
    if (!recalcStartDate || !recalcEndDate || (!isGlobal && !selectedClassroom)) {
      alert('Please fill all required fields');
      return;
    }

    try {
      setRecalculating(true);
      const payload = {
        classroom: isGlobal ? 'all' : selectedClassroom,
        start: recalcStartDate,
        end: recalcEndDate
      };

      const response = await apiService.post('/api/power-analytics/recalculate', payload);
      setRecalcResult(response.data);
      
      alert('Recalculation completed successfully!');
    } catch (error) {
      console.error('Error recalculating:', error);
      alert('Failed to recalculate. Please try again.');
    } finally {
      setRecalculating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isCurrentVersion = (version: CostVersion) => {
    const now = new Date();
    const effectiveFrom = new Date(version.effective_from);
    const effectiveUntil = version.effective_until ? new Date(version.effective_until) : null;
    
    return effectiveFrom <= now && (!effectiveUntil || effectiveUntil > now);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Electricity Rate Management
              </CardTitle>
              <CardDescription>
                {classroom 
                  ? `Manage rates for ${classroom}` 
                  : 'Manage global and classroom-specific electricity rates'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={showRecalcDialog} onOpenChange={setShowRecalcDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Recalculate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Recalculate Energy Costs</DialogTitle>
                    <DialogDescription>
                      Recalculate historical energy costs with updated rates
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warning</AlertTitle>
                    <AlertDescription>
                      This will recalculate all energy consumption costs for the selected date range.
                      This operation may take a few minutes.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Scope</Label>
                      <Select value={isGlobal ? 'global' : 'classroom'} onValueChange={(v) => setIsGlobal(v === 'global')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">All Classrooms</SelectItem>
                          <SelectItem value="classroom">Specific Classroom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {!isGlobal && (
                      <div className="space-y-2">
                        <Label>Classroom</Label>
                        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select classroom" />
                          </SelectTrigger>
                          <SelectContent>
                            {classrooms.map((cr) => (
                              <SelectItem key={cr} value={cr}>{cr}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={recalcStartDate}
                        onChange={(e) => setRecalcStartDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={recalcEndDate}
                        onChange={(e) => setRecalcEndDate(e.target.value)}
                      />
                    </div>

                    {recalcResult && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Success</AlertTitle>
                        <AlertDescription>
                          Recalculated {recalcResult.daily_aggregates} daily aggregates and {recalcResult.monthly_aggregates} monthly aggregates
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRecalcDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleRecalculate} disabled={recalculating}>
                      {recalculating ? 'Recalculating...' : 'Recalculate'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Rate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Electricity Rate</DialogTitle>
                    <DialogDescription>
                      Set a new electricity rate with an effective date
                    </DialogDescription>
                  </DialogHeader>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Rate Versioning</AlertTitle>
                    <AlertDescription>
                      Previous rates will be automatically expired. Historical data will not be changed unless you trigger a recalculation.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="cost">Cost per kWh (₹)</Label>
                      <Input
                        id="cost"
                        type="number"
                        step="0.01"
                        placeholder="7.50"
                        value={newCostPerKwh}
                        onChange={(e) => setNewCostPerKwh(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="effective">Effective From</Label>
                      <Input
                        id="effective"
                        type="datetime-local"
                        value={effectiveFrom}
                        onChange={(e) => setEffectiveFrom(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Scope</Label>
                      <Select value={isGlobal ? 'global' : 'classroom'} onValueChange={(v) => setIsGlobal(v === 'global')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">Global (All Classrooms)</SelectItem>
                          <SelectItem value="classroom">Classroom-Specific</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {!isGlobal && (
                      <div className="space-y-2">
                        <Label>Classroom</Label>
                        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select classroom" />
                          </SelectTrigger>
                          <SelectContent>
                            {classrooms.map((cr) => (
                              <SelectItem key={cr} value={cr}>{cr}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        placeholder="e.g., New rate as per electricity board notification"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateVersion}>
                      Create Rate
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading rates...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No electricity rates configured. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableCaption>Electricity rate history</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate (₹/kWh)</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective Until</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="font-medium">
                      ₹{version.cost_per_kwh.toFixed(2)}
                    </TableCell>
                    <TableCell>{formatDate(version.effective_from)}</TableCell>
                    <TableCell>
                      {version.effective_until ? formatDate(version.effective_until) : 'Active'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {version.scope === 'global' ? (
                          <>
                            <Globe className="h-3 w-3" />
                            Global
                          </>
                        ) : (
                          <>
                            <Building2 className="h-3 w-3" />
                            {version.classroom}
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isCurrentVersion(version) ? (
                        <Badge className="bg-green-500">Current</Badge>
                      ) : (
                        <Badge variant="secondary">Expired</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {version.created_by.username}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How Rate Versioning Works</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            • Electricity rates are versioned with effective dates to track historical changes
          </p>
          <p>
            • When you create a new rate, previous rates are automatically expired
          </p>
          <p>
            • Historical consumption data uses the rate that was active at that time
          </p>
          <p>
            • Use "Recalculate" to update historical costs if you need to apply new rates retroactively
          </p>
          <p>
            • Classroom-specific rates override global rates for that classroom
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default CostVersionManager;
