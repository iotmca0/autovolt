/**
 * WARP ESP32 Classroom Automation - Stable Version
 * 
 * Features:
 * - 6 relay control with manual switches (momentary/maintained)
 * - Dual PIR/Microwave motion sensor support
 * - Per-switch PIR configuration (usePir, dontAutoOff)
 * - MQTT communication with backend
 * - Persistent state in NVS
 * - Watchdog protection with frequent resets
 * - Heap memory monitoring
 * - WiFi auto-reconnect
 * 
 * Created: 2025-10-26
 * Status: Production Ready
 */

#include <WiFi.h>
#include <AsyncMqttClient.h>
#include <AsyncTCP.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <time.h>
#include <stdlib.h>
#include "config.h"
#include "blink_status.h"

// When many switches are toggled at once (motion or bulk config), staggering
// the physical relay transitions reduces inrush current and audible/electrical
// disturbance. If RELAY_SWITCH_STAGGER_MS is defined in config.h it will be
// used, otherwise fall back to this sensible default.
#ifndef RELAY_SWITCH_STAGGER_MS
#define RELAY_SWITCH_STAGGER_MS 150
#endif

// Minimum time allowed between physical toggles of the same relay. This
// prevents audible/electrical chattering by ignoring rapid contradictory
// commands targeting the same GPIO. Can be overridden in config.h.
#ifndef RELAY_MIN_TOGGLE_MS
#define RELAY_MIN_TOGGLE_MS 300
#endif

// ========================================
// CONFIGURATION
// ========================================
// All board / network / MQTT / pin configuration moved to esp32/config.h
// Edit esp32/config.h to change WiFi, MQTT, topics, pins, and timing constants.

// ========================================
// GLOBAL VARIABLES
// ========================================
AsyncMqttClient mqttClient;
Preferences prefs;
char mqttClientId[24];
ConnState connState = WIFI_DISCONNECTED;

// Async MQTT callbacks
void onMqttConnect(bool sessionPresent);
void onMqttDisconnect(AsyncMqttClientDisconnectReason reason);
void onMqttMessage(char* topic, char* payload, AsyncMqttClientMessageProperties properties, size_t len, size_t index, size_t total);
void onMqttPublish(uint16_t packetId);

// Switch state structure
struct SwitchState {
  int relayGpio;
  int manualGpio;
  bool state;
  bool manualOverride;
  bool manualEnabled;
  bool manualActiveLow;
  bool manualMomentary;
  int lastManualLevel;
  unsigned long lastManualChangeMs;
  int stableManualLevel;
  bool lastManualActive;
  bool defaultState;
  int gpio;  // For compatibility
  bool usePir;  // Per-switch PIR response
  bool dontAutoOff;  // Prevent auto-off
};
SwitchState switchesLocal[NUM_SWITCHES];
bool pinSetup[NUM_SWITCHES] = {false};

// Command queue
struct Command {
  int gpio;
  bool state;
  bool valid;
  unsigned long timestamp;
  uint8_t source; // CMD_SRC_*
};
Command commandQueue[MAX_COMMAND_QUEUE];
int commandQueueHead = 0;
int commandQueueTail = 0;

// Motion sensor configuration
struct MotionSensorConfig {
  bool enabled;
  String type;            // "hc-sr501", "rcwl-0516", or "both"
  int primaryGpio;        // PIR (GPIO 34)
  int secondaryGpio;      // Microwave (GPIO 35)
  int autoOffDelay;       // seconds
  String detectionLogic;  // "and", "or", or "weighted"
  bool dualMode;          // true when using both
  bool scheduleEnabled;   // enable time-based gating
  String activeStartTime; // HH:MM (local)
  String activeEndTime;   // HH:MM (local)
  int activeDays[7];      // 0/1 for Sunday..Saturday
  String timezone;        // POSIX TZ (e.g., "IST-5:30", "UTC")
};
MotionSensorConfig motionConfig = {
  false, "hc-sr501", 34, 35, 30, "and", false,
  false, "08:30", "17:30", {0,1,1,1,1,1,0}, "UTC"
};

// Motion sensor state
bool motionDetected = false;
bool lastMotionState = false;
unsigned long lastMotionTime = 0;
unsigned long motionStartTime = 0;
bool autoOffActive = false;
int affectedSwitches[NUM_SWITCHES] = {-1, -1, -1, -1, -1, -1};

// Timing variables
unsigned long lastStateSend = 0;
bool pendingState = false;
// Boot time to avoid spurious triggers right after boot
unsigned long bootTime = 0;

// --- Non-blocking debounce runtime state ---
unsigned long lastMotionSampleAt = 0;
uint8_t primaryConsecutive = 0;
uint8_t secondaryConsecutive = 0;
bool primaryStableState = false;
bool secondaryStableState = false;
bool lastPrimaryRaw = false;
bool lastSecondaryRaw = false;
// Track last successful heartbeat publish (ms)
unsigned long lastSuccessfulHeartbeatPublish = 0;
bool reportedOffline = false;
// Track the last heartbeat message id so we can mark success on PUBACK
uint16_t lastHeartbeatMsgId = 0;

// Track last physical toggle per switch to enforce RELAY_MIN_TOGGLE_MS
unsigned long lastToggleAt[NUM_SWITCHES] = {0};

// Additional debouncing variables for enhanced stability
unsigned long primaryLastChangeTime = 0;
unsigned long secondaryLastChangeTime = 0;
unsigned long lastPressTime[NUM_SWITCHES] = {0};
uint8_t debounceCounter[NUM_SWITCHES] = {0};

// ========================================
// UTILITY FUNCTIONS
// ========================================
// Command sources
#define CMD_SRC_BACKEND 0
#define CMD_SRC_MOTION  1
#define CMD_SRC_MANUAL  2

const char* cmdSourceName(uint8_t s) {
  if (s == CMD_SRC_MOTION) return "motion";
  if (s == CMD_SRC_MANUAL) return "manual";
  return "backend";
}

String normalizeMac(String mac) {
  String normalized = "";
  for (char c : mac) {
    if (isAlphaNumeric(c)) {
      normalized += tolower(c);
    }
  }
  return normalized;
}

int relayNameToGpio(const char* relay) {
  if (strcmp(relay, "relay1") == 0) return 16;
  if (strcmp(relay, "relay2") == 0) return 17;
  if (strcmp(relay, "relay3") == 0) return 18;
  if (strcmp(relay, "relay4") == 0) return 19;
  if (strcmp(relay, "relay5") == 0) return 21;
  if (strcmp(relay, "relay6") == 0) return 22;
  return -1;
}

// ========================================
// NVS PERSISTENCE
// ========================================
void loadSwitchConfigFromNVS() {
  prefs.begin("switch_cfg", true);
  for (int i = 0; i < NUM_SWITCHES; i++) {
    switchesLocal[i].relayGpio = prefs.getInt(("relay" + String(i)).c_str(), relayPins[i]);
    switchesLocal[i].manualGpio = prefs.getInt(("manual" + String(i)).c_str(), manualSwitchPins[i]);
    switchesLocal[i].defaultState = prefs.getBool(("def" + String(i)).c_str(), false);
    switchesLocal[i].state = prefs.getBool(("state" + String(i)).c_str(), false);
    switchesLocal[i].manualMomentary = prefs.getBool(("momentary" + String(i)).c_str(), true);
    switchesLocal[i].usePir = prefs.getBool(("usePir" + String(i)).c_str(), false);
    switchesLocal[i].dontAutoOff = prefs.getBool(("dontAutoOff" + String(i)).c_str(), false);
  }
  prefs.end();
  Serial.println("[NVS] Loaded switch config with PIR settings");
}

void saveSwitchConfigToNVS() {
  prefs.begin("switch_cfg", false);
  for (int i = 0; i < NUM_SWITCHES; i++) {
    prefs.putInt(("relay" + String(i)).c_str(), switchesLocal[i].relayGpio);
    prefs.putInt(("manual" + String(i)).c_str(), switchesLocal[i].manualGpio);
    prefs.putBool(("def" + String(i)).c_str(), switchesLocal[i].defaultState);
    prefs.putBool(("state" + String(i)).c_str(), switchesLocal[i].state);
    prefs.putBool(("momentary" + String(i)).c_str(), switchesLocal[i].manualMomentary);
    prefs.putBool(("usePir" + String(i)).c_str(), switchesLocal[i].usePir);
    prefs.putBool(("dontAutoOff" + String(i)).c_str(), switchesLocal[i].dontAutoOff);
  }
  prefs.end();
}

