# Android Edge-to-Edge Implementation Guide

## Overview
This guide documents the complete edge-to-edge (fullscreen) implementation for the AutoVolt Android app, including status bar transparency, safe area support, and app icon updates.

## ✅ Implementation Status

### 1. Android Java Code (MainActivity.java)
**File:** `android/app/src/main/java/com/autovolt/app/MainActivity.java`

✅ **Added edge-to-edge support:**
```java
private void enableEdgeToEdge() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Android 11+ (API 30+)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        // Android 5.0+ (API 21+)
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }
}
```

Called in `onCreate()` after `super.onCreate(savedInstanceState)`.

### 2. Android Theme Configuration (styles.xml)
**File:** `android/app/src/main/res/values/styles.xml`

✅ **Updated AppTheme.NoActionBar with:**
```xml
<!-- Enable fullscreen edge-to-edge -->
<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
<item name="android:statusBarColor">@android:color/transparent</item>
<item name="android:navigationBarColor">@android:color/transparent</item>

<!-- Window flags for immersive experience -->
<item name="android:windowTranslucentStatus">false</item>
<item name="android:windowTranslucentNavigation">false</item>
<item name="android:windowDrawsSystemBarBackgrounds">true</item>

<!-- Ensure light content on dark system bars -->
<item name="android:windowLightStatusBar">true</item>
```

**Key Features:**
- `shortEdges`: App content extends into camera notch/cutout area
- Transparent status & navigation bars
- System bar backgrounds drawn by app
- Light status bar icons for dark backgrounds

### 3. Capacitor Configuration
**File:** `capacitor.config.ts`

✅ **Added StatusBar plugin:**
```typescript
plugins: {
  StatusBar: {
    style: 'dark',
    backgroundColor: '#3b82f6',
    overlaysWebView: true
  }
}
```

**Settings:**
- `style: 'dark'`: Dark icons on light backgrounds
- `backgroundColor: '#3b82f6'`: AutoVolt blue brand color
- `overlaysWebView: true`: Web content extends under status bar

### 4. CSS Safe Area Support
**Files:** 
- `src/index.css` (CSS variables at `:root`)
- `src/mobile-edge-to-edge.css` (utility classes and mobile-specific styles)

✅ **Safe Area CSS Variables:**
```css
:root {
  --safe-area-inset-top: env(safe-area-inset-top, 0px);
  --safe-area-inset-right: env(safe-area-inset-right, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left: env(safe-area-inset-left, 0px);
}
```

✅ **Utility Classes Available:**
- `.mobile-safe-top` - Padding for status bar area
- `.mobile-safe-bottom` - Padding for navigation bar area
- `.mobile-safe-left` / `.mobile-safe-right` - Side padding
- `.mobile-safe-all` - All sides padding
- `.safe-top`, `.safe-bottom`, etc. - Alternative class names

✅ **Automatic Padding:**
```css
body {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
```

**Key Features:**
- Automatic body padding respects notches/system bars
- Headers get extra top padding: `calc(0.5rem + env(safe-area-inset-top))`
- Footers get extra bottom padding
- iOS Safari viewport fix included
- Prevents input zoom on iOS (font-size: 16px)

---

## 🎨 App Icon Update

### Current Status
❌ **Using default Capacitor icon**

### Required: Update to AutoVolt Logo
**Source file:** `logo auto volt (1).png` (root directory)

### Option 1: Automated Icon Generation (Recommended)

#### Step 1: Install Capacitor Assets CLI
```powershell
npm install -D @capacitor/assets
```

#### Step 2: Prepare Icon File
```powershell
# Copy and rename logo file to resources folder
New-Item -ItemType Directory -Path "resources" -Force
Copy-Item "logo auto volt (1).png" -Destination "resources/icon.png"
```

#### Step 3: Generate All Icon Sizes
```powershell
npx @capacitor/assets generate --iconBackgroundColor '#3b82f6' --android
```

