// --- AI/ML Microservice API ---
export const AI_ML_BASE_URL = import.meta.env.VITE_AI_ML_SERVICE_URL || 'http://127.0.0.1:8004';

export const aiMlAPI = {
  forecast: (device_id: string, history: number[], periods = 5) =>
    axios.post(`${AI_ML_BASE_URL}/forecast`, { device_id, history, periods }),
  schedule: (device_id: string, constraints?: Record<string, unknown>) =>
    axios.post(`${AI_ML_BASE_URL}/schedule`, { device_id, constraints }),
  anomaly: (device_id: string, values: number[]) =>
    axios.post(`${AI_ML_BASE_URL}/anomaly`, { device_id, values }),
  health: () => axios.get(`${AI_ML_BASE_URL}/health`),
};


import type { Device, Schedule } from '../types';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

// Auto-detect working API base URL
const API_URLS = [
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.VITE_API_BASE_URL_EXTRA
].filter(Boolean);

let detectedApiBaseUrl = API_URLS[0];

// Check if running in Capacitor (Android/iOS app)
const isCapacitor = Capacitor.isNativePlatform();

// In development, use the Vite proxy instead of direct backend connection
// BUT if running in Capacitor, always use direct backend URL
const isDevelopment = import.meta.env.DEV;
const effectiveBaseUrl = (isDevelopment && !isCapacitor) ? '' : 'http://172.16.3.171:3001/api'; // Empty string means relative to current origin

// Call detectApiBaseUrl on initialization (only in production)
if (!isDevelopment) {
  detectApiBaseUrl().catch((error) => {
    console.warn('[api] Failed to detect API base URL, using default:', detectedApiBaseUrl, error);
  });
}

export async function detectApiBaseUrl() {
  for (const url of API_URLS) {
    try {
      const res = await fetch(url + '/health');
      if (res.ok) {
        detectedApiBaseUrl = url;
         
        console.info('[api] Using API base URL:', url);
        return url;
      }
    } catch (e) {
      // Try next
    }
  }
  throw new Error('No working API URL found');
}

const api = axios.create({
  baseURL: effectiveBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
});

// Export the api instance for use in hooks
export { api };

// Alias for backward compatibility
export const apiService = api;

// Helper to get backend origin (strip trailing /api)
export const getBackendOrigin = () => {
  if (isDevelopment) {
    return window.location.origin; // Use Vite dev server
  }
  return detectedApiBaseUrl.replace(/\/api\/?$/, '');
};

