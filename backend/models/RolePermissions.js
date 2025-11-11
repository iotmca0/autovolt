const mongoose = require('mongoose');

const rolePermissionsSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    unique: true,
    enum: ['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'],
    index: true
  },

  // User Management Permissions
  userManagement: {
    canViewUsers: { type: Boolean, default: false },
    canCreateUsers: { type: Boolean, default: false },
    canEditUsers: { type: Boolean, default: false },
    canDeleteUsers: { type: Boolean, default: false },
    canApproveRegistrations: { type: Boolean, default: false },
    canChangeUserRoles: { type: Boolean, default: false },
    canResetPasswords: { type: Boolean, default: false },
    canViewUserActivity: { type: Boolean, default: false }
  },

  // Device Management Permissions
  deviceManagement: {
    canViewDevices: { type: Boolean, default: false },
    canCreateDevices: { type: Boolean, default: false },
    canEditDevices: { type: Boolean, default: false },
    canDeleteDevices: { type: Boolean, default: false },
    canControlDevices: { type: Boolean, default: false },
    canBulkControlDevices: { type: Boolean, default: false },
    canAssignDevices: { type: Boolean, default: false },
    canViewDeviceLogs: { type: Boolean, default: false },
    canConfigureDeviceSettings: { type: Boolean, default: false }
  },

  // Classroom/Facility Permissions
  classroomManagement: {
    canViewClassrooms: { type: Boolean, default: false },
    canCreateClassrooms: { type: Boolean, default: false },
    canEditClassrooms: { type: Boolean, default: false },
    canDeleteClassrooms: { type: Boolean, default: false },
    canAccessAllClassrooms: { type: Boolean, default: false },
    canOverrideDepartmentRestrictions: { type: Boolean, default: false },
    canBypassTimeRestrictions: { type: Boolean, default: false },
    canEmergencyAccess: { type: Boolean, default: false }
  },

  // Schedule Management Permissions
  scheduleManagement: {
    canViewSchedules: { type: Boolean, default: false },
    canCreateSchedules: { type: Boolean, default: false },
    canEditSchedules: { type: Boolean, default: false },
    canDeleteSchedules: { type: Boolean, default: false },
    canRunSchedulesManually: { type: Boolean, default: false },
    canToggleSchedules: { type: Boolean, default: false },
    canViewScheduleHistory: { type: Boolean, default: false }
  },

  // Activity & Logging Permissions
  activityManagement: {
    canViewActivities: { type: Boolean, default: false },
    canExportActivities: { type: Boolean, default: false },
    canViewLogs: { type: Boolean, default: false },
    canExportLogs: { type: Boolean, default: false },
    canDeleteOldLogs: { type: Boolean, default: false },
    canViewSystemLogs: { type: Boolean, default: false }
  },

  // Security & Monitoring Permissions
  securityManagement: {
    canViewSecurityAlerts: { type: Boolean, default: false },
    canAcknowledgeAlerts: { type: Boolean, default: false },
    canResolveAlerts: { type: Boolean, default: false },
    canCreateAlerts: { type: Boolean, default: false },
    canViewBlacklist: { type: Boolean, default: false },
    canManageBlacklist: { type: Boolean, default: false },
    canViewSecurityMetrics: { type: Boolean, default: false },
    canConfigureSecuritySettings: { type: Boolean, default: false }
  },

  // Ticket Management Permissions
  ticketManagement: {
    canViewTickets: { type: Boolean, default: false },
    canCreateTickets: { type: Boolean, default: false },
    canUpdateTickets: { type: Boolean, default: false },
    canDeleteTickets: { type: Boolean, default: false },
    canAssignTickets: { type: Boolean, default: false },
    canCloseTickets: { type: Boolean, default: false },
    canViewAllTickets: { type: Boolean, default: false },
    canViewTicketStats: { type: Boolean, default: false }
  },

  // Settings & Configuration Permissions
  systemManagement: {
    canViewSettings: { type: Boolean, default: false },
    canEditSettings: { type: Boolean, default: false },
    canViewSystemHealth: { type: Boolean, default: false },
    canRestartServices: { type: Boolean, default: false },
    canViewSystemLogs: { type: Boolean, default: false },
    canExportData: { type: Boolean, default: false },
    canImportData: { type: Boolean, default: false },
    canBackupData: { type: Boolean, default: false }
  },

  // Extension Request Permissions
  extensionManagement: {
    canRequestExtensions: { type: Boolean, default: false },
    canApproveExtensions: { type: Boolean, default: false },
    canViewExtensionRequests: { type: Boolean, default: false },
    canCancelExtensions: { type: Boolean, default: false }
  },

  // ESP32 Device Permissions
  esp32Management: {
    canViewESP32Devices: { type: Boolean, default: false },
    canConfigureESP32: { type: Boolean, default: false },
    canUpdateESP32Firmware: { type: Boolean, default: false },
    canMonitorESP32Status: { type: Boolean, default: false },
    canDebugESP32: { type: Boolean, default: false }
  },

  // Bulk Operations Permissions
  bulkOperations: {
    canPerformBulkDeviceControl: { type: Boolean, default: false },
    canBulkUpdateDevices: { type: Boolean, default: false },
    canBulkCreateDevices: { type: Boolean, default: false },
    canBulkDeleteDevices: { type: Boolean, default: false }
  },

  // Voice Control Permissions
  voiceControl: {
    enabled: { type: Boolean, default: false },
    canControlDevices: { type: Boolean, default: false },
    canViewDeviceStatus: { type: Boolean, default: false },
    canCreateSchedules: { type: Boolean, default: false },
    canQueryAnalytics: { type: Boolean, default: false },
    canAccessAllDevices: { type: Boolean, default: false },
    restrictToAssignedDevices: { type: Boolean, default: true }
  },

  // Department-specific restrictions
  departmentRestrictions: {
    restrictedToDepartment: { type: Boolean, default: false },
    allowedDepartments: [{ type: String, trim: true }],
    canAccessOtherDepartments: { type: Boolean, default: false }
  },

  // Time-based restrictions
  timeRestrictions: {
    restrictedHours: { type: Boolean, default: false },
    allowedStartTime: { type: String }, // HH:MM format
    allowedEndTime: { type: String }, // HH:MM format
    allowedDays: [{ type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }],
    canBypassTimeRestrictions: { type: Boolean, default: false }
  },

  // Notification preferences
  notifications: {
    receiveSecurityAlerts: { type: Boolean, default: false },
    receiveSystemAlerts: { type: Boolean, default: false },
    receiveActivityReports: { type: Boolean, default: false },
    receiveMaintenanceAlerts: { type: Boolean, default: false }
  },

  // API Access Permissions
  apiAccess: {
    canAccessAPI: { type: Boolean, default: false },
    apiRateLimit: { type: Number, default: 100 }, // requests per minute
    allowedEndpoints: [{ type: String }],
    restrictedEndpoints: [{ type: String }]
  },

  // Audit & Compliance
  audit: {
    requiresAuditLog: { type: Boolean, default: true },
    auditLevel: {
      type: String,
      enum: ['none', 'basic', 'detailed', 'full'],
      default: 'basic'
    },
    auditRetentionDays: { type: Number, default: 365 }
  },

  // Role metadata
  metadata: {
    description: { type: String, trim: true },
    isSystemRole: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
rolePermissionsSchema.index({ role: 1 });
rolePermissionsSchema.index({ 'metadata.isActive': 1 });
rolePermissionsSchema.index({ 'departmentRestrictions.allowedDepartments': 1 });

// Pre-save middleware to set default permissions based on role
rolePermissionsSchema.pre('save', function (next) {
  if (this.isNew) {
    this.setDefaultPermissionsForRole();
  }
  next();
});

// Instance method to set default permissions based on role
rolePermissionsSchema.methods.setDefaultPermissionsForRole = function () {
  const roleDefaults = {
    'super-admin': {
      userManagement: {
        canViewUsers: true, canCreateUsers: true, canEditUsers: true, canDeleteUsers: true,
        canApproveRegistrations: true, canChangeUserRoles: true, canResetPasswords: true, canViewUserActivity: true
      },
      deviceManagement: {
        canViewDevices: true, canCreateDevices: true, canEditDevices: true, canDeleteDevices: true,
        canControlDevices: true, canBulkControlDevices: true, canAssignDevices: true,
        canViewDeviceLogs: true, canConfigureDeviceSettings: true
      },
      classroomManagement: {
        canViewClassrooms: true, canCreateClassrooms: true, canEditClassrooms: true, canDeleteClassrooms: true,
        canAccessAllClassrooms: true, canOverrideDepartmentRestrictions: true,
        canBypassTimeRestrictions: true, canEmergencyAccess: true
      },
      scheduleManagement: {
        canViewSchedules: true, canCreateSchedules: true, canEditSchedules: true, canDeleteSchedules: true,
        canRunSchedulesManually: true, canToggleSchedules: true, canViewScheduleHistory: true
      },
      activityManagement: {
        canViewActivities: true, canExportActivities: true, canViewLogs: true,
        canExportLogs: true, canDeleteOldLogs: true, canViewSystemLogs: true
      },
      securityManagement: {
        canViewSecurityAlerts: true, canAcknowledgeAlerts: true, canResolveAlerts: true,
        canCreateAlerts: true, canViewBlacklist: true, canManageBlacklist: true,
        canViewSecurityMetrics: true, canConfigureSecuritySettings: true
      },
      ticketManagement: {
        canViewTickets: true, canCreateTickets: true, canUpdateTickets: true, canDeleteTickets: true,
        canAssignTickets: true, canCloseTickets: true, canViewAllTickets: true, canViewTicketStats: true
      },
      systemManagement: {
        canViewSettings: true, canEditSettings: true, canViewSystemHealth: true,
        canRestartServices: true, canViewSystemLogs: true, canExportData: true,
        canImportData: true, canBackupData: true
      },
      extensionManagement: {
        canRequestExtensions: true, canApproveExtensions: true, canViewExtensionRequests: true, canCancelExtensions: true
      },
      esp32Management: {
        canViewESP32Devices: true, canConfigureESP32: true, canUpdateESP32Firmware: true,
        canMonitorESP32Status: true, canDebugESP32: true
      },
      bulkOperations: {
        canPerformBulkDeviceControl: true, canBulkUpdateDevices: true,
        canBulkCreateDevices: true, canBulkDeleteDevices: true
      },
      voiceControl: {
        enabled: true, canControlDevices: true, canViewDeviceStatus: true,
        canCreateSchedules: true, canQueryAnalytics: true, canAccessAllDevices: true,
        restrictToAssignedDevices: false
      },
      apiAccess: { canAccessAPI: true, apiRateLimit: 1000 },
      notifications: {
        receiveSecurityAlerts: true, receiveSystemAlerts: true,
        receiveActivityReports: true, receiveMaintenanceAlerts: true
      }
    },
    'dean': {
      userManagement: {
        canViewUsers: true, canEditUsers: true, canApproveRegistrations: true, canViewUserActivity: true
      },
      deviceManagement: {
        canViewDevices: true, canEditDevices: true, canControlDevices: true, canAssignDevices: true, canViewDeviceLogs: true
      },
      classroomManagement: {
        canViewClassrooms: true, canEditClassrooms: true, canAccessAllClassrooms: true
      },
      scheduleManagement: {
        canViewSchedules: true, canCreateSchedules: true, canEditSchedules: true, canViewScheduleHistory: true
      },
      activityManagement: {
        canViewActivities: true, canExportActivities: true, canViewLogs: true
      },
      securityManagement: {
        canViewSecurityAlerts: true, canAcknowledgeAlerts: true
      },
      ticketManagement: {
        canViewTickets: true, canCreateTickets: true, canUpdateTickets: true, canAssignTickets: true, canViewTicketStats: true
      },
      systemManagement: {
        canViewSettings: true, canViewSystemHealth: true, canViewSystemLogs: true, canExportData: true
      },
      extensionManagement: {
        canRequestExtensions: true, canApproveExtensions: true, canViewExtensionRequests: true
      },
      bulkOperations: {
        canPerformBulkDeviceControl: true, canBulkUpdateDevices: true
      },
      voiceControl: {
        enabled: true, canControlDevices: true, canViewDeviceStatus: true,
        canCreateSchedules: true, canQueryAnalytics: true, canAccessAllDevices: true,
        restrictToAssignedDevices: false
      },
      apiAccess: { canAccessAPI: true, apiRateLimit: 300 },
      notifications: {
        receiveSecurityAlerts: true, receiveSystemAlerts: true,
        receiveActivityReports: true, receiveMaintenanceAlerts: true
      }
    },
    'admin': {
      userManagement: {
        canViewUsers: true, canCreateUsers: true, canEditUsers: true, canDeleteUsers: true,
        canApproveRegistrations: true, canChangeUserRoles: true, canResetPasswords: true, canViewUserActivity: true
      },
      deviceManagement: {
        canViewDevices: true, canCreateDevices: true, canEditDevices: true, canDeleteDevices: true,
        canControlDevices: true, canBulkControlDevices: true, canAssignDevices: true,
        canViewDeviceLogs: true, canConfigureDeviceSettings: true
      },
      classroomManagement: {
        canViewClassrooms: true, canCreateClassrooms: true, canEditClassrooms: true, canDeleteClassrooms: true,
        canAccessAllClassrooms: true, canOverrideDepartmentRestrictions: true,
        canBypassTimeRestrictions: true, canEmergencyAccess: true
      },
      scheduleManagement: {
        canViewSchedules: true, canCreateSchedules: true, canEditSchedules: true, canDeleteSchedules: true,
        canRunSchedulesManually: true, canToggleSchedules: true, canViewScheduleHistory: true
      },
      activityManagement: {
        canViewActivities: true, canExportActivities: true, canViewLogs: true,
        canExportLogs: true, canDeleteOldLogs: true, canViewSystemLogs: true
      },
      securityManagement: {
        canViewSecurityAlerts: true, canAcknowledgeAlerts: true, canResolveAlerts: true,
        canCreateAlerts: true, canViewBlacklist: true, canManageBlacklist: true,
        canViewSecurityMetrics: true, canConfigureSecuritySettings: true
      },
      ticketManagement: {
        canViewTickets: true, canCreateTickets: true, canUpdateTickets: true, canDeleteTickets: true,
        canAssignTickets: true, canCloseTickets: true, canViewAllTickets: true, canViewTicketStats: true
      },
      systemManagement: {
        canViewSettings: true, canEditSettings: true, canViewSystemHealth: true,
        canRestartServices: true, canViewSystemLogs: true, canExportData: true,
        canImportData: true, canBackupData: true
      },
      extensionManagement: {
        canRequestExtensions: true, canApproveExtensions: true, canViewExtensionRequests: true, canCancelExtensions: true
      },
      esp32Management: {
        canViewESP32Devices: true, canConfigureESP32: true, canUpdateESP32Firmware: true,
        canMonitorESP32Status: true, canDebugESP32: true
      },
      bulkOperations: {
        canPerformBulkDeviceControl: true, canBulkUpdateDevices: true,
        canBulkCreateDevices: true, canBulkDeleteDevices: true
      },
      voiceControl: {
        enabled: true, canControlDevices: true, canViewDeviceStatus: true,
        canCreateSchedules: true, canQueryAnalytics: true, canAccessAllDevices: true,
        restrictToAssignedDevices: false
      },
      apiAccess: { canAccessAPI: true, apiRateLimit: 1000 },
      notifications: {
        receiveSecurityAlerts: true, receiveSystemAlerts: true,
        receiveActivityReports: true, receiveMaintenanceAlerts: true
      }
    },
    'faculty': {
      userManagement: {
        canViewUsers: true
      },
      deviceManagement: {
        canViewDevices: true, canControlDevices: true
      },
      classroomManagement: {
        canViewClassrooms: true
      },
      scheduleManagement: {
        canViewSchedules: true, canCreateSchedules: true, canEditSchedules: true
      },
      activityManagement: {
        canViewActivities: true
      },
      ticketManagement: {
        canViewTickets: true, canCreateTickets: true, canUpdateTickets: true
      },
      extensionManagement: {
        canRequestExtensions: true, canViewExtensionRequests: true
      },
      voiceControl: {
        enabled: true, canControlDevices: true, canViewDeviceStatus: true,
        canCreateSchedules: false, canQueryAnalytics: false, canAccessAllDevices: false,
        restrictToAssignedDevices: true
      },
      departmentRestrictions: { restrictedToDepartment: true },
      timeRestrictions: { restrictedHours: true, allowedStartTime: '08:00', allowedEndTime: '18:00' },
      apiAccess: { canAccessAPI: true, apiRateLimit: 100 }
    },
    'teacher': {
      userManagement: {
        canViewUsers: true
      },
      deviceManagement: {
        canViewDevices: true, canControlDevices: true
      },
      classroomManagement: {
        canViewClassrooms: true
      },
      scheduleManagement: {
        canViewSchedules: true, canCreateSchedules: true, canEditSchedules: true
      },
      activityManagement: {
        canViewActivities: true
      },
      ticketManagement: {
        canViewTickets: true, canCreateTickets: true, canUpdateTickets: true
      },
      extensionManagement: {
        canRequestExtensions: true, canViewExtensionRequests: true
      },
      voiceControl: {
        enabled: true, canControlDevices: true, canViewDeviceStatus: true,
        canCreateSchedules: false, canQueryAnalytics: false, canAccessAllDevices: false,
        restrictToAssignedDevices: true
      },
      departmentRestrictions: { restrictedToDepartment: true },
      timeRestrictions: { restrictedHours: true, allowedStartTime: '08:00', allowedEndTime: '18:00' },
      apiAccess: { canAccessAPI: true, apiRateLimit: 100 }
    },
    'security': {
      deviceManagement: {
        canViewDevices: true, canControlDevices: true
      },
      classroomManagement: {
        canViewClassrooms: true, canEmergencyAccess: true
      },
      securityManagement: {
        canViewSecurityAlerts: true, canAcknowledgeAlerts: true, canCreateAlerts: true, canViewSecurityMetrics: true
      },
      activityManagement: {
        canViewActivities: true, canViewLogs: true
      },
      ticketManagement: {
        canViewTickets: true, canCreateTickets: true
      },
      notifications: {
        receiveSecurityAlerts: true, receiveSystemAlerts: true
      },
      voiceControl: {
        enabled: true, canControlDevices: true, canViewDeviceStatus: true,
        canCreateSchedules: false, canQueryAnalytics: false, canAccessAllDevices: true,
        restrictToAssignedDevices: false
      },
      timeRestrictions: { restrictedHours: true, allowedStartTime: '00:00', allowedEndTime: '23:59', allowedDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
      apiAccess: { canAccessAPI: true, apiRateLimit: 100 }
    },
    'student': {
      deviceManagement: {
        canViewDevices: true
      },
      classroomManagement: {
        canViewClassrooms: true
      },
      ticketManagement: {
        canCreateTickets: true
      },
      voiceControl: {
        enabled: false, canControlDevices: false, canViewDeviceStatus: true,
        canCreateSchedules: false, canQueryAnalytics: false, canAccessAllDevices: false,
        restrictToAssignedDevices: true
      },
      timeRestrictions: { restrictedHours: true, allowedStartTime: '08:00', allowedEndTime: '17:00', allowedDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
      apiAccess: { canAccessAPI: true, apiRateLimit: 50 }
    },
    'guest': {
      deviceManagement: {
        canViewDevices: true
      },
      classroomManagement: {
        canViewClassrooms: true
      },
      ticketManagement: {
        canCreateTickets: true
      },
      voiceControl: {
        enabled: false, canControlDevices: false, canViewDeviceStatus: false,
        canCreateSchedules: false, canQueryAnalytics: false, canAccessAllDevices: false,
        restrictToAssignedDevices: true
      },
      apiAccess: { canAccessAPI: true, apiRateLimit: 25 }
    }
  };

  const defaults = roleDefaults[this.role];
  if (defaults) {
    Object.keys(defaults).forEach(category => {
      if (this[category] && typeof defaults[category] === 'object') {
        Object.keys(defaults[category]).forEach(permission => {
          // Always set the default value, overriding any existing false values
          this[category][permission] = defaults[category][permission];
        });
      }
    });
  }
};

// Static method to get permissions for a role
rolePermissionsSchema.statics.getPermissionsForRole = function (role) {
  return this.findOne({ role, 'metadata.isActive': true });
};

// Instance method to check if a permission is granted
rolePermissionsSchema.methods.hasPermission = function (category, permission) {
  if (!this[category] || this[category][permission] === undefined) {
    return false;
  }
  return this[category][permission];
};

// Instance method to check multiple permissions
rolePermissionsSchema.methods.hasAnyPermission = function (permissions) {
  for (const [category, permission] of Object.entries(permissions)) {
    if (this.hasPermission(category, permission)) {
      return true;
    }
  }
  return false;
};

// Instance method to check all permissions
rolePermissionsSchema.methods.hasAllPermissions = function (permissions) {
  for (const [category, permission] of Object.entries(permissions)) {
    if (!this.hasPermission(category, permission)) {
      return false;
    }
  }
  return true;
};

// Instance method to get all permissions as a flat object
rolePermissionsSchema.methods.getAllPermissions = function () {
  const permissions = {};
  const categories = [
    'userManagement', 'deviceManagement', 'classroomManagement', 'scheduleManagement',
    'activityManagement', 'securityManagement', 'ticketManagement', 'systemManagement',
    'extensionManagement', 'esp32Management', 'bulkOperations'
  ];

  categories.forEach(category => {
    if (this[category]) {
      Object.keys(this[category]).forEach(permission => {
        permissions[`${category}.${permission}`] = this[category][permission];
      });
    }
  });

  return permissions;
};

module.exports = mongoose.model('RolePermissions', rolePermissionsSchema);
