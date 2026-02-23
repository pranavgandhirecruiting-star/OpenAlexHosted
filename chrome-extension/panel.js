const runBtn = document.getElementById("run");
const dlBtn = document.getElementById("download");
const seedsEl = document.getElementById("seeds");
const engGateEl = document.getElementById("enggate");
const statusText = document.getElementById("statusText");
const statusMeta = document.getElementById("statusMeta");
const bar = document.getElementById("bar");
const progressLine = document.getElementById("progressLine");

const ghSniffEl = document.getElementById("ghsniff");
const ghTokenWrap = document.getElementById("ghTokenWrap");
const ghTokenEl = document.getElementById("ghtoken");

let startedAt = null;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pct(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return clamp(n, 0, 100);
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function normalizeSeedLine(line) {
  const t = (line || "").trim();
  if (!t) return "";
  // Auto-capitalize the leading W/w
  if (t[0].toLowerCase() === "w") {
    return "W" + t.slice(1);
  }
  return t;
}

function setRunningUI(isRunning) {
  runBtn.disabled = isRunning;
}

function renderState(state) {
  const st = state?.status || "idle";
  const jobId = state?.jobId || null;
  const err = state?.error || null;

  const prog = state?.progress || null;
  const overallPct = prog ? pct(prog.overall_pct) : 0;
  const stage = prog?.stage || "";
  const processed = prog?.processed ?? null;
  const total = prog?.total ?? null;
  const msg = prog?.message || "";

  if (bar) bar.style.width = `${overallPct}%`;

  if (progressLine) {
    if (prog && processed != null && total != null) {
      progressLine.textContent = `${Math.round(overallPct)}% • ${stage} • ${processed}/${total} • ${msg}`;
    } else {
      progressLine.textContent = "";
    }
  }

  if (st === "idle") {
    setRunningUI(false);
    statusText.textContent = "Idle.";
    statusMeta.textContent = "";
    dlBtn.style.display = "none";
    if (bar) bar.style.width = "0%";
    if (progressLine) progressLine.textContent = "";
    return;
  }

  if (st === "starting") {
    setRunningUI(true);
    statusText.textContent = "Starting search…";
    statusMeta.textContent = startedAt ? `Elapsed: ${formatElapsed(Date.now() - startedAt)}` : "";
    dlBtn.style.display = "none";
    return;
  }

  if (st === "running") {
    setRunningUI(true);
    statusText.textContent = "Running…";
    const metaParts = [];
    if (startedAt) metaParts.push(`Elapsed: ${formatElapsed(Date.now() - startedAt)}`);
    if (jobId) metaParts.push(`Job: ${jobId.slice(0, 8)}…`);
    statusMeta.textContent = metaParts.join(" • ");
    dlBtn.style.display = "none";
    return;
  }

  if (st === "done") {
    setRunningUI(false);
    statusText.textContent = "Done. Ready to download.";
    statusMeta.textContent = jobId ? `Job: ${jobId}` : "";
    if (bar) bar.style.width = "100%";
    dlBtn.style.display = "block";
    return;
  }

  if (st === "error") {
    setRunningUI(false);
    statusText.textContent = "Error.";
    statusMeta.textContent = err ? String(err).slice(0, 240) : "Unknown error";
    dlBtn.style.display = "none";
    return;
  }

  setRunningUI(false);
  statusText.textContent = `Status: ${st}`;
  statusMeta.textContent = "";
  dlBtn.style.display = "none";
}

async function refreshState() {
  const resp = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (resp?.ok) renderState(resp.state);
}

ghSniffEl.addEventListener("change", () => {
  if (ghSniffEl.checked) {
    ghTokenWrap.classList.remove("hidden");
  } else {
    ghTokenWrap.classList.add("hidden");
    ghTokenEl.value = "";
  }
});

runBtn.addEventListener("click", async () => {
  const seeds = seedsEl.value
    .split("\n")
    .map(normalizeSeedLine)
    .filter(Boolean);

  const engGate = parseInt(engGateEl.value, 10);

  const githubSniffEnabled = !!ghSniffEl.checked;
  const githubToken = githubSniffEnabled ? (ghTokenEl.value || "") : "";

  if (githubSniffEnabled && !githubToken.trim()) {
    alert("GitHub sniff test is enabled. Please enter a GitHub PAT.");
    return;
  }

  startedAt = Date.now();
  renderState({ status: "starting", jobId: null, error: null, progress: null });

  const resp = await chrome.runtime.sendMessage({
    type: "START_RUN",
    payload: {
      seeds,
      engGate,
      githubSniffEnabled,
      githubToken
    }
  });

  if (!resp?.ok) {
    renderState({ status: "error", error: resp?.error || "Unknown error" });
    return;
  }

  await refreshState();
});

// download
dlBtn.addEventListener("click", async () => {
  const resp = await chrome.runtime.sendMessage({ type: "DOWNLOAD" });
  if (!resp?.ok) {
    alert(resp?.error || "Download failed");
  }
});

// Keep the UI updating even if the user doesn’t interact
setInterval(refreshState, 1000);

// initial paint
refreshState();