// ========================================
// TIMEZONE / SCHEDULE HELPERS
// ========================================
void applyTimezone(const String &tz) {
  static String appliedTZ = "";
  if (!tz.length()) return;
  if (appliedTZ == tz) return;
  setenv("TZ", tz.c_str(), 1);
  tzset();
  appliedTZ = tz;
  Serial.printf("[TIME] Timezone set to %s\n", tz.c_str());
}

void ensureDefaultActiveDays() {
  bool any = false;
  for (int d = 0; d < 7; d++) { if (motionConfig.activeDays[d]) { any = true; break; } }
  if (!any) {
    int def[7] = {0,1,1,1,1,1,0};
    for (int d = 0; d < 7; d++) motionConfig.activeDays[d] = def[d];
    Serial.println("[SCHED] Active days defaulted to weekdays");
  }
}

bool isMotionDetectionAllowed() {
  if (!motionConfig.enabled) {
    Serial.println("[SCHED] Motion disabled");
    return false;
  }
  if (!motionConfig.scheduleEnabled) {
    Serial.println("[SCHED] Schedule disabled - motion always allowed");
    return true;
  }

  applyTimezone(motionConfig.timezone);
  ensureDefaultActiveDays();

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    // If time not yet synced, allow motion (fail-open)
    Serial.println("[SCHED] ⚠️ Time NOT synced - allowing motion (fail-open)");
    return true;
  }
  
  // Log current time for debugging
  char timebuf[64];
  strftime(timebuf, sizeof(timebuf), "%Y-%m-%d %H:%M:%S (%A)", &timeinfo);
  Serial.printf("[SCHED] Current time: %s, TZ: %s\n", timebuf, motionConfig.timezone.c_str());
  
  int wday = timeinfo.tm_wday; // 0=Sunday
  if (wday < 0 || wday > 6) return true;
  
  if (motionConfig.activeDays[wday] == 0) {
    Serial.printf("[SCHED] ❌ Day check FAILED - Today (wday=%d) is NOT active\n", wday);
    return false;
  }
  Serial.printf("[SCHED] ✓ Day check passed - wday=%d is active\n", wday);

  int sh=0, sm=0, eh=0, em=0;
  if (sscanf(motionConfig.activeStartTime.c_str(), "%d:%d", &sh, &sm) != 2) return true;
  if (sscanf(motionConfig.activeEndTime.c_str(), "%d:%d", &eh, &em) != 2) return true;
  int cur = timeinfo.tm_hour*60 + timeinfo.tm_min;
  int start = sh*60 + sm;
  int end = eh*60 + em;
  
  bool inWindow;
  if (start <= end) {
    inWindow = (cur >= start && cur < end);
  } else {
    inWindow = (cur >= start || cur < end); // spans midnight
  }
  
  Serial.printf("[SCHED] Time check: %02d:%02d (cur=%d) vs window %s-%s (start=%d, end=%d) -> %s\n",
    timeinfo.tm_hour, timeinfo.tm_min, cur,
    motionConfig.activeStartTime.c_str(), motionConfig.activeEndTime.c_str(),
    start, end, inWindow ? "✓ ALLOWED" : "❌ BLOCKED");
  
  return inWindow;
}

void initSwitches() {
  for (int i = 0; i < NUM_SWITCHES; i++) {
    switchesLocal[i].relayGpio = relayPins[i];
    switchesLocal[i].manualGpio = manualSwitchPins[i];
    switchesLocal[i].state = false;
    switchesLocal[i].manualOverride = false;
    switchesLocal[i].manualEnabled = true;
    switchesLocal[i].manualActiveLow = MANUAL_ACTIVE_LOW;
    switchesLocal[i].manualMomentary = true;
    switchesLocal[i].lastManualLevel = -1;
    switchesLocal[i].lastManualChangeMs = 0;
    switchesLocal[i].stableManualLevel = -1;
    switchesLocal[i].lastManualActive = false;
    switchesLocal[i].defaultState = false;
    switchesLocal[i].usePir = false;
    switchesLocal[i].dontAutoOff = false;
  }
  loadSwitchConfigFromNVS();
  
  // Validate loaded states against hardware constraints
  for (int i = 0; i < NUM_SWITCHES; i++) {
    // Ensure GPIO pins are valid
    if (switchesLocal[i].relayGpio < 0 || switchesLocal[i].relayGpio > 39) {
      Serial.printf("[INIT] Invalid relay GPIO %d for switch %d, resetting to default\n", 
        switchesLocal[i].relayGpio, i);
      switchesLocal[i].relayGpio = relayPins[i];
      switchesLocal[i].state = false;
    }
    
    // Log initial states for debugging
    Serial.printf("[INIT] Switch %d: GPIO %d, state=%s, momentary=%s, usePir=%s\n",
      i, switchesLocal[i].relayGpio, switchesLocal[i].state ? "ON" : "OFF",
      switchesLocal[i].manualMomentary ? "YES" : "NO",
      switchesLocal[i].usePir ? "YES" : "NO");
  }
  
  // Apply loaded states to relays
  for (int i = 0; i < NUM_SWITCHES; i++) {
    pinMode(switchesLocal[i].relayGpio, OUTPUT);
    digitalWrite(switchesLocal[i].relayGpio, 
      switchesLocal[i].state ? (RELAY_ACTIVE_HIGH ? HIGH : LOW) : (RELAY_ACTIVE_HIGH ? LOW : HIGH));
    pinSetup[i] = false;
    lastToggleAt[i] = millis();
  }
}

// ========================================
// COMMAND QUEUE
// ========================================
void queueSwitchCommand(int gpio, bool state, uint8_t source) {
  // Validate GPIO is actually configured for a switch
  bool validGpio = false;
  for (int i = 0; i < NUM_SWITCHES; i++) {
    if (switchesLocal[i].relayGpio == gpio) {
      validGpio = true;
      break;
    }
  }
  if (!validGpio) {
    Serial.printf("[CMD] Rejected: GPIO %d not configured for any switch\n", gpio);
    return;
  }

  // Prevent queuing if source is motion but motion is disabled
  if (source == CMD_SRC_MOTION && !motionConfig.enabled) {
    Serial.printf("[CMD] Rejected: Motion command but motion disabled\n");
    return;
  }

  int nextTail = (commandQueueTail + 1) % MAX_COMMAND_QUEUE;
  if (nextTail == commandQueueHead) {
    Serial.println("[CMD] Queue full, dropping command");
    return;
  }
  // Deduplicate/merge: if a command for this gpio already exists in the
  // queue, update it instead of adding a second entry. If the device is
  // already in the desired state and no queued opposite command exists,
  // skip enqueueing to avoid unnecessary toggles.
  int i = commandQueueHead;
  while (i != commandQueueTail) {
    if (commandQueue[i].gpio == gpio) {
      if (commandQueue[i].state == state) {
        Serial.printf("[CMD] Skip enqueue - already queued same state for GPIO %d\n", gpio);
        return;
      } else {
        // Update existing queued command to the new desired state
        commandQueue[i].state = state;
        commandQueue[i].timestamp = millis();
        commandQueue[i].source = source;
        Serial.printf("[CMD] Updated queued command for GPIO %d -> %s\n", gpio, state ? "ON" : "OFF");
        return;
      }
    }
    i = (i + 1) % MAX_COMMAND_QUEUE;
  }

  // If current physical state already matches desired and there is no
  // queued command for this gpio, nothing to do.
  for (int s = 0; s < NUM_SWITCHES; s++) {
    if (switchesLocal[s].relayGpio == gpio) {
      if (switchesLocal[s].state == state) {
        Serial.printf("[CMD] Skip enqueue - GPIO %d already in desired state\n", gpio);
        return;
      }
      break;
    }
  }

  // Append new command
  commandQueue[commandQueueTail] = {gpio, state, true, millis(), source};
  commandQueueTail = nextTail;
  Serial.printf("[CMD] Queued: GPIO %d -> %s\n", gpio, state ? "ON" : "OFF");
}

