# Start Qwen3-TTS
param(
    [ValidateSet("native-gpu", "docker-cpu", "docker-gpu")]
    [string]$Mode = "native-gpu"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

switch ($Mode) {
    "native-gpu" {
        Write-Host "Windows GPU: starting natively (recommended on this machine)..."
        & (Join-Path $Root "scripts\start_qwen3_tts_gpu.ps1")
        exit $LASTEXITCODE
    }
    "docker-cpu" {
        Write-Host "Docker CPU mode..."
        docker compose up -d --build qwen3-tts
    }
    "docker-gpu" {
        Write-Host "Docker GPU mode (requires Linux or working WSL GPU passthrough)..."
        docker compose --profile gpu up -d --build qwen3-tts-gpu
    }
}

Write-Host ""
Write-Host "Health: http://localhost:8880/health"
