
export interface ScheduledNotification {
  time: string; // HH:MM format
  message: string;
  enabled: boolean;
  daysOfWeek: number[]; // 0-6, Sunday to Saturday
  lastTriggered?: Date;
}

export interface DeviceNotificationSettings {
  afterTime: string; // HH:MM format - notify after this time
  daysOfWeek: number[]; // 0-6, Sunday to Saturday
  enabled: boolean;
  lastTriggered?: Date;
}

export interface Device {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  status: 'online' | 'offline';
  switches: Switch[];
  pirEnabled: boolean;
  pirGpio?: number;
  pirAutoOffDelay?: number;
  pirSensor?: PirSensor;
  // Dual sensor support (Fixed GPIO: 34 for PIR, 35 for Microwave)
  pirSensorType?: 'hc-sr501' | 'rcwl-0516' | 'both';
  pirSensitivity?: number; // 0-100%
  pirDetectionRange?: number; // 1-10 meters
  motionDetectionLogic?: 'and' | 'or' | 'weighted';
  // PIR Detection Schedule - Time-based control
  pirDetectionSchedule?: {
    enabled: boolean;
    activeStartTime: string; // HH:MM format
    activeEndTime: string; // HH:MM format
    daysOfWeek?: number[]; // 0-6, Sunday to Saturday
  };
  lastSeen: Date;
  location?: string;
  classroom?: string;
  assignedUsers?: string[];
  deviceType?: 'esp32' | 'esp8266'; // Device type for filtering
  notificationSettings?: DeviceNotificationSettings;
}

export interface Switch {
  id: string;
  name: string;
  // Primary GPIO used by backend model; keep optional to avoid breaking existing code paths
  gpio?: number;
  relayGpio: number;
  state: boolean;
  type: 'relay' | 'light' | 'fan' | 'outlet' | 'projector' | 'ac';
  icon?: string;
  manualSwitchEnabled: boolean;
  manualSwitchGpio?: number;
  manualMode?: 'maintained' | 'momentary';
  manualActiveLow?: boolean;
  usePir: boolean;
  schedule?: Schedule[];
  powerConsumption?: number;
  dontAutoOff?: boolean;
}

export interface PirSensor {
  id: string;
  name: string;
  gpio: number;
  isActive: boolean;
  triggered: boolean;
  sensitivity: number;
  timeout: number; // auto-off timeout in seconds
  linkedSwitches: string[]; // switch IDs
  // Dual sensor support
  sensorType?: 'hc-sr501' | 'rcwl-0516' | 'both';
  detectionRange?: number; // meters
  secondaryGpio?: number;
  secondaryType?: 'hc-sr501' | 'rcwl-0516';
  secondaryTriggered?: boolean;
  detectionLogic?: 'and' | 'or' | 'weighted';
  schedule?: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'daily' | 'weekly' | 'once';
  time: string;
  days?: number[]; // 0-6, Sunday to Saturday
  action: 'on' | 'off';
  duration?: number; // auto-off after X minutes
  checkHolidays?: boolean;
  respectMotion?: boolean;
  timeoutMinutes?: number;
  switches: Array<{ deviceId: string; switchId: string }>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super-admin' | 'dean' | 'hod' | 'admin' | 'faculty' | 'teacher' | 'student' | 'security' | 'guest';
  roleLevel: number;
  department?: string;
  employeeId?: string;
  designation?: string;
  phone?: string;
  accessLevel: 'full' | 'limited' | 'readonly';
  isActive: boolean;
  isApproved: boolean;
  assignedDevices: string[];
  assignedRooms: string[];
  permissions: {
    canManageUsers: boolean;
    canApproveUsers: boolean;
    canManageDevices: boolean;
    canViewReports: boolean;
    canManageSchedule: boolean;
    canRequestExtensions: boolean;
    canApproveExtensions: boolean;
    canViewSecurityAlerts: boolean;
    canAccessAllClassrooms: boolean;
    canBypassTimeRestrictions: boolean;
    hasEmergencyAccess: boolean;
    hasDepartmentOverride: boolean;
    canAccessSecurityDevices: boolean;
    canAccessStudentDevices: boolean;
    canAccessGuestDevices: boolean;
    canDeleteUsers: boolean;
    canResetPasswords: boolean;
    canManageRoles: boolean;
    canViewAuditLogs: boolean;
    canManageSettings: boolean;
    canCreateSchedules: boolean;
    canModifySchedules: boolean;
    canOverrideSchedules: boolean;
    canViewAllSchedules: boolean;
    canSendNotifications: boolean;
    canReceiveAlerts: boolean;
    canManageAnnouncements: boolean;
  };
  lastLogin: Date;
  registrationDate: string;
  isOnline?: boolean;
  lastSeen?: Date;
}