void processCommandQueue() {
  // We only process a command every RELAY_SWITCH_STAGGER_MS to avoid
  // switching many relays at the same instant. This reduces electrical
  // and audible disturbance when bulk updates happen (motion, config, etc.).
  static unsigned long lastProcess = 0;
  static unsigned long lastSwitchApply = 0;
  unsigned long now = millis();
  if (now - lastProcess < 10) return;
  lastProcess = now;

  // Nothing to do
  if (commandQueueHead == commandQueueTail) return;

  // Calculate how many stagger slots have passed since last apply. This
  // allows bulk processing to advance multiple commands sequentially
  // without blocking the loop — each command is still spaced by
  // RELAY_SWITCH_STAGGER_MS logically.
  unsigned long elapsed = now - lastSwitchApply;
  unsigned int availableSlots = (elapsed / RELAY_SWITCH_STAGGER_MS);
  if (availableSlots == 0) return;

  // Bound the number of commands we apply in one invocation to avoid
  // starving other loop tasks. Tweak MAX_BULK_PER_CALL as needed.
  const int MAX_BULK_PER_CALL = 6;
  int toProcess = min((int)availableSlots, MAX_BULK_PER_CALL);

  int processed = 0;
  while (commandQueueHead != commandQueueTail && processed < toProcess) {
    Command cmd = commandQueue[commandQueueHead];

    // If a later command for the same gpio exists in the queue, skip this
    // earlier one and let the later command decide the final state. This
    // collapses flip-flop sequences like ON->OFF->ON to only the final intent.
    int scan = (commandQueueHead + 1) % MAX_COMMAND_QUEUE;
    bool laterFound = false;
    while (scan != commandQueueTail) {
      if (commandQueue[scan].gpio == cmd.gpio) {
        laterFound = true;
        break;
      }
      scan = (scan + 1) % MAX_COMMAND_QUEUE;
    }
    if (laterFound) {
      // drop this earlier command
      commandQueueHead = (commandQueueHead + 1) % MAX_COMMAND_QUEUE;
      continue;
    }

    // Find switch index for this gpio
    int si = -1;
    for (int i = 0; i < NUM_SWITCHES; i++) {
      if (switchesLocal[i].relayGpio == cmd.gpio) { si = i; break; }
    }
    if (si == -1) {
      // Unknown gpio; drop command
      Serial.printf("[CMD] Unknown GPIO %d - dropping\n", cmd.gpio);
      commandQueueHead = (commandQueueHead + 1) % MAX_COMMAND_QUEUE;
      continue;
    }

    // Enforce per-switch cooldown to avoid rapid re-toggling
    unsigned long nowApply = millis();
    if (nowApply - lastToggleAt[si] < RELAY_MIN_TOGGLE_MS) {
      // Try to postpone by re-adding to tail (if space). If queue is full,
      // drop this command. Stop bulk processing this tick to let time advance.
      int nextTail = (commandQueueTail + 1) % MAX_COMMAND_QUEUE;
      if (nextTail != commandQueueHead) {
        commandQueue[commandQueueTail] = cmd;
        commandQueueTail = nextTail;
        Serial.printf("[CMD] Postponed (cooldown) GPIO %d -> %s\n", cmd.gpio, cmd.state ? "ON" : "OFF");
      } else {
        Serial.printf("[CMD] Drop (cooldown & queue full) GPIO %d -> %s\n", cmd.gpio, cmd.state ? "ON" : "OFF");
      }
      // remove current head and pause bulk processing
      commandQueueHead = (commandQueueHead + 1) % MAX_COMMAND_QUEUE;
      break;
    }

    // Apply the command (but avoid unnecessary writes)
    bool cur = switchesLocal[si].state;
    if (cur == cmd.state) {
      Serial.printf("[CMD] No-op: GPIO %d already %s\n", cmd.gpio, cmd.state ? "ON" : "OFF");
    } else {
      switchesLocal[si].state = cmd.state;
      switchesLocal[si].manualOverride = false;
      digitalWrite(switchesLocal[si].relayGpio, cmd.state ? (RELAY_ACTIVE_HIGH ? HIGH : LOW) : (RELAY_ACTIVE_HIGH ? LOW : HIGH));
      switchesLocal[si].gpio = switchesLocal[si].relayGpio;
      saveSwitchConfigToNVS();
      Serial.printf("[CMD] Applied: GPIO %d -> %s\n", cmd.gpio, cmd.state ? "ON" : "OFF");
      // record physical toggle time to enforce cooldown
      lastToggleAt[si] = nowApply;
      // publish event so backend can mark active logs with source
      DynamicJsonDocument ev(192);
      ev["mac"] = WiFi.macAddress();
      ev["secret"] = DEVICE_SECRET;
      ev["type"] = "switch_event";
      ev["gpio"] = cmd.gpio;
      ev["state"] = cmd.state;
      ev["source"] = cmdSourceName(cmd.source);
      ev["timestamp"] = millis();
      char evbuf[192];
      size_t evn = serializeJson(ev, evbuf);
      if (evn > 0 && mqttClient.connected()) {
        mqttClient.publish(TELEMETRY_TOPIC, STATUS_QOS, false, evbuf, evn);
        Serial.printf("[TELEM] Published switch_event gpio=%d source=%s\n", cmd.gpio, cmdSourceName(cmd.source));
      }
    }

    // advance the queue and account for the slot we consumed
    commandQueueHead = (commandQueueHead + 1) % MAX_COMMAND_QUEUE;
    processed++;
    // Move the lastSwitchApply forward to the next slot so subsequent loops
    // maintain consistent spacing even if we processed multiple now.
    lastSwitchApply += RELAY_SWITCH_STAGGER_MS;
  }
}

