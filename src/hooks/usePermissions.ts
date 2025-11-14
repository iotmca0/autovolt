import React from 'react';
import { useAuth } from '@/hooks/useAuth';

export const usePermissions = () => {
    const { user, refreshProfile } = useAuth();

    const role = user?.role || '';
    const permissions = (user?.permissions as any) || {};

    // Role hierarchy for backward compatibility
    const isSuperAdmin = role === 'super-admin';
    const isDean = role === 'dean';
    const isAdmin = role === 'admin';
    const isFaculty = role === 'faculty';
    const isTeacher = role === 'teacher';
    const isStudent = role === 'student';
    const isSecurity = role === 'security';
    const isGuest = role === 'guest';

    // Permission groups based on role hierarchy (fallback)
    const hasSuperAccess = isSuperAdmin;
    const hasAdminAccess = hasSuperAccess || isAdmin || permissions.canManageUsers;
    const hasManagementAccess = hasAdminAccess || isDean;
    const hasStaffAccess = hasManagementAccess || isFaculty || isTeacher || isSecurity;
    const hasBasicAccess = hasStaffAccess || isStudent || isGuest;

    // Use permissions from user object (which now includes role permissions)
    const canManageUsers = permissions.canManageUsers || hasAdminAccess;
    const canApproveUsers = permissions.canApproveUsers || hasManagementAccess;
    const canManageDevices = permissions.canManageDevices || hasStaffAccess;
    const canViewReports = permissions.canViewReports || hasManagementAccess;
    const canManageSchedule = permissions.canManageSchedule || hasStaffAccess;
    const canRequestExtensions = permissions.canRequestExtensions || isTeacher || isFaculty;
    const canApproveExtensions = permissions.canApproveExtensions || hasManagementAccess;
    const canViewSecurityAlerts = permissions.canViewSecurityAlerts || isSecurity || hasManagementAccess;
    const canAccessAllClassrooms = permissions.canAccessAllClassrooms || hasManagementAccess;
    const canBypassTimeRestrictions = permissions.canBypassTimeRestrictions || hasManagementAccess;
    const hasEmergencyAccess = permissions.hasEmergencyAccess || hasManagementAccess;
    const hasDepartmentOverride = permissions.hasDepartmentOverride || hasManagementAccess;

    // Device-specific permissions
    const canAccessSecurityDevices = permissions.canAccessSecurityDevices || isSecurity || hasManagementAccess;
    const canAccessStudentDevices = permissions.canAccessStudentDevices || isStudent || hasStaffAccess;
    const canAccessGuestDevices = permissions.canAccessGuestDevices || isGuest || hasBasicAccess;

    // Administrative permissions
    const canDeleteUsers = permissions.canDeleteUsers || hasAdminAccess;
    const canResetPasswords = permissions.canResetPasswords || hasAdminAccess;
    const canManageRoles = permissions.canManageRoles || hasSuperAccess;
    const canViewAuditLogs = permissions.canViewAuditLogs || hasManagementAccess;
    const canManageSettings = permissions.canManageSettings || hasAdminAccess;

    // Classroom and scheduling permissions
    const canCreateSchedules = permissions.canCreateSchedules || hasStaffAccess;
    const canModifySchedules = permissions.canModifySchedules || hasManagementAccess;
    const canOverrideSchedules = permissions.canOverrideSchedules || hasManagementAccess;
    const canViewAllSchedules = permissions.canViewAllSchedules || hasManagementAccess;

    // Communication permissions
    const canSendNotifications = permissions.canSendNotifications || hasStaffAccess;
    const canReceiveAlerts = permissions.canReceiveAlerts || hasBasicAccess;
    const canManageAnnouncements = permissions.canManageAnnouncements || hasManagementAccess;

    // Analytics permissions
    // Primary flag provided by backend (from RolePermissions.voiceControl.canQueryAnalytics)
    const canQueryAnalytics = permissions.canQueryAnalytics === true;

    // More permissive UI flag to show Analytics menus for operational roles too.
    // Backend routes still enforce their own authorization; this only controls visibility.
    const canViewAnalytics = Boolean(
        canQueryAnalytics ||
        permissions.canViewSystemHealth ||
        permissions.canViewReports ||
        permissions.canViewSecurityMetrics ||
        hasAdminAccess ||
        isDean ||
        isFaculty ||
        isTeacher
    );

    return {
        isSuperAdmin,
        isDean,
        isAdmin,
        isFaculty,
        isTeacher,
        isStudent,
        isSecurity,
        isGuest,
        hasSuperAccess,
        hasAdminAccess,
        hasManagementAccess,
        hasStaffAccess,
        hasBasicAccess,
        canManageUsers,
        canApproveUsers,
        canManageDevices,
        canViewReports,
        canManageSchedule,
        canRequestExtensions,
        canApproveExtensions,
        canViewSecurityAlerts,
        canAccessAllClassrooms,
        canBypassTimeRestrictions,
        hasEmergencyAccess,
        hasDepartmentOverride,
        canAccessSecurityDevices,
        canAccessStudentDevices,
        canAccessGuestDevices,
        canDeleteUsers,
        canResetPasswords,
        canManageRoles,
        canViewAuditLogs,
        canManageSettings,
        canCreateSchedules,
        canModifySchedules,
        canOverrideSchedules,
        canViewAllSchedules,
        canSendNotifications,
        canManageAnnouncements,
        canQueryAnalytics,
        canViewAnalytics,
        role,
        permissions,
        refreshProfile
    };
};