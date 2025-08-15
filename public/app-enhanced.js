const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Global state
let currentUser = null;
let currentSubscription = null;
let currentVariations = null;
let currentJobId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  refreshMe();
  loadTemplates();
  loadBrands();
  setupEventListeners();
});

// NAV
$$(".nav-btn").forEach(btn => btn.addEventListener("click", (e) => {
  const view = btn.dataset.view;
  
  // Check Pro features
  if (['batch', 'analytics'].includes(view) && currentSubscription?.plan !== 'pro') {
    alert('This feature requires a Pro subscription. Please upgrade to access.');
    document.querySelector('[data-view="billing"]').click();
    return;
  }
  
  $$(".nav-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  $$(".view").forEach(v => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  
  // Load data for specific views
  if (view === "history") loadHistory();
  if (view === "billing") loadUsage();
  if (view === "templates") loadTemplates();
  if (view === "brands") loadBrands();
  if (view === "batch") loadBatchJobs();
  if (view === "analytics") loadAnalytics();
}));

document.querySelector('.nav-btn[data-view="generator"]').classList.add("active");

// Enhanced Authentication
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
  if (!r.ok) { 
    $("#authError").textContent = data?.error || "Error"; 
    $("#authError").hidden = false; 
    return; 
  }
  $("#authModal").close();
  await refreshMe();
});

function openAuth(mode) {
  $("#authTitle").textContent = mode === "signup" ? "Sign up" : "Log in";
  $("#authAction").textContent = mode === "signup" ? "Sign up" : "Log in";
  $("#authToggle").innerHTML = mode === "signup"
    ? 'Have an account? <a href="#" data-mode="login">Log in</a>'
    : 'New here? <a href="#" data-mode="signup">Create account</a>';
  $("#authError").hidden = true;
  $("#authModal").showModal();
}

async function refreshMe() {
  const r = await fetch("/me");
  const data = await r.json();
  currentUser = data.email;
  currentSubscription = data.subscription;
  
  $("#meEmail").textContent = currentUser || "Guest";
  $("#creditsBadge").textContent = `Credits: ${data.credits ?? "—"}`;
  
  if (currentUser) {
    $("#btnLogin").hidden = true;
    $("#btnLogout").hidden = false;
    $("#planBadge").textContent = currentSubscription?.plan?.toUpperCase() || "BASIC";
    $("#planBadge").style.display = "inline";
    
    // Show analytics tab for Pro users
    if (currentSubscription?.analytics_access) {
      $("#analyticsTab").style.display = "inline-block";
    }
  } else {
    $("#btnLogin").hidden = false;
    $("#btnLogout").hidden = true;
    $("#planBadge").style.display = "none";
    $("#analyticsTab").style.display = "none";
  }
  
  updateSubscriptionUI();
}

function updateSubscriptionUI() {
  if (!currentSubscription) return;
  
  const isBasic = currentSubscription.plan === 'basic';
  const isPro = currentSubscription.plan === 'pro';
  
  $("#selectBasic").disabled = isBasic;
  $("#selectBasic").textContent = isBasic ? "Current Plan" : "Downgrade to Basic";
  $("#selectBasic").className = isBasic ? "current-plan" : "downgrade-plan";
  
  $("#selectPro").disabled = isPro;
  $("#selectPro").textContent = isPro ? "Current Plan" : "Upgrade to Pro";
  $("#selectPro").className = isPro ? "current-plan" : "upgrade-plan";
}

// Enhanced Generation with variations
$("#generate").addEventListener("click", async () => {
  if (!currentUser) {
    alert("Please log in to generate listings");
    openAuth("login");
    return;
  }
  
  const payload = collectPayload();
  if (!payload.property.address) { 
    alert("Address is required."); 
    return; 
  }
  
  const variations = parseInt($("#variationCount").value) || 1;
  const creditsNeeded = variations;
  
  if (currentUser) {
    const meData = await fetch("/me").then(r => r.json());
    if (meData.credits < creditsNeeded) {
      alert(`You need ${creditsNeeded} credits to generate ${variations} variation(s). You have ${meData.credits}.`);
      document.querySelector('[data-view="billing"]').click();
      return;
    }
  }
  
  $("#status").hidden = false;
  $("#status").textContent = `Generating ${variations} variation(s)...`;
  $("#results").hidden = true;
  
  try {
    payload.variations = variations;
    payload.template_id = $("#templateSelect").value || null;
    
    const r = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (r.status === 402) {
      const error = await r.json();
      alert(error.error);
      document.querySelector('[data-view="billing"]').click();
      return;
    }
    
    if (!r.ok) throw new Error("Request failed");
    
    const data = await r.json();
    currentVariations = data.variations || [data];
    currentJobId = data.jobId;
    
    renderResults(data);
    setupVariationSelector();
    $("#results").hidden = false;
    $("#status").hidden = true;
    $("#feedback").style.display = currentUser ? "block" : "none";
    
    await refreshMe(); // Update credits
  } catch (err) {
    console.error(err);
    $("#status").textContent = "Generation failed. Please try again.";
  }
});

