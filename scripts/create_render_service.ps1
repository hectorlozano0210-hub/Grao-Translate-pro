Param()

if (-not $env:RENDER_API_KEY) {
  Write-Error "RENDER_API_KEY environment variable is not set. Use: $env:RENDER_API_KEY='your_key'"
  exit 1
}

$payload = @{
  service = @{
    name = 'graotranslate'
    repo = 'hectorlozano0210-hub/graotranslatepro'
    branch = 'main'
    type = 'web_service'
    env = 'docker'
    plan = 'free'
    dockerfilePath = 'Dockerfile'
  }
} | ConvertTo-Json -Depth 10

Write-Output "Creating Render service 'graotranslate'..."

Invoke-RestMethod -Uri 'https://api.render.com/v1/services' -Method Post -Headers @{ Authorization = "Bearer $($env:RENDER_API_KEY)"; 'Content-Type' = 'application/json' } -Body $payload | ConvertTo-Json -Depth 10

Write-Output "If the request succeeded you'll see service JSON. Configure env vars in Render dashboard after creation."
