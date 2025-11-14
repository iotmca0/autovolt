# AutoVolt Multiplatform Voice Control - Mobile Assistant Integration

## 🎯 How Mobile Assistants Connect to AutoVolt

### Architecture Overview

```
Mobile Device (Google/Alexa/Siri)
        ↓
Assistant App/Service (Cloud)
        ↓
OAuth Authentication + Webhook
        ↓
AutoVolt Backend API
        ↓
MQTT Command to ESP32
        ↓
Physical Device Control
```

---

## 🔗 Connection Flow for Each Platform

### 1. Google Assistant Integration

#### **Setup Process:**
1. **User Action**: "Hey Google, talk to AutoVolt"
2. **Google Response**: "To link your AutoVolt account, open the Google Home app"
3. **OAuth Flow**: User signs into AutoVolt account in Google Home app
4. **Permission Grant**: User grants Google access to control devices
5. **Device Sync**: Google discovers all user's AutoVolt devices

#### **How Commands Work:**
```
User: "Hey Google, turn on lights in IoT Lab"
Google → Google Smart Home API → AutoVolt Webhook (/api/voice-assistant/google/action)
AutoVolt → Processes command → MQTT → ESP32 → Lights ON ✅
```

#### **Technical Details:**
- **API**: Google Smart Home API
- **Authentication**: OAuth 2.0 with refresh tokens
- **Webhook URL**: `https://your-domain.com/api/voice-assistant/google/action`
- **Intents Supported**:
  - `SYNC` - Device discovery
  - `QUERY` - Get device states
  - `EXECUTE` - Control devices
- **Device Types**: Maps to Google device types (LIGHT, FAN, SWITCH, AC_UNIT)

#### **Mobile Apps:**
- **Google Home App** (Android/iOS) - Primary setup and control
- **Google Assistant App** - Voice commands
- **Works on**: Any device with Google Assistant (phones, smart displays, etc.)

---

### 2. Amazon Alexa Integration

#### **Setup Process:**
1. **User Action**: "Alexa, enable AutoVolt skill"
2. **Alexa Response**: "To link your AutoVolt account, open the Alexa app"
3. **OAuth Flow**: User signs into AutoVolt in Alexa app
4. **Skill Enable**: Alexa enables AutoVolt Smart Home Skill
5. **Device Discovery**: Alexa calls discovery API to find devices

#### **How Commands Work:**
```
User: "Alexa, turn off the fan"
Alexa → Alexa Smart Home API → AutoVolt Webhook (/api/voice-assistant/alexa/smart-home)
AutoVolt → Processes command → MQTT → ESP32 → Fan OFF ✅
```

#### **Technical Details:**
- **API**: Alexa Smart Home Skill API
- **Authentication**: OAuth 2.0 with authorization codes
- **Webhook URL**: `https://your-domain.com/api/voice-assistant/alexa/smart-home`
- **Directives Supported**:
  - `Discover` - Device discovery
  - `TurnOn/TurnOff` - Power control
  - `ReportState` - Status reporting
- **Device Types**: Maps to Alexa capabilities (PowerController, EndpointHealth)

#### **Mobile Apps:**
- **Amazon Alexa App** (Android/iOS) - Setup and device management
- **Works on**: Echo devices, Alexa-enabled smart devices, phones with Alexa app

---

### 3. Siri/HomeKit Integration

#### **Setup Process:**
1. **User Action**: "Hey Siri, set up HomeKit devices"
2. **iOS Settings**: User opens Settings → Home → Add Accessory
3. **QR Code/URL**: User scans QR code or enters setup URL
4. **OAuth Flow**: User signs into AutoVolt account
5. **Device Sync**: HomeKit app discovers and adds devices

#### **How Commands Work:**
```
User: "Hey Siri, turn on projector"
Siri → HomeKit Framework → AutoVolt Webhook (/api/voice-assistant/siri/webhook)
AutoVolt → Processes command → MQTT → ESP32 → Projector ON ✅
```

