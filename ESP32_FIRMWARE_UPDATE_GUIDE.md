# ESP32 Firmware Update Guide for New Power System

## Overview
This guide provides instructions for updating ESP32 firmware to support the new immutable power consumption tracking system with cumulative energy meters, LWT (Last Will Testament), and proper telemetry.

## Current State
The existing firmware (`esp32_mqtt_client.ino`, `warp_esp32_stable.ino`) currently:
- ✅ Sends heartbeat telemetry every 30 seconds
- ✅ Has MQTT connectivity with AsyncMqttClient
- ❌ Does NOT track cumulative energy (energy_wh_total)
- ❌ Does NOT implement LWT for proper offline detection
- ❌ Does NOT send structured telemetry for power tracking

## Required Changes

### 1. Add Cumulative Energy Counter (NVS Persistent)

**File**: `esp32_mqtt_client.ino` or `warp_esp32_stable.ino`

**Add Global Variable** (around line 130):
```cpp
// Cumulative energy tracking (persistent across reboots)
unsigned long energy_wh_total = 0;  // Total energy consumed since installation (Wh)
unsigned long last_energy_reading_time = 0;
float current_power_w = 0.0;  // Current power consumption in Watts
```

**Add to NVS Load in `setup()`** (after line 970):
```cpp
// Load cumulative energy from NVS
prefs.begin("energy", true);  // Read-only
energy_wh_total = prefs.getULong("total_wh", 0);
prefs.end();
Serial.printf("[ENERGY] Loaded cumulative energy: %lu Wh\n", energy_wh_total);
```

**Add Energy Calculation Function** (after line 400):
```cpp
// Calculate and update cumulative energy
void updateEnergy() {
  unsigned long now = millis();
  
  // Initialize on first run
  if (last_energy_reading_time == 0) {
    last_energy_reading_time = now;
    return;
  }
  
  // Calculate energy delta (E = P × t)
  unsigned long interval_ms = now - last_energy_reading_time;
  float interval_hours = interval_ms / 3600000.0;  // Convert ms to hours
  
  // Calculate current power based on active relays
  // IMPORTANT: Replace this with actual power sensor readings if available
  current_power_w = 0.0;
  for (int i = 0; i < NUM_SWITCHES; i++) {
    if (switchesLocal[i].state) {
      // Use configured power rating per device
      // This should come from backend config or NVS
      current_power_w += switchesLocal[i].power_rating;  // e.g., 60W per bulb
    }
  }
  
  // Calculate energy increment
  float energy_wh_delta = current_power_w * interval_hours;
  energy_wh_total += (unsigned long)energy_wh_delta;
  
  // Save to NVS every 10 Wh to avoid excessive writes
  static unsigned long last_nvs_save = 0;
  if (energy_wh_total - last_nvs_save >= 10) {
    prefs.begin("energy", false);  // Read-write
    prefs.putULong("total_wh", energy_wh_total);
    prefs.end();
    last_nvs_save = energy_wh_total;
    Serial.printf("[ENERGY] Saved to NVS: %lu Wh\n", energy_wh_total);
  }
  
  last_energy_reading_time = now;
}
```

**Call in `loop()`** (after line 1010):
```cpp
// Update energy calculation every 5 seconds
static unsigned long lastEnergyUpdate = 0;
if (millis() - lastEnergyUpdate >= 5000) {
  updateEnergy();
  lastEnergyUpdate = millis();
}
```

---

### 2. Implement Last Will Testament (LWT)

**Update MQTT Connection** (around line 400):
```cpp
void reconnect_mqtt() {
  if (mqttClient.connected()) return;
  
  static unsigned long lastAttempt = 0;
  unsigned long now = millis();
  if (now - lastAttempt < 5000) return;  // Rate limit
  lastAttempt = now;
  
  Serial.println("[MQTT] Attempting connection...");
  
  // ✅ NEW: Set Last Will Testament BEFORE connecting
  String statusTopic = "autovolt/" + String(ESP32_NAME) + "/status";
  String offlinePayload = "{\"status\":\"offline\",\"timestamp\":" + String(now) + "}";
  
  mqttClient.setWill(
    statusTopic.c_str(),    // LWT topic
    1,                       // QoS 1 for reliability
    true,                    // Retained message
    offlinePayload.c_str()   // Payload when disconnected
  );
  
  mqttClient.connect();
  // Connection result handled in onMqttConnect()
}
```

