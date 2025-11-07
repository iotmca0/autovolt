# How to Build & Share AutoVolt APK

## 🚀 Quick Method (Debug APK - For Testing)

### Step 1: Build the APK
```powershell
# Navigate to android folder
cd android

# Build debug APK using Gradle
.\gradlew assembleDebug

# Go back to root
cd ..
```

**Output location:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 2: Share the APK

#### Option A: Copy to Desktop
```powershell
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "$env:USERPROFILE\Desktop\AutoVolt.apk"
```

#### Option B: Share via Cloud
Upload `app-debug.apk` to:
- Google Drive
- Dropbox
- OneDrive
- WeTransfer

#### Option C: Share via USB/ADB
```powershell
# Connect phone via USB
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🏭 Production Method (Release APK - For Distribution)

### Prerequisites
You need a **signing key** to create a release APK.

### Step 1: Generate Keystore (First Time Only)
```powershell
# Navigate to android/app
cd android/app

# Generate keystore
keytool -genkey -v -keystore autovolt-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias autovolt
```

**You'll be prompted for:**
- Keystore password (e.g., `AutoVolt@2024`)
- Key password (e.g., `AutoVolt@2024`)
- Your name/organization details

**⚠️ IMPORTANT:** Save these passwords! You'll need them for every release.

### Step 2: Configure Gradle Signing

Create `android/key.properties`:
```powershell
@"
storePassword=YourKeystorePassword
keyPassword=YourKeyPassword
keyAlias=autovolt
storeFile=app/autovolt-release-key.jks
"@ | Out-File -FilePath "android\key.properties" -Encoding utf8
```

### Step 3: Update build.gradle

Open `android/app/build.gradle` and add signing configuration.

**Find this section (around line 5):**
```gradle
android {
    namespace "com.autovolt.app"
    compileSdkVersion rootProject.ext.compileSdkVersion
```

**Add before `android {`:**
```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

**Add inside `android {` block (after `buildTypes` or create it):**
```gradle
signingConfigs {
    release {
        if (keystorePropertiesFile.exists()) {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

### Step 4: Build Release APK
```powershell
cd android
.\gradlew assembleRelease
cd ..
```

**Output location:**
```
android/app/build/outputs/apk/release/app-release.apk
```

### Step 5: Copy to Desktop
```powershell
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" -Destination "$env:USERPROFILE\Desktop\AutoVolt-v1.0.apk"
```

---

## 📦 Alternative: Build AAB (For Google Play Store)

If you want to publish on Google Play Store, build an **Android App Bundle** instead:

```powershell
cd android
.\gradlew bundleRelease
cd ..
```

**Output:**
```
android/app/build/outputs/bundle/release/app-release.aab
```

---

## 🛠️ Complete Build Script

Save this as `build-apk.ps1`:

```powershell
param(
    [switch]$Release,
    [switch]$CopyToDesktop
)

Write-Host "🔨 Building AutoVolt APK..." -ForegroundColor Cyan
Write-Host ""

# Build web assets
Write-Host "📦 Building web assets..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Web build failed!" -ForegroundColor Red
    exit 1
}

# Sync with Capacitor
Write-Host "🔄 Syncing with Capacitor..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Capacitor sync failed!" -ForegroundColor Red
    exit 1
}

# Build APK
cd android

if ($Release) {
    Write-Host "🏭 Building RELEASE APK..." -ForegroundColor Yellow
    .\gradlew assembleRelease
    $apkPath = "app\build\outputs\apk\release\app-release.apk"
    $outputName = "AutoVolt-v1.0.apk"
} else {
    Write-Host "🔧 Building DEBUG APK..." -ForegroundColor Yellow
    .\gradlew assembleDebug
    $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
    $outputName = "AutoVolt-Debug.apk"
}

cd ..

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ APK build failed!" -ForegroundColor Red
    exit 1
}

