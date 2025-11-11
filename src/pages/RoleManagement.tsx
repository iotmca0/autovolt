import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Shield, Save, RefreshCw, AlertTriangle, Users, Monitor, Building, Calendar, Activity, Lock, Ticket, Settings, Clock, Bell, Zap, Database } from 'lucide-react';
import { rolePermissionsAPI } from '@/services/api';

interface PermissionCategory {
  [key: string]: boolean;
}

interface RolePermissions {
  userManagement: PermissionCategory;
  deviceManagement: PermissionCategory;
  classroomManagement: PermissionCategory;
  scheduleManagement: PermissionCategory;
  administrative: PermissionCategory;
  systemAccess: PermissionCategory;
  // Keep the original fields for backend compatibility
  activityManagement?: PermissionCategory;
  securityManagement?: PermissionCategory;
  ticketManagement?: PermissionCategory;
  systemManagement?: PermissionCategory;
  extensionManagement?: PermissionCategory;
  voiceControl?: PermissionCategory;
  calendarIntegration?: PermissionCategory;
  esp32Management?: PermissionCategory;
  bulkOperations?: PermissionCategory;
  departmentRestrictions?: PermissionCategory;
  timeRestrictions?: PermissionCategory;
  notifications?: PermissionCategory;
  apiAccess?: PermissionCategory;
  audit?: PermissionCategory;
  metadata?: PermissionCategory;
}

interface Role {
  role: string;
  label: string;
  description: string;
  permissions: RolePermissions;
  isSystemRole?: boolean;
  isActive?: boolean;
}

