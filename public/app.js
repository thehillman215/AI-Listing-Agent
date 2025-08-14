const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// NAV
$$(".nav-btn").forEach(btn => btn.addEventListener("click", () => {
  $$(".nav-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const view = btn.dataset.view;
  $$(".view").forEach(v => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  if (view === "history") loadHistory();
  if (view === "billing") loadUsage();
}));
document.querySelector('.nav-btn[data-view="generator"]').classList.add("active");

// Tabs
document.addEventListener("click", (e) => {
  if (e.target.closest(".tabs button")) {
    const btn = e.target.closest(".tabs button");
    $$(".tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $$(".pane").forEach(p => p.classList.remove("active"));
    $("#pane-" + tab).classList.add("active");
  }
});

// Copy / Download
document.addEventListener("click", (e) => {
  const copyId = e.target?.dataset?.copy;
  if (copyId) {
    const el = document.getElementById(copyId);
    let text = "";
    if (el.tagName === "UL") text = Array.from(el.querySelectorAll("li")).map(li => li.textContent).join("\n");
    else text = el.textContent;
    navigator.clipboard.writeText(text);
    e.target.textContent = "Copied!";
    setTimeout(() => e.target.textContent = "Copy", 1200);
  }
  const dl = e.target?.dataset?.download;
  if (dl) {
    let content = "";
    if (dl === "mls") content = $("#out-mls").textContent;
    if (dl === "bullets") content = Array.from($("#out-bullets").children).map(li => li.textContent).join("\n");
    if (dl === "social") content = $("#out-social").textContent;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `listing_${dl}.txt`; a.click();
    URL.revokeObjectURL(url);
  }
});

// Auth modal
const modal = $("#authModal");
$("#btnLogin").addEventListener("click", () => openAuth("login"));
$("#btnLogout").addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  await refreshMe();
});
$("#authToggle").addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  const mode = a.dataset.mode;
  openAuth(mode);
});

$("#authAction").addEventListener("click", async (e) => {
  e.preventDefault();
  const mode = $("#authTitle").textContent.includes("Sign") ? "signup" : "login";
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const url = mode === "signup" ? "/auth/signup" : "/auth/login";
  const r = await fetch(url, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ email, password }) });
  const data = await r.json();
  if (!r.ok) { $("#authError").textContent = data?.error || "Error"; $("#authError").hidden = false; return; }
  modal.close();
  await refreshMe();
});

function openAuth(mode) {
  $("#authTitle").textContent = mode === "signup" ? "Sign up" : "Log in";
  $("#authAction").textContent = mode === "signup" ? "Sign up" : "Log in";
  $("#authToggle").innerHTML = mode === "signup"
    ? 'Have an account? <a href="#" data-mode="login">Log in</a>'
    : 'New here? <a href="#" data-mode="signup">Create account</a>';
  $("#authError").hidden = true;
  modal.showModal();
}

// Generate
$("#generate").addEventListener("click", async () => {
  const payload = collectPayload();
  if (!payload.property.address) { alert("Address is required."); return; }
  $("#status").hidden = false;
  $("#status").textContent = "Composing…";
  $("#results").hidden = true;
  try {
    const r = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (r.status === 402) {
      alert("You need credits to generate. Please purchase a pack and try again.");
      document.querySelector('[data-view="billing"]').click();
      throw new Error("Need credits");
    }
    if (!r.ok) throw new Error("Request failed");
    const data = await r.json();
    renderResults(data);
    $("#results").hidden = false;
    $("#status").hidden = true;
    await refreshCredits();
  } catch (err) {
    console.error(err);
    $("#status").textContent = "We couldn't finish. Please try again.";
  }
});

function collectPayload() {
  const highlights = ($("#highlights").value || "").split(/\n|;|\u2022/).map(s => s.trim()).filter(Boolean);
  const keywords = ($("#keywords").value || "").split(/,|;|\n/).map(s => s.trim()).filter(Boolean);
  return {
    property: {
      address: $("#address").value.trim(),
      type: $("#type").value,
      beds: num($("#beds").value),
      baths: num($("#baths").value),
      sqft: num($("#sqft").value),
      lot_size: num($("#lot").value),
      year_built: num($("#year").value),
      parking: $("#parking").value.trim() || null,
      hoa: $("#hoa").value.trim() || null,
      school_district: $("#school").value.trim() || null
    },
    highlights,
    style: {
      voice: $("#voice").value,
      reading_level: $("#reading").value,
      length: $("#length").value,
      keywords
    },
    compliance: { fair_housing: $("#fh").checked }
  };
}

function renderResults(data) {
  $("#out-mls").textContent = data.description_mls || "";
  const ul = $("#out-bullets"); ul.innerHTML = "";
  (data.bullets || []).forEach(b => { const li = document.createElement("li"); li.textContent = b; ul.appendChild(li); });
  $("#out-social").textContent = data.social_caption || "";
  renderFlags(data.flags || []);
  updateCharCount();
}

