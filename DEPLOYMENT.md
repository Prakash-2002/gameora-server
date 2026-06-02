# Deploying Gameora Multiplayer Server

This guide explains how to host the Gameora Socket.io multiplayer server (`/server`) on **Render.com** (a free cloud platform that supports web service hosting with WebSockets).

---

## Option 1: Live Cloud Hosting (Render.com)

Render allows you to deploy Node.js apps directly from a GitHub repository for free.

### Step 1: Create a GitHub Repository
1. Initialize a Git repository in your project folder (if not already done).
2. Commit your code.
3. Push it to a new private or public repository on GitHub (e.g., `github.com/yourusername/gameora`).

### Step 2: Create a Web Service on Render
1. Sign up for a free account at [Render.com](https://render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your `gameora` repository.

### Step 3: Configure Build & Deploy Settings
Set the following options in the Render setup page:
- **Name**: `gameora-server` (or any name you prefer)
- **Region**: Select the region closest to you and your players
- **Branch**: `main` (or whichever branch contains your server code)
- **Root Directory**: `server` *(Important: Since the server code is located inside the `/server` folder, setting this ensures Render only builds that directory)*
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Instance Type**: `Free`

### Step 4: Add Environment Variables
Under the **Environment** section, Render automatically sets the `PORT` variable (typically `10000`). If you wish to specify one, you can, but Render's dynamic port assignment will work automatically because our `server/src/index.ts` has:
```typescript
const PORT = process.env.PORT || 3000;
```

### Step 5: Get Your URL
Once the deploy is complete (usually 1-2 minutes), Render will display a public HTTPS URL (e.g., `https://gameora-server.onrender.com`).
Copy this URL and update `DEFAULT_LIVE_SERVER_URL` in `src/hooks/useOnlineGame.ts` to point to it!

> [!NOTE]
> On the **Free Tier**, Render puts Web Services to sleep after 15 minutes of inactivity. When the first player tries to connect, the server will take 30-50 seconds to spin back up, after which it will respond instantly.

---

## Option 2: Live Local Tunneling (For Fast Testing)

If you want to play with friends immediately without deploying to a cloud host, you can expose your local server (running on port `3000`) using a tunnel:

### Method A: Pinggy (Zero Installation)
Simply run this command in a new Command Prompt or PowerShell terminal window on your computer while your local server is running (`npm run dev`):
```bash
ssh -p 443 -R0:localhost:3000 a.pinggy.io
```
It will print a public URL like `https://rxxxx.pinggy.link`. You and your friends can input this URL directly into the app's manual connection field to connect!

### Method B: Localtunnel
If you have Node.js installed globally, run:
```bash
npx localtunnel --port 3000
```
This will print a public URL like `https://lucky-cats-cry.localtunnel.me` which you can paste into the app.
