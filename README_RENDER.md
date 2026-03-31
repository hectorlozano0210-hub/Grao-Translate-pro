# Deploy to Render — Instructions

This repo includes helper scripts to create a Render Web Service via the Render API.

Important: never commit your Render API key or other secrets into the repository. Use environment variables.

Prerequisites
- `curl` and `jq` for the bash script (Linux/macOS/WSL/Git Bash)
- PowerShell for the Windows script
- A Render account and API key (Dashboard → Account → API Keys → Generate Key)

Bash (example)

```bash
export RENDER_API_KEY="<your_key_here>"
bash scripts/create_render_service.sh
```

PowerShell (example)

```powershell
$env:RENDER_API_KEY = '<your_key_here>'
.\scripts\create_render_service.ps1
```

What the scripts do
- Use the value of `RENDER_API_KEY` from the environment and call the Render API to create a web service named `graotranslate` pointing at your repository `hectorlozano0210-hub/graotranslatepro` on branch `main`.
- They do not set environment variables for the service — you must add DB credentials and other secrets in the Render dashboard: Service → Environment → Environment Variables.

After creation
- Open Render Dashboard → Services → `graotranslate`.
- Add Environment Variables: `GEMINI_API_KEY`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, etc.
- Trigger a deploy from the Dashboard or push a new commit to `main`.

Notes
- If you do not want to create the service via API, create it manually in the Render UI and choose Docker (it will use the `Dockerfile`).
- For WebSockets ensure the service is a Web Service (Render supports WebSocket connections on Web Services).
