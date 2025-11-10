# AutoVolt Android Debug Helper
# Run this script to help debug your Android app

Write-Host "🔍 AutoVolt Android Debug Helper" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if device is connected
Write-Host "1️⃣ Checking connected devices..." -ForegroundColor Yellow
$devices = adb devices
Write-Host $devices
Write-Host ""

if ($devices -match "device$") {
    Write-Host "✅ Device connected!" -ForegroundColor Green
    
    # Get device info
    Write-Host ""
    Write-Host "2️⃣ Device Information:" -ForegroundColor Yellow
    $model = adb shell getprop ro.product.model
    $version = adb shell getprop ro.build.version.release
    Write-Host "   Model: $model"
    Write-Host "   Android Version: $version"
    
    # Check if app is installed
    Write-Host ""
    Write-Host "3️⃣ Checking if AutoVolt app is installed..." -ForegroundColor Yellow
    $appInstalled = adb shell pm list packages | Select-String "autovolt"
    if ($appInstalled) {
        Write-Host "✅ App is installed: $appInstalled" -ForegroundColor Green
    } else {
        Write-Host "❌ App not found. Please install it first." -ForegroundColor Red
    }
    
    # Menu
    Write-Host ""
    Write-Host "4️⃣ What would you like to do?" -ForegroundColor Yellow
    Write-Host "   1. Open Chrome DevTools (chrome://inspect)"
    Write-Host "   2. View live logs (filtered for AutoVolt)"
    Write-Host "   3. View all Capacitor logs"
    Write-Host "   4. Clear app data and restart"
    Write-Host "   5. Take screenshot"
    Write-Host "   6. Run app with live reload"
    Write-Host "   0. Exit"
    Write-Host ""
    
    $choice = Read-Host "Enter your choice"
    
    switch ($choice) {
        "1" {
            Write-Host "🌐 Opening Chrome DevTools..." -ForegroundColor Green
            Start-Process "chrome://inspect/#devices"
        }
        "2" {
            Write-Host "📱 Viewing AutoVolt logs (Press Ctrl+C to stop)..." -ForegroundColor Green
            adb logcat | Select-String "AutoVolt|Console|Capacitor" --LineBuffered
        }
        "3" {
            Write-Host "📱 Viewing Capacitor logs (Press Ctrl+C to stop)..." -ForegroundColor Green
            adb logcat | Select-String "Capacitor|chromium" --LineBuffered
        }
        "4" {
            Write-Host "🗑️ Clearing app data..." -ForegroundColor Green
            adb shell pm clear com.autovolt.app
            Write-Host "✅ App data cleared!" -ForegroundColor Green
            Write-Host "📱 Launching app..." -ForegroundColor Green
            adb shell am start -n com.autovolt.app/.MainActivity
        }
        "5" {
            Write-Host "📸 Taking screenshot..." -ForegroundColor Green
            $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
            adb exec-out screencap -p > "screenshot_$timestamp.png"
            Write-Host "✅ Screenshot saved as screenshot_$timestamp.png" -ForegroundColor Green
        }
        "6" {
            Write-Host "🚀 Running app with live reload..." -ForegroundColor Green
            Write-Host "   This will take a moment..." -ForegroundColor Yellow
            npx cap run android -l --external
        }
        "0" {
            Write-Host "👋 Goodbye!" -ForegroundColor Cyan
            exit
        }
        default {
            Write-Host "❌ Invalid choice" -ForegroundColor Red
        }
    }
    
} else {
    Write-Host "❌ No device connected!" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "   1. Enable USB Debugging on your Android device"
    Write-Host "   2. Connect device via USB cable"
    Write-Host "   3. Accept 'Allow USB debugging' prompt on device"
    Write-Host "   4. Make sure USB mode is set to 'File Transfer' or 'PTP'"
    Write-Host "   5. Try a different USB cable or port"
}

Write-Host ""
Write-Host "💡 Tip: You can also manually open chrome://inspect in Chrome browser" -ForegroundColor Cyan