// ========================================
// MANUAL SWITCH HANDLING
// ========================================
void handleManualSwitches() {
  unsigned long now = millis();
  
  // Ignore manual switch handling until grace period after boot has passed
  // to avoid spurious triggers from power-on noise or unstable GPIOs
  if (now - bootTime < 3000) return;  // 3 second grace period
  
  for (int i = 0; i < NUM_SWITCHES; i++) {
    SwitchState &sw = switchesLocal[i];
    if (!sw.manualEnabled || sw.manualGpio < 0 || sw.manualGpio > 39) continue;

    // Setup pinMode first time. Use configured pull mode (some boards/wires
    // require INPUT_PULLDOWN instead of INPUT_PULLUP). Also print initial
    // state when DEBUG_MANUAL is enabled to help diagnose wiring/mode issues.
    if (!pinSetup[i]) {
      pinMode(sw.manualGpio, MANUAL_USE_INPUT_PULLDOWN ? INPUT_PULLDOWN : INPUT_PULLUP);
      pinMode(sw.relayGpio, OUTPUT);
      digitalWrite(sw.relayGpio, 
        sw.state ? (RELAY_ACTIVE_HIGH ? HIGH : LOW) : (RELAY_ACTIVE_HIGH ? LOW : HIGH));

      int initialLevel = digitalRead(sw.manualGpio);
      sw.lastManualLevel = initialLevel;
      sw.stableManualLevel = initialLevel;
      sw.lastManualActive = sw.manualActiveLow ? (initialLevel == LOW) : (initialLevel == HIGH);
      sw.lastManualChangeMs = now;
      pinSetup[i] = true;

#if DEBUG_MANUAL
      Serial.printf("[MANUAL-DBG] Switch %d manualPin=%d initialLevel=%d active=%s pulldown=%s\n",
        i, sw.manualGpio, initialLevel, sw.lastManualActive ? "YES" : "NO",
        MANUAL_USE_INPUT_PULLDOWN ? "true" : "false");
#endif
    }

    int rawLevel = digitalRead(sw.manualGpio);
    bool active = sw.manualActiveLow ? (rawLevel == LOW) : (rawLevel == HIGH);

    // Enhanced debouncing with hysteresis - increased debounce time for noisy environments
    if (rawLevel != sw.lastManualLevel) {
      sw.lastManualChangeMs = now;
      sw.lastManualLevel = rawLevel;
      debounceCounter[i] = 1;
    } else {
      if (debounceCounter[i] < 255) debounceCounter[i]++;
    }

    // Require longer debounce time for activation (prevent false triggers)
    // Increased from 2x to 3x for better noise immunity
    int requiredDebounce = active ? MANUAL_DEBOUNCE_MS * 3 : MANUAL_DEBOUNCE_MS;
    
    if ((now - sw.lastManualChangeMs) > requiredDebounce) {
      if (rawLevel != sw.stableManualLevel) {
        sw.stableManualLevel = rawLevel;
        bool currentActive = sw.manualActiveLow ? (rawLevel == LOW) : (rawLevel == HIGH);
        
        // Only process if this is a legitimate state change
        if (currentActive != sw.lastManualActive) {
          Serial.printf("[MANUAL] Switch %d: raw=%d stable=%d active=%s (debounce: %dms)\n", 
            i, rawLevel, sw.stableManualLevel, currentActive ? "YES" : "NO", requiredDebounce);
          
          if (sw.manualMomentary) {
            // Momentary: only toggle on rising edge (press)
            if (currentActive && !sw.lastManualActive) {
              // Additional check: ensure minimum time between presses (increased from 200ms to 500ms)
              if (now - lastPressTime[i] > 500) {  // 500ms minimum between presses
                sw.state = !sw.state;
                sw.manualOverride = true;
                digitalWrite(sw.relayGpio, 
                  sw.state ? (RELAY_ACTIVE_HIGH ? HIGH : LOW) : (RELAY_ACTIVE_HIGH ? LOW : HIGH));
                // record manual physical toggle time to enforce cooldown
                lastToggleAt[i] = millis();
                lastPressTime[i] = now;
                saveSwitchConfigToNVS();
                Serial.printf("[MANUAL] Momentary press accepted for switch %d\n", i);
                publishManualSwitchEvent(sw.relayGpio, sw.state, sw.manualGpio);
                sendStateUpdate(true);
              } else {
                Serial.printf("[MANUAL] Ignored rapid press on switch %d (within 500ms)\n", i);
              }
            }
          } else {
            // Maintained: follow switch state with hysteresis
            if (sw.state != currentActive) {
              sw.state = currentActive;
              sw.manualOverride = true;
              digitalWrite(sw.relayGpio, 
                sw.state ? (RELAY_ACTIVE_HIGH ? HIGH : LOW) : (RELAY_ACTIVE_HIGH ? LOW : HIGH));
              // record manual physical toggle time to enforce cooldown
              lastToggleAt[i] = millis();
              saveSwitchConfigToNVS();
              Serial.printf("[MANUAL] Maintained state change accepted for switch %d\n", i);
              publishManualSwitchEvent(sw.relayGpio, sw.state, sw.manualGpio);
              sendStateUpdate(true);
            }
          }
          sw.lastManualActive = currentActive;
        }
      }
    }
  }
}

// ========================================
// MOTION SENSOR FUNCTIONS
// ========================================
// Non-blocking sampler: called frequently from loop(), updates
// primaryStableState / secondaryStableState based on consecutive samples.
void sampleMotionSensorsNonBlocking() {
  if (!motionConfig.enabled) return;
  // If schedule gating is active and we are outside the allowed window, clear
  // any accumulated debounced HIGH state so a stale level doesn't immediately
  // fire when the window opens again.
  if (motionConfig.scheduleEnabled && !isMotionDetectionAllowed()) {
    // Log only once when we first get gated
    static bool wasGated = false;
    if (!wasGated) {
      Serial.println("[MOTION] Schedule gating active - motion sampling BLOCKED");
      wasGated = true;
    }
    primaryStableState = false;
    secondaryStableState = false;
    primaryConsecutive = 0;
    secondaryConsecutive = 0;
    lastPrimaryRaw = false;
    lastSecondaryRaw = false;
    return; // Skip sampling while gated off
  } else {
    static bool wasGated = false;
    if (wasGated) {
      Serial.println("[MOTION] Schedule gating lifted - motion sampling ACTIVE");
      wasGated = false;
    }
  }
  unsigned long now = millis();
  if (now - lastMotionSampleAt < MOTION_SAMPLE_INTERVAL_MS) return;
  lastMotionSampleAt = now;

  // Primary sensor with improved debouncing
  bool rawPrimary = digitalRead(motionConfig.primaryGpio) == HIGH;
  if (rawPrimary != lastPrimaryRaw) {
    lastPrimaryRaw = rawPrimary;
    primaryConsecutive = 1;
    primaryLastChangeTime = now;  // Track change time
  } else {
    if (primaryConsecutive < 255) primaryConsecutive++;
    // Require longer consistency for HIGH state (motion detected)
    int requiredConsistent = primaryStableState ? MOTION_REQUIRED_CONSISTENT : MOTION_REQUIRED_CONSISTENT * 2;
    if (primaryConsecutive >= requiredConsistent && primaryStableState != rawPrimary) {
      // Additional validation: ensure it's not just a brief spike
      if (rawPrimary && (now - primaryLastChangeTime) > 100) {  // Minimum 100ms for HIGH
        primaryStableState = rawPrimary;
        Serial.printf("[MOTION] Primary stable -> %s (consecutive: %d)\n", 
          primaryStableState ? "HIGH" : "LOW", primaryConsecutive);
      } else if (!rawPrimary) {
        primaryStableState = rawPrimary;
        Serial.printf("[MOTION] Primary stable -> %s (consecutive: %d)\n", 
          primaryStableState ? "HIGH" : "LOW", primaryConsecutive);
      }
    }
  }

  // Secondary (if enabled) with similar improvements
  if (motionConfig.dualMode) {
    bool rawSecondary = digitalRead(motionConfig.secondaryGpio) == HIGH;
    if (rawSecondary != lastSecondaryRaw) {
      lastSecondaryRaw = rawSecondary;
      secondaryConsecutive = 1;
      secondaryLastChangeTime = now;
    } else {
      if (secondaryConsecutive < 255) secondaryConsecutive++;
      int requiredConsistent = secondaryStableState ? MOTION_REQUIRED_CONSISTENT : MOTION_REQUIRED_CONSISTENT * 2;
      if (secondaryConsecutive >= requiredConsistent && secondaryStableState != rawSecondary) {
        if (rawSecondary && (now - secondaryLastChangeTime) > 100) {
          secondaryStableState = rawSecondary;
          Serial.printf("[MOTION] Secondary stable -> %s (consecutive: %d)\n", 
            secondaryStableState ? "HIGH" : "LOW", secondaryConsecutive);
        } else if (!rawSecondary) {
          secondaryStableState = rawSecondary;
          Serial.printf("[MOTION] Secondary stable -> %s (consecutive: %d)\n", 
            secondaryStableState ? "HIGH" : "LOW", secondaryConsecutive);
        }
      }
    }
  }
}

void initMotionSensor() {
  if (!motionConfig.enabled) {
    Serial.println("[MOTION] Disabled");
    return;
  }
  // Configure pinMode based on config macro (allow choosing INPUT or INPUT_PULLDOWN)
  pinMode(motionConfig.primaryGpio, MOTION_USE_INPUT_PULLDOWN ? INPUT_PULLDOWN : INPUT);
  Serial.printf("[MOTION] Primary sensor (PIR) on GPIO %d (%s)\n", motionConfig.primaryGpio,
    MOTION_USE_INPUT_PULLDOWN ? "INPUT_PULLDOWN" : "INPUT");

  if (motionConfig.dualMode) {
    pinMode(motionConfig.secondaryGpio, MOTION_USE_INPUT_PULLDOWN ? INPUT_PULLDOWN : INPUT);
    Serial.printf("[MOTION] Secondary sensor (Microwave) on GPIO %d (%s)\n", motionConfig.secondaryGpio,
      MOTION_USE_INPUT_PULLDOWN ? "INPUT_PULLDOWN" : "INPUT");
  }
  
  Serial.printf("[MOTION] Config: type=%s, autoOff=%ds, logic=%s\n",
    motionConfig.type.c_str(), motionConfig.autoOffDelay, motionConfig.detectionLogic.c_str());
  Serial.printf("[MOTION] Schedule: %s, time=%s-%s, timezone=%s\n",
    motionConfig.scheduleEnabled ? "ENABLED" : "DISABLED",
    motionConfig.activeStartTime.c_str(), motionConfig.activeEndTime.c_str(),
    motionConfig.timezone.c_str());
  // Initialize time sync if schedule is used
  if (motionConfig.scheduleEnabled && WiFi.status() == WL_CONNECTED) {
    // Configure NTP with GMT offset for India (UTC+5:30 = 19800 seconds)
    configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("[NTP] NTP init requested (GMT+5:30 / IST)");
  }
}

