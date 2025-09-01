# King Chu Bridge — Render Deployment

This repo deploys a realtime Bridge game using **Node + Express + Socket.IO** on Render.

## Folder layout
- `server.js` — Express + Socket.IO server
- `package.json` — Node app metadata and scripts
- `public/` — Static client (your `index.html`, `client_patch.js`, and assets)

## Quick Deploy (Dashboard)
1. Push these files to a **public GitHub repo**.
2. Go to **Render** → **New** → **Web Service**.
3. Connect your repo and choose the branch (usually `main`).
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **Create Web Service**. After the build, your app is live at `https://<your-app>.onrender.com`.

> Socket.IO works on Render with no extra config. The server listens on `process.env.PORT` automatically.

## Alternative: Blueprint Deploy (render.yaml)
1. Commit the provided `render.yaml` to your repo.
2. On Render: **New** → **Blueprint** → select your repo.
3. Confirm settings and deploy.

## Local test
```bash
npm install
npm start
# open http://localhost:3000
```

## Notes
- Free tier may **sleep** when idle (cold start on first hit).
- Server state is **in-memory**; for persistence, pair with Redis/DB later.
- Share your live URL with friends; each table syncs in real-time via WebSockets.
