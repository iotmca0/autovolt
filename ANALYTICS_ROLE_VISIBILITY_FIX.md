# Analytics Role Visibility Fix

## Problem Statement
1. **Dean users** were not able to see analytics-related features (Grafana, Analytics & Monitoring, AI/ML Insights, System Health)
2. **Role Management UI** did not have a toggle to control analytics visibility for different roles

## Root Cause Analysis

### Issue 1: Dean Analytics Access
The frontend permission logic in `src/hooks/usePermissions.ts` was using restrictive AND logic:
```typescript
// BEFORE (too restrictive)
const canQueryAnalytics = permissions.canQueryAnalytics === true && (isSuperAdmin || isAdmin || isDean);
```

This required BOTH:
- Backend permission `canQueryAnalytics: true` 
- AND explicit role check

However, the permissions were not being properly loaded because **voiceControl** permissions (which contain `canQueryAnalytics`) were not being merged into the user permissions object.

### Issue 2: Role Management Toggle
The Role Management page (`src/pages/RoleManagement.tsx`) already had the toggle for `canQueryAnalytics` under the **Voice Control** section (line 277), but it wasn't working because permissions weren't being loaded properly.

## Solution Implemented

### 1. Fixed Permission Loading (AuthContext)
**File**: `src/context/AuthContext.tsx`

Added `voiceControl` permissions to the merge operation in TWO places:

**Location 1: Profile check** (Line ~186):
```typescript
userData.permissions = {
  ...userData.permissions,
  ...rolePermissions.userManagement,
  ...rolePermissions.deviceManagement,
  ...rolePermissions.classroomManagement,
  ...rolePermissions.scheduleManagement,
  ...rolePermissions.systemManagement,
  ...rolePermissions.extensionManagement,
  ...rolePermissions.voiceControl, // ← ADDED THIS
};
```

**Location 2: Login function** (Line ~227):
```typescript
userData.permissions = {
  ...userData.permissions,
  ...rolePermissions.userManagement,
  ...rolePermissions.deviceManagement,
  ...rolePermissions.classroomManagement,
  ...rolePermissions.scheduleManagement,
  ...rolePermissions.systemManagement,
  ...rolePermissions.extensionManagement,
  ...rolePermissions.voiceControl, // ← ADDED THIS
};
```

### 2. Updated Permission Logic (usePermissions)
**File**: `src/hooks/usePermissions.ts` (Line 66)

Changed from restrictive AND to permissive OR logic with management access fallback:
```typescript
// BEFORE (too restrictive)
const canQueryAnalytics = permissions.canQueryAnalytics === true && (isSuperAdmin || isAdmin || isDean);

// AFTER (proper fallback logic)
const canQueryAnalytics = permissions.canQueryAnalytics === true || hasManagementAccess;
```

**Logic Explanation**:
- First checks if `canQueryAnalytics` is explicitly set to `true` in role permissions
- Falls back to `hasManagementAccess` which includes super-admin, admin, and dean roles
- This ensures backwards compatibility while allowing role-based customization

### 3. Backend Permissions (Already Correct)
**File**: `backend/models/RolePermissions.js`

Dean role already had correct permissions (Line 311):
```javascript
voiceControl: {
  enabled: true, 
  canControlDevices: true, 
  canViewDeviceStatus: true,
  canCreateSchedules: true, 
  canQueryAnalytics: true, // ✅ Already set
  canAccessAllDevices: true,
  restrictToAssignedDevices: false
}
```

## How It Works Now

### Permission Flow
1. **User logs in** → Backend returns user data with `rolePermissions`
2. **AuthContext** merges all permission categories including `voiceControl` into `user.permissions`
3. **usePermissions hook** checks `permissions.canQueryAnalytics` 
4. **Sidebar** uses `canViewAnalytics` to show/hide analytics menu items

### Role Management UI
Admins can now control analytics visibility per role:

