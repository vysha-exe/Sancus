const rails = [
  { id: "marqeta", name: "Virtual card", provider: "Marqeta", amount: null, hint: "Creates a sandbox user and card." },
  { id: "pix", name: "Brazil Pix", provider: "PayZu", amount: 10, hint: "Creates a QR charge that auto-completes in the sandbox." },
  { id: "promptpay", name: "PromptPay", provider: "Omise", amount: 100, hint: "Creates a THB PromptPay charge and QR." },
  { id: "qris", name: "Indonesia QRIS", provider: "Midtrans", amount: 25000, hint: "Creates an IDR QRIS charge and simulator link." }
];

const states = Object.fromEntries(rails.map((rail) => [rail.id, { phase: "idle", result: null, configured: false, missing: [] }]));
const grid = document.querySelector("#rail-grid");
const runAll = document.querySelector("#run-all");
const resultTitle = document.querySelector("#result-title");
const resultStatus = document.querySelector("#result-status");
const resultJson = document.querySelector("#result-json");
const artifact = document.querySelector("#artifact");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function statusLabel(state) {
  if (!state.configured) return "NOT CONFIGURED";
  if (state.phase === "idle") return "READY";
  if (state.phase === "loading") return "CALLING API";
  if (state.phase === "error") return "FAILED";
  return String(state.result?.status || "SUCCESS").toUpperCase();
}

function statusClass(state) {
  if (!state.configured) return "unconfigured";
  if (state.phase === "loading") return "loading";
  if (state.phase === "error") return "error";
  if (state.phase === "success") {
    return /pending|require|created/i.test(state.result?.status || "") ? "pending" : "success";
  }
  return "idle";
}

function renderCards() {
  grid.innerHTML = rails.map((rail, index) => {
    const state = states[rail.id];
    const result = state.result;
    const canRefresh = state.phase === "success" && rail.id !== "marqeta" && result?.statusLookupId;
    return `
      <article class="rail-card" data-rail="${rail.id}">
        <div class="rail-top">
          <div>
            <div class="rail-number">0${index + 1} / ${escapeHtml(rail.provider)}</div>
            <h2>${escapeHtml(rail.name)}</h2>
            <p>${escapeHtml(rail.hint)}</p>
          </div>
          <span class="status ${statusClass(state)}">${escapeHtml(statusLabel(state))}</span>
        </div>
        <dl class="rail-meta">
          <dt>PROVIDER ID</dt><dd>${escapeHtml(result?.providerId || "—")}</dd>
          <dt>CONFIG</dt><dd>${state.configured ? "credentials present" : escapeHtml(state.missing.join(", "))}</dd>
        </dl>
        <div class="rail-actions">
          <button data-action="run" data-rail="${rail.id}" ${!state.configured || state.phase === "loading" ? "disabled" : ""}>Run test</button>
          ${canRefresh ? `<button data-action="refresh" data-rail="${rail.id}">Refresh status</button>` : ""}
          ${result?.simulatorUrl ? `<a class="link-button" href="${escapeHtml(result.simulatorUrl)}" target="_blank" rel="noreferrer">Open simulator ↗</a>` : ""}
        </div>
      </article>`;
  }).join("");
}

function inspect(rail) {
  const state = states[rail.id];
  const result = state.result || { configured: state.configured, missing: state.missing };
  resultTitle.textContent = `${rail.name} · ${rail.provider}`;
  resultStatus.textContent = statusLabel(state);
  resultStatus.className = `status ${statusClass(state)}`;
  resultJson.textContent = JSON.stringify(result, null, 2);

  if (result.qrImageUrl) {
    artifact.className = "artifact";
    artifact.innerHTML = `<img src="${escapeHtml(result.qrImageUrl)}" alt="${escapeHtml(rail.name)} sandbox QR"><div><strong>Provider-generated QR</strong>${result.qrPayload ? `<code>${escapeHtml(result.qrPayload)}</code>` : ""}</div>`;
  } else if (result.card?.token) {
    artifact.className = "artifact";
    artifact.innerHTML = `<div><strong>Sandbox card issued</strong><code>token: ${escapeHtml(result.card.token)}${result.card.lastFour ? ` · •••• ${escapeHtml(result.card.lastFour)}` : ""}</code></div>`;
  } else if (state.phase === "error") {
    artifact.className = "artifact";
    artifact.textContent = result.error || "Provider call failed.";
  } else {
    artifact.className = "artifact empty";
    artifact.textContent = "Provider QR or card details will appear here.";
  }
}

async function callApi(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { body });
  return body;
}

async function runRail(id) {
  const rail = rails.find((item) => item.id === id);
  const state = states[id];
  state.phase = "loading";
  state.result = null;
  renderCards();
  inspect(rail);
  try {
    const input = rail.amount == null ? {} : { amount: rail.amount };
    state.result = await callApi(`/api/demo/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    state.phase = "success";
  } catch (error) {
    state.phase = "error";
    state.result = error.body || { ok: false, error: error.message };
  }
  renderCards();
  inspect(rail);
}

async function refreshRail(id) {
  const rail = rails.find((item) => item.id === id);
  const state = states[id];
  const lookupId = state.result?.statusLookupId;
  if (!lookupId) return;
  state.phase = "loading";
  renderCards();
  try {
    state.result = await callApi(`/api/demo/${id}/${encodeURIComponent(lookupId)}/status`);
    state.phase = "success";
  } catch (error) {
    state.phase = "error";
    state.result = error.body || { ok: false, error: error.message };
  }
  renderCards();
  inspect(rail);
}

grid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "run") runRail(button.dataset.rail);
  if (button.dataset.action === "refresh") refreshRail(button.dataset.rail);
});

runAll.addEventListener("click", async () => {
  runAll.disabled = true;
  for (const rail of rails) {
    if (states[rail.id].configured) await runRail(rail.id);
  }
  runAll.disabled = false;
});

async function boot() {
  try {
    const response = await callApi("/api/config");
    for (const rail of rails) Object.assign(states[rail.id], response.rails[rail.id]);
  } catch (error) {
    console.error(error);
  }
  renderCards();
  inspect(rails[0]);
}

boot();
