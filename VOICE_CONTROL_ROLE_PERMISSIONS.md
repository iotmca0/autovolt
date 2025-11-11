# Voice Control Role-Based Permissions - Implementation Guide

## 🎯 Overview

Voice control access is now managed through the **Role-Based Permissions System**. Each role has specific voice control capabilities that can be configured through the admin panel.

---

## 📋 Voice Control Permission Categories

### Permission Fields

| Permission | Description | Example Usage |
|------------|-------------|---------------|
| `enabled` | Master switch for voice control | If `false`, user cannot access voice assistant at all |
| `canControlDevices` | Turn devices ON/OFF via voice | "Turn on classroom lights" |
| `canViewDeviceStatus` | Query device status | "What devices are online?" |
| `canCreateSchedules` | Create schedules via voice | "Schedule lights to turn on at 8 AM" |
| `canQueryAnalytics` | Query energy/analytics data | "Show today's power consumption" |
| `canAccessAllDevices` | Access all devices vs. assigned only | Admin: All devices; Faculty: Assigned only |
| `restrictToAssignedDevices` | Limit to assigned devices | If `true`, only assigned devices accessible |

---

## 🔐 Default Permissions by Role

### Super Admin
```javascript
{
  enabled: true,
  canControlDevices: true,
  canViewDeviceStatus: true,
  canCreateSchedules: true,
  canQueryAnalytics: true,
  canAccessAllDevices: true,
  restrictToAssignedDevices: false
}
```
**Can do:** Everything - full voice control access

---

### Dean & Admin
```javascript
{
  enabled: true,
  canControlDevices: true,
  canViewDeviceStatus: true,
  canCreateSchedules: true,
  canQueryAnalytics: true,
  canAccessAllDevices: true,
  restrictToAssignedDevices: false
}
```
**Can do:** Full control, all devices, create schedules, view analytics

---

### Faculty & Teacher
```javascript
{
  enabled: true,
  canControlDevices: true,
  canViewDeviceStatus: true,
  canCreateSchedules: false,
  canQueryAnalytics: true,
  canAccessAllDevices: false,
  restrictToAssignedDevices: true
}
```
**Can do:** Control assigned devices, view status, query analytics
**Cannot do:** Create schedules, access non-assigned devices

---

### Security
```javascript
{
  enabled: true,
  canControlDevices: true,
  canViewDeviceStatus: true,
  canCreateSchedules: false,
  canQueryAnalytics: false,
  canAccessAllDevices: true,
  restrictToAssignedDevices: false
}
```
**Can do:** Control all devices (emergency access), view status
**Cannot do:** Create schedules, query analytics

---

### Student
```javascript
{
  enabled: false,
  canControlDevices: false,
  canViewDeviceStatus: true,
  canCreateSchedules: false,
  canQueryAnalytics: false,
  canAccessAllDevices: false,
  restrictToAssignedDevices: true
}
```
**Can do:** View device status only (if voice control enabled by admin)
**Cannot do:** Control devices, create schedules, query analytics
**Default:** Voice control is DISABLED

---

### Guest
```javascript
{
  enabled: false,
  canControlDevices: false,
  canViewDeviceStatus: false,
  canCreateSchedules: false,
  canQueryAnalytics: false,
  canAccessAllDevices: false,
  restrictToAssignedDevices: true
}
```
**Can do:** Nothing
**Default:** Voice control is DISABLED

---

## 🚀 Implementation Details

### Backend Changes

#### 1. RolePermissions Model (`backend/models/RolePermissions.js`)

Added `voiceControl` category:
```javascript
voiceControl: {
  enabled: { type: Boolean, default: false },
  canControlDevices: { type: Boolean, default: false },
  canViewDeviceStatus: { type: Boolean, default: false },
  canCreateSchedules: { type: Boolean, default: false },
  canQueryAnalytics: { type: Boolean, default: false },
  canAccessAllDevices: { type: Boolean, default: false },
  restrictToAssignedDevices: { type: Boolean, default: true }
}
```

#### 2. Voice Session Creation (`backend/routes/voiceAssistant.js`)

Updated `/session/create` endpoint:
```javascript
// Check role-based permissions
const rolePermissions = await RolePermissions.findOne({ 
  role: user.role, 
  'metadata.isActive': true 
});

if (!rolePermissions?.voiceControl?.enabled) {
  return res.status(403).json({
    success: false,
    message: 'Voice control is not enabled for your role',
    code: 'VOICE_CONTROL_DISABLED'
  });
}

// Store permissions in session
const voicePermissions = {
  canControlDevices: rolePermissions.voiceControl.canControlDevices,
  // ... other permissions
};

const sessionData = createVoiceSession(user, voicePermissions);
```

#### 3. Voice Auth Middleware (`backend/middleware/voiceAuth.js`)

