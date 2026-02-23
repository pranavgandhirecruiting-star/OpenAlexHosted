function normalizeSeedLine(line) {
  const t = (line || "").trim();
  if (!t) return "";
  // Auto-capitalize the leading W/w
  if (t[0].toLowerCase() === "w") return "W" + t.slice(1);
  return t;
}

function parseSeeds() {
  return document.getElementById("seeds").value
    .split("\n")
    .map(normalizeSeedLine)
    .filter(Boolean);
}

function getEngGate() {
  return parseInt(document.getElementById("enggate").value, 10);
}

function setStatus(html) {
  document.getElementById("status").innerHTML = html;
}

async function getState() {
  return await chrome.runtime.sendMessage({ type: "GET_STATE" });
}

function renderProgress(st) {
  const prog = st?.progress;
  if (!prog) return "";

  const overall = typeof prog.overall_pct === "number" ? Math.max(0, Math.min(100, prog.overall_pct)) : 0;
  const stage = prog.stage || "";
  const processed = prog.processed ?? "";
  const total = prog.total ?? "";
  const msg = prog.message || "";

  return `
    <div style="margin-top:8px;">
      <div style="font-size:12px;color:#666;">
        <b>${Math.round(overall)}%</b> • ${stage} • ${processed}/${total} • ${msg}
      </div>
      <div style="height:10px;background:#eee;border-radius:999px;overflow:hidden;margin-top:6px;">
        <div style="height:10px;width:${overall}%;background:#111;"></div>
      </div>
    </div>
  `;
}

async function refreshUI() {
  const res = await getState();
  const st = res?.state;

  if (!st) {
    setStatus("Idle. Enter seeds and click Run.");
    return;
  }

  if (st.status === "starting") {
    setStatus(`Starting job…${renderProgress(st)}`);
    return;
  }

  if (st.status === "running" || st.status === "queued") {
    setStatus(`Running…<br/>job_id: <code>${st.jobId || ""}</code>${renderProgress(st)}`);
    return;
  }

  if (st.status === "done") {
    setStatus(`
      Done ✅<br/>
      job_id: <code>${st.jobId}</code><br/><br/>
      <button id="downloadBtn">Download Excel</button>
      ${renderProgress(st)}
    `);

    document.getElementById("downloadBtn").addEventListener("click", async () => {
      const dl = await chrome.runtime.sendMessage({ type: "DOWNLOAD" });
      if (!dl.ok) {
        setStatus(`Done ✅<br/>Download error: ${dl.error}${renderProgress(st)}`);
      } else {
        setStatus(`Done ✅<br/>Download started (id: <b>${dl.downloadId}</b>)${renderProgress(st)}`);
      }
    });
    return;
  }

  if (st.status === "error") {
    setStatus(`Error ❌<br/><pre style="white-space:pre-wrap">${st.error || "unknown error"}</pre>${renderProgress(st)}`);
    return;
  }

  setStatus(`Status: ${st.status}<br/>job_id: <code>${st.jobId || ""}</code>${renderProgress(st)}`);
}

document.getElementById("run").addEventListener("click", async () => {
  const seeds = parseSeeds();
  const engGate = getEngGate();

  if (!seeds.length) {
    setStatus("Please enter at least one seed Work ID (W...)");
    return;
  }

  // OPTIONAL GitHub sniff UI:
  // If you add a checkbox with id="ghsniff" and a password input id="ghtoken",
  // this will pick them up. If not present, it just runs without GitHub sniff.
  const ghSniffEl = document.getElementById("ghsniff");
  const ghTokenEl = document.getElementById("ghtoken");
  const githubSniffEnabled = ghSniffEl ? !!ghSniffEl.checked : false;
  const githubToken = ghTokenEl ? (ghTokenEl.value || "").trim() : "";

  if (githubSniffEnabled && !githubToken) {
    setStatus("GitHub sniff is enabled. Please enter a GitHub PAT.");
    return;
  }

  setStatus("Starting…");

  const resp = await chrome.runtime.sendMessage({
    type: "START_RUN",
    payload: {
      seeds,
      engGate,
      githubSniffEnabled,
      githubToken
    }
  });

  // UI will update via refresh loop
  if (!resp.ok) {
    await refreshUI();
  }
});

// Refresh every second while popup is open
refreshUI();
setInterval(refreshUI, 1000);