function collectPayload() {
  const highlights = ($("#highlights").value || "").split(/\n|;|\u2022/).map(s => s.trim()).filter(Boolean);
  const keywords = ($("#keywords").value || "").split(/,|;|\n/).map(s => s.trim()).filter(Boolean);
  
  return {
    property: {
      address: $("#address").value.trim(),
      type: $("#type").value,
      beds: parseInt($("#beds").value) || null,
      baths: parseFloat($("#baths").value) || null,
      sqft: parseInt($("#sqft").value) || null,
      lot_size: parseFloat($("#lot").value) || null,
      year_built: parseInt($("#year").value) || null,
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
    compliance: {
      fair_housing: $("#fh").checked
    }
  };
}

function setupVariationSelector() {
  if (!currentVariations || currentVariations.length <= 1) {
    $("#variationSelector").style.display = "none";
    return;
  }
  
  $("#variationSelector").style.display = "block";
  const select = $("#currentVariation");
  select.innerHTML = "";
  
  currentVariations.forEach((_, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = `Variation ${index + 1}`;
    select.appendChild(option);
  });
  
  select.addEventListener("change", () => {
    const variation = currentVariations[parseInt(select.value)];
    displayVariation(variation);
  });
}

function displayVariation(variation) {
  $("#out-mls").textContent = variation.description_mls;
  $("#charCount").textContent = `(${variation.description_mls.length} chars)`;
  
  $("#out-bullets").innerHTML = "";
  (variation.bullets || []).forEach(bullet => {
    const li = document.createElement("li");
    li.textContent = bullet;
    $("#out-bullets").appendChild(li);
  });
  
  $("#out-social").textContent = variation.social_caption;
  
  // Display flags
  const flagsDiv = $("#flags");
  flagsDiv.innerHTML = "";
  if (variation.flags && variation.flags.length > 0) {
    const title = document.createElement("h3");
    title.textContent = "Fair Housing Review:";
    flagsDiv.appendChild(title);
    
    variation.flags.forEach(flag => {
      const div = document.createElement("div");
      div.className = "flag";
      div.innerHTML = `<strong>${flag.type}:</strong> "${flag.original}" → <em>Suggestion:</em> ${flag.suggest}`;
      flagsDiv.appendChild(div);
    });
  }
}

function renderResults(data) {
  displayVariation(data.variations ? data.variations[0] : data);
}

// Templates Management
async function loadTemplates() {
  if (!currentUser) return;
  
  try {
    const r = await fetch("/templates");
    const data = await r.json();
    renderTemplates(data.templates || []);
    populateTemplateSelect(data.templates || []);
  } catch (err) {
    console.error("Failed to load templates:", err);
  }
}

function renderTemplates(templates) {
  const container = $("#templatesList");
  container.innerHTML = "";
  
  if (templates.length === 0) {
    container.innerHTML = "<p class='muted'>No templates yet. Create your first template!</p>";
    return;
  }
  
  templates.forEach(template => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <h4>${template.name}</h4>
      <p class="muted">${template.property_type} • Used ${template.usage_count} times</p>
      <p>${template.description || 'No description'}</p>
      <div class="card-actions">
        <button onclick="useTemplate('${template.id}')">Use Template</button>
        <button onclick="editTemplate('${template.id}')" class="secondary">Edit</button>
        ${template.user_email === currentUser ? `<button onclick="deleteTemplate('${template.id}')" class="danger">Delete</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function populateTemplateSelect(templates) {
  const select = $("#templateSelect");
  const currentValue = select.value;
  select.innerHTML = '<option value="">No template</option>';
  
  templates.forEach(template => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = `${template.name} (${template.property_type})`;
    select.appendChild(option);
  });
  
  select.value = currentValue;
}

// Brand Management
async function loadBrands() {
  if (!currentUser) return;
  
  try {
    const r = await fetch("/brands");
    const data = await r.json();
    renderBrands(data.presets || []);
    populateBrandSelect(data.presets || []);
  } catch (err) {
    console.error("Failed to load brands:", err);
  }
}

function renderBrands(brands) {
  const container = $("#brandsList");
  container.innerHTML = "";
  
  if (brands.length === 0) {
    container.innerHTML = "<p class='muted'>No brand presets yet. Create your first brand!</p>";
    return;
  }
  
  brands.forEach(brand => {
    const card = document.createElement("div");
    card.className = "brand-card";
    card.innerHTML = `
      <h4>${brand.name} ${brand.is_default ? '(Default)' : ''}</h4>
      <p class="muted">${brand.company_name || 'No company'} • ${brand.voice} voice</p>
      <p>${brand.specializations || 'General real estate'}</p>
      <div class="card-actions">
        <button onclick="useBrand('${brand.id}')">Use Brand</button>
        <button onclick="editBrand('${brand.id}')" class="secondary">Edit</button>
        <button onclick="deleteBrand('${brand.id}')" class="danger">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function populateBrandSelect(brands) {
  const select = $("#brandPresetSelect");
  const currentValue = select.value;
  select.innerHTML = '<option value="">Default brand</option>';
  
  brands.forEach(brand => {
    const option = document.createElement("option");
    option.value = brand.id;
    option.textContent = `${brand.name}${brand.is_default ? ' (Default)' : ''}`;
    select.appendChild(option);
  });
  
  select.value = currentValue;
}

// Batch Processing
async function loadBatchJobs() {
  if (!currentUser) return;
  
  try {
    const r = await fetch("/batch");
    const data = await r.json();
    renderBatchJobs(data.jobs || []);
  } catch (err) {
    console.error("Failed to load batch jobs:", err);
  }
}

function renderBatchJobs(jobs) {
  const container = $("#batchJobs");
  container.innerHTML = "";
  
  if (jobs.length === 0) {
    container.innerHTML = "<p class='muted'>No batch jobs yet.</p>";
    return;
  }
  
  jobs.forEach(job => {
    const div = document.createElement("div");
    div.className = "batch-job";
    div.innerHTML = `
      <div class="job-header">
        <h4>Batch Job ${job.id.substr(-8)}</h4>
        <span class="status ${job.status}">${job.status}</span>
      </div>
      <div class="progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(job.completed / job.total) * 100}%"></div>
        </div>
        <span>${job.completed}/${job.total} completed</span>
      </div>
      <div class="job-actions">
        <button onclick="viewBatchJob('${job.id}')">View Details</button>
        <small>${new Date(job.created_at).toLocaleDateString()}</small>
      </div>
    `;
    container.appendChild(div);
  });
}

// Analytics
async function loadAnalytics() {
  if (!currentUser) return;
  
  try {
    const r = await fetch("/analytics");
    const data = await r.json();
    renderAnalytics(data);
  } catch (err) {
    console.error("Failed to load analytics:", err);
  }
}

function renderAnalytics(data) {
  const container = $("#analyticsContent");
  container.innerHTML = `
    <div class="analytics-cards">
      <div class="metric-card">
        <h3>Generation History</h3>
        <div class="metric">${data.generationHistory?.length || 0}</div>
        <p class="muted">Total generations</p>
      </div>
      <div class="metric-card">
        <h3>Average Rating</h3>
        <div class="metric">${(data.feedbackStats?.avg_rating || 0).toFixed(1)}</div>
        <p class="muted">Out of 5 stars</p>
      </div>
      <div class="metric-card">
        <h3>Templates Created</h3>
        <div class="metric">${data.templateUsage?.length || 0}</div>
        <p class="muted">Active templates</p>
      </div>
    </div>
    <div class="analytics-charts">
      <div class="chart-section">
        <h3>Monthly Usage</h3>
        <div class="simple-chart">
          ${data.monthlyUsage?.map(month => `
            <div class="chart-bar">
              <div class="bar" style="height: ${Math.min(month.generations * 10, 100)}px;"></div>
              <span class="chart-label">${month.month}</span>
            </div>
          `).join('') || '<p class="muted">No data yet</p>'}
        </div>
      </div>
    </div>
  `;
}

// Event Listeners Setup
function setupEventListeners() {
  // Template actions
  $("#createTemplate").addEventListener("click", () => openTemplateModal());
  $("#saveAsTemplate").addEventListener("click", () => saveAsTemplate());
  
  // Brand actions
  $("#createBrand").addEventListener("click", () => openBrandModal());
  $("#manageBrands").addEventListener("click", () => {
    document.querySelector('[data-view="brands"]').click();
  });
  
  // Batch upload
  $("#uploadBatch").addEventListener("click", () => {
    $("#batchFileInput").click();
  });
  
  $("#batchFileInput").addEventListener("change", handleBatchUpload);
  
  // Feedback
  setupFeedbackHandlers();
  
  // Subscription management
  $("#selectPro").addEventListener("click", upgradeToPro);
  
  // Copy/Download handlers (existing)
  document.addEventListener("click", handleCopyDownload);
  
  // Tab switching (existing)
  document.addEventListener("click", handleTabSwitch);
}

function setupFeedbackHandlers() {
  $$(".rating span").forEach(star => {
    star.addEventListener("click", () => {
      const rating = parseInt(star.dataset.rating);
      $$(".rating span").forEach((s, index) => {
        s.style.opacity = index < rating ? "1" : "0.3";
      });
      star.dataset.selectedRating = rating;
    });
  });
  
  $("#submitFeedback").addEventListener("click", async () => {
    const rating = document.querySelector(".rating span[data-selected-rating]")?.dataset.selectedRating;
    const feedback = $("#feedbackText").value;
    
    if (!rating || !currentJobId) return;
    
    try {
      await fetch("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: currentJobId, rating: parseInt(rating), feedback })
      });
      
      $("#feedback").style.display = "none";
      alert("Thank you for your feedback!");
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  });
}

// Copy/Download handlers
function handleCopyDownload(e) {
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
    a.href = url; 
    a.download = `listing_${dl}.txt`; 
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Tab switching
function handleTabSwitch(e) {
  if (e.target.closest(".tabs button")) {
    const btn = e.target.closest(".tabs button");
    $$(".tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $$(".pane").forEach(p => p.classList.remove("active"));
    $("#pane-" + tab).classList.add("active");
  }
}

// Modal functions (implement these based on your UI needs)
function openTemplateModal(template = null) {
  // Implementation for template modal
  $("#templateModal").showModal();
}

function openBrandModal(brand = null) {
  // Implementation for brand modal
  $("#brandModal").showModal();
}

function saveAsTemplate() {
  const payload = collectPayload();
  const name = prompt("Template name:");
  if (!name) return;
  
  const templateData = {
    name,
    property_type: payload.property.type,
    description: `Template for ${payload.property.type} properties`,
    template_data: payload
  };
  
  fetch("/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(templateData)
  }).then(() => {
    alert("Template saved!");
    loadTemplates();
  }).catch(err => {
    console.error("Failed to save template:", err);
  });
}

async function upgradeToPro() {
  try {
    const r = await fetch("/subscription/upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro" })
    });
    
    if (r.ok) {
      await refreshMe();
      alert("Upgraded to Pro! You now have access to all Pro features.");
    } else {
      alert("Upgrade failed. Please try again.");
    }
  } catch (err) {
    console.error("Upgrade failed:", err);
  }
}

// Utility functions for batch processing
function handleBatchUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let properties;
      
      if (file.type === 'application/json') {
        properties = JSON.parse(e.target.result);
      } else {
        // Simple CSV parsing
        const lines = e.target.result.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        properties = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const property = {};
          headers.forEach((header, index) => {
            property[header] = values[index];
          });
          return { property };
        });
      }
      
      processBatchUpload(properties);
    } catch (err) {
      alert("Failed to parse file. Please check the format.");
      console.error(err);
    }
  };
  
  reader.readAsText(file);
}