Updated to store permissions in JWT token:
```javascript
function createVoiceSession(user, voicePermissions = {}) {
  const voiceToken = jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      type: 'voice_session',
      permissions: voicePermissions,  // ← Permissions embedded
      exp: Math.floor(Date.now() / 1000) + (60 * 60)
    },
    process.env.JWT_SECRET
  );
  
  voiceSessions.set(voiceToken, {
    userId, userName, role,
    permissions: voicePermissions,  // ← Stored in session
    // ...
  });
}
```

---

### Frontend Changes

#### 1. useVoiceSession Hook (`src/hooks/useVoiceSession.ts`)

Added permissions tracking:
```typescript
interface VoicePermissions {
  canControlDevices: boolean;
  canViewDeviceStatus: boolean;
  canCreateSchedules: boolean;
  canQueryAnalytics: boolean;
  canAccessAllDevices: boolean;
  restrictToAssignedDevices: boolean;
}

const [permissions, setPermissions] = useState<VoicePermissions | null>(null);

// Store permissions in sessionStorage
sessionStorage.setItem('voicePermissions', JSON.stringify(voicePermissions));
```

#### 2. FloatingVoiceMic Component (`src/components/FloatingVoiceMic.tsx`)

Component automatically handles permission errors:
```typescript
// If voice control disabled, session creation fails gracefully
if (err.response?.data?.code === 'VOICE_CONTROL_DISABLED') {
  console.warn('⚠️ Voice control disabled for role:', user.role);
  // Component hides voice mic button automatically
}
```

---

## 🛠️ Setup Instructions

### Step 1: Run Database Migration

Update existing role permissions with voice control settings:

```powershell
cd C:\Users\IOT\Desktop\new-autovolt\backend
node update_voice_permissions.js
```

**Expected Output:**
```
🚀 Starting Voice Control Permissions Update...

🔌 Connecting to MongoDB: mongodb://localhost:27017/autovolt
✅ Connected to MongoDB

📋 Found 8 role permission documents

➕ Adding voice control permissions to role: super-admin
✅ Updated super-admin: { enabled: true, canControlDevices: true, ... }

➕ Adding voice control permissions to role: admin
✅ Updated admin: { enabled: true, canControlDevices: true, ... }

...

📊 Summary:
   Total processed: 8
   Updated: 8
   Skipped: 0

✅ Voice control permissions update complete!
```

### Step 2: Restart Backend Server

```powershell
# If using PM2
pm2 restart autovolt-backend

# If running directly
# Stop current server (Ctrl+C)
cd backend
npm run dev
```

### Step 3: Test Voice Control

1. **Login as different roles**
2. **Check voice mic button visibility**:
   - ✅ Admin/Faculty: Voice mic appears
   - ❌ Student/Guest: Voice mic hidden (unless enabled)

3. **Try voice commands**:
   ```
   - "Turn on all lights"
   - "What devices are online?"
   - "Show today's power consumption"
   ```

---

## 🎮 Admin Configuration

### Enable Voice Control for Students (Optional)

If you want to enable voice control for students:

**Method 1: Via MongoDB**
```javascript
db.rolepermissions.updateOne(
  { role: 'student' },
  { 
    $set: { 
      'voiceControl.enabled': true,
      'voiceControl.canControlDevices': true  // Optional
    } 
  }
);
```

**Method 2: Via Admin Panel** (Future Feature)
```
Settings → Role Management → Student → Voice Control
[x] Enable Voice Control
[x] Can View Device Status
[ ] Can Control Devices (optional)
```

---

## 🔒 Security Features

### 1. Token-Based Permissions
Voice tokens contain embedded permissions:
```javascript
{
  userId: "123",
  role: "faculty",
  permissions: {
    canControlDevices: true,
    canAccessAllDevices: false,
    // ...
  }
}
```

### 2. Backend Validation
Every voice command validates permissions:
```javascript
if (!voiceSession.permissions.canControlDevices) {
  return res.status(403).json({
    message: 'You do not have permission to control devices via voice'
  });
}
```

### 3. Device Access Restriction
```javascript
// Faculty can only access assigned devices
if (voiceSession.permissions.restrictToAssignedDevices) {
  devices = devices.filter(device => 
    device.assignedUsers.includes(userId)
  );
}
```

---

## 🧪 Testing Checklist

### Test Each Role

| Role | Voice Mic Visible | Can Control | Can View | Can Schedule | Can Query Analytics |
|------|------------------|-------------|----------|--------------|-------------------|
| Super Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dean | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Faculty | ✅ | ✅ (assigned only) | ✅ | ❌ | ✅ |
| Teacher | ✅ | ✅ (assigned only) | ✅ | ❌ | ✅ |
| Security | ✅ | ✅ (all devices) | ✅ | ❌ | ❌ |
| Student | ❌ (default) | ❌ | ✅ (if enabled) | ❌ | ❌ |
| Guest | ❌ | ❌ | ❌ | ❌ | ❌ |