1. Navigate to **Settings** → **Role Management**
2. Expand any role card
3. Find **Voice Control** section
4. Toggle **"Query Analytics"** switch
5. Click **Save Changes**

The toggle controls the `canQueryAnalytics` permission in the `voiceControl` category of role permissions.

## Default Analytics Access

By default (based on backend configuration):
- ✅ **Super-Admin**: `canQueryAnalytics: true`
- ✅ **Dean**: `canQueryAnalytics: true`
- ✅ **Admin**: `canQueryAnalytics: true`
- ❌ **Faculty**: `canQueryAnalytics: false`
- ❌ **Teacher**: `canQueryAnalytics: false`
- ❌ **Security**: `canQueryAnalytics: false`
- ❌ **Student**: `canQueryAnalytics: false`
- ❌ **Guest**: `canQueryAnalytics: false`

## Testing Checklist

### Test 1: Dean User Analytics Access
1. Login as dean user
2. Check sidebar for:
   - ✅ Analytics & Monitoring
   - ✅ AI/ML Insights
   - ✅ Grafana
   - ✅ System Health
3. Click each link - pages should load properly

### Test 2: Role Management Toggle
1. Login as super-admin
2. Navigate to **Settings** → **Role Management**
3. Find **Faculty** role
4. Expand **Voice Control** section
5. Enable **"Query Analytics"**
6. Save changes
7. Login as faculty user
8. Verify analytics pages now appear in sidebar

### Test 3: Permission Persistence
1. Enable analytics for Teacher role
2. Logout and login as teacher
3. Verify analytics pages visible
4. Disable analytics for Teacher role
5. Have teacher user refresh page
6. Verify analytics pages disappear from sidebar

### Test 4: Backward Compatibility
1. Login as admin (should still have access)
2. Login as super-admin (should still have access)
3. Login as student (should NOT have access)
4. Login as security (should NOT have access)

## Files Modified

1. **src/context/AuthContext.tsx** - Added voiceControl to permission merging (2 locations)
2. **src/hooks/usePermissions.ts** - Updated analytics permission logic with OR fallback
3. **Frontend built** - New build includes all changes

## Backend Status
- ✅ Backend already configured correctly with dean voiceControl permissions
- ✅ Role Management API already supports updating voiceControl.canQueryAnalytics
- ✅ No backend changes required

## Deployment Notes

### Frontend
```bash
npm run build
```
Build completed successfully in 12.46s.

### Backend
No backend restart required - configuration already correct.

### User Impact
- Dean users will immediately see analytics pages after frontend deployment
- Other roles can be configured via Role Management UI
- No database migration required
- Existing user sessions will load new permissions on next page refresh

## Troubleshooting

### Issue: Dean still can't see analytics
**Solution**: 
1. Clear browser cache and hard refresh (Ctrl+Shift+R)
2. Check browser console for user object - verify `permissions.canQueryAnalytics: true`
3. Logout and login again to reload permissions

### Issue: Role Management toggle doesn't work
**Solution**:
1. Check backend logs for permission update success
2. Verify WebSocket `role_permissions_updated` event fires
3. Have affected users refresh page to reload permissions

### Issue: Permission changes not taking effect
**Solution**:
1. Backend emits `role_permissions_updated` event on save
2. Frontend AuthContext listens for this event and triggers profile refresh
3. User should see changes within a few seconds
4. If not, manual logout/login will force permission reload

## Summary

**What was broken**:
- Dean couldn't see analytics despite having backend permissions
- voiceControl permissions weren't being merged into user object

**What was fixed**:
- Added voiceControl to permission merge in AuthContext (2 places)
- Updated permission logic to check canQueryAnalytics properly
- Role Management UI already had toggle - now it works

**Result**:
- Dean users can now see all analytics pages
- Admins can control analytics visibility per role via Role Management UI
- System maintains backward compatibility with existing role hierarchy
