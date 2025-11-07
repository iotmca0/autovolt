import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch as UiSwitch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Device } from '@/types';
import { deviceAPI } from '@/services/api';
import { Copy, Check, Eye, EyeOff, Shield, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MacAddressInput } from '@/components/ui/mac-address-input';

const switchTypes = ['relay', 'light', 'fan', 'outlet', 'projector', 'ac'] as const;
const blocks = ['A', 'B', 'C', 'D'];
const floors = ['0', '1', '2', '3', '4', '5'];

// GPIO Pin status types
interface GpioPinInfo {
  pin: number;
  safe: boolean;
  status: 'safe' | 'problematic' | 'reserved' | 'invalid';
  reason: string;
  used: boolean;
  available: boolean;
  category: string;
  inputOnly?: boolean;
  recommendedFor?: string[];
  alternativePins?: number[];
}

interface GpioValidationResult {
  valid: boolean;
  errors: Array<{ type: string; switch?: number; pin: number; message: string; alternatives?: number[] }>;
  warnings: Array<{ type: string; switch?: number; pin: number; message: string; alternatives?: number[] }>;
}

// Update validation to be more flexible with GPIO pins
const switchSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  gpio: z.number().min(0).max(39).optional(),
  relayGpio: z.number().min(0).max(39).optional(),
  type: z.enum(switchTypes),
  icon: z.string().optional(),
  state: z.boolean().default(false),
  manualSwitchEnabled: z.boolean().default(false),
  manualSwitchGpio: z.number().min(0, { message: 'Required when manual is enabled' }).max(39).optional(),
  manualMode: z.enum(['maintained', 'momentary']).default('maintained'),
  manualActiveLow: z.boolean().default(true),
  usePir: z.boolean().default(false),
  dontAutoOff: z.boolean().default(false)
}).refine(s => !s.manualSwitchEnabled || s.manualSwitchGpio !== undefined, {
  message: 'Choose a manual switch GPIO when manual is enabled',
  path: ['manualSwitchGpio']
});

const scheduledNotificationSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  message: z.string().min(1, 'Message is required').max(200, 'Message too long'),
  enabled: z.boolean().default(true),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1, 'At least one day required'),
  lastTriggered: z.date().nullable().optional()
});

const deviceNotificationSchema = z.object({
  afterTime: z.string().optional(),
  enabled: z.boolean().default(false),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  lastTriggered: z.date().nullable().optional()
}).refine((d) => {
  // Only require afterTime and daysOfWeek when notifications are enabled
  if (!d.enabled) return true;
  if (!d.afterTime) return false;
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(d.afterTime)) return false;
  if (!Array.isArray(d.daysOfWeek) || d.daysOfWeek.length < 1) return false;
  return true;
}, {
  message: 'When notifications are enabled, set a valid time (HH:MM) and at least one day',
  path: ['enabled']
});

const formSchema = z.object({
  name: z.string().min(1, 'Required'),
  macAddress: z.string()
    .min(1, 'MAC address is required')
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address format (use XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX)'),
  ipAddress: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP').refine(v => v.split('.').every(o => +o >= 0 && +o <= 255), 'Octets 0-255'),
  location: z.string().min(1),
  classroom: z.string().optional(),
  deviceType: z.enum(['esp32', 'esp8266']).default('esp32'),
  pirEnabled: z.boolean().default(false),
  pirGpio: z.number().min(0).max(39).optional(),
  pirAutoOffDelay: z.number().min(0).default(30),
  // Dual sensor support - Fixed GPIO pins (34 for PIR, 35 for Microwave)
  pirSensorType: z.enum(['hc-sr501', 'rcwl-0516', 'both']).default('hc-sr501').optional(),
  motionDetectionLogic: z.enum(['and', 'or', 'weighted']).default('and').optional(),
  // PIR Detection Schedule
  pirDetectionSchedule: z.object({
    enabled: z.boolean().default(false),
    activeStartTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format').default('18:00'),
    activeEndTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format').default('22:00'),
    daysOfWeek: z.array(z.number().min(0).max(6)).optional()
  }).optional(),
  deviceNotifications: deviceNotificationSchema.optional(),
  switches: z.array(switchSchema).min(1).max(8).refine(sw => {
    const prim = sw.map(s => s.gpio);
    const man = sw.filter(s => s.manualSwitchEnabled && s.manualSwitchGpio !== undefined).map(s => s.manualSwitchGpio as number);
    const all = [...prim, ...man];
    return new Set(all).size === all.length;
  }, { message: 'GPIO pins (including manual) must be unique' })
}).refine((data) => {
  // Device-specific switch limits
  const maxSwitches = data.deviceType === 'esp8266' ? 4 : 8;
  return data.switches.length <= maxSwitches;
}, {
  message: 'ESP8266 devices support maximum 4 switches',
  path: ['switches']
});

type FormValues = z.infer<typeof formSchema>;
interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: FormValues) => void; initialData?: Device }

const parseLocation = (loc?: string) => {
  if (!loc) return { block: 'A', floor: '0' };
  const b = loc.match(/Block\s+([A-Z])/i)?.[1]?.toUpperCase() || 'A';
  const f = loc.match(/Floor\s+(\d+)/i)?.[1] || '0';
  return { block: b, floor: f };
};

// Helper function to format MAC address with colons
const formatMacAddress = (mac: string): string => {
  if (!mac) return '';
  // Remove all non-alphanumeric characters first
  const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  // Format with colons: every 2 characters, separated by colons
  return cleanMac.replace(/(.{2})(?=.)/g, '$1:');
};

// Get display name for GPIO pin based on device type
const getPinDisplayName = (gpio: number, deviceType: string): string => {
  if (deviceType === 'esp8266') {
    const boardName = getEsp8266BoardPinName(gpio);
    return `${boardName} (GPIO${gpio})`;
  }
  return `GPIO ${gpio}`;
};

// ESP8266 board pin name mapping
const getEsp8266BoardPinName = (gpio: number): string => {
  const esp8266PinMap: { [key: number]: string } = {
    0: 'D3',   // GPIO0 - can cause boot issues
    1: 'D10',  // GPIO1 - TX pin, avoid for relays
    2: 'D4',   // GPIO2 - can cause boot issues
    3: 'D9',   // GPIO3 - RX pin, avoid for relays
    4: 'D2',   // GPIO4 - safe for relays
    5: 'D1',   // GPIO5 - safe for relays
    12: 'D6',  // GPIO12 - safe for relays
    13: 'D7',  // GPIO13 - safe for relays
    14: 'D5',  // GPIO14 - safe for relays
    15: 'D8',  // GPIO15 - can cause boot issues
    16: 'D0'   // GPIO16 - safe for relays
  };
  return esp8266PinMap[gpio] || `GPIO${gpio}`;
};