### Test Commands

```bash
# 1. Login as faculty
# 2. Say: "Turn on lights in Room 101"
#    Expected: ✅ Works (if Room 101 assigned)
#    Expected: ❌ Denied (if Room 101 NOT assigned)

# 3. Login as student
# 4. Check: Voice mic button should be hidden
#    Expected: ❌ No voice mic button

# 5. Login as security
# 6. Say: "Turn on all devices in Block A"
#    Expected: ✅ Works (emergency access)

# 7. Login as admin
# 8. Say: "Schedule lights to turn on at 8 AM tomorrow"
#    Expected: ✅ Schedule created
```

---

## 📊 API Response Examples

### Success - Voice Control Enabled
```json
{
  "success": true,
  "data": {
    "voiceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "123",
      "name": "John Faculty",
      "role": "faculty"
    }
  },
  "permissions": {
    "canControlDevices": true,
    "canViewDeviceStatus": true,
    "canCreateSchedules": false,
    "canQueryAnalytics": true,
    "canAccessAllDevices": false,
    "restrictToAssignedDevices": true
  }
}
```

### Error - Voice Control Disabled
```json
{
  "success": false,
  "message": "Voice control is not enabled for your role",
  "code": "VOICE_CONTROL_DISABLED",
  "role": "student"
}
```

### Error - Permissions Not Configured
```json
{
  "success": false,
  "message": "Voice control permissions not configured for your role",
  "code": "PERMISSIONS_NOT_CONFIGURED"
}
```

---

## 🐛 Troubleshooting

### Voice Mic Button Not Appearing

**Check 1: User logged in?**
```javascript
// Browser console
localStorage.getItem('token')  // Should return JWT token
```

**Check 2: Voice control enabled?**
```powershell
# Backend query
cd backend
node -e "const mongoose = require('mongoose'); const RolePermissions = require('./models/RolePermissions'); mongoose.connect(process.env.MONGODB_URI).then(async () => { const perms = await RolePermissions.findOne({ role: 'faculty' }); console.log(perms.voiceControl); process.exit(0); });"
```

**Check 3: Browser console errors?**
```javascript
// Look for these logs:
"⚠️ Voice control disabled for role: student"
"✅ Voice session already authenticated"
```

### Voice Commands Not Working

**Check 1: Session created successfully?**
```javascript
// Browser console
sessionStorage.getItem('voiceToken')  // Should exist
sessionStorage.getItem('voicePermissions')  // Should show permissions JSON
```

**Check 2: Backend logs?**
```bash
# Terminal running backend
[Voice Session] Created for user: John Faculty (faculty)
[Voice Auth] Validation error: Voice session not found
```

---

## 📝 Database Schema

### RolePermissions Collection
```javascript
{
  role: "faculty",
  voiceControl: {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: false,
    canQueryAnalytics: true,
    canAccessAllDevices: false,
    restrictToAssignedDevices: true
  },
  metadata: {
    isActive: true,
    lastModifiedBy: ObjectId("..."),
    // ...
  },
  createdAt: ISODate("2025-11-11T10:00:00Z"),
  updatedAt: ISODate("2025-11-11T10:00:00Z")
}
```

---

## 🎓 Summary

### What Changed?

1. ✅ **RolePermissions Model**: Added `voiceControl` category with 6 permissions
2. ✅ **Voice Session Creation**: Checks role permissions before allowing access
3. ✅ **Voice Auth Middleware**: Embeds permissions in JWT tokens
4. ✅ **Frontend Hook**: Tracks and stores voice permissions
5. ✅ **Migration Script**: Updates existing roles with default permissions

### Benefits

- 🔐 **Security**: Role-based access control for voice features
- 🎯 **Granular Control**: 6 different permission levels
- 🔄 **Dynamic**: Admins can enable/disable per role
- 📊 **Auditable**: All permissions logged and tracked
- 🚀 **Scalable**: Easy to add new voice permissions

### Next Steps

1. **Run migration script**: `node backend/update_voice_permissions.js`
2. **Restart backend**: Reload with new permissions
3. **Test each role**: Verify voice control behavior
4. **Configure as needed**: Enable/disable per role
5. **Monitor usage**: Check voice session logs

---

**Files Modified:**
- `backend/models/RolePermissions.js` - Added voiceControl schema
- `backend/routes/voiceAssistant.js` - Added permission checks
- `backend/middleware/voiceAuth.js` - Store permissions in session
- `src/hooks/useVoiceSession.ts` - Track voice permissions
- `src/components/FloatingVoiceMic.tsx` - Handle permission errors
- `backend/update_voice_permissions.js` - Migration script (NEW)