bool readMotionSensor() {
  if (!motionConfig.enabled) return false;
  if (!isMotionDetectionAllowed()) {
    return false;
  }
  // Return the debounced stable states sampled by sampleMotionSensorsNonBlocking()
  bool primaryActive = primaryStableState;

  if (motionConfig.dualMode) {
    bool secondaryActive = secondaryStableState;

    if (motionConfig.detectionLogic == "and") {
      return primaryActive && secondaryActive;
    } else if (motionConfig.detectionLogic == "or") {
      return primaryActive || secondaryActive;
    } else if (motionConfig.detectionLogic == "weighted") {
      int confidence = 0;
      if (primaryActive) confidence += 60;
      if (secondaryActive) confidence += 40;
      return confidence >= 70;
    }
  }

  return primaryActive;
}

void publishMotionEvent(bool detected) {
  if (!motionConfig.enabled || ESP.getFreeHeap() < 1000) return;
  
  DynamicJsonDocument doc(512);
  doc["mac"] = WiFi.macAddress();
  doc["secret"] = DEVICE_SECRET;
  doc["type"] = "motion";
  doc["detected"] = detected;
  doc["sensorType"] = motionConfig.type;
  doc["timestamp"] = millis();
  bool detectionAllowed = isMotionDetectionAllowed();
  doc["detectionAllowed"] = detectionAllowed;
  doc["scheduleEnabled"] = motionConfig.scheduleEnabled;
  if (motionConfig.scheduleEnabled) {
    doc["timezone"] = motionConfig.timezone;
    char window[16];
    snprintf(window, sizeof(window), "%s-%s", motionConfig.activeStartTime.c_str(), motionConfig.activeEndTime.c_str());
    doc["activeWindow"] = window;
    uint8_t dayMask = 0; for (int d=0; d<7; d++) if (motionConfig.activeDays[d]) dayMask |= (1<<d);
    doc["activeDaysMask"] = dayMask; // bit0=Sun .. bit6=Sat
    struct tm ti; if (getLocalTime(&ti)) {
      char tbuf[24];
      strftime(tbuf, sizeof(tbuf), "%Y-%m-%d %H:%M", &ti);
      doc["localTime"] = tbuf;
      doc["wday"] = ti.tm_wday;
    }
  }
  
  if (motionConfig.dualMode) {
    doc["pirState"] = digitalRead(motionConfig.primaryGpio) == HIGH;
    doc["microwaveState"] = digitalRead(motionConfig.secondaryGpio) == HIGH;
    doc["logic"] = motionConfig.detectionLogic;
  }
  
  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n > 0 && mqttClient.connected()) {
    // Async publish with QoS and payload length
    mqttClient.publish(TELEMETRY_TOPIC, STATUS_QOS, false, buf, n);
    Serial.printf("[MOTION] Event published: %s\n", detected ? "DETECTED" : "STOPPED");
  }
}

void handleMotionSensor() {
  // Ignore motion handling entirely until grace period after boot has passed
  if (millis() - bootTime < MOTION_BOOT_GRACE_MS) return;
  if (!motionConfig.enabled) return;
  // Time-based gating: if not allowed, ensure motion-triggered switches are OFF
  bool detectionAllowed = isMotionDetectionAllowed();
  if (!detectionAllowed) {
    if (motionDetected) {
      motionDetected = false;
      autoOffActive = false;
      for (int i = 0; i < NUM_SWITCHES; i++) {
        if (affectedSwitches[i] == 1 && switchesLocal[i].state && !switchesLocal[i].manualOverride) {
          queueSwitchCommand(switchesLocal[i].relayGpio, false, CMD_SRC_MOTION);
          affectedSwitches[i] = -1;
        }
      }
      sendStateUpdate(true);
    }
    // Clear debounced states so stale HIGH does not trigger immediately later
    primaryStableState = false;
    secondaryStableState = false;
    primaryConsecutive = 0;
    secondaryConsecutive = 0;
    lastPrimaryRaw = false;
    lastSecondaryRaw = false;
    return;
  }
  
  unsigned long now = millis();
  bool currentMotion = readMotionSensor();
  
  // Additional validation: require motion to be stable for a minimum time
  static unsigned long motionStableStart = 0;
  static bool lastValidatedMotion = false;
  
  if (currentMotion != lastValidatedMotion) {
    if (currentMotion) {
      motionStableStart = now;
    }
    lastValidatedMotion = currentMotion;
  }
  
  // Only consider motion valid if it's been stable for at least 500ms
  bool validatedMotion = currentMotion && ((now - motionStableStart) > 500);
  
  // Use validated motion instead of raw currentMotion
  
  // Motion started
  if (validatedMotion && !motionDetected) {
    motionDetected = true;
    motionStartTime = now;
    lastMotionTime = now;
    autoOffActive = false;
    
    Serial.println("[MOTION] 🔴 DETECTED - Turning ON switches");
    
    // Turn ON switches with usePir enabled
    for (int i = 0; i < NUM_SWITCHES; i++) {
      if (!switchesLocal[i].usePir || switchesLocal[i].manualOverride) continue;
      // Queue the switch command rather than toggling immediately. This
      // avoids toggling many relays at once and lets processCommandQueue
      // stagger the actual physical actuations.
      if (!switchesLocal[i].state) {
        queueSwitchCommand(switchesLocal[i].relayGpio, true, CMD_SRC_MOTION);
        affectedSwitches[i] = 1; // mark affected immediately for auto-off logic
        Serial.printf("[MOTION] Queued ON for Switch %d (GPIO %d)\n", i, switchesLocal[i].relayGpio);
      }
    }
    
    publishMotionEvent(true);
    sendStateUpdate(true);
  }
  
  // Motion continues
  if (validatedMotion && motionDetected) {
    lastMotionTime = now;
  }
  
  // Motion stopped - start auto-off
  if (!currentMotion && motionDetected && !autoOffActive) {
    unsigned long timeSinceLastMotion = (now - lastMotionTime) / 1000;
    
    if (timeSinceLastMotion >= motionConfig.autoOffDelay) {
      autoOffActive = true;
      motionDetected = false;
      
      Serial.printf("[MOTION] ⚫ No motion for %ds - Turning OFF switches\n", motionConfig.autoOffDelay);
      
      // Turn OFF switches (except dontAutoOff ones)
      for (int i = 0; i < NUM_SWITCHES; i++) {
        if (switchesLocal[i].dontAutoOff || switchesLocal[i].manualOverride) continue;
        // Queue OFF commands so switching is staggered and non-disruptive
        if (affectedSwitches[i] == 1 && switchesLocal[i].state) {
          queueSwitchCommand(switchesLocal[i].relayGpio, false, CMD_SRC_MOTION);
          affectedSwitches[i] = -1;
          Serial.printf("[MOTION] Queued OFF for Switch %d (GPIO %d)\n", i, switchesLocal[i].relayGpio);
        }
      }
      
      publishMotionEvent(false);
      sendStateUpdate(true);
    }
  }
}

// ========================================
// MQTT FUNCTIONS
// ========================================
void publishState() {
  if (ESP.getFreeHeap() < 2000) return;
  
  DynamicJsonDocument doc(512);
  doc["mac"] = WiFi.macAddress();
  doc["secret"] = DEVICE_SECRET;
  JsonArray arr = doc.createNestedArray("switches");
  
  for (int i = 0; i < NUM_SWITCHES; i++) {
    JsonObject o = arr.createNestedObject();
    o["gpio"] = switchesLocal[i].relayGpio;
    o["state"] = switchesLocal[i].state;
    o["manual_override"] = switchesLocal[i].manualOverride;
  }
  
  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  // Ensure serialization did not truncate and MQTT connection is available
  if (n > 0 && n < sizeof(buf) && mqttClient.connected()) {
    mqttClient.publish(STATE_TOPIC, STATUS_QOS, false, buf, n);
  }
}