**Publish Online Status in `onMqttConnect()`** (around line 600):
```cpp
void onMqttConnect(bool sessionPresent) {
  Serial.printf("[MQTT] Connected to broker (session present: %d)\n", sessionPresent);
  connState = MQTT_CONNECTED;
  
  // ✅ Publish online status (overrides LWT)
  String statusTopic = "autovolt/" + String(ESP32_NAME) + "/status";
  DynamicJsonDocument doc(128);
  doc["status"] = "online";
  doc["timestamp"] = millis();
  doc["heap"] = ESP.getFreeHeap();
  
  char buf[128];
  serializeJson(doc, buf);
  mqttClient.publish(statusTopic.c_str(), 1, true, buf);  // QoS 1, retained
  
  // Subscribe to control topics
  String switchTopic = "autovolt/" + String(ESP32_NAME) + "/switches";
  String configTopic = "autovolt/" + String(ESP32_NAME) + "/config";
  mqttClient.subscribe(switchTopic.c_str(), 1);
  mqttClient.subscribe(configTopic.c_str(), 1);
  
  // Send full state update
  sendStateUpdate(true);
}
```

---

### 3. Send Proper Telemetry with Cumulative Energy

**Update Telemetry Payload** (around line 430):
```cpp
void sendTelemetry() {
  static unsigned long lastTelemetry = 0;
  unsigned long now = millis();
  
  // Send telemetry every 30 seconds
  if (now - lastTelemetry < 30000) return;
  lastTelemetry = now;
  
  // Build telemetry payload
  DynamicJsonDocument doc(512);
  doc["mac"] = WiFi.macAddress();
  doc["esp32_name"] = ESP32_NAME;  // e.g., "ESP32_CLASSROOM_A"
  doc["classroom"] = CLASSROOM;     // e.g., "CSE-301"
  doc["timestamp"] = now;
  doc["sequence_no"] = telemetrySequence++;  // Increment sequence number
  
  // ✅ NEW: Add cumulative energy
  doc["energy_wh_total"] = energy_wh_total;  // Cumulative meter reading
  doc["power_w"] = current_power_w;          // Current power (optional, for fallback)
  
  // Add switch states (Map of device_id → state)
  JsonObject switchStates = doc.createNestedObject("switch_state");
  for (int i = 0; i < NUM_SWITCHES; i++) {
    String deviceId = String("relay_") + String(switchesLocal[i].relayGpio);
    switchStates[deviceId] = switchesLocal[i].state;
  }
  
  // Device status
  doc["status"] = "online";
  doc["heap"] = ESP.getFreeHeap();
  doc["rssi"] = WiFi.RSSI();
  
  // Publish to telemetry topic
  String telemetryTopic = "autovolt/" + String(ESP32_NAME) + "/telemetry";
  char buf[512];
  size_t n = serializeJson(doc, buf);
  
  if (mqttClient.connected()) {
    mqttClient.publish(telemetryTopic.c_str(), 1, false, buf, n);  // QoS 1
    Serial.printf("[TELEMETRY] Sent: energy_wh_total=%lu, power_w=%.2f\n", 
                  energy_wh_total, current_power_w);
  }
}
```

**Call in `loop()`** (replace old sendHeartbeat):
```cpp
void loop() {
  // ... existing code ...
  
  sendTelemetry();  // Replaces sendHeartbeat()
  
  // ... rest of loop ...
}
```

---

### 4. Add Sequence Number for Deduplication

**Add Global Variable** (around line 130):
```cpp
unsigned long telemetrySequence = 0;  // Sequence number for telemetry messages
```

**Load from NVS in `setup()`**:
```cpp
prefs.begin("telemetry", true);
telemetrySequence = prefs.getULong("seq_no", 0);
prefs.end();
```

**Save to NVS periodically**:
```cpp
// Save sequence number every 100 messages
if (telemetrySequence % 100 == 0) {
  prefs.begin("telemetry", false);
  prefs.putULong("seq_no", telemetrySequence);
  prefs.end();
}
```

---

### 5. Add Power Ratings Per Device (From Backend Config)

**Modify SwitchState struct** (around line 115):
```cpp
struct SwitchState {
  int relayGpio;
  int manualGpio;
  bool state;
  bool usePir;
  bool dontAutoOff;
  bool isValid;
  unsigned long lastToggleTime;
  float power_rating;  // ✅ NEW: Power rating in Watts (from backend)
};
```

