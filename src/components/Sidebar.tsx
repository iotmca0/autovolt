
import React, { useState, useEffect } from 'react';
import {
  Home,
  Cpu,
  ToggleLeft,
  Calendar,
  Users,
  Settings,
  Shield,
  ChevronRight,
  ChevronLeft,
  Power,
  User,
  UserCheck,
  FileText,
  Activity,
  Brain,
  BarChart3,
  Monitor,
  Ticket,
  Settings2,
  Server,
  ExternalLink,
  Mic
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useDevices } from '@/hooks/useDevices';
import { scheduleAPI } from '@/services/api';
import { api } from '@/services/api';
import { useGlobalLoading } from '@/hooks/useGlobalLoading';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocation, useNavigate } from 'react-router-dom';

const navigationSections = [
  {
    title: 'Dashboard',
    items: [
      { name: 'Power Dashboard', icon: Home, href: '/dashboard', current: false },
    ]
  },
  {
    title: 'Core Operations',
    items: [
      { name: 'Devices', icon: Cpu, href: '/dashboard/devices', current: false, requiresPermission: 'canManageDevices' },
      { name: 'Switches', icon: ToggleLeft, href: '/dashboard/switches', current: false, requiresPermission: 'canManageDevices' },
      { name: 'Master Control', icon: Power, href: '/dashboard/master', current: false, requiresPermission: 'canManageDevices' },
    ]
  },
  {
    title: 'Scheduling',
    items: [
      { name: 'Schedule', icon: Calendar, href: '/dashboard/schedule', current: false, requiresPermission: 'canManageSchedule' },
    ]
  },
  {
    title: 'User Management',
    items: [
      { name: 'Users', icon: Users, href: '/dashboard/users', current: false, requiresPermission: 'canManageUsers' },
      { name: 'Role Management', icon: Shield, href: '/dashboard/roles', current: false, requiresPermission: 'canManageUsers' },
    ]
  },
  {
    title: 'Analytics & Monitoring',
    items: [
      { name: 'System Health', icon: Server, href: '/dashboard/system-health', requiresPermission: 'canViewAnalytics' },
      { name: 'Analytics & Monitoring', icon: BarChart3, href: '/dashboard/analytics', requiresPermission: 'canViewAnalytics' },
      { name: 'AI/ML Insights', icon: Brain, href: '/dashboard/aiml', requiresPermission: 'canViewAnalytics' },
      { name: 'Voice Settings', icon: Mic, href: '/dashboard/voice-settings', current: false },
      { name: 'Grafana', icon: Activity, href: '/dashboard/grafana', requiresPermission: 'canViewAnalytics' },
    ]
  },
  {
    title: 'Support & Logs',
    items: [
      { name: 'Support Tickets', icon: Ticket, href: '/dashboard/tickets', current: false },
      { name: 'Active Logs', icon: FileText, href: '/dashboard/logs', current: false, requiresPermission: 'canViewAuditLogs' },
    ]
  },
  {
    title: 'Account & Settings',
    items: [
      { name: 'Profile', icon: User, href: '/dashboard/profile', current: false },
      { name: 'Settings', icon: Settings, href: '/dashboard/settings', current: false },
    ]
  },
];

interface SidebarProps {
  className?: string;
  onNavigateClose?: () => void; // for mobile sheet close
}

