param(
    [Parameter(Mandatory=$true)]
    [string]$SourceIcon
)

Write-Host "🎨 AutoVolt Android Icon Updater" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if source icon exists
if (-not (Test-Path $SourceIcon)) {
    Write-Host "❌ Error: Source icon '$SourceIcon' not found!" -ForegroundColor Red
    Write-Host "   Please provide a valid PNG file path." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Source icon found: $SourceIcon" -ForegroundColor Green

# Check if Android folder exists
if (-not (Test-Path "android/app/src/main/res")) {
    Write-Host "❌ Error: Android resource folder not found!" -ForegroundColor Red
    Write-Host "   Run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Android resource folder found" -ForegroundColor Green
Write-Host ""

# Define icon sizes for each density
$iconSizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

# Check if ImageMagick is installed
$hasImageMagick = Get-Command "magick" -ErrorAction SilentlyContinue
if (-not $hasImageMagick) {
    Write-Host "⚠️  ImageMagick not found. Attempting automated installation..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📦 Installing ImageMagick via Chocolatey..." -ForegroundColor Cyan
    
    # Check if chocolatey is installed
    $hasChoco = Get-Command "choco" -ErrorAction SilentlyContinue
    if (-not $hasChoco) {
        Write-Host "❌ Chocolatey not installed. Please install manually:" -ForegroundColor Red
        Write-Host "   Option 1: Install ImageMagick from https://imagemagick.org/script/download.php" -ForegroundColor Yellow
        Write-Host "   Option 2: Install Chocolatey, then run: choco install imagemagick" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Alternative: Use Android Studio Image Asset Studio (recommended)" -ForegroundColor Cyan
        Write-Host "   1. Open android/ folder in Android Studio" -ForegroundColor White
        Write-Host "   2. Right-click app/src/main/res > New > Image Asset" -ForegroundColor White
        Write-Host "   3. Browse to your logo file and configure" -ForegroundColor White
        exit 1
    }
    
    choco install imagemagick -y
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install ImageMagick" -ForegroundColor Red
        exit 1
    }
    
    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "✅ ImageMagick installed successfully" -ForegroundColor Green
}

Write-Host "🖼️  Generating Android icon assets..." -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$errorCount = 0

foreach ($density in $iconSizes.Keys) {
    $size = $iconSizes[$density]
    $outputDir = "android/app/src/main/res/$density"
    
    # Create directory if it doesn't exist
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    
    # Generate launcher icon
    $launcherPath = "$outputDir/ic_launcher.png"
    Write-Host "   Generating $density (${size}x${size}px)..." -ForegroundColor White
    
    try {
        & magick convert "$SourceIcon" -resize "${size}x${size}" -background none -gravity center -extent "${size}x${size}" "$launcherPath"
        
        if ($LASTEXITCODE -eq 0) {
            $successCount++
            Write-Host "      ✓ $launcherPath" -ForegroundColor Green
        } else {
            $errorCount++
            Write-Host "      ✗ Failed to generate $launcherPath" -ForegroundColor Red
        }
        
        # Generate round icon (same as launcher for simplicity)
        $roundPath = "$outputDir/ic_launcher_round.png"
        Copy-Item $launcherPath $roundPath -Force
        
        # Generate foreground icon (for adaptive icons)
        $foregroundPath = "$outputDir/ic_launcher_foreground.png"
        Copy-Item $launcherPath $foregroundPath -Force
        
    } catch {
        $errorCount++
        Write-Host "      ✗ Error: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "📊 Generation Summary:" -ForegroundColor Cyan
Write-Host "   ✅ Success: $successCount icon sets" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "   ❌ Errors: $errorCount" -ForegroundColor Red
}
Write-Host ""

if ($successCount -eq $iconSizes.Count) {
    Write-Host "🎉 All icons generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Build the app: npm run build" -ForegroundColor White
    Write-Host "   2. Sync Capacitor: npx cap sync android" -ForegroundColor White
    Write-Host "   3. Open Android Studio: npx cap open android" -ForegroundColor White
    Write-Host "   4. Run on device to verify icon" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "⚠️  Some icons failed to generate. Consider using Android Studio Image Asset instead." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "💡 Tip: For better quality, use a square PNG (1024x1024px) as source icon" -ForegroundColor Cyan
Write-Host ""