export const DeviceConfigDialog: React.FC<Props> = ({ open, onOpenChange, onSubmit, initialData }) => {
  const locParts = parseLocation(initialData?.location);
  const [block, setBlock] = useState(locParts.block);
  const [floor, setFloor] = useState(locParts.floor);
  const [gpioInfo, setGpioInfo] = useState<GpioPinInfo[]>([]);
  const [gpioValidation, setGpioValidation] = useState<GpioValidationResult | null>(null);
  const [loadingGpio, setLoadingGpio] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
      defaultValues: {
        name: '',
        macAddress: '',
        ipAddress: '',
        location: `Block ${locParts.block} Floor ${locParts.floor}`,
        classroom: '',
        deviceType: 'esp32',
        pirEnabled: false,
        pirGpio: undefined,
        pirAutoOffDelay: 30,
        deviceNotifications: undefined,
        switches: [{ id: `switch-${Date.now()}-0`, name: '', gpio: undefined, relayGpio: undefined, type: 'relay', icon: 'lightbulb', state: false, manualSwitchEnabled: false, manualMode: 'maintained', manualActiveLow: true, usePir: false, dontAutoOff: false }]
      }
  });
  // When switching between devices, reset the form with new defaults so fields are populated
  useEffect(() => {
    if (initialData && open) {
      const lp = parseLocation(initialData.location);
      setBlock(lp.block); setFloor(lp.floor);
      fetchGpioInfo(); // Fetch GPIO info when dialog opens with existing device
      // Normalize incoming notification settings to avoid partial objects that fail validation
      let notifSettings = initialData.notificationSettings as any;
      if (notifSettings && notifSettings.enabled) {
        const missingAfterTime = !notifSettings.afterTime || typeof notifSettings.afterTime !== 'string';
        const missingDays = !Array.isArray(notifSettings.daysOfWeek) || notifSettings.daysOfWeek.length === 0;
        if (missingAfterTime || missingDays) {
          // If enabled but missing required fields, fall back to disabled to avoid blocking edits
          notifSettings = { enabled: false };
        }
      }

      form.reset({
        name: initialData.name,
        macAddress: formatMacAddress(initialData.macAddress),
        ipAddress: initialData.ipAddress,
        location: initialData.location || `Block ${lp.block} Floor ${lp.floor}`,
        classroom: initialData.classroom || '',
        deviceType: (initialData.deviceType === 'esp32' || initialData.deviceType === 'esp8266') ? initialData.deviceType : 'esp32',
        pirEnabled: initialData.pirEnabled || false,
        pirGpio: initialData.pirGpio,
        pirAutoOffDelay: initialData.pirAutoOffDelay || 30,
        pirSensorType: initialData.pirSensorType || 'hc-sr501',
        motionDetectionLogic: initialData.motionDetectionLogic || 'and',
        pirDetectionSchedule: initialData.pirDetectionSchedule || {
          enabled: false,
          activeStartTime: '18:00',
          activeEndTime: '22:00',
          daysOfWeek: []
        },
        deviceNotifications: notifSettings,
    switches: initialData.switches.map((sw: import('@/types').Switch) => ({
    id: sw.id,
          name: sw.name,
          gpio: sw.gpio,
          relayGpio: sw.relayGpio,
          type: sw.type || 'relay',
          icon: sw.icon,
          state: !!sw.state,
          manualSwitchEnabled: sw.manualSwitchEnabled || false,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualMode: sw.manualMode || 'maintained',
          manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : true,
          usePir: sw.usePir || false,
          dontAutoOff: sw.dontAutoOff || false
        }))
      });
    } else if (!initialData && open) {
      const lp = parseLocation(undefined);
      fetchGpioInfo(); // Fetch GPIO info when creating new device
      form.reset({
        name: '', macAddress: '', ipAddress: '', location: `Block ${lp.block} Floor ${lp.floor}`, classroom: '', deviceType: 'esp32', pirEnabled: false, pirGpio: undefined, pirAutoOffDelay: 30, pirDetectionSchedule: { enabled: false, activeStartTime: '18:00', activeEndTime: '22:00', daysOfWeek: [] }, deviceNotifications: undefined,
  switches: [{ id: `switch-${Date.now()}-0`, name: '', gpio: undefined, relayGpio: undefined, type: 'relay', icon: 'lightbulb', state: false, manualSwitchEnabled: false, manualMode: 'maintained', manualActiveLow: true, usePir: false, dontAutoOff: false }]
      });
    }
  }, [initialData, open]);
  useEffect(() => { form.setValue('location', `Block ${block} Floor ${floor}`); }, [block, floor]);

  // Refetch GPIO info when deviceType changes
  const prevDeviceTypeRef = React.useRef<string>();
  const watchedDeviceType = form.watch('deviceType');
  useEffect(() => {
    if (open && watchedDeviceType !== prevDeviceTypeRef.current) {
      prevDeviceTypeRef.current = watchedDeviceType;
      fetchGpioInfo();
    }
  }, [open, watchedDeviceType]);

  // Keep gpio and relayGpio synchronized for each switch (removed - they should be separate fields)
  // useEffect(() => {
  //   const subscription = form.watch((value, { name, type }) => {
  //     if (name && name.includes('gpio') && !name.includes('manual') && !name.includes('pir') && type === 'change') {
  //       const pathParts = name.split('.');
  //       if (pathParts.length === 3 && pathParts[1] === 'switches') {
  //         const switchIndex = parseInt(pathParts[2]);
  //         const gpioValue = form.getValues(`switches.${switchIndex}.gpio`);
  //         if (gpioValue !== undefined) {
  //           form.setValue(`switches.${switchIndex}.relayGpio`, gpioValue, { shouldValidate: false });
  //         }
  //       }
  //     }
  //   });
  //   return () => subscription.unsubscribe();
  // }, [form]);

  // Secret reveal state
  const [secretPin, setSecretPin] = useState('');
  const [secretLoading, setSecretLoading] = useState(false);
  const [secretValue, setSecretValue] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const deviceId = initialData?.id;

  // Fetch GPIO pin information
  const fetchGpioInfo = async () => {
    try {
      setLoadingGpio(true);
      const deviceType = form.getValues('deviceType') || 'esp32';
      const response = await deviceAPI.getGpioPinInfo(deviceId, deviceType);
      setGpioInfo(response.data.data.pins);
    } catch (error) {
      console.error('Failed to fetch GPIO info:', error);
    } finally {
      setLoadingGpio(false);
    }
  };

  // Validate GPIO configuration
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const validateGpioConfig = async (config: { switches: import('@/types').Switch[]; pirEnabled: boolean; pirGpio?: number }) => {
    try {
      const deviceType = form.getValues('deviceType') || 'esp32';
      const isUpdate = !!initialData; // True if editing existing device
      const existingConfig = initialData?.switches || []; // Existing switch configuration
      
      const response = await deviceAPI.validateGpioConfig({ 
        ...config, 
        deviceType,
        isUpdate,
        existingConfig,
        existingPirGpio: initialData?.pirGpio // Pass existing PIR GPIO
      });
      const validation = response.data.data;
      setGpioValidation(validation);

      // Set field-specific errors
      const newFieldErrors: Record<string, string> = {};
      const newGeneralErrors: string[] = [];

      if (validation.errors) {
        validation.errors.forEach((error: any) => {
          if (error.field) {
            newFieldErrors[error.field] = `${error.message}\n\nSuggestion: ${error.suggestion}`;
          } else {
            newGeneralErrors.push(`${error.message}\n\nSuggestion: ${error.suggestion || 'Please review your GPIO configuration.'}`);
          }
        });
      }

      setFieldErrors(newFieldErrors);
      setGeneralErrors(newGeneralErrors);

      return validation;
    } catch (error: any) {
      console.error('GPIO validation failed:', error);
      // Show error if validation API fails
      const errorMessage = error.response?.data?.message || error.message || 'GPIO validation failed';
      const validationError = {
        valid: false,
        errors: [{ type: 'validation_api', pin: 0, message: `Validation check failed: ${errorMessage}`, suggestion: 'Please check your network connection and try again.' }],
        warnings: []
      };
      setGpioValidation(validationError);
      setFieldErrors({});
      setGeneralErrors([`Validation failed: ${errorMessage}\n\nSuggestion: Check your network connection and try again.`]);
      return null;
    }
  };

  const fetchSecret = async () => {
    if (!deviceId) { setSecretError('No device ID'); return; }
    setSecretLoading(true); setSecretError(null); setCopied(false);
    try {
      const resp = await deviceAPI.getDeviceWithSecret(deviceId, secretPin || undefined);
      // Try multiple possible locations for the secret
      const s = resp.data?.deviceSecret || resp.data?.data?.deviceSecret || resp.data?.data?.device?.deviceSecret;
      if (!s) {
        console.error('Secret not found in response:', resp.data);
        setSecretError('Secret not returned from server');
        return;
      }
      setSecretValue(s);
      setSecretVisible(true);
    } catch (e: unknown) {
      let message = 'Failed to fetch secret';
      if (e && typeof e === 'object' && 'response' in e) {
        const error = e as { response?: { status?: number; data?: unknown } };
        if (error.response?.status === 403) {
          message = 'Access denied - admin privileges required or invalid PIN';
        } else if (error.response?.status === 404) {
          message = 'Device not found';
        } else if (error.response?.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
          message = String((error.response.data as { message: unknown }).message);
        }
      }
      setSecretError(message);
    } finally { setSecretLoading(false); }
  };

  const copySecret = async () => {
    if (!secretValue) return;
    try {
      await navigator.clipboard.writeText(secretValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Optionally log error for debugging
      // console.error('Clipboard copy failed', e);
    }
  };
  const submit = async (data: FormValues) => {
    console.log('[DeviceConfigDialog] submit() called', { initialDataId: initialData?.id });
    console.log('[DeviceConfigDialog] submit data sensor fields:', {
      pirSensorType: data.pirSensorType,
      motionDetectionLogic: data.motionDetectionLogic,
      pirEnabled: data.pirEnabled
    });
    const switchesWithId = data.switches.map(sw => ({
      id: typeof sw.id === 'string' && sw.id.length > 0 ? sw.id : `switch-${Date.now()}-${Math.floor(Math.random()*10000)}`,
      name: sw.name || 'Unnamed Switch',
      type: sw.type || 'relay',
      gpio: sw.gpio, // Keep as undefined if not set, don't default to 0
      relayGpio: sw.relayGpio ?? sw.gpio, // relayGpio can default to gpio if set
      state: sw.state ?? false,
      manualSwitchEnabled: sw.manualSwitchEnabled ?? false,
      manualSwitchGpio: sw.manualSwitchGpio,
      manualMode: sw.manualMode || 'maintained',
      manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : true,
      usePir: sw.usePir ?? false,
      dontAutoOff: sw.dontAutoOff ?? false,
      icon: sw.icon
    }));

    // Validate GPIO configuration before submitting
    // Normalize MAC address to backend expected format (colon-separated, lowercase)
    try {
      if (data.macAddress) {
        data.macAddress = formatMacAddress(data.macAddress).toLowerCase();
        form.setValue('macAddress', data.macAddress, { shouldValidate: false });
        console.log('[DeviceConfigDialog] normalized macAddress ->', data.macAddress);
      }

      console.log('[DeviceConfigDialog] calling validateGpioConfig with switches:', switchesWithId.map(s => ({ id: s.id, gpio: s.gpio, manual: s.manualSwitchGpio })));
      const validation = await validateGpioConfig({
        switches: switchesWithId,
        pirEnabled: data.pirEnabled,
        pirGpio: data.pirGpio
      });
      console.log('[DeviceConfigDialog] validateGpioConfig result:', validation);

      if (!validation) {
        console.warn('[DeviceConfigDialog] validation API returned null/failed; aborting submit');
        return;
      }

      if (!validation.valid) {
        console.warn('[DeviceConfigDialog] validation failed, not submitting. Errors:', validation.errors);
        return;
      }

      try {
        onSubmit({ ...data, switches: switchesWithId });
        onOpenChange(false);
        console.log('[DeviceConfigDialog] onSubmit called successfully');
      } catch (err) {
        console.error('[DeviceConfigDialog] onSubmit threw an error:', err);
        throw err;
      }
    } catch (err: any) {
      console.error('[DeviceConfigDialog] unexpected error during submit:', err && (err.message || err));
      // Surface a general message in the UI as a fallback
      setGeneralErrors([`Submission failed: ${err?.message || String(err)}`]);
      return;
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Device' : 'Add New Device'}</DialogTitle>
          <DialogDescription>{initialData ? 'Update device configuration' : 'Enter device details and at least one switch.'}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={async (e) => {
            console.log('[DeviceConfigDialog] native form onSubmit event');
            // Prevent default here and run programmatic validation to inspect results
            try {
              e.preventDefault();
            } catch (err) {
              // older browsers may not allow preventDefault on synthetic events
            }
            try {
              const valid = await form.trigger();
              console.log('[DeviceConfigDialog] form.trigger() result:', valid, 'errors:', form.formState.errors);
              if (valid) {
                // Call handleSubmit without passing the raw event because we've already prevented default
                await form.handleSubmit(submit)();
              } else {
                // Provide more targeted debug info for nested deviceNotifications validation
                try {
                  const notifVals = form.getValues('deviceNotifications');
                  const notifError = (form.formState.errors as any)?.deviceNotifications;
                  const errSummary = notifError ? (notifError.message || JSON.stringify({ type: notifError.type, ...notifError })) : null;
                  console.warn('[DeviceConfigDialog] Validation failed, not calling submit. deviceNotifications values:', notifVals, 'deviceNotifications error:', errSummary);
                } catch (e) {
                  console.warn('[DeviceConfigDialog] Validation failed, failed to read deviceNotifications debug info', e);
                }
                console.warn('[DeviceConfigDialog] Validation failed, not calling submit.');
              }
            } catch (err) {
              console.error('[DeviceConfigDialog] error during programmatic validation/submit:', err);
            }
          }} className="space-y-6">
            <div className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Device Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="macAddress" render={({ field }) => (<FormItem><FormLabel>MAC Address</FormLabel><FormControl><MacAddressInput {...field} placeholder="AA:BB:CC:DD:EE:FF" /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="ipAddress" render={({ field }) => (<FormItem><FormLabel>IP Address</FormLabel><FormControl><Input {...field} placeholder="192.168.1.100" /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-2 gap-4">
                <FormItem><FormLabel>Block</FormLabel><Select value={block || ''} onValueChange={v => setBlock(v)}><FormControl><SelectTrigger><SelectValue placeholder="Block" /></SelectTrigger></FormControl><SelectContent>{blocks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></FormItem>
                <FormItem><FormLabel>Floor</FormLabel><Select value={floor || ''} onValueChange={v => setFloor(v)}><FormControl><SelectTrigger><SelectValue placeholder="Floor" /></SelectTrigger></FormControl><SelectContent>{floors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></FormItem>
              </div>
              <input type="hidden" {...form.register('location')} />
              <FormField control={form.control} name="classroom" render={({ field }) => (<FormItem><FormLabel>Classroom (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="deviceType" render={({ field }) => (<FormItem><FormLabel>Device Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select device type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="esp32">ESP32</SelectItem><SelectItem value="esp8266">ESP8266</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <Separator />
            {initialData && (
              <div className="space-y-3 p-4 border rounded-md">
                <div className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4" /> Device Secret</div>
                <p className="text-xs text-muted-foreground">Enter admin PIN to generate/reveal the device secret. Keep it confidential.</p>
                <div className="flex items-center gap-2">
                  <Input placeholder="PIN" type="password" value={secretPin} onChange={e => setSecretPin(e.target.value)} className="max-w-[140px]" />
                  <Button type="button" variant="outline" size="sm" disabled={secretLoading} onClick={fetchSecret}>{secretLoading ? 'Loading...' : (secretValue ? 'Regenerate' : 'Reveal')}</Button>
                  {secretValue && (
                    <Button type="button" variant="outline" size="icon" onClick={() => setSecretVisible(v => !v)}>
                      {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  {secretValue && (
                    <Button type="button" variant="outline" size="icon" onClick={copySecret}>
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {secretValue && (
                  <div className="text-xs font-mono break-all bg-muted p-2 rounded border select-all">
                    {secretVisible ? secretValue : secretValue.replace(/.(?=.{6})/g, '•')}
                  </div>
                )}
                {secretError && <div className="text-xs text-red-500">{secretError}</div>}
              </div>
            )}
            <Separator />
            <div className="space-y-4">
              <FormField control={form.control} name="pirEnabled" render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Enable PIR Sensor</FormLabel></FormItem>)} />
              {/* Auto-Off Delay moved to dual sensor section below */}

              {/* Dual Sensor Configuration */}
              {form.watch('pirEnabled') && (
                <>
                  <FormField control={form.control} name="pirSensorType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motion Sensor Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select sensor type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hc-sr501">
                            <div className="flex flex-col items-start py-1">
                              <span className="font-medium">HC-SR501 (PIR Only)</span>
                              <span className="text-xs text-muted-foreground">Passive Infrared • 5-20V • 7m range</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="rcwl-0516">
                            <div className="flex flex-col items-start py-1">
                              <span className="font-medium">RCWL-0516 (Microwave Only)</span>
                              <span className="text-xs text-muted-foreground">Microwave Radar • 3.3V • Through walls</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="both">
                            <div className="flex flex-col items-start py-1">
                              <span className="font-medium">🔥 Both Sensors (Dual Mode)</span>
                              <span className="text-xs text-muted-foreground">PIR + Microwave • 95%+ accuracy</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {field.value === 'both' 
                          ? '✅ Recommended: Dual mode provides best accuracy with redundancy'
                          : field.value === 'rcwl-0516'
                          ? '⚠️ Microwave detects through walls - may trigger from adjacent rooms'
                          : 'PIR detects body heat and motion in line-of-sight only'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Fixed GPIO Pin Information */}
                  {form.watch('pirSensorType') && (
                    <Alert className="border-primary/50 bg-primary/10">
                      <Info className="h-4 w-4 text-primary" />
                      <AlertDescription>
                        <strong>GPIO Pin Configuration (Fixed):</strong>
                        <ul className="text-xs mt-1 space-y-1 list-disc list-inside">
                          {form.watch('pirSensorType') === 'hc-sr501' && (
                            <li>GPIO 34: HC-SR501 PIR sensor (Input-only pin)</li>
                          )}
                          {form.watch('pirSensorType') === 'rcwl-0516' && (
                            <li>GPIO 35: RCWL-0516 Microwave sensor (Input-only pin)</li>
                          )}
                          {form.watch('pirSensorType') === 'both' && (
                            <>
                              <li>GPIO 34: HC-SR501 PIR sensor (Primary)</li>
                              <li>GPIO 35: RCWL-0516 Microwave sensor (Secondary)</li>
                            </>
                          )}
                          <li>No pin conflicts with relays (16,17,18,19,21,22) ✅</li>
                          <li>No pin conflicts with manual switches (25,26,27,32,33,23) ✅</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Detection Logic (only for dual mode) */}
                  {form.watch('pirSensorType') === 'both' && (
                    <FormField control={form.control} name="motionDetectionLogic" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Detection Logic</FormLabel>
                        <Select value={field.value || 'and'} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select detection logic" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="and">
                              <div className="flex flex-col items-start py-1">
                                <span className="font-medium">AND Logic (Strict)</span>
                                <span className="text-xs text-muted-foreground">Both must detect • 95%+ accuracy</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="or">
                              <div className="flex flex-col items-start py-1">
                                <span className="font-medium">OR Logic (Sensitive)</span>
                                <span className="text-xs text-muted-foreground">Either triggers • Fast response</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="weighted">
                              <div className="flex flex-col items-start py-1">
                                <span className="font-medium">Weighted Fusion (Balanced)</span>
                                <span className="text-xs text-muted-foreground">Confidence-based • Adaptive</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          AND logic recommended for classrooms (low false positives)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  {/* Advanced Settings */}
                  <FormField control={form.control} name="pirAutoOffDelay" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Auto-off Delay (seconds)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0" 
                          max="300" 
                          value={field.value ?? 30}
                          onChange={e => field.onChange(Number(e.target.value || 30))} 
                        />
                      </FormControl>
                      <FormDescription>
                        Seconds after motion stops before turning off (0-300s)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* PIR Detection Schedule */}
                  <div className="space-y-4 border-t pt-4">
                    <FormField control={form.control} name="pirDetectionSchedule.enabled" render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <UiSwitch checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">Enable Time-Based Detection Schedule</FormLabel>
                      </FormItem>
                    )} />

                    {form.watch('pirDetectionSchedule.enabled') && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name="pirDetectionSchedule.activeStartTime" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Detection Starts At</FormLabel>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  value={field.value || '18:00'}
                                  onChange={e => field.onChange(e.target.value)} 
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
                                PIR will start detecting after this time
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name="pirDetectionSchedule.activeEndTime" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Detection Ends At</FormLabel>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  value={field.value || '22:00'}
                                  onChange={e => field.onChange(e.target.value)} 
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
                                PIR will stop detecting after this time
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>

                        <FormField control={form.control} name="pirDetectionSchedule.daysOfWeek" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Active Days</FormLabel>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { value: 0, label: 'Sun' },
                                { value: 1, label: 'Mon' },
                                { value: 2, label: 'Tue' },
                                { value: 3, label: 'Wed' },
                                { value: 4, label: 'Thu' },
                                { value: 5, label: 'Fri' },
                                { value: 6, label: 'Sat' }
                              ].map((day) => (
                                <Button
                                  key={day.value}
                                  type="button"
                                  variant={field.value?.includes(day.value) ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => {
                                    const current = field.value || [];
                                    const updated = current.includes(day.value)
                                      ? current.filter((d: number) => d !== day.value)
                                      : [...current, day.value];
                                    field.onChange(updated);
                                  }}
                                >
                                  {day.label}
                                </Button>
                              ))}
                            </div>
                            <FormDescription className="text-xs">
                              PIR detection will only be active on selected days
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <Alert className="border-blue-500/50 bg-blue-500/10">
                          <Info className="h-4 w-4 text-blue-500" />
                          <AlertDescription className="text-xs">
                            <strong>Schedule Example:</strong> Set detection from 18:00 to 22:00 on weekdays to automatically control lights during evening classes only.
                            Outside these times, PIR won't trigger any switches.
                          </AlertDescription>
                        </Alert>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <Separator />
            <div className="space-y-3">
              <h5 className="text-sm font-medium">Device Notifications</h5>
              <p className="text-xs text-muted-foreground">Configure intelligent time-based notifications for this device. Notifications will be sent after the specified time if any switches are still on (naming specific switches) or if all switches are on.</p>
              
              <FormField control={form.control} name="deviceNotifications.enabled" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <UiSwitch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Enable device notifications</FormLabel>
                </FormItem>
              )} />

              {form.watch('deviceNotifications.enabled') && (
                <div className="grid gap-3 p-3 border rounded-md">
                  <FormField
                    control={form.control}
                    name="deviceNotifications.afterTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification Time (HH:MM)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="17:00" />
                        </FormControl>
                        <FormDescription>
                          Time after which to check if switches are still on and send notifications
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deviceNotifications.daysOfWeek"
                    render={({ field }) => {
                      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      return (
                        <FormItem>
                          <FormLabel>Days of Week</FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {days.map((day, dayIdx) => (
                              <Button
                                key={day}
                                type="button"
                                variant={(field.value || []).includes(dayIdx) ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const current = field.value || [];
                                  const newValue = current.includes(dayIdx)
                                    ? current.filter(d => d !== dayIdx)
                                    : [...current, dayIdx];
                                  field.onChange(newValue);
                                }}
                              >
                                {day}
                              </Button>
                            ))}
                          </div>
                          <FormDescription>
                            Select days when notifications should be active
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              )}
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-card border border-border rounded-md">
                <Info className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <strong>GPIO Pin Safety:</strong> Only safe GPIO pins are available for selection. These pins are recommended for reliable {form.watch('deviceType') === 'esp8266' ? 'ESP8266' : 'ESP32'} operation and avoid boot issues or system instability.
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <span className="text-xs">Safe pins (recommended)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span className="text-xs">Problematic pins (avoid)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-danger" />
                      <span className="text-xs">Reserved pins (system use)</span>
                    </div>
                  </div>
                </div>
              </div>
              {form.watch('switches')?.map((_, idx) => {
                const switches = form.watch('switches') || [];
                const usedPins = new Set(switches.flatMap((s, i) => { const arr = [s.gpio]; if (s.manualSwitchEnabled && s.manualSwitchGpio !== undefined) arr.push(s.manualSwitchGpio); return i === idx ? [] : arr; }));
                return (
                  <div key={idx} className="grid gap-4 p-4 border rounded-md">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">Switch {idx + 1}</h4>
                      {idx > 0 && <Button type="button" variant="destructive" size="sm" onClick={() => { const sw = [...switches]; sw.splice(idx, 1); form.setValue('switches', sw); }}>Remove</Button>}
                    </div>
                    {/* Hidden id field to preserve existing switch identity */}
                    {switches[idx]?.id && <input type="hidden" value={switches[idx].id} {...form.register(`switches.${idx}.id` as const)} />}
                    <FormField control={form.control} name={`switches.${idx}.name`} render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Light" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`switches.${idx}.type`} render={({ field }) => (<FormItem><FormLabel>Type</FormLabel><Select onValueChange={field.onChange} value={field.value || 'relay'}><FormControl><SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger></FormControl><SelectContent>{switchTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`switches.${idx}.gpio`} render={({ field }) => {
                      const switches = form.watch('switches') || [];
                      const usedPins = new Set(switches.flatMap((s, i) => i === idx ? [] : [s.gpio]));
                      const deviceType = form.getValues('deviceType') || 'esp32';
                      
                      // Device-specific recommended relay pins
                      const recommendedRelayPins = deviceType === 'esp8266' 
                        ? [4, 5, 12, 13]  // ESP8266: matches firmware config and documentation
                        : [16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33]; // ESP32 pins
                      
                      const availablePins = gpioInfo.filter(p =>
                        p.safe &&
                        recommendedRelayPins.includes(p.pin) &&
                        !usedPins.has(p.pin)
                      );
                      const list = [...availablePins];

                      // If current pin is not in recommended list, add it to the list so user can see it but with warning
                      if (field.value !== undefined && !list.find(p => p.pin === field.value)) {
                        const currentPin = gpioInfo.find(p => p.pin === field.value);
                        if (currentPin) list.push(currentPin);
                      }
                      list.sort((a, b) => a.pin - b.pin);

                      const getPinStatusIcon = (pin: GpioPinInfo) => {
                        if (pin.status === 'safe') return <CheckCircle className="w-4 h-4 text-success" />;
                        if (pin.status === 'problematic') return <AlertTriangle className="w-4 h-4 text-warning" />;
                        return <XCircle className="w-4 h-4 text-danger" />;
                      };

                      const getPinStatusDot = (pin: GpioPinInfo) => {
                        const dotClass = "w-2 h-2 rounded-full flex-shrink-0";
                        if (pin.status === 'safe') return <div className={`${dotClass} bg-success`} />;
                        if (pin.status === 'problematic') return <div className={`${dotClass} bg-warning`} />;
                        return <div className={`${dotClass} bg-danger`} />;
                      };

                      const getPinStatusColor = (pin: GpioPinInfo) => {
                        if (pin.status === 'safe') return 'text-foreground hover:bg-accent';
                        if (pin.status === 'problematic') return 'text-foreground hover:bg-accent';
                        return 'text-foreground hover:bg-accent';
                      };

                      const getPinRecommendation = (pin: GpioPinInfo) => {
                        if (deviceType === 'esp8266') {
                          if ([4, 5, 12, 13].includes(pin.pin)) return 'Primary (Most Stable)';
                          if ([14, 16].includes(pin.pin)) return 'Secondary (Alternative)';
                          return 'Not Recommended';
                        }
                        const primaryRelayPins = [16, 17, 18, 19, 21, 22];
                        const secondaryRelayPins = [23, 25, 26, 27, 32, 33];
                        if (primaryRelayPins.includes(pin.pin)) return 'Primary (Recommended)';
                        if (secondaryRelayPins.includes(pin.pin)) return 'Secondary (Alternative)';
                        return 'Not Recommended';
                      };

                      return (
                        <FormItem>
                          <FormLabel>GPIO Pin (Relay Control)</FormLabel>
                          <Select value={field.value !== undefined ? String(field.value) : ''} onValueChange={v => field.onChange(v === '' ? undefined : Number(v))}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select recommended GPIO pin for relay" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-64">
                              {list.map(pin => (
                                <SelectItem
                                  key={pin.pin}
                                  value={String(pin.pin)}
                                  className={getPinStatusColor(pin)}
                                  disabled={pin.status !== 'safe'}
                                >
                                  <div className="flex items-center gap-2">
                                    {getPinStatusDot(pin)}
                                    {getPinStatusIcon(pin)}
                                    <span>{getPinDisplayName(pin.pin, deviceType)}</span>
                                    {pin.status === 'safe' && (
                                      <Badge variant="outline" className="text-xs bg-success/50 text-white border-success/70">
                                        {getPinRecommendation(pin)}
                                      </Badge>
                                    )}
                                    {pin.status === 'problematic' && (
                                      <Badge variant="outline" className="text-xs bg-warning/50 text-white border-warning/70">
                                        Problematic
                                      </Badge>
                                    )}
                                    {pin.status === 'reserved' && (
                                      <Badge variant="outline" className="text-xs bg-danger/50 text-white border-danger/70">
                                        Reserved
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldErrors[`switches.${idx}.gpio`] && (
                            <Alert className="mt-2 border-danger/70 bg-danger/20">
                              <XCircle className="h-4 w-4 text-danger" />
                              <AlertDescription className="text-foreground whitespace-pre-line">
                                {fieldErrors[`switches.${idx}.gpio`]}
                              </AlertDescription>
                            </Alert>
                          )}
                          {gpioInfo.find(p => p.pin === field.value)?.status === 'problematic' && (
                            <Alert className="mt-2 border-warning/70 bg-warning/20">
                              <AlertTriangle className="h-4 w-4 text-warning" />
                              <AlertDescription className="text-foreground">
                                <strong>Warning:</strong> {gpioInfo.find(p => p.pin === field.value)?.reason}
                                {gpioInfo.find(p => p.pin === field.value)?.alternativePins && (
                                  <div className="mt-2">
                                    <strong>Recommended relay pins:</strong> GPIO {gpioInfo.find(p => p.pin === field.value)?.alternativePins?.join(', ')}
                                  </div>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                          {gpioInfo.find(p => p.pin === field.value)?.status === 'reserved' && (
                            <Alert className="mt-2 border-danger/70 bg-danger/20">
                              <XCircle className="h-4 w-4 text-danger" />
                              <AlertDescription className="text-foreground">
                                <strong>Warning:</strong> This pin is reserved and may cause system instability.
                                {gpioInfo.find(p => p.pin === field.value)?.alternativePins && (
                                  <div className="mt-2">
                                    <strong>Use recommended relay pins:</strong> GPIO {gpioInfo.find(p => p.pin === field.value)?.alternativePins?.join(', ')}
                                  </div>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                          {!recommendedRelayPins.includes(field.value) && gpioInfo.find(p => p.pin === field.value)?.status === 'safe' && (
                            <Alert className="mt-2 border-success/70 bg-success/20">
                              <Info className="h-4 w-4 text-success" />
                              <AlertDescription className="text-foreground">
                                <strong>Note:</strong> This pin is safe but not recommended for relay control.
                                <div className="mt-2">
                                  <strong>Recommended relay pins:</strong> {deviceType === 'esp8266' 
                                    ? 'GPIO 4, 5, 12, 13 (Primary/Most Stable) or 14, 16 (Secondary/Alternative)' 
                                    : 'GPIO 16, 17, 18, 19, 21, 22 (Primary) or 23, 25, 26, 27, 32, 33 (Secondary)'}
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }} />
                    <FormField control={form.control} name={`switches.${idx}.manualSwitchEnabled`} render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Manual Switch</FormLabel></FormItem>)} />
                    {form.watch(`switches.${idx}.manualSwitchEnabled`) && (
                      <>
                        <FormField control={form.control} name={`switches.${idx}.manualSwitchGpio`} render={({ field }) => {
                          const all = form.watch('switches') || [];
                          const used = new Set(all.flatMap((s, i) => { const arr = [s.gpio]; if (s.manualSwitchEnabled && s.manualSwitchGpio !== undefined) arr.push(s.manualSwitchGpio); return i === idx ? [s.gpio] : arr; }));
                          const deviceType = form.getValues('deviceType') || 'esp32';
                          
                          // Device-specific recommended manual pins
                          const recommendedManualPins = deviceType === 'esp8266' 
                            ? [14, 16, 0, 2]  // ESP8266: 4 pins for manual switches
                            : [16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33]; // ESP32 pins
                          
                          // For ESP8266, allow problematic pins for manual switches
                          const allowProblematic = deviceType === 'esp8266';
                          
                          const availablePins = gpioInfo.filter(p =>
                            (p.safe || (allowProblematic && p.status === 'problematic')) &&
                            recommendedManualPins.includes(p.pin) &&
                            !used.has(p.pin)
                          );
                          const avail = [...availablePins];

                          // If current pin is not in recommended list, add it to the list so user can see it but with warning
                          if (field.value !== undefined && !avail.find(p => p.pin === field.value)) {
                            const currentPin = gpioInfo.find(p => p.pin === field.value);
                            if (currentPin) avail.push(currentPin);
                          }
                          avail.sort((a, b) => a.pin - b.pin);

                          const getPinStatusIcon = (pin: GpioPinInfo) => {
                            if (pin.status === 'safe') return <CheckCircle className="w-4 h-4 text-success" />;
                            if (pin.status === 'problematic') return <AlertTriangle className="w-4 h-4 text-warning" />;
                            return <XCircle className="w-4 h-4 text-danger" />;
                          };

                          const getPinStatusDot = (pin: GpioPinInfo) => {
                            const dotClass = "w-2 h-2 rounded-full flex-shrink-0";
                            if (pin.status === 'safe') return <div className={`${dotClass} bg-success`} />;
                            if (pin.status === 'problematic') return <div className={`${dotClass} bg-warning`} />;
                            return <div className={`${dotClass} bg-danger`} />;
                          };

                          const getPinStatusColor = (pin: GpioPinInfo) => {
                            if (pin.status === 'safe') return 'text-foreground hover:bg-accent';
                            if (pin.status === 'problematic') return 'text-foreground hover:bg-accent';
                            return 'text-foreground hover:bg-accent';
                          };

                          const getPinRecommendation = (pin: GpioPinInfo) => {
                            if (deviceType === 'esp8266') {
                              if ([14, 16, 0, 2].includes(pin.pin)) return 'Primary (Safe)';
                              if ([13, 1, 3].includes(pin.pin)) return 'Secondary (Caution)';
                              return 'Available';
                            }
                            const primaryManualPins = [23, 25, 26, 27, 32, 33];
                            const secondaryManualPins = [16, 17, 18, 19, 21, 22];
                            if (primaryManualPins.includes(pin.pin)) return 'Primary (Recommended)';
                            if (secondaryManualPins.includes(pin.pin)) return 'Secondary (Alternative)';
                            return 'Not Recommended';
                          };

                          const NONE = '__none__';
                          const currentVal = field.value === undefined ? NONE : String(field.value);
                          return (
                            <FormItem>
                              <FormLabel>Manual Switch GPIO</FormLabel>
                              <Select value={currentVal} onValueChange={v => field.onChange(v === NONE ? undefined : Number(v))}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select recommended GPIO pin for manual switch" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-64">
                                  <SelectItem key={NONE} value={NONE}>Select</SelectItem>
                                  {avail.map(pin => (
                                    <SelectItem
                                      key={String(pin.pin)}
                                      value={String(pin.pin)}
                                      className={getPinStatusColor(pin)}
                                      disabled={pin.status !== 'safe'}
                                    >
                                      <div className="flex items-center gap-2">
                                        {getPinStatusDot(pin)}
                                        {getPinStatusIcon(pin)}
                                        <span>{getPinDisplayName(pin.pin, deviceType)}</span>
                                        {pin.status === 'safe' && (
                                          <Badge variant="outline" className="text-xs bg-success/50 text-white border-success/70">
                                            {getPinRecommendation(pin)}
                                          </Badge>
                                        )}
                                        {pin.status === 'problematic' && (
                                          <Badge variant="outline" className="text-xs bg-warning/50 text-white border-warning/70">
                                            Problematic
                                          </Badge>
                                        )}
                                        {pin.status === 'reserved' && (
                                          <Badge variant="outline" className="text-xs bg-danger/50 text-white border-danger/70">
                                            Reserved
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {fieldErrors[`switches.${idx}.manualSwitchGpio`] && (
                                <Alert className="mt-2 border-danger/70 bg-danger/20">
                                  <XCircle className="h-4 w-4 text-danger" />
                                  <AlertDescription className="text-foreground whitespace-pre-line">
                                    {fieldErrors[`switches.${idx}.manualSwitchGpio`]}
                                  </AlertDescription>
                                </Alert>
                              )}
                              {field.value !== undefined && gpioInfo.find(p => p.pin === field.value)?.status === 'problematic' && (
                                <Alert className="mt-2 border-warning/70 bg-warning/20">
                                  <AlertTriangle className="h-4 w-4 text-warning" />
                                  <AlertDescription className="text-foreground">
                                    <strong>Warning:</strong> {deviceType === 'esp8266' && [0, 2, 15, 16].includes(field.value) 
                                      ? `This pin (${field.value === 16 ? 'has limited functionality' : 'may affect ESP8266 boot/serial communication'}) but can be used for manual switches with proper wiring.` 
                                      : gpioInfo.find(p => p.pin === field.value)?.reason}
                                    {deviceType === 'esp32' && gpioInfo.find(p => p.pin === field.value)?.alternativePins && (
                                      <div className="mt-2">
                                        <strong>Recommended manual switch pins:</strong> GPIO {gpioInfo.find(p => p.pin === field.value)?.alternativePins?.join(', ')}
                                      </div>
                                    )}
                                  </AlertDescription>
                                </Alert>
                              )}
                              {field.value !== undefined && gpioInfo.find(p => p.pin === field.value)?.status === 'reserved' && (
                                <Alert className="mt-2 border-danger/70 bg-danger/20">
                                  <XCircle className="h-4 w-4 text-danger" />
                                  <AlertDescription className="text-foreground">
                                    <strong>Warning:</strong> This pin is reserved and may cause system instability.
                                    {gpioInfo.find(p => p.pin === field.value)?.alternativePins && (
                                      <div className="mt-2">
                                        <strong>Use recommended manual switch pins:</strong> GPIO {gpioInfo.find(p => p.pin === field.value)?.alternativePins?.join(', ')}
                                      </div>
                                    )}
                                  </AlertDescription>
                                </Alert>
                              )}
                              {field.value !== undefined && !recommendedManualPins.includes(field.value) && gpioInfo.find(p => p.pin === field.value)?.status === 'safe' && (
                                <Alert className="mt-2 border-success/70 bg-success/20">
                                  <Info className="h-4 w-4 text-success" />
                                  <AlertDescription className="text-foreground">
                                    <strong>Note:</strong> This pin is safe but not recommended for manual switches.
                                    <div className="mt-2">
                                      <strong>Recommended manual switch pins:</strong> {deviceType === 'esp8266' 
                                        ? 'GPIO 14, 16, 0, 2 (Primary/Safe) or 13, 1, 3 (Secondary/Caution)' 
                                        : 'GPIO 23, 25, 26, 27, 32, 33 (Primary) or 16, 17, 18, 19, 21, 22 (Secondary)'}
                                    </div>
                                  </AlertDescription>
                                </Alert>
                              )}
                              <FormMessage />
                            </FormItem>
                          );
                        }} />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name={`switches.${idx}.manualMode`} render={({ field }) => (<FormItem><FormLabel>Manual Mode</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger></FormControl><SelectContent><SelectItem value="maintained">Maintained</SelectItem><SelectItem value="momentary">Momentary</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                          <FormField control={form.control} name={`switches.${idx}.manualActiveLow`} render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Active Low</FormLabel></FormItem>)} />
                        </div>
                      </>
                    )}
                    <Separator />
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium">PIR Configuration</h5>
                      <FormField control={form.control} name={`switches.${idx}.usePir`} render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Respond to PIR motion</FormLabel></FormItem>)} />
                      <FormField control={form.control} name={`switches.${idx}.dontAutoOff`} render={({ field }) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Don't auto-off (manual override)</FormLabel></FormItem>)} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={idx === 0} onClick={() => {
                        const swArr = [...form.getValues('switches')];
                        if (idx > 0) { const tmp = swArr[idx - 1]; swArr[idx - 1] = swArr[idx]; swArr[idx] = tmp; form.setValue('switches', swArr); }
                      }}>Up</Button>
                      <Button type="button" variant="outline" size="sm" disabled={idx === switches.length - 1} onClick={() => {
                        const swArr = [...form.getValues('switches')];
                        if (idx < swArr.length - 1) { const tmp = swArr[idx + 1]; swArr[idx + 1] = swArr[idx]; swArr[idx] = tmp; form.setValue('switches', swArr); }
                      }}>Down</Button>
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" onClick={() => { 
                const sw = form.getValues('switches') || []; 
                const deviceType = form.getValues('deviceType') || 'esp32';
                const maxSwitches = deviceType === 'esp8266' ? 4 : 8;
                
                if (sw.length >= maxSwitches) {
                  return; // Don't add more switches than allowed
                }
                
                const switchIndex = sw.length;
                
                // ESP8266 GPIO pin mapping (matches esp8266_config.h and documentation)
                const esp8266RelayPins = [4, 5, 12, 13];
                const esp8266ManualPins = [14, 16, 0, 2];
                
                // ESP32 default GPIO pin mapping
                const esp32RelayPins = [16, 17, 18, 19, 21, 22, 23, 25, 26, 27];
                const esp32ManualPins = [32, 33, 14, 12, 13, 15, 2, 4];
                
                const relayPins = deviceType === 'esp8266' ? esp8266RelayPins : esp32RelayPins;
                const manualPins = deviceType === 'esp8266' ? esp8266ManualPins : esp32ManualPins;
                
                const suggestedRelayGpio = relayPins[switchIndex] || relayPins[0] || 16;
                const suggestedManualGpio = manualPins[switchIndex] || manualPins[0] || 25;
                
                form.setValue('switches', [...sw, { 
                  id: `switch-${Date.now()}-${Math.floor(Math.random()*10000)}`, 
                  name: '', 
                  gpio: undefined, 
                  relayGpio: undefined, 
                  type: 'relay', 
                  icon: 'lightbulb', 
                  state: false, 
                  manualSwitchEnabled: false, 
                  manualSwitchGpio: undefined,
                  manualMode: 'maintained', 
                  manualActiveLow: true, 
                  usePir: false, 
                  dontAutoOff: false
                }]); 
              }} disabled={(form.watch('switches') || []).length >= (form.watch('deviceType') === 'esp8266' ? 4 : 8)}>
                Add Switch ({(form.watch('switches') || []).length}/{(form.watch('deviceType') === 'esp8266' ? 4 : 8)})
              </Button>
              {/* Auto-assigns correct GPIO pins based on device type (ESP8266/ESP32) */}
            </div>
            {/* GPIO Validation Errors */}
            {gpioValidation && !gpioValidation.valid && (
              <Alert className="border-danger/70 bg-danger/20">
                <XCircle className="h-4 w-4 text-danger" />
                <AlertDescription className="text-foreground">
                  <strong>GPIO Configuration Errors:</strong>
                  <ul className="mt-2 space-y-1">
                    {gpioValidation.errors.map((error, idx) => (
                      <li key={idx} className="text-sm">
                        • {error.message}
                      </li>
                    ))}
                  </ul>
                  {gpioValidation.warnings.length > 0 && (
                    <div className="mt-3">
                      <strong>Warnings:</strong>
                      <ul className="mt-1 space-y-1">
                        {gpioValidation.warnings.map((warning, idx) => (
                          <li key={idx} className="text-sm text-warning">
                            • {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {/* General Validation Errors */}
            {generalErrors.length > 0 && (
              <Alert className="border-danger/70 bg-danger/20">
                <XCircle className="h-4 w-4 text-danger" />
                <AlertDescription className="text-foreground">
                  <strong>Configuration Issues:</strong>
                  <ul className="mt-2 space-y-1">
                    {generalErrors.map((error, idx) => (
                      <li key={idx} className="text-sm whitespace-pre-line">
                        • {error}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter className="sticky bottom-0 bg-transparent py-4 z-10">
              <Button
                type="submit"
                className="w-full"
                disabled={gpioValidation && !gpioValidation.valid}
                onClick={(e) => {
                  try {
                    const btn = e.currentTarget as HTMLButtonElement;
                    // Build a safe, shallow snapshot to avoid circular refs (DOM nodes, fibers)
                    const values = form.getValues();
                    const snapshot: any = {
                      isSubmitting: form.formState.isSubmitting,
                      errorKeys: Object.keys(form.formState.errors || {}),
                      // Provide small, helpful value hints instead of entire deep object
                      values: {
                        name: values.name,
                        macAddress: values.macAddress,
                        ipAddress: values.ipAddress,
                        deviceType: values.deviceType,
                        switchesCount: Array.isArray(values.switches) ? values.switches.length : 0
                      },
                      buttonTag: btn.tagName,
                      buttonTypeAttr: btn.getAttribute('type'),
                      hasAssociatedForm: !!btn.form,
                      associatedFormName: btn.form?.name || btn.form?.id || null
                    };
                    console.log('[DeviceConfigDialog] Save button clicked (detailed):', snapshot);
                  } catch (err) {
                    console.log('[DeviceConfigDialog] Save button click logging failed', err);
                  }
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