# Check if APK exists
if (Test-Path "android\$apkPath") {
    $apkSize = (Get-Item "android\$apkPath").Length / 1MB
    Write-Host ""
    Write-Host "✅ APK built successfully!" -ForegroundColor Green
    Write-Host "   Size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor White
    Write-Host "   Location: android\$apkPath" -ForegroundColor White
    
    if ($CopyToDesktop) {
        $desktopPath = "$env:USERPROFILE\Desktop\$outputName"
        Copy-Item "android\$apkPath" -Destination $desktopPath -Force
        Write-Host ""
        Write-Host "📁 Copied to: $desktopPath" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "📱 Install on device:" -ForegroundColor Cyan
    Write-Host "   adb install android\$apkPath" -ForegroundColor White
} else {
    Write-Host "❌ APK not found at expected location!" -ForegroundColor Red
    exit 1
}
```

### Usage:
```powershell
# Build debug APK
.\build-apk.ps1

# Build debug and copy to desktop
.\build-apk.ps1 -CopyToDesktop

# Build release APK
.\build-apk.ps1 -Release -CopyToDesktop
```

---

## 📱 Installing on Android Device

### Method 1: ADB (USB Connection)
```powershell
# Check device is connected
adb devices

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or force reinstall
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Method 2: Direct Transfer
1. Copy APK to phone (USB/Bluetooth/Cloud)
2. On phone: Open file manager
3. Tap the APK file
4. Allow "Install from Unknown Sources" if prompted
5. Tap Install

### Method 3: QR Code Share
```powershell
# Install QR code generator
npm install -g qrcode-terminal

# Generate QR for download link (after uploading to cloud)
npx qrcode-terminal "https://your-cloud-link.com/AutoVolt.apk"
```

---

## 🔐 Security Notes

### For Debug APK:
- ✅ Good for testing
- ✅ Easy to build
- ❌ Not secure (uses default debug key)
- ❌ Cannot publish to Play Store
- ❌ Shows "unsafe" warning on some devices

### For Release APK:
- ✅ Signed with your private key
- ✅ Ready for distribution
- ✅ Can publish to Play Store (if using AAB)
- ✅ More secure
- ⚠️ MUST keep keystore file safe!

---

## 🚀 Quick Commands Reference

| Task | Command |
|------|---------|
| Build debug APK | `cd android && .\gradlew assembleDebug && cd ..` |
| Build release APK | `cd android && .\gradlew assembleRelease && cd ..` |
| Build AAB bundle | `cd android && .\gradlew bundleRelease && cd ..` |
| Install on device | `adb install android/app/build/outputs/apk/debug/app-debug.apk` |
| Clean build | `cd android && .\gradlew clean && cd ..` |
| List devices | `adb devices` |

---

## 🐛 Troubleshooting

### Error: "JAVA_HOME not set"
```powershell
# Set JAVA_HOME (Android Studio JDK)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

### Error: "SDK location not found"
Create `android/local.properties`:
```properties
sdk.dir=C:\\Users\\YourUsername\\AppData\\Local\\Android\\Sdk
```

### Error: Build fails with signing errors
```powershell
# Use debug build instead
cd android
.\gradlew assembleDebug
```

### APK too large (>100MB)
```powershell
# Enable ProGuard/R8 minification in build.gradle
minifyEnabled true
shrinkResources true
```

---

## 📤 Best Practices for Sharing

1. **For Testing:** Share debug APK via Google Drive/Dropbox
2. **For Beta Users:** Use Firebase App Distribution
3. **For Public Release:** Publish to Google Play Store
4. **For Internal Team:** Use enterprise app distribution (MDM)

### Firebase App Distribution (Recommended for Beta)
```powershell
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Upload APK
firebase appdistribution:distribute android/app/build/outputs/apk/release/app-release.apk \
  --app YOUR_FIREBASE_APP_ID \
  --groups testers
```

---

## 🎯 Summary

**For quick testing:**
```powershell
cd android
.\gradlew assembleDebug
cd ..
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" -Destination "$env:USERPROFILE\Desktop\AutoVolt.apk"
```

**Then share `AutoVolt.apk` via any file sharing method!** 🚀