// Normalize any accidental double /api prefixes (e.g., request to /api/devices when baseURL already ends with /api)
api.interceptors.request.use((config) => {
  if (config.url) {
    if (isDevelopment && !isCapacitor) {
      // In browser development, ensure URLs start with /api for Vite proxy
      if (!config.url.startsWith('/api/') && !config.url.startsWith('/api')) {
        config.url = '/api' + (config.url.startsWith('/') ? config.url : '/' + config.url);
      }
    } else {
      // In Capacitor or production, handle the existing logic
      // Replace leading /api/ with / if baseURL already ends with /api
      if (effectiveBaseUrl.endsWith('/api') && config.url.startsWith('/api/')) {
        config.url = config.url.replace(/^\/api\//, '/');
      }
    }
    // Guard against resulting // paths
    config.url = config.url.replace(/\/\//g, '/');
  }
  
  console.log('[API] Request:', config.method?.toUpperCase(), config.url, 'isCapacitor:', isCapacitor);
  
  return config;
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  console.error('Request interceptor error:', error);
  return Promise.reject(error);
});

// Authentication API endpoints
// (Removed duplicate authAPI declaration)

// Consolidated response interceptor (avoid duplicate logic)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
  const originalRequest: Record<string, unknown> = error.config || {};
    const status = error.response?.status;
    const path = (originalRequest?.url || '').toString();

    // Helper: log once
    const debugPayload = {
      status,
      data: error.response?.data,
      message: error.message,
      url: path,
      method: originalRequest.method,
    };
     
    console.error('API Error:', debugPayload);

    // If 401 during explicit login/register attempt -> just reject so UI can show error (NO redirect)
    if (status === 401 && /\/auth\/(login|register)/.test(path)) {
      return Promise.reject(error.response?.data || error);
    }

    // Token expired flow (single retry)
    if (status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const refreshUrl = isDevelopment ? '/api/auth/refresh-token' : `${detectedApiBaseUrl}/auth/refresh-token`;
          const refreshResp = await axios.post(refreshUrl, { refreshToken });
          if (refreshResp.data?.token) {
            localStorage.setItem('auth_token', refreshResp.data.token);
            api.defaults.headers.common['Authorization'] = `Bearer ${refreshResp.data.token}`;
            return api(originalRequest);
          }
        }
      } catch (refreshErr) {
         
        console.warn('Token refresh failed, clearing session');
      }
    }

    // Generic unauthorized (not login/register) -> clear & soft redirect only if a token had existed
    if (status === 401) {
      const errorCode = error.response?.data?.code;
      const voiceAuthErrors = new Set([
        'NO_VOICE_TOKEN',
        'INVALID_VOICE_SESSION',
        'VOICE_SESSION_EXPIRED',
        'SESSION_MISMATCH'
      ]);

      if (errorCode && voiceAuthErrors.has(errorCode)) {
        return Promise.reject(error.response?.data || error);
      }

      const hadToken = !!localStorage.getItem('auth_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      if (hadToken && window.location.pathname !== '/login') {
        // SPA friendly redirect
        window.history.replaceState({}, '', '/login');
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

// Settings types
export interface NotificationSettings {
  email: {
    enabled: boolean;
    recipients: string[];
  };
  push: {
    enabled: boolean;
  };
}

export interface SecuritySettings {
  deviceOfflineThreshold: number;
  motionDetectionEnabled: boolean;
}

export interface Settings {
  notifications: NotificationSettings;
  security: SecuritySettings;
  created: string;
  lastModified: string;
}

// Settings API endpoints
// Settings endpoints (baseURL already ends with /api)
export const getSettings = () => api.get<Settings>('/settings');

export const updateSettings = (settings: Partial<Settings>) =>
  api.put<Settings>('/settings', settings);

// (Removed second duplicate response interceptor to prevent double handling / forced reloads)

// Device REST API endpoints
export const deviceAPI = {
  // Old deviceAPI methods

  updateStatus: (deviceId: string, status: Partial<Device>) =>
    api.post<{ success: boolean; device: Device }>(`/device-api/${deviceId}/status`, status),


  sendCommand: (deviceId: string, command: { type: string; payload: unknown }) =>
    api.post<{ success: boolean }>(`/device-api/${deviceId}/command`, { command }),


  getCommands: (deviceId: string) =>
    api.get<{ commands: Array<{ type: string; payload: unknown }> }>(`/device-api/${deviceId}/commands`),

  // New deviceAPI methods
  getAllDevices: () => api.get('/devices'),

  createDevice: (deviceData: Partial<Device>) => api.post('/devices', deviceData),

  updateDevice: (deviceId: string, updates: Partial<Device>) =>
    api.put(`/devices/${deviceId}`, updates),

  deleteDevice: (deviceId: string) => api.delete(`/devices/${deviceId}`),

  toggleSwitch: (deviceId: string, switchId: string, state?: boolean) =>
    api.post(`/devices/${deviceId}/switches/${switchId}/toggle`, { state }),
  bulkToggle: (state: boolean) => api.post('/devices/bulk-toggle', { state }),
  bulkToggleByType: (type: string, state: boolean) => api.post(`/devices/bulk-toggle/type/${type}`, { state }),
  bulkToggleByLocation: (location: string, state: boolean) => api.post(`/devices/bulk-toggle/location/${encodeURIComponent(location)}`, { state }),

  getStats: () => api.get('/devices/stats'),
  // Secure admin-only: fetch single device with secret (?includeSecret=1)
  getDeviceWithSecret: (deviceId: string, pin?: string) =>
    api.get(`/devices/${deviceId}`, { params: { includeSecret: 1, ...(pin && { secretPin: pin }) } }),

  // GPIO pin information and validation
  getGpioPinInfo: (deviceId?: string, deviceType?: string) => api.get(`/devices/gpio-info/${deviceId || 'new'}`, { params: deviceType ? { deviceType } : {} }),
  validateGpioConfig: (config: Record<string, unknown>) => api.post('/devices/validate-gpio', config),
};

export const authAPI = {
  // Helper to build auth endpoint without risking double /api
  _url: (path: string) => `/auth${path}`.replace(/\/{2,}/g, '/'),
  login: (credentials: { email: string; password: string }) =>
    api.post('/auth/login', credentials),

  register: (userData: { name: string; email: string; password: string; role: string; department: string; employeeId?: string; phone?: string; designation?: string; reason?: string } | FormData) =>
    api.post('/auth/register', userData),

  getProfile: () => api.get('/auth/profile'),

  logout: () => api.post('/auth/logout'),

  updateProfile: (data: {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => api.put('/auth/profile', data),

  deleteAccount: () => api.delete('/auth/profile'),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),

  getPendingPermissionRequests: () => api.get('/auth/permission-requests/pending'),

  approvePermissionRequest: (requestId: string, data: { comments?: string }) =>
    api.put(`/auth/permission-requests/${requestId}/approve`, data),

  rejectPermissionRequest: (requestId: string, data: { rejectionReason: string; comments?: string }) =>
    api.put(`/auth/permission-requests/${requestId}/reject`, data),

  getNotifications: (params?: { limit?: number; unreadOnly?: boolean }) =>
    api.get('/auth/notifications', { params }),

  markNotificationAsRead: (notificationId: string) =>
    api.put(`/auth/notifications/${notificationId}/read`),

  getUnreadNotificationCount: () => api.get('/auth/notifications/unread-count'),
};

export const scheduleAPI = {
  getAllSchedules: () => api.get('/schedules'),

  getSchedule: (scheduleId: string) => api.get(`/schedules/${scheduleId}`),

  createSchedule: (scheduleData: Partial<Schedule>) => api.post('/schedules', scheduleData),

  updateSchedule: (scheduleId: string, updates: Partial<Schedule>) =>
    api.put(`/schedules/${scheduleId}`, updates),

  deleteSchedule: (scheduleId: string) => api.delete(`/schedules/${scheduleId}`),

  toggleSchedule: (scheduleId: string) => api.put(`/schedules/${scheduleId}/toggle`),
  runNow: (scheduleId: string) => api.post(`/schedules/${scheduleId}/run`),
};

export const activityAPI = {
  getActivities: (filters?: Record<string, unknown>) => api.get('/activities', { params: filters }),

  getDeviceActivities: (deviceId: string) => api.get(`/activities/device/${deviceId}`),

  getUserActivities: (userId: string) => api.get(`/activities/user/${userId}`),
};

export const ticketAPI = {
  createTicket: (ticketData: {
    title: string;
    description: string;
    category: string;
    priority?: string;
    department?: string;
    location?: string;
    deviceId?: string;
    tags?: string[];
    mentionedUsers?: string[];
  }) => api.post('/tickets', ticketData),

  getTickets: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    category?: string;
    priority?: string;
    search?: string;
  }) => api.get('/tickets', { params }),

  getTicket: (ticketId: string) => api.get(`/tickets/${ticketId}`),

  updateTicket: (ticketId: string, updates: {
    status?: string;
    assignedTo?: string;
    priority?: string;
    resolution?: string;
    estimatedHours?: number;
    actualHours?: number;
    comment?: string;
    isInternal?: boolean;
  }) => api.put(`/tickets/${ticketId}`, updates),

  deleteTicket: (ticketId: string) => api.delete(`/tickets/${ticketId}`),

  getTicketStats: () => api.get('/tickets/stats'),
};

export const rolePermissionsAPI = {
  // Get all role permissions
  getAllRolePermissions: () => api.get('/role-permissions'),

  // Get permissions for a specific role
  getRolePermissions: (role: string) => api.get(`/role-permissions/${role}`),

  // Create new role permissions
  createRolePermissions: (data: {
    role: string;
    userManagement?: Record<string, unknown>;
    deviceManagement?: Record<string, unknown>;
    classroomManagement?: Record<string, unknown>;
    scheduleManagement?: Record<string, unknown>;
    activityManagement?: Record<string, unknown>;
    securityManagement?: Record<string, unknown>;
    ticketManagement?: Record<string, unknown>;
    systemManagement?: Record<string, unknown>;
    extensionManagement?: Record<string, unknown>;
    calendarIntegration?: Record<string, unknown>;
    esp32Management?: Record<string, unknown>;
    bulkOperations?: Record<string, unknown>;
    departmentRestrictions?: Record<string, unknown>;
    timeRestrictions?: Record<string, unknown>;
    notifications?: Record<string, unknown>;
    apiAccess?: Record<string, unknown>;
    audit?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => api.post('/role-permissions', data),

  // Update permissions for a specific role
  updateRolePermissions: (role: string, updates: Record<string, unknown>) =>
    api.put(`/role-permissions/${role}`, updates),

  // Partially update permissions for a specific role
  patchRolePermissions: (role: string, updates: Record<string, unknown>) =>
    api.patch(`/role-permissions/${role}`, updates),

  // Delete permissions for a specific role
  deleteRolePermissions: (role: string) => api.delete(`/role-permissions/${role}`),

  // Reset permissions to defaults for a specific role
  resetRolePermissions: (role: string) => api.post(`/role-permissions/${role}/reset`),

  // Initialize default permissions for all roles
  initializeRolePermissions: () => api.post('/role-permissions/initialize'),

  // Check if a role has a specific permission
  checkPermission: (role: string, category: string, permission: string) =>
    api.get(`/role-permissions/check/${role}/${category}/${permission}`),
};

export const devicePermissionsAPI = {
  // Grant device permission to user
  grantDevicePermission: (data: {
    userId: string;
    deviceId: string;
    permissions?: {
      canTurnOn?: boolean;
      canTurnOff?: boolean;
      canViewStatus?: boolean;
      canSchedule?: boolean;
      canModifySettings?: boolean;
      canViewHistory?: boolean;
      canAdjustBrightness?: boolean;
      canAdjustSpeed?: boolean;
      canChangeInput?: boolean;
      canConfigurePir?: boolean;
      canViewPirData?: boolean;
      canDisablePir?: boolean;
    };
    restrictions?: {
      maxUsesPerDay?: number;
      allowedTimeSlots?: string[];
      maxBrightnessLevel?: number;
      maxFanSpeed?: number;
      allowedInputSources?: string[];
    };
    expiresAt?: string;
    reason?: string;
  }) => api.post('/device-permissions/grant', data),

  // Get user's device permissions
  getUserDevicePermissions: (userId: string) => api.get(`/device-permissions/user/${userId}`),

  // Update device permission
  updateDevicePermission: (permissionId: string, data: {
  permissions?: Record<string, unknown>;
  restrictions?: Record<string, unknown>;
    expiresAt?: string;
    reason?: string;
  }) => api.put(`/device-permissions/${permissionId}`, data),

  // Revoke device permission
  revokeDevicePermission: (permissionId: string) => api.delete(`/device-permissions/${permissionId}`),

  // Get device permissions summary
  getDevicePermissionsSummary: (classroom?: string) =>
    api.get('/device-permissions/summary', { params: { classroom } }),

  // Grant temporary override
  grantTemporaryOverride: (permissionId: string, data: {
    durationMinutes?: number;
    reason?: string;
  }) => api.post(`/device-permissions/${permissionId}/override`, data),
};

// User management API endpoints
export const usersAPI = {
  getAllUsers: (params?: { search?: string; role?: string; department?: string; limit?: number }) => 
    api.get('/users', { params }),
  searchUsersForMention: (search: string) => 
    api.get('/users', { params: { search, limit: 20 } }),
  bulkActivateUsers: (userIds: string[]) => api.patch('/users/bulk-activate', { userIds }),
  bulkDeactivateUsers: (userIds: string[]) => api.patch('/users/bulk-deactivate', { userIds }),
  bulkDeleteUsers: (userIds: string[]) => api.delete('/users/bulk-delete', { data: { userIds } }),
  bulkAssignRole: (userIds: string[], role: string) => api.patch('/users/bulk-assign-role', { userIds, role }),
};

export const settingsAPI = {
  // Get system settings
  getSettings: () => api.get<Settings>('/settings'),

  // Update system settings
  updateSettings: (settings: Partial<Settings>) =>
    api.put<Settings>('/settings', settings),
};

export const esp32API = {
  // Get device configuration for ESP32
  getDeviceConfig: (macAddress: string) => api.get(`/esp32/config/${macAddress}`),

  // Update device status from ESP32
  updateDeviceStatus: (macAddress: string, data: {
    switchId?: string;
    state?: boolean;
    switches?: Array<{ id: string; state: boolean }>;
    heartbeat?: boolean;
  }) => api.post(`/esp32/state/${macAddress}`, data),

  // Send command to ESP32 device
  sendCommand: (macAddress: string, command: { type: string; payload: unknown }) =>
    api.post(`/esp32/command/${macAddress}`, { command }),
};

export const integrationsAPI = {
  // RSS Feed Management
  rss: {
    getAll: () => api.get('/integrations/rss'),
    create: (data: {
      name: string;
      url: string;
      updateInterval?: number;
      maxItems?: number;
      autoPublish?: boolean;
      filters?: Record<string, unknown>;
    }) => api.post('/integrations/rss', data),
    update: (feedId: string, data: Partial<{
      name: string;
      url: string;
      updateInterval: number;
      maxItems: number;
      autoPublish: boolean;
      filters: Record<string, unknown>;
    }>) => api.patch(`/integrations/rss/${feedId}`, data),
    delete: (feedId: string) => api.delete(`/integrations/rss/${feedId}`),
    fetch: (feedId: string) => api.post(`/integrations/rss/${feedId}/fetch`),
  },

  // Social Media Management
  socialMedia: {
    getAll: () => api.get('/integrations/social-media'),
    create: (data: {
      name: string;
      platform: 'instagram' | 'twitter' | 'facebook';
      accessToken: string;
      accounts?: string[];
      hashtags?: string[];
      updateInterval?: number;
      autoPublish?: boolean;
    }) => api.post('/integrations/social-media', data),
    update: (feedId: string, data: Partial<{
      name: string;
      platform: string;
      accessToken: string;
      accounts: string[];
      hashtags: string[];
      updateInterval: number;
      autoPublish: boolean;
    }>) => api.patch(`/integrations/social-media/${feedId}`, data),
    delete: (feedId: string) => api.delete(`/integrations/social-media/${feedId}`),
    fetch: (feedId: string) => api.post(`/integrations/social-media/${feedId}/fetch`),
  },

  // Weather Management
  weather: {
    getAll: () => api.get('/integrations/weather'),
    create: (data: {
      name: string;
      apiKey: string;
      location: string;
      units?: 'metric' | 'imperial';
      updateInterval?: number;
      autoPublish?: boolean;
    }) => api.post('/integrations/weather', data),
    update: (feedId: string, data: Partial<{
      name: string;
      apiKey: string;
      location: string;
      units: string;
      updateInterval: number;
      autoPublish: boolean;
    }>) => api.patch(`/integrations/weather/${feedId}`, data),
    delete: (feedId: string) => api.delete(`/integrations/weather/${feedId}`),
    fetch: (feedId: string) => api.post(`/integrations/weather/${feedId}/fetch`),
  },

  // Webhook Management
  webhooks: {
    getAll: () => api.get('/integrations/webhooks'),
    getDetails: (feedId: string) => api.get(`/integrations/webhooks/${feedId}`),
    create: (data: {
      name: string;
      autoPublish?: boolean;
    }) => api.post('/integrations/webhooks', data),
    update: (feedId: string, data: Partial<{
      name: string;
      autoPublish: boolean;
    }>) => api.patch(`/integrations/webhooks/${feedId}`, data),
    delete: (feedId: string) => api.delete(`/integrations/webhooks/${feedId}`),
    test: (feedId: string) => api.post(`/integrations/webhooks/${feedId}/test`),
    getStats: (feedId: string) => api.get(`/integrations/webhooks/${feedId}/stats`),
  },

  // Database Management
  database: {
    getAll: () => api.get('/integrations/database'),
    create: (data: {
      name: string;
      dbType: 'mysql' | 'postgres' | 'mssql';
      connectionString: string;
      query: string;
      updateInterval?: number;
      autoPublish?: boolean;
    }) => api.post('/integrations/database', data),
    update: (feedId: string, data: Partial<{
      name: string;
      dbType: string;
      connectionString: string;
      query: string;
      updateInterval: number;
      autoPublish: boolean;
    }>) => api.patch(`/integrations/database/${feedId}`, data),
    delete: (feedId: string) => api.delete(`/integrations/database/${feedId}`),
    fetch: (feedId: string) => api.post(`/integrations/database/${feedId}/fetch`),
    test: (data: {
      dbType: string;
      connectionString: string;
      query: string;
    }) => api.post('/integrations/database/test', data),
  },

  // General Integration Management
  getAll: () => api.get('/integrations'),
  getById: (id: string) => api.get(`/integrations/${id}`),
  delete: (id: string) => api.delete(`/integrations/${id}`),
};

export const voiceAssistantAPI = {
  // Voice session management
  createSession: () => api.post('/voice-assistant/session/create'),
  listSessions: () => api.get('/voice-assistant/session/list'),
  revokeSession: (voiceToken: string) => api.delete('/voice-assistant/session/revoke', { data: { voiceToken } }),
  revokeAllSessions: () => api.post('/voice-assistant/session/revoke-all'),

  // Voice command processing
  processVoiceCommand: (data: {
    command: string;
    deviceName?: string;
    switchName?: string;
    assistant?: string;
    voiceToken?: string; // Made optional for JWT fallback
    // Extended structured intent support (optional)
    intentType?: string;
    devices?: string[];
    parameters?: Record<string, unknown>;
  }) => api.post('/voice-assistant/voice/command', data),

  // Optional client-side voice event logging (best-effort)
  logEvent: (event: {
    level: 'info' | 'warn' | 'error';
    stage: 'parse' | 'execute' | 'confirm' | 'permission' | 'other';
    message: string;
    data?: Record<string, unknown>;
    ts?: number;
  }) => api.post('/voice-assistant/log', event),

  // Device discovery for voice assistants
  discoverDevices: () => api.get('/voice-assistant/devices/discovery'),

  // Get device status
  getDeviceStatus: (deviceId: string) => api.get(`/voice-assistant/devices/${deviceId}/status`),

  // Google Assistant integration
  handleGoogleAction: (inputs: unknown[], requestId: string) =>
    api.post('/voice-assistant/google/action', { inputs, requestId }),

  // Amazon Alexa integration
  handleAlexaRequest: (directive: unknown) =>
    api.post('/voice-assistant/alexa/smart-home', { directive }),

  // Siri/HomeKit integration
  handleSiriRequest: (data: {
    intent: string;
    deviceId?: string;
    command?: string;
    parameters?: Record<string, unknown>;
  }) => api.post('/voice-assistant/siri/webhook', data),
};

// Voice analytics API (for insights/dashboards)
export const voiceAnalyticsAPI = {
  summary: (days = 7) => api.get('/analytics/voice/summary', { params: { days } }),
  timeseries: (granularity: 'hour' | 'day' = 'day', days = 7) =>
    api.get('/analytics/voice/timeseries', { params: { granularity, days } }),
  topIntents: (limit = 10, days = 7) => api.get('/analytics/voice/top-intents', { params: { limit, days } }),
  topErrors: (limit = 10, days = 7) => api.get('/analytics/voice/top-errors', { params: { limit, days } }),
};

// Energy breakdown API (new immutable aggregate powered analytics)
export const energyAPI = {
  summary: () => api.get('/analytics/energy-summary'),
  dailyBreakdown: (date: string, classroom?: string, deviceId?: string) =>
    api.get('/analytics/energy-breakdown/daily', { params: { date, classroom, deviceId } }),
  hourlyBreakdown: (date: string, classroom?: string, deviceId?: string) =>
    api.get('/analytics/energy-breakdown/hourly', { params: { date, classroom, deviceId } }),
  monthlyBreakdown: (year: number, month: number, classroom?: string, deviceId?: string) =>
    api.get('/analytics/energy-breakdown/monthly', { params: { year, month, classroom, deviceId } }),
  yearlyBreakdown: (year: number, classroom?: string) =>
    api.get('/analytics/energy-breakdown/yearly', { params: { year, classroom } })
};
