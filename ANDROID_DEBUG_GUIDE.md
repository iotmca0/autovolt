# Android Debug Guide for AutoVolt

## Quick Start - Debug in 3 Steps

### Step 1: Enable USB Debugging
1. On Android: **Settings** → **About Phone** → Tap **Build Number** 7 times
2. **Settings** → **Developer Options** → Enable **USB Debugging**
3. Connect phone to PC via USB

### Step 2: Open Chrome Inspect
1. Open Chrome on PC
2. Go to: `chrome://inspect/#devices`
3. Your phone should appear

### Step 3: Launch App & Inspect
1. Open AutoVolt app on phone
2. In Chrome, click **"Inspect"** next to your app
3. DevTools opens - see console, network, etc.

---

## Using the Debug Script

### Quick Usage:
```powershell
# Run the helper script
.\debug-android.ps1
```

The script will:
- ✅ Check if device is connected
- ✅ Show device info
- ✅ Verify app installation
- ✅ Provide debugging options

---

## Manual Commands

### Check Device Connection
```powershell
adb devices
```

### View Logs
```powershell
# All logs
adb logcat

# Filter for AutoVolt
adb logcat | Select-String "AutoVolt|Console|Capacitor"

# Clear logs first, then view
adb logcat -c
adb logcat
```

### App Management
```powershell
# Install APK
adb install -r path\to\app-debug.apk

# Uninstall app
adb uninstall com.autovolt.app

# Clear app data
adb shell pm clear com.autovolt.app

# Launch app
adb shell am start -n com.autovolt.app/.MainActivity
```

### Debugging Commands
```powershell
# Take screenshot
adb exec-out screencap -p > screenshot.png

# Pull file from device
adb pull /sdcard/file.txt

# Push file to device
adb push file.txt /sdcard/

# View device info
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
```

---

## Capacitor Live Reload

### Best for Development:
```powershell
# Run with live reload (changes update automatically)
npx cap run android -l --external

# Sync changes to Android
npx cap sync android

# Open Android Studio
npx cap open android
```

---

## Troubleshooting

### Device Not Showing Up?
1. Check USB cable (try different cable/port)
2. Enable USB debugging on phone
3. Change USB mode to "File Transfer" (not just charging)
4. Restart ADB: `adb kill-server` then `adb start-server`
5. Accept "Allow USB debugging" prompt on phone

### Can't See App in chrome://inspect?
1. Make sure app is running on device
2. Check if WebView is enabled in app
3. Try closing and reopening Chrome
4. In Chrome, click "Port forwarding" and enable it

### Console Logs Not Showing?
1. In DevTools, check Console filter (shouldn't be filtered)
2. Try setting log level to "Verbose"
3. In app code, use `console.log()` not just `logger.info()`

### App Crashes on Launch?
```powershell
# View crash logs
adb logcat | Select-String "AndroidRuntime|FATAL"

# View last crash
adb logcat -d | Select-String "FATAL" -Context 20,5
```

---

## Voice Control Debugging

### To Debug TTS Issues:
1. Connect phone to Chrome DevTools
2. Open DevTools Console
3. Click voice button in app
4. Watch for logs starting with 🔊:
   - `🔊 TTS Enabled, speaking response:`
   - `🔊 Available voices:`
   - `🔊 TTS started`
   - `🔊 TTS ended`

### Check Voice Settings:
1. In app, go to **Sidebar** → **Voice Settings**
2. Verify "Text-to-Speech" is enabled
3. Check voice, rate, and volume settings
4. Test with "Test Voice" button

---

## Useful Chrome URLs

- **Remote Devices**: `chrome://inspect/#devices`
- **WebView Settings**: `chrome://inspect/#devices` → Configure
- **Port Forwarding**: Click "Port forwarding" in chrome://inspect
- **Service Workers**: `chrome://inspect/#service-workers`

---

## Quick Tips

### See Real-Time Changes:
```powershell
# Terminal 1: Run backend
cd backend
npm run dev

# Terminal 2: Run frontend with Android
npx cap run android -l --external
```

### Debug Network Requests:
1. Chrome DevTools → Network tab
2. See all API calls to backend
3. Check request/response payloads
4. Verify WebSocket connections

### Debug Storage:
1. Chrome DevTools → Application tab
2. See LocalStorage (voice settings stored here)
3. See IndexedDB
4. See Service Workers

### Performance Profiling:
1. Chrome DevTools → Performance tab
2. Record app usage
3. See FPS, memory, CPU usage
4. Identify bottlenecks

---

## Need More Help?

- **ADB Docs**: https://developer.android.com/studio/command-line/adb
- **Chrome DevTools**: https://developer.chrome.com/docs/devtools/
- **Capacitor Docs**: https://capacitorjs.com/docs/android

---

**Pro Tip**: Keep Chrome DevTools open while testing voice features to see all console logs in real-time! 🎤
