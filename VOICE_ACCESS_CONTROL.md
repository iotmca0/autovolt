# Voice Control Access Control

## Overview
Voice commands are now restricted to devices that users have explicit access to. This ensures users can only control authorized devices through voice commands.

## Access Rules

### Admin Roles (Full Access)
The following roles have unrestricted access to all devices:
- **super-admin**
- **admin** 
- **dean**

### Non-Admin Roles (Restricted Access)
Users with the following roles can only control devices they are assigned to:
- **hod**
- **faculty**
- **teacher**
- **student**
- **security**
- **guest**

## How Device Access is Determined

A user can control a device via voice command if ANY of the following conditions are met:

1. **Direct Device Assignment**: User's `assignedDevices` array contains the device ID
2. **Device User List**: Device's `assignedUsers` array contains the user ID
3. **Room/Location Access**: Device's `classroom` or `location` matches any of:
   - User's `assignedRooms` array
   - User's `classroom` field
   - User's `location` field
   - User's `department` field

## Voice Command Behavior

### Successful Command
```
User: "Turn on the lights in IoT Lab"
System: ✅ "Turned ON 3 lights in IoT Lab"
```

### Unauthorized Access Attempt
```
User: "Turn on the lights in Chemistry Lab"
System: ❌ "You do not have access to any devices. Please contact an administrator."
```

### No Matching Devices
```
User: "Turn on the projector"
System: ❌ "Couldn't find any devices in 'your location'. Try the classroom name shown on the dashboard."
```

## Implementation Details

### Backend Changes

#### `voiceAssistantController.js`
- Added `checkUserDeviceAccess(user, device)` function to verify permissions
- Modified `processVoiceCommand()` to filter devices based on user access
- Added access verification before executing bulk confirmations
- Logs unauthorized access attempts for security auditing

#### Device Query
```javascript
// Non-admin users see only accessible devices
const deviceQuery = {
  $or: [
    { _id: { $in: user.assignedDevices } },
    { assignedUsers: user._id },
    { classroom: { $in: userRooms } },
    { location: { $in: userRooms } }
  ]
};
```

### Context Notes
The voice response includes metadata about access restrictions:
```javascript
{
  accessRestricted: true,
  userRole: 'teacher',
  candidateDevices: [...filtered devices...]
}
```

## Security Features

1. **Double Verification**: Access is checked both during device query AND before execution
2. **Confirmation Revalidation**: Bulk operations verify access again when user confirms
3. **Audit Logging**: Unauthorized attempts are logged with user and device info
4. **Session Context**: User context remembers last accessed device (within permissions)

## Admin Configuration

### Assigning Devices to Users

#### Option 1: Direct Device Assignment
```javascript
// Update user's assignedDevices array
user.assignedDevices.push(deviceId);
```

#### Option 2: Add User to Device
```javascript
// Update device's assignedUsers array
device.assignedUsers.push(userId);
```

#### Option 3: Room-Based Access
```javascript
// Assign rooms to user
user.assignedRooms = ['IoT Lab', 'Computer Lab'];
// Or set user's classroom
user.classroom = 'IoT Lab';
```

### Recommended Approach
For scalability, use **room-based access** so users automatically get access to all devices in their assigned rooms.

## Testing Voice Access

### Test as Admin
```bash
# Should see all devices
POST /api/voice-assistant/voice/command
{
  "command": "turn on all lights",
  "voiceToken": "admin_token"
}
```

### Test as Student
```bash
# Should only see assigned devices
POST /api/voice-assistant/voice/command
{
  "command": "turn on the projector in IoT Lab",
  "voiceToken": "student_token"
}
```

## Error Messages

| Error | Reason |
|-------|--------|
| "You do not have access to any devices" | User has no device assignments |
| "You no longer have access to one or more devices" | Permission revoked during confirmation |
| "Couldn't find any devices in [room]" | No accessible devices in specified room |
| "I found multiple devices. Try a more specific command" | Ambiguous command with multiple matches |

## Future Enhancements

1. **Time-based Access**: Restrict access to certain hours
2. **Request-based Access**: Allow users to request temporary device access
3. **Group-based Access**: Assign devices to user groups
4. **Granular Permissions**: Control which operations (on/off/status) are allowed
5. **Usage Limits**: Rate limiting per user or device

## Related Files

- `backend/controllers/voiceAssistantController.js` - Main logic
- `backend/routes/voiceAssistant.js` - API endpoints
- `backend/models/User.js` - User schema with assignments
- `backend/models/Device.js` - Device schema with assignments
- `backend/middleware/voiceAuth.js` - Session management