**What this does:**
- Generates all required Android icon sizes (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- Creates adaptive icons (foreground + background layers)
- Outputs to correct mipmap folders
- Maintains aspect ratio and quality

### Option 2: Manual Icon Creation (Android Studio)

#### Step 1: Open Android Studio
```powershell
cd android
& "C:\Program Files\Android\Android Studio\bin\studio64.exe" .
```

#### Step 2: Use Image Asset Studio
1. Right-click `app/src/main/res` folder
2. Select **New > Image Asset**
3. Choose **Launcher Icons (Adaptive and Legacy)**
4. Click **Browse** next to "Path"
5. Select `logo auto volt (1).png`
6. Adjust settings:
   - **Foreground Layer:** Scaling 80-90% (to add padding)
   - **Background Layer:** Color #3b82f6 (AutoVolt blue)
   - **Shape:** Circle (recommended for modern Android)
7. Click **Next** > **Finish**

**Generated files:**
- `mipmap-mdpi/ic_launcher.png` (48x48)
- `mipmap-hdpi/ic_launcher.png` (72x72)
- `mipmap-xhdpi/ic_launcher.png` (96x96)
- `mipmap-xxhdpi/ic_launcher.png` (144x144)
- `mipmap-xxxhdpi/ic_launcher.png` (192x192)
- `mipmap-anydpi-v26/ic_launcher.xml` (adaptive icon)

### Option 3: PowerShell Script (Quick & Dirty)

**File:** `update-android-icon.ps1` (created below)

```powershell
.\update-android-icon.ps1 -SourceIcon "logo auto volt (1).png"
```

---

## 🧪 Testing Checklist

### Desktop/Browser Testing
- [ ] Open browser DevTools mobile view (F12 > Toggle device toolbar)
- [ ] Check body has safe-area padding
- [ ] Verify CSS variables are set in DevTools console:
  ```javascript
  getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')
  ```

### Android Device Testing
- [ ] **Build Android app:**
  ```powershell
  npm run build
  npx cap sync android
  npx cap open android
  ```
- [ ] **Run on device/emulator** (Android Studio > Run)
- [ ] **Verify edge-to-edge:**
  - [ ] Status bar is transparent (app content visible behind it)
  - [ ] No black bar at top of screen
  - [ ] Content doesn't overlap with status bar text
  - [ ] Navigation bar at bottom is transparent (if device has one)
  - [ ] Notch/cutout area used properly (if device has one)
  
- [ ] **Verify icon:**
  - [ ] Home screen shows AutoVolt logo (not Capacitor logo)
  - [ ] Recent apps screen shows logo
  - [ ] Settings > Apps shows logo
  
- [ ] **Test different scenarios:**
  - [ ] Portrait mode
  - [ ] Landscape mode
  - [ ] Keyboard open (bottom safe area should adjust)
  - [ ] Pull-down notification shade works
  - [ ] Gesture navigation (if enabled on device)

### Component-Specific Testing
- [ ] Headers don't overlap status bar
- [ ] Bottom navigation respects safe area
- [ ] Modals/dialogs fit within safe area
- [ ] Fixed positioned elements (FABs, snackbars) respect safe areas

---

## 🐛 Troubleshooting

### Issue: Status bar still has black background
**Fix:** Ensure `overlaysWebView: true` in capacitor.config.ts and rebuild:
```powershell
npx cap sync android
```

### Issue: Content overlaps with status bar
**Fix 1:** Add `mobile-safe-top` class to header/navbar components:
```jsx
<header className="mobile-safe-top">
```

**Fix 2:** Increase body top padding in mobile-edge-to-edge.css:
```css
body {
  padding-top: calc(1rem + env(safe-area-inset-top));
}
```

### Issue: Icons not updated after generation
**Fix:** Clean and rebuild:
```powershell
cd android
.\gradlew clean
cd ..
npx cap sync android
```

### Issue: Edge-to-edge not working on older Android
**Check:** Android version must be 5.0+ (API 21+)
```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
```

### Issue: White flash on app startup
**Fix:** Add in styles.xml:
```xml
<item name="android:windowBackground">@color/background</item>
```
Then define color in `values/colors.xml`:
```xml
<color name="background">#3b82f6</color>
```

---

## 📱 React Component Integration

### Example: Header with Safe Area
```jsx
const Header = () => {
  return (
    <header className="bg-blue-600 text-white mobile-safe-top">
      <div className="px-4 py-3">
        <h1>AutoVolt</h1>
      </div>
    </header>
  );
};
```

### Example: Bottom Navigation
```jsx
const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t mobile-safe-bottom">
      <div className="flex justify-around py-2">
        {/* Navigation items */}
      </div>
    </nav>
  );
};
```

### Example: Full-Screen Modal
```jsx
const Modal = ({ children }) => {
  return (
    <div className="fixed inset-0 bg-black/50">
      <div className="modal-content bg-white rounded-t-lg mobile-safe-all">
        {children}
      </div>
    </div>
  );
};
```

---

## 🔄 Build & Deploy Process

### 1. Development Build (Testing)
```powershell
# Build web assets
npm run build

# Sync with Android project
npx cap sync android

# Open in Android Studio
npx cap open android

# Run on device (Android Studio > Run button)
```

### 2. Production Build (Release)
```powershell
# Build optimized web assets
npm run build

# Sync with Android
npx cap sync android

# Open Android Studio
npx cap open android

# In Android Studio:
# 1. Build > Generate Signed Bundle / APK
# 2. Select Android App Bundle (.aab)
# 3. Choose keystore or create new
# 4. Build Release
```

### 3. Update After Changes
```powershell
# If only web code changed:
npm run build
npx cap copy android

# If Capacitor config changed:
npm run build
npx cap sync android

# If Android native code changed (MainActivity.java, styles.xml):
# Just rebuild in Android Studio
```

---

## 📚 Reference Links

- [Capacitor Status Bar Plugin](https://capacitorjs.com/docs/apis/status-bar)
- [Android Edge-to-Edge Guide](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- [CSS env() Safe Area](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Capacitor Assets CLI](https://github.com/ionic-team/capacitor-assets)

---

## 📝 Change Log

### 2024 - Edge-to-Edge Implementation
- ✅ Added `MainActivity.enableEdgeToEdge()` method
- ✅ Updated `styles.xml` with transparent system bars
- ✅ Configured Capacitor StatusBar plugin
- ✅ Created safe-area CSS variables and utility classes
- ✅ Added mobile-edge-to-edge.css with comprehensive styles
- ⏳ **Pending:** Update app icon to AutoVolt logo

---

## 🎯 Next Steps

1. **Icon Update:**
   - Run icon generation script OR use Android Studio Image Asset
   - Test icon appears correctly on home screen

2. **Component Updates:**
   - Add `mobile-safe-top` class to main header/navbar
   - Test on physical device with notch/cutout
   - Adjust padding values if needed

3. **Performance:**
   - Test on low-end Android devices (API 21-23)
   - Verify no layout shifts during app launch
   - Optimize CSS to avoid reflows

4. **Future Enhancements:**
   - Splash screen with edge-to-edge support
   - Dynamic status bar color based on current page
   - iOS edge-to-edge implementation (if building iOS app)
