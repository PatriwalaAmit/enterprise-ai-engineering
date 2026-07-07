# Start Qwen3-TTS on native GPU (Windows — bypasses broken Docker/WSL GPU passthrough)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$venv = Join-Path $Root ".venv"
if (-not (Test-Path $venv)) {
    python -m venv $venv
}

& (Join-Path $venv "Scripts\Activate.ps1")

Write-Host "Installing GPU dependencies (PyTorch CUDA + Qwen3-TTS)..."
$pipTrusted = @(
    "--trusted-host", "pypi.org",
    "--trusted-host", "files.pythonhosted.org",
    "--trusted-host", "download.pytorch.org",
    "--trusted-host", "download-r2.pytorch.org"
)
$env:PIP_TRUSTED_HOST = "pypi.org files.pythonhosted.org download.pytorch.org download-r2.pytorch.org"
pip install @pipTrusted -r requirements-gpu.txt

# Use materialized local model (HF hub symlinks break when copied from Docker on Windows).
$localModel17 = Join-Path $Root "models/1.7B-CustomVoice"
$localModel06 = Join-Path $Root "models/0.6B-CustomVoice"
if (-not (Test-Path (Join-Path $localModel17 "model.safetensors"))) {
    Write-Host "Materializing 1.7B model from Docker cache (one-time)..."
    New-Item -ItemType Directory -Path $localModel17 -Force | Out-Null
    docker run --rm `
        -v qwenlmqwen3-tts_huggingface_cache:/cache `
        -v "${Root}/models/1.7B-CustomVoice:/out" `
        alpine sh -c "cp -Lr /cache/hub/models--Qwen--Qwen3-TTS-12Hz-1.7B-CustomVoice/snapshots/0c0e3051f131929182e2c023b9537f8b1c68adfe/. /out/"
}

$env:PYTHONPATH = $Root
$env:QWEN3_TTS_CONFIG = if ($env:QWEN3_TTS_CONFIG) { $env:QWEN3_TTS_CONFIG } else { Join-Path $Root "config.yaml" }
$env:QWEN3_TTS_DEVICE = "cuda:0"
$env:QWEN3_TTS_MODEL_ID = (Resolve-Path $localModel17).Path
$env:QWEN3_TTS_DTYPE = "bfloat16"
$env:QWEN3_TTS_ATTN = "sdpa"

Write-Host "Checking CUDA..."
python -c @"
import torch
if not torch.cuda.is_available():
    raise SystemExit('CUDA not available — update NVIDIA drivers or use CPU mode.')
print(f'GPU: {torch.cuda.get_device_name(0)}')
print(f'VRAM: {torch.cuda.get_device_properties(0).total_memory // 1024**2} MB')
"@

Write-Host ""
Write-Host "Starting Qwen3-TTS server on GPU at http://0.0.0.0:8880/v1"
python -m server.main --config $env:QWEN3_TTS_CONFIG