function renderFlags(flags) {
  const el = $("#flags");
  if (!flags.length) { el.innerHTML = "<div class='ok'>All clear ✓</div>"; return; }
  el.innerHTML = "<h3>Potential issues</h3>" + flags.map(f =>
    `<div class="flag"><strong>${f.type}</strong>: “${escapeHtml(f.original)}” → <em>${escapeHtml(f.suggest || "")}</em><br><small>${escapeHtml(f.note || "")}</small></div>`
  ).join("");
}

// Character counter for MLS
function updateCharCount() {
  const n = ($("#out-mls").textContent || "").length;
  $("#charCount").textContent = `(${n} chars)`;
}
const observer = new MutationObserver(updateCharCount);
observer.observe($("#out-mls"), { childList: true, characterData: true, subtree: true });

// Billing buttons -> Stripe Checkout (requires login)
document.addEventListener("click", async (e) => {
  const pack = e.target?.dataset?.pack;
  if (!pack) return;
  try {
    const r = await fetch("/billing/checkout", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ pack }) });
    const data = await r.json();
    if (r.status === 401) { openAuth("login"); return; }
    if (!r.ok) throw new Error(data?.error || "Checkout failed");
    window.location.href = data.url;
  } catch (err) {
    alert("Could not start checkout: " + err.message);
  }
});

// HISTORY & USAGE
async function loadHistory() {
  const list = $("#historyList");
  const r = await fetch("/history");
  const data = await r.json();
  if (!Array.isArray(data.items) || data.items.length === 0) { list.innerHTML = "<li>No history yet.</li>"; return; }
  list.innerHTML = data.items.map(it => {
    const d = new Date(it.created_at).toLocaleString();
    const desc = it.output?.description_mls ? it.output.description_mls.slice(0, 140) + "…" : "(no data)";
    return `<li><strong>${d}</strong><br>${escapeHtml(desc)}</li>`;
  }).join("");
}

async function loadUsage() {
  const r = await fetch("/usage");
  if (r.status === 401) { openAuth("login"); return; }
  const { totals, events } = await r.json();
  $("#uJobs").textContent = totals?.jobs ?? 0;
  $("#uTP").textContent = totals?.tp ?? 0;
  $("#uTC").textContent = totals?.tc ?? 0;
  const list = $("#usageEvents");
  if (!Array.isArray(events) || events.length === 0) { list.innerHTML = "<li>No purchases yet.</li>"; return; }
  list.innerHTML = events.map(ev => {
    const d = new Date(ev.created_at).toLocaleString();
    return `<li>${d}: +${ev.credits_added} credits (price: ${ev.stripe_price_id || "n/a"})</li>`;
  }).join("");
}

// ME / CREDITS
async function refreshMe() {
  const r = await fetch("/me"); const data = await r.json();
  $("#meEmail").textContent = data.email || "Guest";
  $("#btnLogin").hidden = !!data.email;
  $("#btnLogout").hidden = !data.email;
  $("#creditsBadge").textContent = "Credits: " + (data.credits ?? "—");
}
async function refreshCredits() {
  const r = await fetch("/credits"); const data = await r.json();
  $("#creditsBadge").textContent = "Credits: " + (data.credits ?? "—");
}

// Utils
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[c])); }

// INIT
refreshMe();


// BRAND PRESETS
$("#savePreset").addEventListener("click", async () => {
  const body = {
    voice: $("#voice").value,
    reading_level: $("#reading").value,
    keywords: ($("#keywords").value || "").split(/,|;|\n/).map(s => s.trim()).filter(Boolean)
  };
  const r = await fetch("/brand", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  if (!r.ok) return alert("Could not save preset");
  alert("Preset saved");
});

$("#applyPreset").addEventListener("click", async () => {
  const r = await fetch("/brand");
  if (r.status === 401) return openAuth("login");
  const { preset } = await r.json();
  if (!preset) return alert("No preset saved yet.");
  if (preset.voice) $("#voice").value = preset.voice;
  if (preset.reading_level) $("#reading").value = preset.reading_level;
  if (preset.keywords) $("#keywords").value = preset.keywords;
  alert("Preset applied");
});

// APPLY REWRITE on flags (event delegation)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-apply-rewrite]");
  if (!btn) return;
  const original = btn.dataset.original;
  const suggest = btn.dataset.suggest || "";
  // Replace in text outputs where present
  const mls = $("#out-mls").textContent;
  const social = $("#out-social").textContent;
  if (original) {
    if (mls.includes(original)) $("#out-mls").textContent = mls.replaceAll(original, suggest);
    if (social.includes(original)) $("#out-social").textContent = social.replaceAll(original, suggest);
    // Bullets
    $$("#out-bullets li").forEach(li => { if (li.textContent.includes(original)) li.textContent = li.textContent.replaceAll(original, suggest); });
  }
});