const RoleManagement: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        fetchRolePermissions();
    }, []);

    const fetchRolePermissions = async () => {
        setLoading(true);
        try {
            const response = await rolePermissionsAPI.getAllRolePermissions();
            let roleData = response.data?.data || response.data || [];

            // If no roles exist, initialize default permissions
            if (!roleData || roleData.length === 0) {
                console.log('No role permissions found, initializing defaults...');
                await rolePermissionsAPI.initializeRolePermissions();
                // Fetch again after initialization
                const initResponse = await rolePermissionsAPI.getAllRolePermissions();
                roleData = initResponse.data?.data || initResponse.data || [];
            }

            // Ensure roleData is an array
            if (!Array.isArray(roleData)) {
                console.error('API response is not an array:', roleData);
                roleData = [];
            }

            // Transform backend data to frontend format
            const transformedRoles: Role[] = roleData.map((roleData: any) => {
                // Extract permissions from roleData, excluding metadata and other fields
                const { role, metadata, createdAt, updatedAt, _id, ...permissions } = roleData;

                return {
                    role: roleData.role,
                    label: getRoleLabel(roleData.role),
                    description: getRoleDescription(roleData.role),
                    permissions: permissions as RolePermissions,
                    isSystemRole: roleData.metadata?.isSystemRole || false,
                    isActive: roleData.metadata?.isActive !== false
                };
            });

            setRoles(transformedRoles);
        } catch (error) {
            console.error('Failed to fetch role permissions:', error);
            toast({
                title: 'Error',
                description: 'Failed to load role permissions',
                variant: 'destructive'
            });
        }
        setLoading(false);
    };

    const getRoleLabel = (role: string): string => {
        const labels: Record<string, string> = {
            'super-admin': 'Super Administrator',
            'dean': 'Dean',
            'admin': 'Administrator',
            'faculty': 'Faculty',
            'teacher': 'Teacher',
            'student': 'Student',
            'security': 'Security Personnel',
            'guest': 'Guest'
        };
        return labels[role] || role.charAt(0).toUpperCase() + role.slice(1);
    };

    const getRoleDescription = (role: string): string => {
        const descriptions: Record<string, string> = {
            'super-admin': 'Complete system access with all permissions and system management',
            'dean': 'Academic leadership with oversight of faculty and departmental management',
            'admin': 'System administration with user management and configuration access',
            'faculty': 'Teaching staff with classroom and device control access',
            'teacher': 'Teaching staff with classroom and device control access',
            'student': 'Student access to facilities and basic system features',
            'security': 'Security monitoring and emergency access capabilities',
            'guest': 'Limited access for visitors and temporary users'
        };
        return descriptions[role] || 'Role description not available';
    };

    const updateRolePermission = (roleName: string, category: string, permission: string, value: boolean) => {
        setRoles(prevRoles =>
            prevRoles.map(role =>
                role.role === roleName
                    ? {
                        ...role,
                        permissions: {
                            ...role.permissions,
                            [category]: {
                                ...role.permissions[category as keyof RolePermissions] as PermissionCategory,
                                [permission]: value
                            }
                        }
                    }
                    : role
            )
        );
    };

    const saveRolePermissions = async () => {
        setSaving(true);
        try {
            // Save each role's permissions
            for (const role of roles) {
                if (!role.isSystemRole) { // Only save non-system roles
                    await rolePermissionsAPI.updateRolePermissions(role.role, role.permissions);
                }
            }

            toast({
                title: 'Success',
                description: 'Role permissions updated successfully',
            });
        } catch (error) {
            console.error('Failed to save role permissions:', error);
            toast({
                title: 'Error',
                description: 'Failed to save role permissions',
                variant: 'destructive'
            });
        }
        setSaving(false);
    };

    const resetToDefaults = async () => {
        try {
            setLoading(true);
            // Reset by calling the backend reset endpoint for each role
            for (const role of roles) {
                if (!role.isSystemRole) {
                    await rolePermissionsAPI.resetRolePermissions(role.role);
                }
            }
            // Re-fetch to get the updated permissions
            await fetchRolePermissions();
            toast({
                title: 'Reset',
                description: 'Role permissions reset to defaults',
            });
        } catch (error) {
            console.error('Failed to reset role permissions:', error);
            toast({
                title: 'Error',
                description: 'Failed to reset role permissions',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const permissionCategories = {
        userManagement: {
            icon: Users,
            label: 'User Management',
            permissions: {
                canViewUsers: 'View Users',
                canCreateUsers: 'Create Users',
                canEditUsers: 'Edit Users',
                canDeleteUsers: 'Delete Users',
                canApproveRegistrations: 'Approve Registrations'
            }
        },
        deviceManagement: {
            icon: Monitor,
            label: 'Device Control',
            permissions: {
                canViewDevices: 'View Devices',
                canControlDevices: 'Control Devices',
                canCreateDevices: 'Create Devices',
                canEditDevices: 'Edit Devices',
                canDeleteDevices: 'Delete Devices'
            }
        },
        classroomManagement: {
            icon: Building,
            label: 'Classroom Access',
            permissions: {
                canViewClassrooms: 'View Classrooms',
                canAccessAllClassrooms: 'Access All Classrooms',
                canCreateClassrooms: 'Create Classrooms',
                canEditClassrooms: 'Edit Classrooms'
            }
        },
        scheduleManagement: {
            icon: Calendar,
            label: 'Scheduling',
            permissions: {
                canViewSchedules: 'View Schedules',
                canCreateSchedules: 'Create Schedules',
                canEditSchedules: 'Edit Schedules',
                canDeleteSchedules: 'Delete Schedules'
            }
        },
        systemManagement: {
            icon: Shield,
            label: 'System Administration',
            permissions: {
                canViewSettings: 'View Settings',
                canEditSettings: 'Edit Settings',
                canViewSystemLogs: 'View System Logs',
                canRestartServices: 'Restart Services'
            }
        },
        extensionManagement: {
            icon: Clock,
            label: 'Extensions',
            permissions: {
                canRequestExtensions: 'Request Extensions',
                canApproveExtensions: 'Approve Extensions',
                canViewExtensionRequests: 'View Extension Requests'
            }
        },
        voiceControl: {
            icon: Zap,
            label: 'Voice Control',
            permissions: {
                enabled: 'Enable Voice Assistant',
                canControlDevices: 'Control Devices via Voice',
                canViewDeviceStatus: 'View Device Status',
                canCreateSchedules: 'Create Schedules via Voice',
                canQueryAnalytics: 'Query Analytics',
                canAccessAllDevices: 'Access All Devices',
                restrictToAssignedDevices: 'Restrict to Assigned Devices Only'
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={resetToDefaults}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset to Defaults
                    </Button>
                    <Button onClick={saveRolePermissions} disabled={saving}>
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>

            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                    Changes to role permissions will affect all users with the corresponding role.
                    System roles (marked with a lock) cannot be modified.
                </AlertDescription>
            </Alert>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading role permissions...</p>
                    </div>
                </div>
            ) : roles.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <p className="text-muted-foreground">No role permissions found.</p>
                        <Button onClick={fetchRolePermissions} className="mt-4">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Refresh
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6">
                    {roles.map((role) => (
                        <Card key={role.role} className="relative">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            {role.label}
                                            {role.isSystemRole && <Badge variant="secondary">System</Badge>}
                                            {!role.isActive && <Badge variant="destructive">Inactive</Badge>}
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {role.description}
                                        </p>
                                    </div>
                                    <Badge variant={role.isSystemRole ? 'destructive' : 'default'}>
                                        {role.role.toUpperCase()}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {Object.entries(permissionCategories).map(([categoryKey, category]) => {
                                        const IconComponent = category.icon;
                                        const categoryPermissions = (role.permissions[categoryKey as keyof RolePermissions] as PermissionCategory) || {};

                                        return (
                                            <div key={categoryKey} className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <IconComponent className="w-4 h-4" />
                                                    <h4 className="font-medium text-sm">{category.label}</h4>
                                                </div>
                                                <div className="space-y-2 pl-6">
                                                    {Object.entries(category.permissions).map(([permissionKey, permissionLabel]) => {
                                                        const isEnabled = categoryPermissions[permissionKey] || false;
                                                        const isDisabled = role.isSystemRole && categoryKey === 'userManagement' && permissionKey === 'canChangeUserRoles';

                                                        return (
                                                            <div key={permissionKey} className="flex items-center justify-between">
                                                                <Label
                                                                    htmlFor={`${role.role}-${categoryKey}-${permissionKey}`}
                                                                    className="text-xs cursor-pointer flex-1"
                                                                >
                                                                    {permissionLabel}
                                                                </Label>
                                                                <Switch
                                                                    id={`${role.role}-${categoryKey}-${permissionKey}`}
                                                                    checked={isEnabled}
                                                                    onCheckedChange={(checked) =>
                                                                        updateRolePermission(role.role, categoryKey, permissionKey, checked)
                                                                    }
                                                                    disabled={isDisabled}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RoleManagement;