**Parse from MQTT Config** (in `onMqttMessage()`, around line 650):
```cpp
// Parse switch config from backend
if (strcmp(topic, configTopic.c_str()) == 0) {
  DynamicJsonDocument doc(2048);
  deserializeJson(doc, payload, len);
  
  if (doc.containsKey("switches")) {
    JsonArray switches = doc["switches"];
    for (JsonObject sw : switches) {
      int relayGpio = sw["relayGpio"];
      
      for (int i = 0; i < NUM_SWITCHES; i++) {
        if (switchesLocal[i].relayGpio == relayGpio) {
          switchesLocal[i].power_rating = sw["powerRating"] | 60.0;  // Default 60W
          Serial.printf("[CONFIG] Set power rating for GPIO %d: %.2fW\n", 
                        relayGpio, switchesLocal[i].power_rating);
          break;
        }
      }
    }
    
    // Save to NVS
    prefs.begin("power", false);
    for (int i = 0; i < NUM_SWITCHES; i++) {
      String key = "pwr_" + String(switchesLocal[i].relayGpio);
      prefs.putFloat(key.c_str(), switchesLocal[i].power_rating);
    }
    prefs.end();
  }
}
```

---

## Configuration Constants

**Add to `config.h`** (or directly in .ino):
```cpp
// Device identification (MUST be unique per ESP32)
#define ESP32_NAME "ESP32_CLASSROOM_A"
#define CLASSROOM "CSE-301"

// MQTT topics (new structure)
#define MQTT_TOPIC_TELEMETRY "autovolt/" ESP32_NAME "/telemetry"
#define MQTT_TOPIC_STATUS "autovolt/" ESP32_NAME "/status"
#define MQTT_TOPIC_SWITCHES "autovolt/" ESP32_NAME "/switches"
#define MQTT_TOPIC_CONFIG "autovolt/" ESP32_NAME "/config"
#define MQTT_TOPIC_HEARTBEAT "autovolt/" ESP32_NAME "/heartbeat"

// QoS levels
#define STATUS_QOS 1    // QoS 1 for LWT reliability
#define TELEMETRY_QOS 1 // QoS 1 for telemetry reliability
```

---

## Backend Integration

### Backend MQTT Subscription (server.js)
```javascript
// Subscribe to all ESP32 telemetry
mqttClient.subscribe('autovolt/+/telemetry', { qos: 1 });
mqttClient.subscribe('autovolt/+/status', { qos: 1 });
mqttClient.subscribe('autovolt/+/heartbeat', { qos: 1 });

mqttClient.on('message', async (topic, message) => {
  const parts = topic.split('/');
  const esp32_name = parts[1];
  const topicType = parts[2];
  
  if (topicType === 'telemetry') {
    const payload = JSON.parse(message.toString());
    await telemetryIngestionService.ingestTelemetry({
      esp32_name: payload.esp32_name,
      classroom: payload.classroom,
      timestamp: new Date(),
      power_w: payload.power_w,
      energy_wh_total: payload.energy_wh_total,
      switch_state: payload.switch_state,
      status: payload.status,
      mqtt_payload: payload
    });
  }
  
  if (topicType === 'status') {
    const payload = JSON.parse(message.toString());
    if (payload.status === 'offline') {
      await handleDeviceOffline(esp32_name);
    } else if (payload.status === 'online') {
      await handleDeviceOnline(esp32_name);
    }
  }
});
```

---

## Testing Checklist

### 1. Energy Counter Persistence
- [ ] Flash firmware and verify `energy_wh_total` starts at 0
- [ ] Let it run for 1 hour with relays ON
- [ ] Reboot ESP32
- [ ] Verify `energy_wh_total` is restored from NVS

### 2. LWT Testing
- [ ] Connect ESP32 to MQTT broker
- [ ] Verify online status published to `autovolt/<name>/status`
- [ ] Physically disconnect power
- [ ] Verify broker publishes LWT offline message (retained)
- [ ] Reconnect power
- [ ] Verify online status replaces LWT

### 3. Telemetry Testing
- [ ] Monitor `autovolt/<name>/telemetry` topic
- [ ] Verify messages sent every 30 seconds
- [ ] Verify `energy_wh_total` increments correctly
- [ ] Verify `switch_state` map is correct
- [ ] Verify `sequence_no` increments

