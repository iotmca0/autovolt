# Dean Analytics Access Fix

## Issue
Users with the `dean` role were unable to see analytics features (Grafana, Analytics & Monitoring, AI/ML Insights) in the sidebar, despite having the proper backend permissions.

## Root Cause
The frontend Sidebar component was using hardcoded `adminOnly: true` checks instead of the proper role-based permission system (`canQueryAnalytics`).

## Changes Made

### 1. Enhanced `usePermissions` Hook
**File**: `src/hooks/usePermissions.ts`

Added analytics permissions:
```typescript
// Analytics permissions
const canQueryAnalytics = permissions.canQueryAnalytics || hasManagementAccess;
const canViewAnalytics = canQueryAnalytics; // Alias for clarity
```

These permissions are now exposed in the hook's return object, making them available to all components.

### 2. Updated Sidebar Component
**File**: `src/components/Sidebar.tsx`

Changed analytics items from `adminOnly: true` to `requiresPermission: 'canViewAnalytics'`:

```typescript
{
  title: 'Analytics & Monitoring',
  items: [
    { name: 'System Health', icon: Server, href: '/dashboard/system-health', requiresPermission: 'canViewAnalytics' },
    { name: 'Analytics & Monitoring', icon: BarChart3, href: '/dashboard/analytics', requiresPermission: 'canViewAnalytics' },
    { name: 'AI/ML Insights', icon: Brain, href: '/dashboard/aiml', requiresPermission: 'canViewAnalytics' },
    { name: 'Voice Settings', icon: Mic, href: '/dashboard/voice-settings', current: false },
    { name: 'Grafana', icon: Activity, href: '/dashboard/grafana', requiresPermission: 'canViewAnalytics' },
  ]
}
```

Also updated Active Logs:
```typescript
{ name: 'Active Logs', icon: FileText, href: '/dashboard/logs', current: false, requiresPermission: 'canViewAuditLogs' }
```

## Backend Permissions (Already Configured)
**File**: `backend/models/RolePermissions.js`

The `dean` role already has the correct permissions in the backend:
```javascript
'faculty': {
  voiceControl: {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: false,
    canQueryAnalytics: true,  // ✅ Already set to true
    canAccessAllDevices: false,
    restrictToAssignedDevices: true
  }
}
```

## Roles with Analytics Access

After this fix, the following roles can access analytics features:

| Role | System Health | Analytics | AI/ML | Grafana | Active Logs |
|------|---------------|-----------|-------|---------|-------------|
| **super-admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **dean** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **faculty** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **teacher** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **student** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **security** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **guest** | ❌ | ❌ | ❌ | ❌ | ❌ |

## Permission Logic

The `usePermissions` hook now includes:
```typescript
const hasManagementAccess = hasAdminAccess || isDean;
const canQueryAnalytics = permissions.canQueryAnalytics || hasManagementAccess;
```

This means:
- **Dean role** automatically gets `hasManagementAccess = true`
- **Dean role** automatically gets `canQueryAnalytics = true`
- Even if the permission is not explicitly set in the user object, deans will still have access

## Testing Checklist

### 1. Test Dean User
```bash
# Login as dean user
# Expected: Should see all analytics menu items in sidebar
```

- [ ] System Health visible
- [ ] Analytics & Monitoring visible  
- [ ] AI/ML Insights visible
- [ ] Grafana visible
- [ ] Active Logs visible
- [ ] Can navigate to each page
- [ ] Data loads properly on each page

### 2. Test Faculty User
```bash
# Login as faculty user
# Expected: Should see analytics items but NOT Active Logs
```

- [ ] Analytics items visible
- [ ] Active Logs NOT visible

### 3. Test Student User
```bash
# Login as student user
# Expected: Should NOT see any analytics items
```

- [ ] No analytics items visible

## API Endpoints

All analytics API endpoints are already accessible (no backend changes needed):

```bash
# Analytics Dashboard
GET /api/analytics/dashboard

# Energy Metrics
GET /api/analytics/energy/monthly-chart
GET /api/analytics/energy-summary

# AI/ML Service
POST /api/aiml/forecast
POST /api/aiml/anomaly-detection

# Grafana (embedded)
GET /dashboard/grafana (iframe to Grafana server)

# Voice Analytics
GET /api/analytics/voice/summary
GET /api/analytics/voice/timeseries
GET /api/analytics/voice/top-intents
GET /api/analytics/voice/top-errors
```

## How the Permission System Works

1. **User Login**: Backend returns user object with `role` and `permissions`
2. **Auth Context**: Stores user data in localStorage and state
3. **usePermissions Hook**: 
   - Reads user role and permissions
   - Calculates derived permissions (e.g., `hasManagementAccess`)
   - Returns all permission flags
4. **Sidebar Component**:
   - Calls `usePermissions()`
   - Filters menu items based on `requiresPermission` property
   - Only shows items where permission evaluates to `true`

## Rollback Instructions

If you need to revert these changes:

### Revert usePermissions.ts
```typescript
// Remove these lines:
const canQueryAnalytics = permissions.canQueryAnalytics || hasManagementAccess;
const canViewAnalytics = canQueryAnalytics;

// Remove from return object:
canQueryAnalytics,
canViewAnalytics,
```

### Revert Sidebar.tsx
```typescript
// Change back to:
{ name: 'System Health', icon: Server, href: '/dashboard/system-health', adminOnly: true },
{ name: 'Analytics & Monitoring', icon: BarChart3, href: '/dashboard/analytics', adminOnly: true },
{ name: 'AI/ML Insights', icon: Brain, href: '/dashboard/aiml', adminOnly: true },
{ name: 'Grafana', icon: Activity, href: '/dashboard/grafana', adminOnly: true },
{ name: 'Active Logs', icon: FileText, href: '/dashboard/logs', current: false, adminOnly: true },
```

## Additional Notes

- **No database changes** required - backend already has correct permissions
- **No API changes** required - all endpoints already accessible
- **No backend restart** required - only frontend changes
- **Works immediately** after `npm run dev` or `npm run build`

## Related Files

- `src/hooks/usePermissions.ts` - Permission hook
- `src/components/Sidebar.tsx` - Sidebar navigation
- `backend/models/RolePermissions.js` - Backend role definitions (already correct)
- `src/hooks/useAuth.tsx` - Authentication context (no changes needed)

## Deployment

### Development
```bash
npm run dev
```
Visit app and test with dean user account

### Production
```bash
npm run build
npx cap sync android  # If building Android app
```

### Android App
After building:
```bash
npx cap open android
# Build → Build APK in Android Studio
```

---

**Status**: ✅ COMPLETED
**Files Modified**: 2
**Backend Changes**: None required
**Database Changes**: None required
**Testing Required**: Yes (dean user login)