export const Sidebar: React.FC<SidebarProps> = ({ className, onNavigateClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  // Retrieve permissions once (avoid calling hooks inside loops/filters)
  const perms = usePermissions();
  const { isAdmin, isSuperAdmin, hasManagementAccess } = perms;
  const { refreshDevices } = useDevices();
  const { start, stop } = useGlobalLoading();
  const [navLock, setNavLock] = useState(false);
  const debounceRef = React.useRef<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const deviceRelated = new Set(['/dashboard', '/dashboard/devices', '/dashboard/switches', '/dashboard/master']);
  // Future: add schedule/users background prefetch similarly without blocking

  const handleNavigation = (href: string, isExternal?: boolean) => {
    if (navLock) return;
    setNavLock(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setNavLock(false), 400);
    
    // Handle external links
    if (isExternal) {
      window.open(href, '_blank', 'noopener,noreferrer');
      if (onNavigateClose) onNavigateClose();
      return;
    }
    
    // Handle internal navigation
    if (deviceRelated.has(href)) {
      const token = start('nav');
      refreshDevices({ background: true }).finally(() => stop(token));
    }
    navigate(href);
    if (onNavigateClose) onNavigateClose();
  };

  return (
    <div className={cn(
      "glass flex flex-col transition-all duration-300 h-full relative z-20 min-w-16 box-border opacity-100 visible rounded-r-lg",
      collapsed ? "w-12 sm:w-16" : "w-48 sm:w-64",
      className
    )}>
      {/* Logo/Brand */}
      <div className="p-3 flex-shrink-0 h-16 relative z-10 glass border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 ring-1 ring-primary/20">
            <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-base truncate tracking-tight">AutoVolt</h1>
              <p className="text-[11px] text-muted-foreground truncate font-medium">Power Management</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div
        className="flex-1 glass min-h-0 overflow-y-auto sidebar-scroll"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'hsl(var(--muted)) transparent',
          maxHeight: 'calc(100vh - 8rem)'
        }}
      >
        <div className="p-2 space-y-4">
          {navigationSections.map((section, sectionIndex) => {
            // Filter items based on permissions
            const visibleItems = section.items.filter((item: any) => {
              if (item.adminOnly && !(isAdmin || isSuperAdmin)) {
                return false;
              }
              if (item.requiresPermission) {
                return Boolean(perms[item.requiresPermission as keyof typeof perms]);
              }
              return true;
            });

            // Skip section if no visible items
            if (visibleItems.length === 0) {
              return null;
            }

            return (
              <div key={section.title} className="space-y-2">
                {/* Section Header */}
                {!collapsed && (
                  <div className="px-3 py-2">
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      {section.title}
                    </h3>
                  </div>
                )}

                {/* Section Items */}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isExternal = Boolean('external' in item && item.external);
                    const isCurrentPage = !isExternal && location.pathname === item.href;
                    const isAdminItem = 'adminOnly' in item && item.adminOnly;
                    const isPermissionItem = 'requiresPermission' in item && item.requiresPermission;

                    return (
                      <Button
                        key={item.name}
                        variant="ghost"
                        className={cn(
                          "w-full justify-start gap-3 h-10 px-3 text-left overflow-hidden transition-all duration-200 relative group",
                          isCurrentPage && "bg-primary text-primary-foreground font-semibold shadow-sm",
                          !isCurrentPage && "hover:bg-accent/50 hover:shadow-sm",
                          collapsed && "px-2 justify-center tooltip-trigger"
                        )}
                        onClick={() => handleNavigation(item.href, isExternal)}
                        title={collapsed ? item.name : undefined}
                      >
                        {/* Active indicator bar */}
                        {isCurrentPage && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-foreground rounded-r-full" />
                        )}
                        
                        <Icon className={cn(
                          "w-5 h-5 flex-shrink-0 transition-transform duration-200",
                          isCurrentPage && "text-primary-foreground",
                          !isCurrentPage && "text-muted-foreground group-hover:text-foreground group-hover:scale-110"
                        )} />
                        
                        {!collapsed && (
                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <span className={cn(
                              "text-sm truncate transition-colors duration-200",
                              isCurrentPage && "font-semibold text-primary-foreground",
                              !isCurrentPage && "font-medium text-foreground group-hover:text-foreground"
                            )}>
                              {item.name}
                            </span>
                            
                            <div className="flex items-center gap-1">
                              {/* External link indicator */}
                              {isExternal && (
                                <ExternalLink className={cn(
                                  "w-3.5 h-3.5 flex-shrink-0",
                                  isCurrentPage && "text-primary-foreground",
                                  !isCurrentPage && "text-muted-foreground group-hover:text-foreground"
                                )} />
                              )}
                              
                              {/* Subtle badges for special items */}
                              {(isAdminItem || isPermissionItem) && (
                                <span className={cn(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded-md ml-1 flex-shrink-0",
                                  isCurrentPage && "bg-primary-foreground/20 text-primary-foreground",
                                  !isCurrentPage && "bg-muted text-muted-foreground"
                                )}>
                                  {isAdminItem ? "Admin" : "Auth"}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>

                {/* Section Divider (except for last section) */}
                {sectionIndex < navigationSections.length - 1 && (
                  <div className="mx-3 my-3 border-t border-border/40" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapse Toggle */}
      <div className="p-2 flex-shrink-0 relative z-10 glass border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-center h-9 hover:bg-accent transition-all duration-200 rounded-lg group"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <div className="flex items-center gap-2">
            {collapsed ? (
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                {!collapsed && <span className="text-xs font-medium">Collapse</span>}
              </>
            )}
          </div>
        </Button>
      </div>
    </div>
  );
};