### 4. Backend Integration
- [ ] Verify telemetry stored in `telemetry_events` collection
- [ ] Verify ledger entries created in `device_consumption_ledger`
- [ ] Verify no duplicate entries (hash deduplication working)
- [ ] Verify offline period handled correctly (LWT → no telemetry → online)

---

## Migration Strategy

### Phase 1: Firmware Update (1 Device)
1. Select one ESP32 device for testing
2. Flash updated firmware with new telemetry
3. Monitor for 24 hours
4. Verify data in backend (telemetry_events, ledger)

### Phase 2: Gradual Rollout (10% of Devices)
1. Flash 10% of devices
2. Monitor for 1 week
3. Compare data quality with old system
4. Fix any issues discovered

### Phase 3: Full Rollout (All Devices)
1. Flash all remaining devices
2. Deprecate old power tracking code after 1 week
3. Archive old `ActivityLog` and `EnergyConsumption` collections

---

## Important Notes

### Power Calculation Methods

The firmware has **two options** for power measurement:

#### Option A: Calculated Power (Relay State Based)
- **Current Implementation**: Sum of relay power ratings
- **Pros**: Simple, no extra hardware needed
- **Cons**: Not accurate if devices have variable loads
- **Use Case**: Fixed loads like lights, fans

#### Option B: Measured Power (Sensor Based)
- **Requires**: PZEM-004T or similar power meter on each relay
- **Pros**: Accurate real-time measurements
- **Cons**: More complex wiring, higher cost
- **Use Case**: Variable loads like computers, motors

**Recommendation**: Start with Option A (calculated), upgrade to Option B later if accuracy is critical.

---

### Energy Counter Reset Detection

The backend automatically detects when `energy_wh_total` decreases (firmware resets, NVS corruption, counter overflow):

```javascript
// backend/services/ledgerGenerationService.js (already implemented)
detectReset(lastEntry, currentEvent) {
  if (lastEntry && currentEvent.energy_wh_total < lastEntry.end_energy_wh_total) {
    return {
      isReset: true,
      reason: 'counter_wrap_or_firmware_reset'
    };
  }
  return { isReset: false };
}
```

The ledger will create a `is_reset_marker: true` entry and continue tracking from the new base.

---

## Troubleshooting

### Issue: Energy Counter Not Incrementing
- **Check**: Are any relays actually ON?
- **Check**: Is `current_power_w` being calculated correctly?
- **Fix**: Verify power ratings are loaded from backend config

### Issue: Duplicate Telemetry in Backend
- **Check**: Is `sequence_no` incrementing?
- **Check**: Is deduplication working (SHA256 hash)?
- **Fix**: Ensure telemetry includes all required fields

### Issue: LWT Not Publishing on Disconnect
- **Check**: Is LWT set BEFORE `mqttClient.connect()`?
- **Check**: Is LWT topic retained (flag set to `true`)?
- **Fix**: Verify MQTT broker supports LWT (most do)

### Issue: Energy Saved to NVS Too Frequently
- **Symptom**: NVS wear, slow performance
- **Fix**: Increase save threshold from 10 Wh to 50 Wh or higher

---

## Summary

| Feature | Status | Priority | Testing Required |
|---------|--------|----------|------------------|
| Cumulative energy counter | ✅ Spec ready | HIGH | 24 hours runtime |
| LWT implementation | ✅ Spec ready | HIGH | Disconnect test |
| Proper telemetry format | ✅ Spec ready | HIGH | Monitor MQTT topic |
| Sequence numbers | ✅ Spec ready | MEDIUM | Check dedup |
| Power ratings from backend | ✅ Spec ready | LOW | Config test |

**Total Development Time**: 2-4 hours per firmware variant (esp32_mqtt_client.ino, warp_esp32_stable.ino)

**Total Testing Time**: 24-48 hours (1 device), 1 week (full rollout)

---

## Next Steps

1. ✅ Review this guide
2. ⏳ Implement changes in one firmware file (e.g., `esp32_mqtt_client.ino`)
3. ⏳ Flash to test device
4. ⏳ Monitor backend logs and database
5. ⏳ Validate energy calculations match expectations
6. ⏳ Rollout to all devices

Once firmware is updated, the new power system will provide:
- ✅ Immutable audit trail
- ✅ Accurate offline period handling
- ✅ Proper reset detection
- ✅ Consistent dashboard/chart data
- ✅ Historical rate recalculation support
