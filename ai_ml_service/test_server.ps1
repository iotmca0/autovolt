Start-Process -FilePath python -ArgumentList "flask_server.py" -WorkingDirectory "$PSScriptRoot" -WindowStyle Hidden
Start-Sleep -Seconds 2
Write-Host "AI/ML Service started. Testing endpoints..."

try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8002/health" -Method GET -TimeoutSec 10
    Write-Host "Health endpoint response:" $response.Content
} catch {
    Write-Host "Health endpoint failed:" $_.Exception.Message
}

try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8002/forecast" -Method GET -TimeoutSec 10
    Write-Host "Forecast endpoint response:" $response.Content
} catch {
    Write-Host "Forecast endpoint failed:" $_.Exception.Message
}