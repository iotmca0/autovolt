// Safe capitalize helper
function capitalize(str: unknown): string {
  return typeof str === 'string' && str.length > 0
    ? str.charAt(0).toUpperCase() + str.slice(1)
    : '';
}

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Zap, Settings, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useCustomMasterSwitches } from '@/hooks/useCustomMasterSwitches';
import { useDevices } from '@/hooks/useDevices';
import { useToast } from '@/hooks/use-toast';

interface MasterSwitchCardProps {
  totalSwitches?: number; // legacy external aggregate
  activeSwitches?: number; // legacy external aggregate
  offlineDevices?: number;
  onMasterToggle: (state: boolean) => void;
  isBusy?: boolean; // bulk operation in-flight
}

export const MasterSwitchCard: React.FC<MasterSwitchCardProps> = ({
  totalSwitches: externalTotal,
  activeSwitches: externalActive,
  offlineDevices = 0,
  onMasterToggle,
  isBusy = false
}) => {
  const { devices } = useDevices();
  // Derive authoritative live counts from devices to avoid cross-page divergence with stale stats
  const derivedTotal = devices.reduce((sum, d) => sum + d.switches.length, 0);
  const derivedActive = devices.reduce((sum, d) => sum + d.switches.filter(sw => sw.state).length, 0);
  const totalSwitches = derivedTotal || externalTotal || 0;
  const activeSwitches = derivedActive || externalActive || 0;
  if (externalTotal !== undefined && externalTotal !== derivedTotal && import.meta.env.DEV) {
    console.debug('[MasterSwitchCard] external vs derived mismatch', { externalTotal, derivedTotal, externalActive, derivedActive });
  }
  const { customSwitches, addCustomSwitch, toggleCustomSwitch, deleteCustomSwitch, toggleOnlineDevicesInCustomSwitch } = useCustomMasterSwitches();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // Derived master state: on only if every switch is on. We keep a local echo only to show immediate UI while server updates.
  const [forcedState, setForcedState] = useState<boolean | null>(null);
  const [newSwitch, setNewSwitch] = useState({
    name: '',
    accessCode: '',
    selectedSwitches: [] as string[],
    _search: '',
    _classroom: '',
    _type: ''
  });
  const { toast } = useToast();

  const allMasterOn = totalSwitches > 0 && activeSwitches === totalSwitches;
  const allOff = activeSwitches === 0;
  const mixed = !allOff && !allMasterOn;

  // Whenever upstream counts change, clear forced override so UI reflects real aggregate.
  useEffect(() => { setForcedState(null); }, [activeSwitches, totalSwitches]);
  const effectiveChecked = forcedState !== null ? forcedState : allMasterOn;

  // Device status counts
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineList = devices.filter(d => d.status && d.status !== 'online');
  const totalDevices = devices.length;

  // Get all available switches from devices
  const allSwitches = devices.flatMap(device =>
    device.switches.map(sw => ({
      id: `${device.id}-${sw.id}`,
      name: `${device.name} - ${sw.name}`,
      deviceId: device.id,
      switchId: sw.id
    }))
  );

  const handleCreateCustomSwitch = () => {
    if (!newSwitch.name || newSwitch.selectedSwitches.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide a name and select at least one switch",
        variant: "destructive"
      });
      return;
    }

    addCustomSwitch({
      name: newSwitch.name,
      accessCode: newSwitch.accessCode || undefined,
      switches: newSwitch.selectedSwitches
    });

    setNewSwitch({ name: '', accessCode: '', selectedSwitches: [], _search: '', _classroom: '', _type: '' });
    setShowCreateDialog(false);

    toast({
      title: "Custom Switch Created",
      description: `"${newSwitch.name}" has been created successfully`
    });
  };

  const handleToggleCustomSwitch = (switchId: string, state: boolean) => {
    toggleCustomSwitch(switchId, state);
    toast({
      title: state ? "Group Switches On" : "Group Switches Off",
      description: `All switches in the group have been turned ${state ? 'on' : 'off'}`
    });
  };

  return (
    <div className="space-y-4">
      {/* Master Switch Card */}
      <Card className="glass border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Zap className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="truncate">Master Switch</span>
            {onlineDevices > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 whitespace-nowrap flex-shrink-0">
                {onlineDevices} Online
              </span>
            )}
            {offlineDevices > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 cursor-help whitespace-nowrap flex-shrink-0">
                      {offlineDevices} Offline
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Offline Devices:</p>
                      {offlineList.length === 0 && <p>None</p>}
                                            {offlineList.slice(0, 8).map(d => (
                        <p key={d.id} className="truncate" title={d.name}>{d.name}</p>
                      ))}
                      {offlineList.length > 8 && (
                        <p className="italic">+ {offlineList.length - 8} more...</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground break-words">
                Control all {totalSwitches} switches at once
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                Currently {activeSwitches} of {totalSwitches} switches are on | {onlineDevices}/{totalDevices} devices online
              </p>
              {onlineDevices === 0 && (
                <p className="text-xs text-red-600 mt-1 break-words">All devices offline — master control disabled.</p>
              )}
              <div className="flex items-center gap-3 flex-wrap mt-2">
                {mixed && !isBusy && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 border border-amber-300 whitespace-nowrap">
                    Mixed
                  </span>
                )}
                {isBusy && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700 border border-blue-300 animate-pulse whitespace-nowrap">
                    Syncing
                  </span>
                )}
                <Switch
                  checked={effectiveChecked}
                  onCheckedChange={(checked) => {
                    // Master is OFF-only: block ON attempts; allow OFF.
                    if (isBusy) return;
                    if (checked) {
                      // Disallow turning ON from master; show hint
                      toast({ title: 'Master ON disabled', description: 'Use individual or group switches to turn ON. Master only turns OFF.', variant: 'default' });
                      // snap back to previous aggregate without changing
                      setForcedState(null);
                      return;
                    }
                    // OFF path
                    setForcedState(false);
                    if (!allOff) onMasterToggle(false);
                  }}
                  disabled={onlineDevices === 0 || isBusy}
                  className="data-[state=checked]:bg-primary"
                />
                {(mixed || allMasterOn) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={onlineDevices === 0 || isBusy}
                    onClick={() => { if (!isBusy) { setForcedState(false); onMasterToggle(false); } }}
                    className="whitespace-nowrap"
                  >
                    Turn all off
                  </Button>
                )}
              </div>
            </div>
            {/* Removed secondary All Off/Mixed toggle for clarity */}
          </div>
        </CardContent>
      </Card>

      {/* Custom Master Switches */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Custom Master Switches</h3>
          <div className="ml-auto">
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Group
            </Button>
          </div>
        </div>

        {customSwitches.length === 0 ? (
          <Card className="glass">
            <CardContent className="text-center py-8">
              <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No custom master switches created yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customSwitches.map((customSwitch) => (
              <Card key={customSwitch.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <h4 className="font-medium truncate flex-1" title={customSwitch.name}>{customSwitch.name}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(customSwitch.id)}
                      className="text-destructive hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {/* Confirm Delete Custom Switch Dialog */}
                    <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Custom Master Switch</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete this custom master switch group? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => {
                                if (confirmDeleteId) {
                                  deleteCustomSwitch(confirmDeleteId);
                                  setConfirmDeleteId(null);
                                  toast({ title: 'Custom Master Switch Deleted', description: 'The group has been deleted.' });
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {customSwitch.switches.length} switches in this group
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {customSwitch.isActive ? 'Group On' : 'Group Off'}
                    </span>
                    <Switch
                      checked={!!customSwitch.isActive}
                      onCheckedChange={async (checked) => {
                        const offlineDevices = customSwitch.switches.filter(sid => {
                          const [deviceId] = sid.split('-');
                          const device = devices.find(d => d.id === deviceId);
                          return device && device.status !== 'online';
                        });
                        const onlineDevices = customSwitch.switches.filter(sid => {
                          const [deviceId] = sid.split('-');
                          const device = devices.find(d => d.id === deviceId);
                          return device && device.status === 'online';
                        });
                        if (offlineDevices.length > 0) {
                          toast({
                            title: 'Some Devices Offline',
                            description: `Offline: ${offlineDevices.map(sid => {
                              const [deviceId] = sid.split('-');
                              const device = devices.find(d => d.id === deviceId);
                              return device?.name || deviceId;
                            }).join(', ')}`,
                            variant: 'destructive'
                          });
                        }
                        if (onlineDevices.length > 0) {
                          // Only toggle online devices
                          await toggleOnlineDevicesInCustomSwitch(customSwitch.id, checked, onlineDevices);
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Custom Switch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Master Switch</DialogTitle>
            <DialogDescription>
              Create a custom group of switches that can be controlled together as a master switch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="switch-name">Group Name</Label>
              <Input
                id="switch-name"
                value={newSwitch.name || ''}
                onChange={(e) => setNewSwitch({ ...newSwitch, name: e.target.value })}
                placeholder="e.g., Living Room Lights"
              />
            </div>

            <div>
              <Label htmlFor="access-code">Access Code (Optional)</Label>
              <Input
                id="access-code"
                type="password"
                value={newSwitch.accessCode || ''}
                onChange={(e) => setNewSwitch({ ...newSwitch, accessCode: e.target.value })}
                placeholder="Enter access code for security"
              />
            </div>

            <div>
              <Label>Select Switches to Control</Label>
              <Input
                className="mt-2 mb-2"
                placeholder="Search switches..."
                value={newSwitch._search || ''}
                onChange={e => setNewSwitch({ ...newSwitch, _search: e.target.value })}
              />
              <div className="flex gap-2 mb-2">
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={newSwitch._classroom || ''}
                  onChange={e => setNewSwitch({ ...newSwitch, _classroom: e.target.value })}
                >
                  <option value="">Select Classroom</option>
                  {[...new Set(allSwitches.map(sw => sw.name.split(' - ')[0]))].map(classroom => (
                    <option key={classroom} value={classroom}>{classroom}</option>
                  ))}
                </select>
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={newSwitch._type || ''}
                  onChange={e => setNewSwitch({ ...newSwitch, _type: e.target.value })}
                >
                  <option value="">Select Type</option>
                  {[...new Set(devices.flatMap(d => d.switches.map(sw => sw.type)))].map(type => (
                    <option key={type ?? 'unknown'} value={type}>{capitalize(type)}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="select-all-switches"
                    checked={(() => {
                      const filtered = allSwitches
                        .filter(sw => !newSwitch._search || sw.name.toLowerCase().includes(newSwitch._search.toLowerCase()))
                        .filter(sw => !newSwitch._classroom || sw.name.split(' - ')[0] === newSwitch._classroom)
                        .filter(sw => !newSwitch._type || devices.find(d => d.id === sw.deviceId)?.switches.find(s => s.id === sw.switchId)?.type === newSwitch._type);
                      return filtered.length > 0 && filtered.every(sw => newSwitch.selectedSwitches.includes(sw.id));
                    })()}
                    onChange={e => {
                      const filtered = allSwitches
                        .filter(sw => !newSwitch._search || sw.name.toLowerCase().includes(newSwitch._search.toLowerCase()))
                        .filter(sw => !newSwitch._classroom || sw.name.split(' - ')[0] === newSwitch._classroom)
                        .filter(sw => !newSwitch._type || devices.find(d => d.id === sw.deviceId)?.switches.find(s => s.id === sw.switchId)?.type === newSwitch._type);
                      if (e.target.checked) {
                        setNewSwitch({ ...newSwitch, selectedSwitches: Array.from(new Set([...newSwitch.selectedSwitches, ...filtered.map(sw => sw.id)])) });
                      } else {
                        setNewSwitch({ ...newSwitch, selectedSwitches: newSwitch.selectedSwitches.filter(id => !filtered.map(sw => sw.id).includes(id)) });
                      }
                    }}
                  />
                  <Label htmlFor="select-all-switches" className="text-xs cursor-pointer">Select All</Label>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md p-2">
                {allSwitches
                  .filter(sw => !newSwitch._search || sw.name.toLowerCase().includes(newSwitch._search.toLowerCase()))
                  .filter(sw => !newSwitch._classroom || sw.name.split(' - ')[0] === newSwitch._classroom)
                  .filter(sw => {
                    if (!newSwitch._type) return true;
                    const device = devices.find(d => d.id === sw.deviceId);
                    const switchObj = device?.switches.find(s => s.id === sw.switchId);
                    return switchObj?.type === newSwitch._type;
                  })
                  .map((switch_) => (
                    <div key={switch_.id} className="flex items-center space-x-2 py-2">
                      <Checkbox
                        id={switch_.id}
                        checked={newSwitch.selectedSwitches.includes(switch_.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewSwitch({
                              ...newSwitch,
                              selectedSwitches: [...newSwitch.selectedSwitches, switch_.id]
                            });
                          } else {
                            setNewSwitch({
                              ...newSwitch,
                              selectedSwitches: newSwitch.selectedSwitches.filter(id => id !== switch_.id)
                            });
                          }
                        }}
                      />
                      <Label htmlFor={switch_.id} className="text-sm">
                        {switch_.name}
                      </Label>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCustomSwitch}>
                Create Group
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
