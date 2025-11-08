# Notification System Architecture

## Overview
The application uses a multi-layered notification system with proper z-index hierarchy to prevent overlapping notifications.

## Notification Layers

### 1. Inline Errors & Banners (Normal Flow - No z-index)
**Purpose:** Form validation errors, contextual warnings  
**Used in:**
- `AssistantPanel.tsx`: Mic permission denied banner
  - Location: Lines 224-227
  - Styling: `bg-red-50 text-red-700 border rounded p-2 mb-2`
- `DeviceConfigDialog.tsx`: GPIO validation errors
  - Alert components with danger/warning/success variants
  - Examples: Lines 983-1140 (field-specific errors)
- Form validation errors in various components

**Behavior:**
- Part of normal document flow
- Positioned inline within their parent components
- Don't interfere with toast notifications

### 2. Sonner Toast Notifications (z-index: 60)
**Purpose:** General toast messages, voice assistant feedback  
**Component:** `src/components/ui/sonner.tsx`  
**Configuration:**
```tsx
<Sonner
  position="top-center"
  className="toaster group z-[60]"
/>
```

**Used in:**
- `AssistantPanel.tsx`: Voice command feedback (5 usages)
  - Success: Command executed
  - Error: Command not understood, wake word required
  - Info: Microphone state changes
- `Profile.tsx`: Profile update notifications
- `IntegrationsPage.tsx`: Integration actions
- General user feedback across the app

**Behavior:**
- Fixed position at top-center of viewport
- Auto-dismisses after timeout
- Multiple toasts stack vertically
- Lower z-index than shadcn/ui Toaster to avoid conflict

### 3. shadcn/ui Toaster (z-index: 100)
**Purpose:** Critical system notifications, auth errors, API errors  
**Component:** `src/components/ui/toaster.tsx` + `src/components/ui/toast.tsx`  
**Configuration:**
```tsx
<ToastViewport className="fixed top-0 z-[100] ... sm:bottom-0 sm:right-0 sm:top-auto" />
```

**Used in:**
- `Login.tsx`: Authentication errors (lines 165-169)
  - Failed login attempts
  - Network errors
- `Devices.tsx`: Device operations (lines 214, 236, 260, 289)
  - Add/edit/delete errors
  - Device control failures
- API error responses across the app

**Behavior:**
- Fixed position: top-right on mobile, bottom-right on desktop
- Manual dismiss required for critical errors
- Highest z-index for toast-level notifications

### 4. Modals & Overlays (z-index: varies)
**Purpose:** Dialog overlays, loading screens  
**Components:**
- `GlobalLoadingOverlay`: Loading states
- Various dialog components

**Behavior:**
- Full-screen overlays
- Block interactions when active
- Higher z-index than notifications when present

## Z-Index Hierarchy Summary

```
Layer 0  (default flow): Inline errors, form validation, banners
Layer 60 (z-[60]):       Sonner toast notifications
Layer 100 (z-[100]):     shadcn/ui Toaster (critical notifications)
Layer 200+ (z-[200]+):   Modals, dialogs, overlays
```

## Notification Flow Examples

### Example 1: Device Add Error
1. User submits invalid GPIO configuration in `DeviceConfigDialog`
2. **Inline error** appears in the form (Alert component)
3. If API fails, **shadcn/ui toast** appears at bottom-right with error
4. Both visible simultaneously without overlap

### Example 2: Voice Command + Login Error
1. User issues voice command without wake word
2. **Sonner toast** appears at top-center: "Wake word required"
3. User attempts login with wrong password
4. **shadcn/ui toast** appears at bottom-right: "Invalid credentials"
5. Both visible simultaneously at different positions

### Example 3: Multiple Voice Commands
1. User issues command: "Turn on the light"
2. **Sonner toast**: "Executing command..."
3. Command fails
4. **Sonner toast**: "Failed to execute. Try: 'Turn on light 1'"
5. Toasts stack vertically at top-center

## Best Practices

### When to Use Each System

**Use Inline Errors for:**
- Form field validation
- Contextual warnings within a component
- Permission banners (mic, camera)
- GPIO configuration errors

**Use Sonner Toasts for:**
- Voice assistant feedback
- Quick confirmations
- Non-critical notifications
- Auto-dismissible messages

**Use shadcn/ui Toaster for:**
- Authentication errors
- API errors
- Critical system notifications
- Actions requiring user acknowledgment

### Adding New Notifications

1. **Inline errors:** Add Alert/div directly in JSX where needed
2. **Sonner:** Import `toast` from `sonner`, call `toast.success/error/info()`
3. **shadcn/ui:** Import `useToast` hook, call `toast({ title, description, variant })`

## Configuration Files

- `src/components/ui/sonner.tsx` - Sonner toast configuration
- `src/components/ui/toaster.tsx` - shadcn/ui Toaster wrapper
- `src/components/ui/toast.tsx` - Toast primitives with z-index
- `src/App.tsx` - Both toasters rendered at app root

## Fixes Applied (2024)

### Issue: Overlapping Notifications
**Problem:** Multiple notification sources (device errors, login errors, voice errors) displayed simultaneously with overlapping text, making content unreadable.

**Root Causes:**
1. Both Sonner and shadcn/ui Toaster using default z-index
2. No explicit position set for Sonner
3. Potential conflicts between inline errors and toasts

**Solutions Implemented:**
1. ✅ Added `position="top-center"` to Sonner configuration
2. ✅ Set Sonner z-index to `z-[60]` (lower than shadcn/ui Toaster's z-100)
3. ✅ Verified inline errors use normal flow (no fixed positioning)
4. ✅ Established clear z-index hierarchy

**Result:** Notifications now display in separate regions with proper stacking order, preventing overlap and ensuring all text remains readable.

## Testing Scenarios

To verify notification system works correctly:

1. **Device Error + Voice Error:**
   - Add device with invalid GPIO
   - Issue voice command without wake word
   - Verify inline error in form + Sonner toast at top + shadcn toast at bottom

2. **Multiple Voice Commands:**
   - Issue 3 voice commands rapidly
   - Verify Sonner toasts stack vertically without overlap

3. **Login Error + Device Error:**
   - Attempt login with wrong credentials
   - Add device with invalid config
   - Verify both errors visible in their respective positions

4. **Mobile Responsiveness:**
   - Test all scenarios on mobile viewport
   - Verify shadcn/ui Toaster moves to top on small screens
   - Verify Sonner remains at top-center

## Future Improvements

1. **Rate Limiting:** Prevent toast spam from rapid actions
2. **Toast Queue:** Limit simultaneous toasts (max 3-5)
3. **Priority System:** Allow critical toasts to interrupt/dismiss lower priority ones
4. **Unified API:** Create wrapper to simplify choosing correct notification type
5. **Analytics:** Track notification types to optimize user experience
