# OpenAlex Author Finder — Setup & Sharing Guide

A Chrome extension that discovers ML engineering candidates from academic literature.
Give this guide (and the `chrome-extension/` folder) to anyone you want to try it out.

---

## For the person sharing this tool (you, Pranav)

### Step 1 — Deploy the backend to Railway

> You already have a Railway account and a project running. This goes in the same account.

1. Go to [railway.app](https://railway.app) and open your dashboard.

2. Click **New Project → Deploy from GitHub repo** (or **Empty Project** if you prefer manual deploy).

   **If using GitHub:**
   - Push the `backend/` folder to a new GitHub repo (or a subfolder of an existing one).
   - In Railway, connect that repo. Railway will auto-detect the `Dockerfile`.

   **If deploying manually (no GitHub needed):**
   - Install the Railway CLI: `npm install -g @railway/cli`
   - In your terminal:
     ```bash
     cd backend/
     railway login
     railway init        # name it "openalex-backend" or similar
     railway up
     ```

3. After deploy, click your service → **Settings → Networking → Generate Domain**.
   You'll get a URL like: `https://openalex-backend-production.up.railway.app`

4. Add one environment variable in Railway:
   - **Variable name:** `OPENALEX_EMAIL`
   - **Value:** `your.email@example.com`
   *(This gets you into OpenAlex's polite pool for 10x rate limits.)*

5. Open the deployed URL in your browser. You should see: `{"ok":true}`

### Step 2 — Update the extension with your Railway URL

Open `chrome-extension/background.js` and replace line 6:

```js
// Change this:
const API_BASE = "https://YOUR-RAILWAY-APP.up.railway.app";

// To your actual URL, e.g.:
const API_BASE = "https://openalex-backend-production.up.railway.app";
```

Save the file.

### Step 3 — Zip and share the extension

```bash
cd chrome-extension/
zip -r openalex-author-finder.zip . -x "*.DS_Store"
```

Share `openalex-author-finder.zip` with your hiring manager (or anyone).
Point them to the **"For the person receiving this tool"** section below.

---

## For the person receiving this tool (e.g., the hiring manager)

Hi! Below are the steps to install this Chrome extension on your machine.
It takes about 3 minutes. No coding required.

### Step 1 — Unzip the extension

Unzip `openalex-author-finder.zip` somewhere permanent on your computer
(e.g., `~/Documents/openalex-extension/`). Don't delete this folder — Chrome needs it to stay.

### Step 2 — Load the extension in Chrome

1. Open Chrome and go to: **chrome://extensions**
2. In the top-right, toggle **Developer mode** ON.
3. Click **Load unpacked**.
4. Select the folder you unzipped in Step 1.
5. The **OpenAlex Author Finder** extension will appear in your list with an "OA" icon.
6. Pin it to your toolbar: click the puzzle piece icon (🧩) → pin OpenAlex Author Finder.

### Step 3 — Find a seed paper on OpenAlex

1. Go to [openalex.org](https://openalex.org)
2. Search for a foundational paper in ML infrastructure, distributed training, or whatever domain you're recruiting for. For example, search: `"Megatron-LM"` or `"PyTorch distributed"`
3. Click on the paper. Look at the URL — it ends with a Work ID like `W4318541647`
4. Copy that ID (just the `W...` part)

### Step 4 — Run a search

1. Click the **OA** icon in your Chrome toolbar to open the side panel.
2. Paste your Work ID(s) into the **Seed Work IDs** box (one per line).
3. Set **Min Eng Gate Score**:
   - `0` = include everyone (broad)
   - `5–8` = decent industry signal filter
   - `10+` = strict (fewer, stronger candidates)
4. *(Optional)* Enable the **GitHub sniff test** for industry activity signals — see below.
5. Click **Run Search**.
6. Wait for the progress bar to complete (typically 2–8 minutes depending on seed size).
7. Click **Download XLSX** to get your results spreadsheet.

### Understanding the XLSX output

Each row is an author who cited your seed paper(s). Columns include:

| Column | What it means |
|---|---|
| `AUTHOR NAME` | Clickable — links to a Google search for that person |
| `AUTHOR SCORE` | Overall relevance score (higher = more systems/infra signal) |
| `BUCKET COVERAGE` | How many of 6 skill dimensions appeared in their work |
| `INFRA PROD HITS` | Papers about training/inference infra, MLOps, deployment |
| `ML FRAMEWORKS HITS` | PyTorch, JAX, XLA, custom ops, compiler work |
| `MATH OPTIMIZATION HITS` | Gradient methods, numerical optimization |
| `GITHUB INDUSTRY SIGNAL` | 0–10 score from GitHub profile sniff (if enabled) |
| `LINKEDIN XRAY` | Pre-built Google X-ray search to find their LinkedIn |
| `ENG GATE SCORE` | Raw engineering signal score used to filter |

---

## Optional: GitHub Sniff Test

The GitHub sniff test checks each candidate's GitHub profile for signals that they work in
industry (not just academia): company affiliation, active repos, contributions to ML orgs
(pytorch, nvidia, openai, etc.), follower count, and recent activity.

To enable it, you need a free **GitHub Personal Access Token (PAT)**.

### How to create a GitHub PAT

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
   *(You'll need a free GitHub account — sign up at github.com if you don't have one)*

2. Click **Generate new token → Generate new token (classic)**

3. Give it a name like `openalex-sniff`

4. Set **Expiration** to `90 days` (or No expiration if you prefer)

5. Under **Scopes**, check only:
   - ✅ `read:user`
   - ✅ `public_repo`

6. Scroll down and click **Generate token**

7. **Copy the token immediately** — GitHub only shows it once.
   It starts with `github_pat_` or `ghp_`

8. Back in the extension, check **GitHub sniff test** and paste your token.

> **Privacy note:** Your token is only sent to the backend server for this search.
> It is not stored anywhere permanently.

---

## Troubleshooting

**"Error" immediately after clicking Run Search**
- The backend may be sleeping (Railway free tier spins down). Wait 30 seconds and try again.
- Check the URL in `background.js` is correct.

**Progress bar stuck at 0% for a long time**
- Normal for large seeds — the pipeline is fetching citing papers. Give it a minute.

**Downloaded XLSX is empty / all candidates filtered**
- Lower the Min Eng Gate Score to `0` and try again.
- Try a more specific seed paper (foundational systems/infra papers work best).

**Extension not appearing after Load Unpacked**
- Make sure you selected the folder *containing* `manifest.json`, not a parent folder.

---

## Architecture (for the curious)

```
Chrome Extension (side panel UI)
        ↓ POST /run
Railway Backend (FastAPI)
        ↓
pipeline.py → OpenAlex API + GitHub API
        ↓
XLSX → downloaded via /download/<job_id>
```
