# Render Selenium Hub (Selenium Standalone Chrome)

Render Web Services route traffic to `$PORT`. The official `selenium/standalone-chrome` image listens on `4444`.

This wrapper keeps Selenium running normally on `4444` and adds a small TCP forwarder (socat) that listens on `$PORT`
and forwards to `127.0.0.1:4444`, so the service is reachable on the public Render URL.

## Deploy on Render

1. Create a new Web Service
2. Choose **Deploy from GitHub repo**
3. Root directory: `render/selenium`
4. Environment: Docker
5. Deploy

## Health check

- `https://<your-render-service>.onrender.com/status`
- `https://<your-render-service>.onrender.com/wd/hub/status`
- `https://<your-render-service>.onrender.com/ui/`

## Use from Nexus (Vercel or local)

Set:

- `ENABLE_SKOOL_PASSWORD_LOGIN=true`
- `USE_SELENIUM_GRID=true`
- `SELENIUM_HUB_URL=https://<your-render-service>.onrender.com/wd/hub`