export interface ActivityLog {
  id: string;
  deviceId: string;
  deviceName: string;
  switchId?: string;
  switchName?: string;
  action: 'on' | 'off' | 'toggle' | 'created' | 'updated' | 'deleted';
  triggeredBy: 'user' | 'schedule' | 'pir' | 'master' | 'system' | 'manual_switch' | 'voice_assistant' | 'monitoring';
  userId?: string;
  userName?: string;
  location: string;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  duration?: number;
  powerConsumption?: number;
  conflictResolution?: {
    hasConflict: boolean;
    conflictType?: string;
    resolution?: string;
    responseTime?: number;
  } | string;
  deviceStatus?: {
    isOnline: boolean;
    responseTime?: number;
    signalStrength?: number;
  };
  isManualOverride?: boolean;
  metadata?: any;
  context?: any;
}

export interface Holiday {
  id: string;
  name: string;
  date: Date;
  type: 'college' | 'national' | 'religious';
  createdBy?: string;
}

export interface DeviceConfig {
  switches: Array<{
    gpio: number;
    name: string;
    type: string;
    hasManualSwitch: boolean;
    manualSwitchGpio?: number;
    dontAutoOff?: boolean;
  }>;
  pirSensor?: {
    gpio: number;
    name: string;
    sensitivity: number;
    timeout: number;
  };
  updateInterval: number;
  otaEnabled: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DeviceStats {
  totalDevices: number;
  onlineDevices: number;
  totalSwitches: number;
  activeSwitches: number;
  totalPirSensors: number;
  activePirSensors: number;
}

export interface Notice {
  _id: string;
  title: string;
  content: string;
  contentType: 'text' | 'image' | 'video' | 'document';
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'general' | 'academic' | 'administrative' | 'event' | 'emergency' | 'maintenance';
  status: 'pending' | 'approved' | 'rejected' | 'published' | 'archived';
  submittedBy: {
    _id: string;
    name: string;
    email: string;
    role: string;
    department?: string;
  };
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
    role: string;
  };
  approvedAt?: Date;
  publishedAt?: Date;
  expiryDate?: Date;
  attachments: Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    url: string;
    uploadedAt: Date;
  }>;
  targetAudience: {
    roles?: string[];
    departments?: string[];
    classes?: string[];
  };
  targetBoards?: Array<{
    boardId: string;
    assignedBy: string;
    priority: number;
    displayOrder: number;
  }>;
  driveLink?: string;
  displayDevices?: Array<{
    deviceId: string;
    displayedAt: Date;
    displayDuration: number;
  }>;
  viewCount: number;
  isActive: boolean;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  isExpired?: boolean;
  formattedExpiryDate?: string;
}

export interface NoticeSubmissionData {
  title: string;
  content: string;
  contentType: 'text' | 'image' | 'video' | 'document';
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'general' | 'academic' | 'administrative' | 'event' | 'emergency' | 'maintenance';
  expiryDate?: string;
  targetAudience: {
    roles?: string[];
    departments?: string[];
    classes?: string[];
  };
  attachments?: File[];
}

export interface NoticeReviewData {
  action: 'approve' | 'reject';
  rejectionReason?: string;
}

export interface NoticeStats {
  total: number;
  pending: number;
  published: number;
  rejected: number;
  breakdown: Array<{
    _id: string;
    count: number;
  }>;
}

export interface NoticeFilters {
  status?: string;
  category?: string;
  priority?: string;
  submittedBy?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// Re-export new comprehensive type definitions
// ============================================
// Import all the newly defined types from separate files
export * from './device';
export * from './user';
export * from './analytics';
export * from './activityLog';
export * from './common';