#### **Technical Details:**
- **API**: HomeKit Accessory Protocol (webhook-based)
- **Authentication**: OAuth 2.0 with HomeKit-specific tokens
- **Webhook URL**: `https://your-domain.com/api/voice-assistant/siri/webhook`
- **Intents Supported**:
  - `turn_on/turn_off` - Power control
  - `get_status` - Device status
- **Device Types**: Maps to HomeKit accessory types (Switch, Lightbulb, Fan)

#### **Mobile Apps:**
- **Apple Home App** (iOS) - Primary setup and control
- **Works on**: iPhone, iPad, Apple Watch, HomePod, Apple TV

---

## 🔐 Authentication & Security

### OAuth 2.0 Flow (All Platforms)

```
1. User initiates linking in assistant app
2. Assistant redirects to AutoVolt OAuth page
3. User signs in to AutoVolt account
4. User grants permissions to assistant
5. Assistant receives access token + refresh token
6. Assistant can now send authenticated requests
```

### Security Features

- **JWT Tokens**: Each platform gets unique JWT tokens
- **Role-Based Access**: Assistants inherit user's permissions
- **Rate Limiting**: 100 commands per 15 minutes per user
- **Session Management**: Voice sessions expire after 24 hours
- **Audit Logging**: All commands logged with user attribution

### Permission Mapping

| AutoVolt Role | Google Assistant | Amazon Alexa | Siri/HomeKit |
|---------------|------------------|--------------|--------------|
| Super-Admin | Full Control | Full Control | Full Control |
| Admin | Full Control | Full Control | Full Control |
| Dean | Academic Devices | Academic Devices | Academic Devices |
| Faculty | Assigned Rooms | Assigned Rooms | Assigned Rooms |
| Student | Assigned Devices | Assigned Devices | Assigned Devices |

---

## 📱 Mobile-Specific Features

### Cross-Platform Commands

**Same Commands Work Everywhere:**
- ✅ "Turn on the lights"
- ✅ "Switch off fan in IoT Lab"
- ✅ "What's the status of projector"
- ✅ "Turn off everything"

### Platform-Specific Optimizations

**Google Assistant:**
- Best natural language understanding
- Contextual follow-up commands
- Works offline for some commands

**Amazon Alexa:**
- Fastest response times
- Excellent device grouping
- Strong routine integration

**Siri/HomeKit:**
- Deep iOS integration
- Automation with Shortcuts app
- Works with Apple Watch

### Mobile App Integration

**Google Home App:**
- Visual device control
- Room-based organization
- Automation routines
- Works with Android Auto

**Alexa App:**
- Device groups and scenes
- Smart home dashboards
- Works with Alexa Auto

**Apple Home App:**
- 3D room visualization
- Automation with HomeKit
- Works with CarPlay

---

## 🔄 Device Synchronization

### How Devices Appear in Mobile Apps

**Google Home:**
```
🏠 Home
  └── 📍 IoT Lab
      ├── 💡 Light 1 (AutoVolt IoT)
      ├── 💡 Light 2 (AutoVolt IoT)
      └── 🌪️ Fan (AutoVolt IoT)
```

**Alexa:**
```
🏠 Smart Home
  └── 📍 IoT Lab
      ├── 💡 IoT Lab Light 1
      ├── 💡 IoT Lab Light 2
      └── 🌪️ IoT Lab Fan
```

**Apple Home:**
```
🏠 Home
  └── 🏫 IoT Lab
      ├── 💡 Light 1
      ├── 💡 Light 2
      └── 🌪️ Fan
```

### Sync Triggers

- **Automatic**: When devices are added/removed in AutoVolt
- **Manual**: User can trigger sync in assistant apps
- **Periodic**: Assistants sync every 24 hours automatically

---

## ⚡ Real-Time Updates

### State Synchronization

**When Device Changes:**
1. ESP32 sends MQTT update to AutoVolt backend
2. Backend updates database
3. Backend sends webhook to assistant platforms
4. Assistant apps update device states in real-time