// Enhance flags renderer to include Apply buttons
const _renderFlags = renderFlags;
renderFlags = function(flags) {
  const el = $("#flags");
  if (!flags.length) { el.innerHTML = "<div class='ok'>All clear ✓</div>"; return; }
  el.innerHTML = "<h3>Potential issues</h3>" + flags.map(f => {
    const btn = `<button class="mini" data-apply-rewrite data-original="${escapeHtml(f.original||'')}" data-suggest="${escapeHtml(f.suggest||'')}">Apply rewrite</button>`;
    return `<div class="flag"><strong>${f.type}</strong>: "${escapeHtml(f.original)}" → <em>${escapeHtml(f.suggest || "")}</em> ${btn}<br><small>${escapeHtml(f.note || "")}</small></div>`;
  }).join("");
};

// EMAIL & PDF
$("#btnPdf").addEventListener("click", async () => {
  const body = currentPackagePayload();
  const r = await fetch("/export/pdf", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  if (!r.ok) return alert("Could not build PDF");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "listing_package.pdf"; a.click();
  URL.revokeObjectURL(url);
});

$("#btnEmail").addEventListener("click", async () => {
  const body = currentPackagePayload();
  const r = await fetch("/email", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) return alert(data?.error || "Email failed (configure RESEND_API_KEY and SENDER_EMAIL).");
  alert("Emailed!");
});

function currentPackagePayload() {
  return {
    property: {
      address: $("#address").value.trim()
    },
    outputs: {
      description_mls: $("#out-mls").textContent,
      bullets: Array.from($("#out-bullets").children).map(li => li.textContent),
      social_caption: $("#out-social").textContent
    }
  };
}

// ONBOARDING CHECKLIST
const onboard = document.createElement("div");
onboard.id = "onboard";
onboard.innerHTML = `<div class="card">
  <button class="close" id="onboardClose">✕</button>
  <h3>Welcome! Quick checklist</h3>
  <ul>
    <li>✅ Create an account (Log in → Sign up)</li>
    <li>✅ Get your free credits</li>
    <li>⬜ Generate your first listing</li>
    <li>⬜ Buy a credit pack (optional)</li>
  </ul>
  <button id="onboardHide" class="mini">Got it</button>
</div>`;
document.body.appendChild(onboard);
$("#onboardClose").addEventListener("click", () => onboard.style.display = "none");
$("#onboardHide").addEventListener("click", () => { localStorage.setItem("onboarded", "1"); onboard.style.display = "none"; });

async function maybeShowOnboarding() {
  const r = await fetch("/me"); const me = await r.json();
  if (!localStorage.getItem("onboarded")) {
    onboard.style.display = "flex";
  }
}
maybeShowOnboarding();

async function ensureSandbox() {
  const r = await fetch("/mls/providers"); const data = await r.json();
  return Array.isArray(data.providers) && data.providers.find(p => p.id === "sandbox");
}
document.getElementById("mlsNumber") && (document.getElementById("mlsNumber").value = localStorage.getItem("lastMLS") || "TEST123");
document.getElementById("mlsNumber") && document.getElementById("mlsNumber").addEventListener("change", (e) => localStorage.setItem("lastMLS", e.target.value));
document.getElementById("btnPrefill") && document.getElementById("btnPrefill").addEventListener("click", async () => {
  try {
    const prov = await ensureSandbox();
    if (!prov) return alert("MLS Sandbox is disabled. Set MLS_SANDBOX_ENABLED=true");
    if (!prov.connected) {
      const c = await fetch("/mls/connect", { method: "POST" });
      if (!c.ok) return alert("Could not connect MLS Sandbox");
    }
    const mls = (document.getElementById("mlsNumber").value || "TEST123").trim();
    const r = await fetch("/mls/fetch", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ mls_number: mls })
    });
    const data = await r.json();
    if (!r.ok) return alert(data?.error || "MLS fetch failed");
    const rec = data.record || {};
    document.getElementById("address").value = rec.address || "";
    document.getElementById("type").value = "Single-family";
    document.getElementById("beds").value = rec.beds ?? "";
    document.getElementById("baths").value = rec.baths ?? "";
    document.getElementById("sqft").value = rec.sqft ?? "";
    document.getElementById("lot").value = rec.lot_size ?? "";
    document.getElementById("year").value = rec.year_built ?? "";
    document.getElementById("parking").value = rec.parking || "";
    document.getElementById("hoa").value = rec.hoa || "";
    document.getElementById("school").value = rec.school_district || "";
    const hl = (rec.highlights || []).join("; ");
    if (hl) {
      const curr = document.getElementById("highlights").value || "";
      document.getElementById("highlights").value = curr ? (curr + "\n" + hl) : hl;
    }
    alert("Prefilled from MLS Sandbox");
  } catch (e) { alert("Prefill failed"); }
});