// Note: older PubSubClient-style mqttCallback removed. AsyncMqttClient
// handling is implemented in onMqttMessage() below.

void publishManualSwitchEvent(int gpio, bool state, int physicalPin) {
  if (ESP.getFreeHeap() < 1000) return;
  
  DynamicJsonDocument doc(128);
  doc["mac"] = WiFi.macAddress();
  doc["secret"] = DEVICE_SECRET;
  doc["type"] = "manual_switch";
  doc["gpio"] = gpio;
  doc["state"] = state;
  if (physicalPin >= 0) doc["physicalPin"] = physicalPin;
  doc["timestamp"] = millis();
  
  char buf[128];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n > 0 && mqttClient.connected()) {
    mqttClient.publish(TELEMETRY_TOPIC, STATUS_QOS, false, buf, n);
  }
}

void sendStateUpdate(bool force) {
  static unsigned long lastStateSent = 0;
  static uint32_t lastStateHash = 0;
  unsigned long now = millis();
  
  uint32_t stateHash = 0;
  for (int i = 0; i < NUM_SWITCHES; i++) {
    stateHash ^= (switchesLocal[i].state ? (1 << i) : 0);
    stateHash ^= (switchesLocal[i].manualOverride ? (1 << (i+8)) : 0);
  }
  
  bool changed = (stateHash != lastStateHash);
  if (force || changed || (now - lastStateSent > 5000)) {
    publishState();
    lastStateSent = now;
    lastStateHash = stateHash;
    pendingState = false;
  } else {
    pendingState = true;
  }
}

void sendHeartbeat() {
  static unsigned long lastHeartbeat = 0;
  unsigned long now = millis();
  if (now - lastHeartbeat < 30000) return;
  lastHeartbeat = now;
  
  DynamicJsonDocument doc(256);
  doc["mac"] = WiFi.macAddress();
  doc["status"] = "heartbeat";
  doc["heap"] = ESP.getFreeHeap();
  doc["uptime"] = millis();
  bool detectionAllowed = isMotionDetectionAllowed();
  doc["detectionAllowed"] = detectionAllowed;
  doc["scheduleEnabled"] = motionConfig.scheduleEnabled;
  if (motionConfig.scheduleEnabled) {
    doc["timezone"] = motionConfig.timezone;
    char window[16];
    snprintf(window, sizeof(window), "%s-%s", motionConfig.activeStartTime.c_str(), motionConfig.activeEndTime.c_str());
    doc["activeWindow"] = window;
    uint8_t dayMask = 0; for (int d=0; d<7; d++) if (motionConfig.activeDays[d]) dayMask |= (1<<d);
    doc["activeDaysMask"] = dayMask;
    struct tm ti; if (getLocalTime(&ti)) {
      char tbuf[24];
      strftime(tbuf, sizeof(tbuf), "%Y-%m-%d %H:%M", &ti);
      doc["localTime"] = tbuf;
      doc["wday"] = ti.tm_wday;
    }
  }
  
  char buf[256];
  size_t n = serializeJson(doc, buf);
  if (mqttClient.connected()) {
    // Async publish: returns a message id (non-zero if queued)
    uint16_t msgId = mqttClient.publish(TELEMETRY_TOPIC, STATUS_QOS, false, buf, n);
    if (msgId) {
      // Wait for PUBACK to consider heartbeat successful; store msgId for onMqttPublish()
      lastHeartbeatMsgId = msgId;
      Serial.printf("[HEART] Heartbeat queued (msgId=%u)\n", msgId);
    } else {
      Serial.println("[HEART] Failed to queue heartbeat");
    }
  }

  // If we haven't successfully published a heartbeat for over OFFLINE_TIMEOUT_MS, mark offline locally
  if (millis() - lastSuccessfulHeartbeatPublish > OFFLINE_TIMEOUT_MS) {
    if (!reportedOffline) {
      reportedOffline = true;
      Serial.printf("[STATUS] No heartbeat published for >%ds - marking OFFLINE locally\n", OFFLINE_TIMEOUT_MS/1000);
      // Attempt to publish offline retained status (best-effort)
      if (mqttClient.connected()) mqttClient.publish(STATUS_TOPIC, STATUS_QOS, true, STATUS_OFFLINE);
    }
  }
}



void reconnect_mqtt() {
  static unsigned long lastAttempt = 0;
  static unsigned long connectStartTime = 0;
  static bool connecting = false;
  
  unsigned long now = millis();
  
  // Don't attempt reconnection too frequently
  if (!connecting && (now - lastAttempt < 5000)) return;
  
  // Start new connection attempt
  if (!connecting) {
    lastAttempt = now;
    connecting = true;
    connectStartTime = now;
    Serial.println("[MQTT] Attempting async connect...");

    // Configure credentials and Last Will before connecting
    // Ensure a stable client id (built in setup_wifi)
    mqttClient.setClientId(mqttClientId);
    mqttClient.setCredentials(MQTT_USER, MQTT_PASSWORD);
    mqttClient.setWill(STATUS_TOPIC, STATUS_QOS, true, STATUS_OFFLINE);
    mqttClient.connect();
  }

  // Timeout after 3 seconds to prevent stuck connecting state
  if (connecting && (now - connectStartTime > 3000)) {
    connecting = false;
    Serial.println("[MQTT] Connection attempt timed out");
    connState = WIFI_ONLY;
    return;
  }
}

// ========================
// Async MQTT callbacks
// ========================
void onMqttConnect(bool sessionPresent) {
  Serial.println("[MQTT] Async connected");
  // Publish retained 'online' status so server/broker know device is up
  mqttClient.publish(STATUS_TOPIC, STATUS_QOS, true, STATUS_ONLINE);
  lastSuccessfulHeartbeatPublish = millis();
  reportedOffline = false;

  // Subscribe to topics with desired QoS
  mqttClient.subscribe(SWITCH_TOPIC, STATUS_QOS);
  mqttClient.subscribe(CONFIG_TOPIC, STATUS_QOS);

  sendStateUpdate(true);
  connState = BACKEND_CONNECTED;
}

void onMqttDisconnect(AsyncMqttClientDisconnectReason reason) {
  Serial.printf("[MQTT] Async disconnected (%d)\n", (int)reason);
  connState = WIFI_ONLY;
}

void onMqttPublish(uint16_t packetId) {
  // Handle PUBACKs for QoS1 publishes. If this ACK corresponds to a
  // heartbeat message we queued earlier, mark the heartbeat as successful.
  if (packetId == lastHeartbeatMsgId && packetId != 0) {
    lastSuccessfulHeartbeatPublish = millis();
    lastHeartbeatMsgId = 0;
    if (reportedOffline) {
      // Republish retained ONLINE now that we have confirmation
      mqttClient.publish(STATUS_TOPIC, STATUS_QOS, true, STATUS_ONLINE);
      reportedOffline = false;
      Serial.println("[STATUS] Recovered - published ONLINE (ack)");
    } else {
      Serial.printf("[MQTT] Heartbeat ack: %u\n", packetId);
    }
  } else {
    Serial.printf("[MQTT] Publish ack: %u\n", packetId);
  }
}

