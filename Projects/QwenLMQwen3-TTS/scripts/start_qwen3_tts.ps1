# Start Qwen3-TTS OpenAI-compatible server on port 8880
# Prefers native GPU on Windows (Docker GPU requires WSL NVIDIA adapters).
param(
    [ValidateSet("auto", "gpu", "cpu")]
    [string]$Mode = "auto"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if ($Mode -eq "gpu" -or $Mode -eq "auto") {
    & (Join-Path $Root "scripts\start_qwen3_tts_gpu.ps1")
    exit $LASTEXITCODE
}
