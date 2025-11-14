# AI/ML Insights - Quick Start Script
# This script helps you quickly start and test the improved AI/ML Insights UI

Write-Host "🚀 AutoVolt AI/ML Insights - Quick Start" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Error: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Pre-flight checks..." -ForegroundColor Yellow
Write-Host ""

# Check Node.js
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check Python
$pythonVersion = python --version 2>$null
if ($pythonVersion) {
    Write-Host "✅ Python: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Python not found. Please install Python first." -ForegroundColor Red
    exit 1
}

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host "✅ Environment file (.env) found" -ForegroundColor Green
    
    # Check if AI/ML service URL is correct
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "VITE_AI_ML_SERVICE_URL=.*:8003") {
        Write-Host "✅ AI/ML Service URL configured for port 8003" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Warning: AI/ML Service URL may need updating to port 8003" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Warning: .env file not found. Copying from .env.windows..." -ForegroundColor Yellow
    if (Test-Path ".env.windows") {
        Copy-Item ".env.windows" ".env"
        Write-Host "✅ .env file created from .env.windows" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "🎯 What would you like to do?" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start AI/ML Service only (Python FastAPI)" -ForegroundColor White
Write-Host "2. Start Frontend only (React + Vite)" -ForegroundColor White
Write-Host "3. Start both AI/ML Service and Frontend" -ForegroundColor White
Write-Host "4. Check service status (ports 8003, 5174)" -ForegroundColor White
Write-Host "5. View AI/ML UI improvements documentation" -ForegroundColor White
Write-Host "6. Exit" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Enter your choice (1-6)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🤖 Starting AI/ML Service on port 8003..." -ForegroundColor Cyan
        Write-Host ""
        
        if (!(Test-Path "ai_ml_service")) {
            Write-Host "❌ Error: ai_ml_service directory not found" -ForegroundColor Red
            exit 1
        }
        
        # Check if required Python packages are installed
        Write-Host "📦 Checking Python dependencies..." -ForegroundColor Yellow
        Set-Location ai_ml_service
        
        # Try to import fastapi
        python -c "import fastapi" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  FastAPI not found. Installing dependencies..." -ForegroundColor Yellow
            pip install -r requirements.txt
        }
        
        Write-Host ""
        Write-Host "✨ Starting AI/ML service..." -ForegroundColor Green
        Write-Host "   Endpoint: http://127.0.0.1:8003" -ForegroundColor Cyan
        Write-Host "   Health Check: http://127.0.0.1:8003/health" -ForegroundColor Cyan
        Write-Host "   API Docs: http://127.0.0.1:8003/docs" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Press Ctrl+C to stop the service" -ForegroundColor Yellow
        Write-Host ""
        
        python main.py
    }
    
    "2" {
        Write-Host ""
        Write-Host "⚛️  Starting Frontend Development Server..." -ForegroundColor Cyan
        Write-Host ""
        
        # Check if node_modules exists
        if (!(Test-Path "node_modules")) {
            Write-Host "📦 node_modules not found. Installing dependencies..." -ForegroundColor Yellow
            npm install
        }
        
        Write-Host ""
        Write-Host "✨ Starting frontend..." -ForegroundColor Green
        Write-Host "   Local: http://localhost:5174" -ForegroundColor Cyan
        Write-Host "   Network: http://172.16.3.171:5174" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
        Write-Host ""
        
        npm run dev
    }
    
    "3" {
        Write-Host ""
        Write-Host "🚀 Starting Full Stack (AI/ML + Frontend)..." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "⚠️  Note: This will open two terminal windows" -ForegroundColor Yellow
        Write-Host "   - Window 1: AI/ML Service (port 8003)" -ForegroundColor White
        Write-Host "   - Window 2: Frontend (port 5174)" -ForegroundColor White
        Write-Host ""
        
        # Start AI/ML service in new window
        Write-Host "📍 Starting AI/ML Service..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\ai_ml_service'; Write-Host '🤖 AI/ML Service' -ForegroundColor Green; python main.py"
        
        Start-Sleep -Seconds 3
        
        # Start frontend in new window
        Write-Host "📍 Starting Frontend..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host '⚛️  Frontend Server' -ForegroundColor Green; npm run dev"
        
        Write-Host ""
        Write-Host "✅ Both services starting in separate windows!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Access the application:" -ForegroundColor Cyan
        Write-Host "   Frontend: http://localhost:5174" -ForegroundColor White
        Write-Host "   AI/ML API: http://localhost:8003" -ForegroundColor White
        Write-Host "   AI/ML Docs: http://localhost:8003/docs" -ForegroundColor White
        Write-Host ""
        Write-Host "To stop services, close both PowerShell windows" -ForegroundColor Yellow
        Write-Host ""
        
        Read-Host "Press Enter to continue..."
    }
    
    "4" {
        Write-Host ""
        Write-Host "🔍 Checking Service Status..." -ForegroundColor Cyan
        Write-Host ""
        
        # Check AI/ML service (port 8003)
        $aimlPort = netstat -ano | findstr ":8003"
        if ($aimlPort) {
            Write-Host "✅ AI/ML Service: RUNNING on port 8003" -ForegroundColor Green
            Write-Host "   Health Check: http://localhost:8003/health" -ForegroundColor Cyan
        } else {
            Write-Host "❌ AI/ML Service: NOT RUNNING" -ForegroundColor Red
            Write-Host "   Start with: python ai_ml_service/main.py" -ForegroundColor Yellow
        }
        
        Write-Host ""
        
        # Check Frontend (port 5174)
        $frontendPort = netstat -ano | findstr ":5174"
        if ($frontendPort) {
            Write-Host "✅ Frontend: RUNNING on port 5174" -ForegroundColor Green
            Write-Host "   URL: http://localhost:5174" -ForegroundColor Cyan
        } else {
            Write-Host "❌ Frontend: NOT RUNNING" -ForegroundColor Red
            Write-Host "   Start with: npm run dev" -ForegroundColor Yellow
        }
        
        Write-Host ""
        
        # Check Backend (port 3001)
        $backendPort = netstat -ano | findstr ":3001"
        if ($backendPort) {
            Write-Host "✅ Backend API: RUNNING on port 3001" -ForegroundColor Green
            Write-Host "   URL: http://localhost:3001" -ForegroundColor Cyan
        } else {
            Write-Host "⚠️  Backend API: NOT RUNNING" -ForegroundColor Yellow
            Write-Host "   (Required for full functionality)" -ForegroundColor Gray
        }
        
        Write-Host ""
        Read-Host "Press Enter to continue..."
    }
    
    "5" {
        Write-Host ""
        Write-Host "📖 Opening AI/ML UI Improvements Documentation..." -ForegroundColor Cyan
        Write-Host ""
        
        if (Test-Path "AI_ML_UI_IMPROVEMENTS.md") {
            Start-Process "AI_ML_UI_IMPROVEMENTS.md"
            Write-Host "✅ Documentation opened in default editor" -ForegroundColor Green
        } else {
            Write-Host "❌ Documentation file not found: AI_ML_UI_IMPROVEMENTS.md" -ForegroundColor Red
        }
        
        Write-Host ""
        Read-Host "Press Enter to continue..."
    }
    
    "6" {
        Write-Host ""
        Write-Host "👋 Goodbye!" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    }
    
    default {
        Write-Host ""
        Write-Host "❌ Invalid choice. Please run the script again." -ForegroundColor Red
        exit 1
    }
}