void onMqttMessage(char* topic, char* payload, AsyncMqttClientMessageProperties properties, size_t len, size_t index, size_t total) {
  // Reconstruct payload into a String (payload is not null-terminated)
  String message;
  message.reserve(len + 1);
  for (size_t i = 0; i < len; i++) message += payload[i];

  Serial.printf("[MQTT] %s: %s\n", topic, message.c_str());

  // Handle SWITCH_TOPIC
  if (String(topic) == SWITCH_TOPIC) {
    DynamicJsonDocument doc(256);
    if (deserializeJson(doc, message) == DeserializationError::Ok) {
      String targetMac = doc["mac"];
      String targetSecret = doc["secret"];
      String myMac = WiFi.macAddress();

      bool macMatches = normalizeMac(targetMac).equalsIgnoreCase(normalizeMac(myMac));
      bool secretMatches = (targetSecret == String(DEVICE_SECRET));
      if (macMatches && secretMatches) {
        // Accept multiple possible field names for GPIO and state for compatibility
        int gpio = -1;
        if (doc.containsKey("gpio")) {
          gpio = (int)doc["gpio"];
        } else if (doc.containsKey("relayGpio")) {
          gpio = (int)doc["relayGpio"];
        } else if (doc.containsKey("index")) {
          int idx = (int)doc["index"];
          if (idx >= 0 && idx < NUM_SWITCHES) gpio = switchesLocal[idx].relayGpio;
        }

        bool state = false;
        if (doc.containsKey("state")) state = (bool)doc["state"];
        else if (doc.containsKey("value")) state = (bool)doc["value"];

        if (gpio >= 0) {
          Serial.printf("[MQTT] SWITCH accepted -> gpio=%d state=%d\n", gpio, state ? 1 : 0);
          queueSwitchCommand(gpio, state, CMD_SRC_BACKEND);
          processCommandQueue();
        } else {
          Serial.println("[MQTT] SWITCH accepted but no gpio/index/relayGpio found in payload");
        }
      } else {
        // Helpful debug output when a SWITCH command is ignored so user can trace
        // backend vs. device secret/MAC mismatches without revealing secrets.
        Serial.printf("[MQTT] SWITCH msg ignored - macMatch=%s secretMatch=%s targetMac=%s myMac=%s\n",
          macMatches ? "YES" : "NO",
          secretMatches ? "YES" : "NO",
          targetMac.c_str(), myMac.c_str());
        // If mac matches but secret doesn't, hint to check DEVICE_SECRET in secrets.h
        if (macMatches && !secretMatches) {
          Serial.println("[MQTT] Secret mismatch for this device - ensure DEVICE_SECRET in esp32/secrets.h matches the device secret in backend DB");
        }
      }
    }
  }

  // Handle CONFIG_TOPIC
  if (String(topic) == CONFIG_TOPIC) {
    DynamicJsonDocument doc(512);
    if (deserializeJson(doc, message) == DeserializationError::Ok) {
      String targetMac = doc["mac"];
      String targetSecret = doc["secret"];
      String myMac = WiFi.macAddress();

      if (normalizeMac(targetMac).equalsIgnoreCase(normalizeMac(myMac)) && targetSecret == String(DEVICE_SECRET)) {
        // Update switch config
        if (doc.containsKey("switches")) {
          JsonArray sws = doc["switches"];
          int n = sws.size();
          if (n > 0 && n <= NUM_SWITCHES) {
                for (int i = 0; i < n; i++) {
                  JsonObject sw = sws[i];
                  if (sw.containsKey("gpio")) {
                    relayPins[i] = (int)sw["gpio"];
                  }
                  if (sw.containsKey("manualGpio")) {
                    manualSwitchPins[i] = (int)sw["manualGpio"];
                  }
                  // Support per-switch PIR assignment and dontAutoOff
                  if (sw.containsKey("usePir")) {
                    switchesLocal[i].usePir = (bool)sw["usePir"];
                  }
                  if (sw.containsKey("dontAutoOff")) {
                    switchesLocal[i].dontAutoOff = (bool)sw["dontAutoOff"];
                  }
                  if (sw.containsKey("manualMode")) {
                    const char* mode_c = sw["manualMode"] | "";
                    String mode = String(mode_c);
                    switchesLocal[i].manualMomentary = (mode == "momentary");
                  }
                }

            // Persist to NVS
            prefs.begin("switch_cfg", false);
            for (int i = 0; i < n; i++) {
              prefs.putInt(("relay" + String(i)).c_str(), relayPins[i]);
              prefs.putInt(("manual" + String(i)).c_str(), manualSwitchPins[i]);
              prefs.putBool(("momentary" + String(i)).c_str(), switchesLocal[i].manualMomentary);
              prefs.putBool(("usePir" + String(i)).c_str(), switchesLocal[i].usePir);
              prefs.putBool(("dontAutoOff" + String(i)).c_str(), switchesLocal[i].dontAutoOff);
            }
            prefs.end();

            initSwitches();
            Serial.println("[CONFIG] Switch config updated from server");
          }
        }

        // Motion sensor config (optional nested object)
        if (doc.containsKey("motionSensor")) {
          JsonObject ms = doc["motionSensor"];
          bool wasEnabled = motionConfig.enabled;
          if (ms.containsKey("enabled")) motionConfig.enabled = (bool)ms["enabled"];
          if (ms.containsKey("type")) motionConfig.type = String((const char*)ms["type"]);
          if (ms.containsKey("autoOffDelay")) motionConfig.autoOffDelay = (int)ms["autoOffDelay"];
          motionConfig.dualMode = (String(motionConfig.type) == "both");
          if (ms.containsKey("detectionLogic")) motionConfig.detectionLogic = String((const char*)ms["detectionLogic"]);
          // Schedule options
          if (ms.containsKey("scheduleEnabled")) motionConfig.scheduleEnabled = (bool)ms["scheduleEnabled"];
          if (ms.containsKey("activeStartTime")) motionConfig.activeStartTime = String((const char*)ms["activeStartTime"]);
          if (ms.containsKey("activeEndTime")) motionConfig.activeEndTime = String((const char*)ms["activeEndTime"]);
          if (ms.containsKey("activeDays")) {
            // reset then set
            for (int d=0; d<7; d++) motionConfig.activeDays[d] = 0;
            JsonArray days = ms["activeDays"].as<JsonArray>();
            for (JsonVariant v : days) {
              int dn = v.as<int>();
              if (dn >= 0 && dn <= 6) motionConfig.activeDays[dn] = 1;
            }
          }
          if (ms.containsKey("timezone")) motionConfig.timezone = String((const char*)ms["timezone"]);

          ensureDefaultActiveDays();
          applyTimezone(motionConfig.timezone);

          // Persist to NVS (including schedule fields)
          prefs.begin("motion_cfg", false);
          prefs.putBool("enabled", motionConfig.enabled);
          prefs.putString("type", motionConfig.type);
          prefs.putInt("autoOff", motionConfig.autoOffDelay);
          prefs.putBool("dualMode", motionConfig.dualMode);
          prefs.putString("logic", motionConfig.detectionLogic);
          prefs.putBool("schedEnabled", motionConfig.scheduleEnabled);
          prefs.putString("startTime", motionConfig.activeStartTime);
          prefs.putString("endTime", motionConfig.activeEndTime);
          uint8_t daysByte = 0; for (int d=0; d<7; d++) if (motionConfig.activeDays[d]) daysByte |= (1<<d);
          prefs.putUChar("activeDays", daysByte);
          prefs.putString("timezone", motionConfig.timezone);
          prefs.end();

          if (motionConfig.enabled != wasEnabled || motionConfig.enabled) initMotionSensor();
          Serial.println("[CONFIG] Motion config updated from server");
          Serial.printf("[CONFIG] Schedule: %s, %s-%s\n",
            motionConfig.scheduleEnabled ? "ENABLED" : "DISABLED",
            motionConfig.activeStartTime.c_str(), motionConfig.activeEndTime.c_str());
        }
      }
    }
  }
}

// ========================================
// WIFI FUNCTIONS
// ========================================
void setup_wifi() {
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 50) {
    delay(100);
    handleManualSwitches();
    esp_task_wdt_reset();
    Serial.print(".");
    retries++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("Signal: %d dBm\n", WiFi.RSSI());
    connState = WIFI_ONLY;
    
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    sprintf(mqttClientId, "ESP32_%s", mac.c_str());
    if (motionConfig.scheduleEnabled) {
      // Configure NTP with GMT offset for India (UTC+5:30 = 19800 seconds)
      configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
      Serial.println("[NTP] NTP init requested (GMT+5:30 / IST, WiFi up)");
    }
  } else {
    Serial.println("\nWiFi failed - offline mode");
    connState = WIFI_DISCONNECTED;
  }
}

