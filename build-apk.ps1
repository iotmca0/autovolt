param(
    [switch]$Release,
    [switch]$CopyToDesktop,
    [switch]$Install
)

Write-Host "🔨 AutoVolt APK Builder" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""

# Check if in project root
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Step 1: Build web assets
Write-Host "📦 Step 1/4: Building web assets..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Web build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Web assets built" -ForegroundColor Green
Write-Host ""

# Step 2: Sync with Capacitor
Write-Host "🔄 Step 2/4: Syncing with Capacitor..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Capacitor sync failed!" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Capacitor synced" -ForegroundColor Green
Write-Host ""

# Step 3: Build APK
Write-Host "🏗️  Step 3/4: Building Android APK..." -ForegroundColor Yellow

Push-Location android

if ($Release) {
    Write-Host "   Building RELEASE APK (signed)..." -ForegroundColor Cyan
    .\gradlew assembleRelease
    $apkPath = "app\build\outputs\apk\release\app-release.apk"
    $outputName = "AutoVolt-v1.0.apk"
    $buildType = "RELEASE"
} else {
    Write-Host "   Building DEBUG APK (for testing)..." -ForegroundColor Cyan
    .\gradlew assembleDebug
    $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
    $outputName = "AutoVolt-Debug.apk"
    $buildType = "DEBUG"
}

$buildSuccess = $LASTEXITCODE -eq 0
Pop-Location

if (-not $buildSuccess) {
    Write-Host "❌ APK build failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "   1. Ensure Android SDK is installed" -ForegroundColor White
    Write-Host "   2. Check JAVA_HOME environment variable" -ForegroundColor White
    Write-Host "   3. Try: cd android && .\gradlew clean && cd .." -ForegroundColor White
    exit 1
}

Write-Host "   ✅ APK built successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Process output
Write-Host "📱 Step 4/4: Processing output..." -ForegroundColor Yellow

$fullApkPath = "android\$apkPath"

if (Test-Path $fullApkPath) {
    $apkSize = (Get-Item $fullApkPath).Length / 1MB
    $apkSizeFormatted = [math]::Round($apkSize, 2)
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║     ✅ BUILD SUCCESSFUL!              ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Build Information:" -ForegroundColor Cyan
    Write-Host "   Type: $buildType" -ForegroundColor White
    Write-Host "   Size: $apkSizeFormatted MB" -ForegroundColor White
    Write-Host "   Path: $fullApkPath" -ForegroundColor White
    Write-Host ""
    
    # Copy to desktop if requested
    if ($CopyToDesktop) {
        $desktopPath = "$env:USERPROFILE\Desktop\$outputName"
        Copy-Item $fullApkPath -Destination $desktopPath -Force
        Write-Host "📁 Copied to Desktop:" -ForegroundColor Cyan
        Write-Host "   $desktopPath" -ForegroundColor White
        Write-Host ""
    }
    
    # Install on device if requested
    if ($Install) {
        Write-Host "📲 Installing on device..." -ForegroundColor Cyan
        
        # Check if device is connected
        $devices = adb devices
        if ($devices -match "device$") {
            adb install -r $fullApkPath
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ Installed successfully!" -ForegroundColor Green
            } else {
                Write-Host "   ❌ Installation failed" -ForegroundColor Red
                Write-Host "   💡 Try: adb install -r $fullApkPath" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   ⚠️  No Android device connected" -ForegroundColor Yellow
            Write-Host "   💡 Connect device via USB and enable USB debugging" -ForegroundColor White
        }
        Write-Host ""
    }
    
    # Show next steps
    Write-Host "🎯 Next Steps:" -ForegroundColor Cyan
    Write-Host ""
    
    if (-not $CopyToDesktop) {
        Write-Host "   📁 Copy to Desktop:" -ForegroundColor White
        Write-Host "      Copy-Item '$fullApkPath' -Destination '`$env:USERPROFILE\Desktop\$outputName'" -ForegroundColor Gray
        Write-Host ""
    }
    
    if (-not $Install) {
        Write-Host "   📲 Install on device:" -ForegroundColor White
        Write-Host "      adb install -r $fullApkPath" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host "   📤 Share APK:" -ForegroundColor White
    Write-Host "      • Upload to Google Drive/Dropbox" -ForegroundColor Gray
    Write-Host "      • Send via email/messaging app" -ForegroundColor Gray
    Write-Host "      • Transfer via USB to phone" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "💡 Tip: Run with flags for automation:" -ForegroundColor Cyan
    Write-Host "   .\build-apk.ps1 -CopyToDesktop" -ForegroundColor White
    Write-Host "   .\build-apk.ps1 -Install" -ForegroundColor White
    Write-Host "   .\build-apk.ps1 -Release -CopyToDesktop -Install" -ForegroundColor White
    Write-Host ""
    
} else {
    Write-Host "❌ APK not found at expected location: $fullApkPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Possible locations to check:" -ForegroundColor Yellow
    
    $possibleLocations = @(
        "android\app\build\outputs\apk\debug\app-debug.apk",
        "android\app\build\outputs\apk\release\app-release.apk",
        "android\app\build\outputs\apk\release\app-release-unsigned.apk"
    )
    
    foreach ($location in $possibleLocations) {
        if (Test-Path $location) {
            Write-Host "   ✓ Found: $location" -ForegroundColor Green
        } else {
            Write-Host "   ✗ Not found: $location" -ForegroundColor Gray
        }
    }
    
    exit 1
}