**Supported Updates:**
- Device online/offline status
- Switch state changes (ON/OFF)
- Power consumption updates
- Error conditions

---

## 🛠️ Setup Instructions

### Google Assistant Setup

1. **Open Google Home App**
2. **Tap "+" → "Set up device" → "Works with Google"**
3. **Search for "AutoVolt"**
4. **Sign in with your AutoVolt account**
5. **Grant permissions**
6. **Wait for device discovery**

### Amazon Alexa Setup

1. **Open Alexa App**
2. **Tap "More" → "Skills & Games"**
3. **Search for "AutoVolt"**
4. **Enable the skill**
5. **Link your AutoVolt account**
6. **Discover devices**

### Siri/HomeKit Setup

1. **Open Home App on iPhone**
2. **Tap "+" → "Add Accessory"**
3. **Tap "Don't Have a Code?"**
4. **Select AutoVolt from list**
5. **Sign in to AutoVolt**
6. **Add devices to rooms**

---

## 🔧 Troubleshooting

### Common Issues

**"Account linking failed"**
- Check internet connection
- Verify AutoVolt account credentials
- Try different browser/app

**"Devices not found"**
- Ensure devices are online in AutoVolt dashboard
- Trigger manual sync in assistant app
- Check user permissions

**"Commands not working"**
- Verify device is online
- Check MQTT connection status
- Review command logs in AutoVolt

**"Permission denied"**
- Check role permissions in AutoVolt
- Re-link account in assistant app
- Contact administrator

### Debug Tools

**Check Backend Logs:**
```bash
tail -f backend/logs/voice-assistant.log
```

**Test Webhooks:**
```bash
curl -X POST https://your-domain.com/api/voice-assistant/google/action \
  -H "Content-Type: application/json" \
  -d '{"inputs":[{"intent":"action.devices.SYNC"}],"requestId":"test"}'
```

**Monitor MQTT:**
```bash
mosquitto_sub -h localhost -t "esp32/#" -v
```

---

## 📊 Analytics & Monitoring

### Voice Command Tracking

**Metrics Collected:**
- Commands per platform (Google/Alexa/Siri/Web)
- Success/failure rates
- Popular commands and devices
- Response times
- User engagement

**Dashboard Available:**
- Voice command history
- Platform usage statistics
- Error analysis
- User activity reports

---

## 🚀 Advanced Features

### Multi-Assistant Control

**Control from Multiple Platforms:**
- Set up on Google Assistant AND Alexa
- Same devices appear in both apps
- Commands work from any platform
- State syncs across all platforms

### Automation Integration

**Google Home Routines:**
- "Good morning" → Turn on IoT Lab lights
- "Movie time" → Turn off lights, turn on projector

**Alexa Routines:**
- "Study session" → Turn on Computer Lab lights and fans
- "Break time" → Turn off all devices

**Siri Shortcuts:**
- Custom shortcuts for complex commands
- Integration with iOS automation

### Voice Context Management

**Follow-up Commands:**
```
User (Google): "Turn on lights in IoT Lab"
Assistant: "Turned on 3 lights"

User: "Turn them off" ← Context remembered
Assistant: "Turned off 3 lights"
```

---

## 🔮 Future Enhancements

- **Multi-language support** (Hindi, Tamil, Telugu)
- **Voice biometrics** (speaker identification)
- **Advanced NLP** (complex sentence understanding)
- **Offline mode** (command queuing)
- **Voice analytics** (usage patterns, preferences)

---

## 📞 Support

**Setup Help:**
- Check platform-specific setup guides
- Verify account permissions
- Test with web interface first

**Command Issues:**
- Try simpler commands first
- Check device online status
- Review error logs

**Integration Problems:**
- Re-link accounts in assistant apps
- Clear app cache and restart
- Contact support with error details

---

**Last Updated**: November 12, 2025  
**Platforms Supported**: Google Assistant, Amazon Alexa, Siri/HomeKit  
**Mobile OS**: Android, iOS  
**Setup Time**: 2-5 minutes per platform

