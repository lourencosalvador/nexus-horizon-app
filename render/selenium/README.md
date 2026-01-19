# Render Selenium Hub (Selenium Standalone Chrome)

Render Web Services route traffic to `$PORT`. The official `selenium/standalone-chrome` image listens on:

- Selenium (WebDriver + UI): `4444`
- noVNC: `7900`

This wrapper keeps Selenium running normally and adds a small **nginx reverse-proxy** that listens on `$PORT` and routes:

- `/` → `127.0.0.1:4444`
- `/vnc/` → `127.0.0.1:7900` (websocket)

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
- noVNC: `https://<your-render-service>.onrender.com/vnc/`

## Cold start (Render free plan)

On Render free instances, the service may **hibernate** after inactivity. When it wakes up, Selenium can take ~30–90s to become ready.
During this time, Nexus may return a fast `503` like:

- `Selenium hub is not ready yet (cold start/hibernation)...`

To reduce this:

- Use a paid Render plan (no hibernation), or
- Keep it warm with a cron ping:
  - Call `GET /api/health/selenium-warmup` every 5 minutes (use any external monitor/cron).

## Use from Nexus (any hosting)

Set:

- `ENABLE_SKOOL_PASSWORD_LOGIN=true`
- `USE_SELENIUM_GRID=true`
- `SELENIUM_HUB_URL=https://<your-render-service>.onrender.com/wd/hub`

Optional (recommended for the interactive captcha fallback):

- `SELENIUM_VNC_URL=https://<your-render-service>.onrender.com/vnc/?token=<token>`
- `SELENIUM_VNC_TOKEN=<token>` (nginx will require the `token` query param for `/vnc/`)

Security note: exposing noVNC publicly is sensitive. Use a long random token and treat it like a password.