async function processBatchUpload(properties) {
  if (!properties || properties.length === 0) {
    alert("No valid properties found in file");
    return;
  }
  
  if (properties.length > 50) {
    alert("Maximum 50 properties per batch");
    return;
  }
  
  try {
    const r = await fetch("/batch/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ properties })
    });
    
    const data = await r.json();
    
    if (r.ok) {
      alert(`Batch processing started! Job ID: ${data.batchId}`);
      loadBatchJobs();
    } else {
      alert(data.error || "Batch processing failed");
    }
  } catch (err) {
    console.error("Batch processing failed:", err);
    alert("Batch processing failed. Please try again.");
  }
}

// Legacy functions for existing features
async function loadHistory() {
  if (!currentUser) return;
  
  try {
    const r = await fetch("/history");
    const data = await r.json();
    const list = $("#historyList");
    list.innerHTML = "";
    
    if (data.items?.length === 0) {
      list.innerHTML = '<li class="muted">No history yet.</li>';
      return;
    }
    
    data.items?.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${new Date(item.created_at).toLocaleDateString()}</strong>
        <br>
        ${item.output?.description_mls?.substring(0, 100)}...
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load history:", err);
  }
}

async function loadUsage() {
  if (!currentUser) return;
  
  try {
    const r = await fetch("/usage");
    const data = await r.json();
    
    $("#uJobs").textContent = data.totals?.jobs || 0;
    $("#uTP").textContent = data.totals?.tp || 0;
    $("#uTC").textContent = data.totals?.tc || 0;
    
    const eventsList = $("#usageEvents");
    eventsList.innerHTML = "";
    
    data.events?.forEach(event => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>+${event.credits_added} credits</strong> 
        ${new Date(event.created_at).toLocaleDateString()}
      `;
      eventsList.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load usage:", err);
  }
}