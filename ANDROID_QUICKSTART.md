# Android App Edge-to-Edge Quick Start

## ✅ What's Done

### 1. Edge-to-Edge Implementation
- ✅ Java code in `MainActivity.java` - extends app under status bar
- ✅ Theme config in `styles.xml` - transparent system bars
- ✅ Capacitor config updated - StatusBar plugin configured
- ✅ CSS safe areas added - prevents overlap with system UI

### 2. Files Modified
- `android/app/src/main/java/com/autovolt/app/MainActivity.java`
- `android/app/src/main/res/values/styles.xml`
- `capacitor.config.ts`
- `src/index.css`
- `src/mobile-edge-to-edge.css` (new file)

---

## 🎯 What You Need To Do

### Update App Icon (Choose one method)

#### Method 1: Automated Script (Easiest)
```powershell
# Run the PowerShell script
.\update-android-icon.ps1 -SourceIcon "logo auto volt (1).png"
```

**Requirements:**
- ImageMagick (script will attempt to install if missing)
- OR manually install from: https://imagemagick.org

#### Method 2: Android Studio (Most Control)
```powershell
# Open Android project
npx cap open android
```

**In Android Studio:**
1. Right-click `app/src/main/res`
2. Select **New → Image Asset**
3. Choose **Launcher Icons**
4. Browse to `logo auto volt (1).png`
5. Set background color: `#3b82f6`
6. Click **Next → Finish**

#### Method 3: Capacitor Assets (Recommended for Production)
```powershell
# Install package
npm install -D @capacitor/assets

# Create resources folder
mkdir resources
Copy-Item "logo auto volt (1).png" -Destination "resources/icon.png"

# Generate all assets
npx @capacitor/assets generate --android
```

---

## 🏗️ Build & Test

### Step 1: Build Web Assets
```powershell
npm run build
```

### Step 2: Sync with Android
```powershell
npx cap sync android
```

### Step 3: Open in Android Studio
```powershell
npx cap open android
```

### Step 4: Run on Device
Click the **green play button** in Android Studio toolbar

---

## ✅ Testing Checklist

### Visual Checks
- [ ] Status bar is transparent (blue app content visible behind it)
- [ ] App uses full screen height (no black bar at top)
- [ ] Content doesn't overlap with status bar icons/clock
- [ ] App icon shows AutoVolt logo (not Capacitor default)

### Device Variations
- [ ] Works on device with notch/cutout
- [ ] Works in portrait mode
- [ ] Works in landscape mode
- [ ] Safe areas adjust when keyboard opens

### Components
- [ ] Headers don't hide under status bar
- [ ] Bottom navigation visible above gesture bar
- [ ] Modals/dialogs fit within safe area

---

## 🐛 Quick Fixes

### Problem: Status bar still black
```powershell
# Clean rebuild
npx cap sync android
# Then rebuild in Android Studio
```

### Problem: Content overlaps status bar
Add this class to your main header component:
```jsx
<header className="mobile-safe-top">
```

### Problem: Icon not updated
```powershell
cd android
.\gradlew clean
cd ..
npx cap sync android
# Rebuild in Android Studio
```

---

## 📱 CSS Classes Available

Use these classes in your React components:

```jsx
// Header with safe area
<header className="mobile-safe-top">

// Bottom nav with safe area  
<nav className="mobile-safe-bottom">

// Full safe area padding
<div className="mobile-safe-all">

// Individual sides
<div className="safe-left safe-right">
```

---

## 🔄 After Making Changes

### If you modify web code (JS/CSS/React):
```powershell
npm run build
npx cap copy android
```

### If you modify capacitor.config.ts:
```powershell
npm run build
npx cap sync android
```

### If you modify Android native code (.java/.xml):
Just rebuild in Android Studio (no Capacitor sync needed)

---

## 📚 Full Documentation

For detailed explanations, troubleshooting, and advanced configuration:
- See `ANDROID_EDGE_TO_EDGE_GUIDE.md`

---

## 🎉 That's It!

Your Android app now:
- ✅ Uses full screen (edge-to-edge)
- ✅ Has transparent status bar
- ✅ Respects notches and system UI
- ⏳ Just needs icon update (run one of the 3 methods above)
