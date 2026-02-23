// background.js (MV3 service worker)
//
// Responsibilities:
// - Keep a persisted "state" so the UI survives panel close/reopen
// - Start a backend run via POST /run
// - Poll backend /status/<job_id> until done/error
// - Trigger download via /download/<job_id>

// ⚙️  BACKEND URL — set this to your Railway deployment URL
const API_BASE = "https://YOUR-RAILWAY-APP.up.railway.app";

const DEFAULT_STATE = {
  status: "idle",   // "idle" | "starting" | "running" | "done" | "error"
  jobId: null,
  error: null,
  progress: null,   // { stage, processed, total, stage_pct, overall_pct, message }
};

async function getState() {
  const data = await chrome.storage.local.get(["state"]);
  return data.state || { ...DEFAULT_STATE };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

async function startRun(payload) {
  // payload: { seeds: string[], engGate: number, githubSniffEnabled: bool, githubToken: string }
  await setState({ status: "starting", jobId: null, error: null, progress: null });

  const res = await fetch(`${API_BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seed_work_ids: payload.seeds,
      eng_gate_min_score: payload.engGate,
      github_sniff_enabled: !!payload.githubSniffEnabled,
      github_token: payload.githubSniffEnabled ? (payload.githubToken || null) : null
      // everything else uses backend defaults unless you add UI controls
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    await setState({ status: "error", error: txt || `HTTP ${res.status}` });
    return { ok: false, error: txt || `HTTP ${res.status}` };
  }

  const data = await res.json();
  const jobId = data.job_id;

  if (!jobId) {
    await setState({ status: "error", error: "Backend did not return job_id." });
    return { ok: false, error: "Backend did not return job_id." };
  }

  await setState({ status: "running", jobId, error: null, progress: null });
  return { ok: true, jobId };
}

async function pollOnce() {
  const st = await getState();
  if (!st.jobId || (st.status !== "running" && st.status !== "starting")) {
    return;
  }

  const res = await fetch(`${API_BASE}/status/${encodeURIComponent(st.jobId)}`);
  if (!res.ok) {
    const txt = await res.text();
    await setState({ status: "error", error: txt || `HTTP ${res.status}` });
    return;
  }

  const data = await res.json();

  // Save progress
  await setState({ progress: data.progress || null });

  if (data.status === "done") {
    await setState({ status: "done", error: null });
    return;
  }

  if (data.status === "error") {
    await setState({ status: "error", error: data.error || "Unknown backend error" });
    return;
  }

  // still running
  await setState({ status: data.status || "running" });
}

async function downloadLatest() {
  const st = await getState();
  if (!st.jobId) {
    return { ok: false, error: "No jobId available. Run a search first." };
  }

  const url = `${API_BASE}/download/${encodeURIComponent(st.jobId)}`;

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: `openalex_candidates_${st.jobId}.xlsx`,
      saveAs: true,
    });
    return { ok: true, downloadId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Side panel setup
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setOptions({
    path: "panel.html",
    enabled: true,
  });

  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  });

  // Initialize state
  await chrome.storage.local.set({ state: { ...DEFAULT_STATE } });
});

// Poll while extension is alive
setInterval(() => { pollOnce(); }, 1000);

// Message bridge for panel.js / popup.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) {
      sendResponse({ ok: false, error: "Missing message type" });
      return;
    }

    if (msg.type === "GET_STATE") {
      const state = await getState();
      sendResponse({ ok: true, state });
      return;
    }

    if (msg.type === "START_RUN") {
      const payload = msg.payload || {};
      const seeds = payload.seeds || [];
      const engGate = Number.isFinite(payload.engGate) ? payload.engGate : 8;

      if (!Array.isArray(seeds) || seeds.length === 0) {
        sendResponse({ ok: false, error: "No seeds provided" });
        return;
      }

      const resp = await startRun({
        seeds,
        engGate,
        githubSniffEnabled: !!payload.githubSniffEnabled,
        githubToken: payload.githubToken || ""
      });
      sendResponse(resp);
      return;
    }

    if (msg.type === "DOWNLOAD") {
      const resp = await downloadLatest();
      sendResponse(resp);
      return;
    }

    sendResponse({ ok: false, error: `Unknown type: ${msg.type}` });
  })();

  // Keep the message channel open for async response
  return true;
});