void updateConnectionStatus() {
  static ConnState lastState = WIFI_DISCONNECTED;
  
  if (WiFi.status() != WL_CONNECTED) {
    connState = WIFI_DISCONNECTED;
  } else if (!mqttClient.connected()) {
    connState = WIFI_ONLY;
  } else {
    connState = BACKEND_CONNECTED;
  }
  
  if (connState != lastState) {
    lastState = connState;
    if (connState == BACKEND_CONNECTED) {
      sendStateUpdate(true);
    }
  }
}

// ========================================
// SYSTEM HEALTH
// ========================================
void checkSystemHealth() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck < 10000) return;
  lastCheck = millis();
  
  size_t freeHeap = ESP.getFreeHeap();
  Serial.printf("[HEALTH] Heap: %u bytes\n", freeHeap);
  
  if (freeHeap < 5000) {
    Serial.printf("[CRITICAL] Low heap: %u bytes!\n", freeHeap);
  }
  
  int activeSwitches = 0;
  for (int i = 0; i < NUM_SWITCHES; i++) {
    if (switchesLocal[i].state) activeSwitches++;
  }
  Serial.printf("[HEALTH] Active switches: %d/%d\n", activeSwitches, NUM_SWITCHES);
  
  // Motion schedule status
  if (motionConfig.enabled) {
    struct tm ti;
    bool timeValid = getLocalTime(&ti);
    char tbuf[24] = "NOT_SYNCED";
    if (timeValid) {
      strftime(tbuf, sizeof(tbuf), "%Y-%m-%d %H:%M:%S", &ti);
    }
    Serial.printf("[HEALTH] Motion: %s, Schedule: %s, Time: %s\n",
      motionConfig.enabled ? "ENABLED" : "DISABLED",
      motionConfig.scheduleEnabled ? "ENABLED" : "DISABLED",
      tbuf);
    if (motionConfig.scheduleEnabled) {
      Serial.printf("[HEALTH] Window: %s-%s, TZ: %s, Allowed: %s\n",
        motionConfig.activeStartTime.c_str(),
        motionConfig.activeEndTime.c_str(),
        motionConfig.timezone.c_str(),
        isMotionDetectionAllowed() ? "YES" : "NO");
    }
  }
  
  // Check for unexpected activations
  logUnexpectedActivations();
}

void logUnexpectedActivations() {
  static unsigned long lastLog = 0;
  if (millis() - lastLog < 10000) return; // Log every 10 seconds
  lastLog = millis();
  
  for (int i = 0; i < NUM_SWITCHES; i++) {
    if (switchesLocal[i].state) {
      // Check if this switch should be on
      bool shouldBeOn = false;
      
      // Check manual override
      if (switchesLocal[i].manualOverride) {
        shouldBeOn = true;
      }
      
      // Check motion (if enabled and switch uses PIR)
      if (motionConfig.enabled && switchesLocal[i].usePir && motionDetected) {
        shouldBeOn = true;
      }
      
      // Check backend commands (recent commands in queue)
      // ... check command queue for recent backend commands
      
      if (!shouldBeOn) {
        Serial.printf("[ALERT] Switch %d (GPIO %d) is ON but no valid reason found!\n", i, switchesLocal[i].relayGpio);
        Serial.printf("  - Manual override: %s\n", switchesLocal[i].manualOverride ? "YES" : "NO");
        Serial.printf("  - Motion detected: %s (switch uses PIR: %s)\n", 
          motionDetected ? "YES" : "NO", switchesLocal[i].usePir ? "YES" : "NO");
        Serial.printf("  - Motion enabled: %s\n", motionConfig.enabled ? "YES" : "NO");
      }
    }
  }
}

// ========================================
// SETUP
// ========================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n========================================");
  Serial.println("WARP ESP32 Classroom Automation");
  Serial.println("Version: Stable 1.0");
  Serial.println("========================================\n");
  
  // Record boot time to ignore sensor noise immediately after boot
  bootTime = millis();

  // Boot recovery check
  int resetReason = esp_reset_reason();
  Serial.printf("[BOOT] Reset reason: %d\n", resetReason);
  if (resetReason == 1 || resetReason == 5 || resetReason == 6) {
    Serial.println("[BOOT] Crash recovery detected");
    delay(1000);
  }
  
  // Initialize watchdog (15 seconds)
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_MS,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  Serial.printf("[WDT] Watchdog initialized: %d seconds\n", WDT_TIMEOUT_MS / 1000);
  
  // Initialize switches
  initSwitches();
  
  // Load motion sensor config
  prefs.begin("motion_cfg", true);
  motionConfig.enabled = prefs.getBool("enabled", false);
  motionConfig.type = prefs.getString("type", "hc-sr501");
  motionConfig.autoOffDelay = prefs.getInt("autoOff", 30);
  motionConfig.dualMode = prefs.getBool("dualMode", false);
  motionConfig.detectionLogic = prefs.getString("logic", "and");
  motionConfig.scheduleEnabled = prefs.getBool("schedEnabled", false);
  motionConfig.activeStartTime = prefs.getString("startTime", "08:30");
  motionConfig.activeEndTime = prefs.getString("endTime", "17:30");
  // Load activeDays bitfield if present
  uint8_t daysByte = prefs.getUChar("activeDays", 0);
  for (int d=0; d<7; d++) motionConfig.activeDays[d] = (daysByte & (1<<d)) ? 1 : 0;
  motionConfig.timezone = prefs.getString("timezone", "UTC");
  prefs.end();

  ensureDefaultActiveDays();
  applyTimezone(motionConfig.timezone);
  
  // Always initialize motion sensor
  initMotionSensor();
  Serial.printf("[SETUP] Motion: %s, GPIO: %d\n", 
    motionConfig.enabled ? "ENABLED" : "DISABLED", 
    motionConfig.primaryGpio);
  
  // Setup WiFi
  setup_wifi();
  
  // Setup MQTT
  // Async MQTT client setup
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  // credentials and will will be set before connect in reconnect_mqtt()/setup
  mqttClient.onConnect(onMqttConnect);
  mqttClient.onDisconnect(onMqttDisconnect);
  mqttClient.onMessage(onMqttMessage);
  mqttClient.onPublish(onMqttPublish);

  // If WiFi already connected, trigger an initial connect attempt
  if (WiFi.status() == WL_CONNECTED) {
    reconnect_mqtt();
  }
  
  Serial.println("\n[SETUP] Complete - Ready\n");
}

// ========================================
// MAIN LOOP
// ========================================
void loop() {
  esp_task_wdt_reset();
  
  // PRIORITY 1: Always handle manual switches first (no network delays)
  handleManualSwitches();
  esp_task_wdt_reset();
  
  // PRIORITY 2: Sample and handle motion sensor (non-blocking sampler)
  sampleMotionSensorsNonBlocking();
  handleMotionSensor();
  esp_task_wdt_reset();
  
  // PRIORITY 3: Network operations (can be slower)
  updateConnectionStatus();
  
  // Periodic state updates
  if (millis() - lastStateSend > 30000) {
    sendStateUpdate(true);
    lastStateSend = millis();
  }
  
  // Network operations only when WiFi is connected
  if (WiFi.status() == WL_CONNECTED) {
    // Try to reconnect MQTT if disconnected (non-blocking with timeout)
    if (!mqttClient.connected()) {
      reconnect_mqtt();
      esp_task_wdt_reset();
      // Continue handling manual switches even if connecting
    }
    
    // Process MQTT messages if connected (Async client handles network in background)
    if (mqttClient.connected()) {
      esp_task_wdt_reset();
      processCommandQueue();
    }
    sendHeartbeat();
  }
  
  blinkStatus();
  if (pendingState) sendStateUpdate(false);
  checkSystemHealth();
  
  // Re-apply relay states periodically
  static unsigned long lastRelayCheck = 0;
  if (millis() - lastRelayCheck > 5000) {
    for (int i = 0; i < NUM_SWITCHES; i++) {
      digitalWrite(switchesLocal[i].relayGpio, 
        switchesLocal[i].state ? (RELAY_ACTIVE_HIGH ? HIGH : LOW) : (RELAY_ACTIVE_HIGH ? LOW : HIGH));
    }
    lastRelayCheck = millis();
  }
  
  esp_task_wdt_reset();
  delay(10);
}