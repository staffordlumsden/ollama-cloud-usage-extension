import { OllamaAuthError, parseOllamaSettings } from "./lib/ollama-parser.js";

const SETTINGS_URL = "https://ollama.com/settings";
const SIGN_IN_URL = "https://ollama.com/signin";
const CACHE_KEY = "ollamaUsageSnapshot";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const MODEL_COLORS = ["#479ac2", "#e69f00", "#7b8d42", "#9a6fbb", "#c9685b", "#5d9584"];

const ui = Object.fromEntries(
  [
    "loading-view", "signed-out-view", "error-view", "usage-view", "refresh-button",
    "sign-in-button", "retry-button", "open-settings-button", "error-message", "username",
    "email", "avatar", "subscription", "session-percent", "session-reset", "session-track",
    "session-fill", "weekly-percent", "weekly-reset", "weekly-track", "weekly-fill",
    "models-list", "models-empty", "request-total", "last-updated", "stale-notice",
  ].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]),
);

let activeSnapshot = null;
let countdownTimer = null;

function show(view) {
  for (const element of [ui.loading_view, ui.signed_out_view, ui.error_view, ui.usage_view]) {
    element.hidden = element !== view;
  }
}

function setBusy(busy) {
  ui.refresh_button.disabled = busy;
  ui.refresh_button.classList.toggle("is-spinning", busy);
}

function clampPercent(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function renderMeter(kind, meter) {
  const value = clampPercent(meter?.percent);
  ui[`${kind}_percent`].textContent = value === null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
  ui[`${kind}_fill`].style.width = `${value ?? 0}%`;
  ui[`${kind}_track`].setAttribute("aria-valuenow", String(value ?? 0));
  ui[`${kind}_track`].setAttribute("aria-valuetext", value === null ? "Unavailable" : `${value}% used`);
}

function timeUntil(iso) {
  if (!iso) return "unavailable";
  const remaining = Date.parse(iso) - Date.now();
  if (!Number.isFinite(remaining)) return "unavailable";
  if (remaining <= 0) return "now";

  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

function updateCountdowns() {
  if (!activeSnapshot) return;
  for (const kind of ["session", "weekly"]) {
    const element = ui[`${kind}_reset`];
    const iso = activeSnapshot[kind]?.resetsAt;
    element.textContent = timeUntil(iso);
    element.title = iso ? new Date(iso).toLocaleString() : "Reset time unavailable";
  }
  const age = Math.max(0, Date.now() - activeSnapshot.fetchedAt);
  if (age < 60_000) ui.last_updated.textContent = "Updated now";
  else if (age < 3_600_000) ui.last_updated.textContent = `Updated ${Math.floor(age / 60_000)}m ago`;
  else ui.last_updated.textContent = `Updated ${Math.floor(age / 3_600_000)}h ago`;
}

function renderModels(models = []) {
  ui.models_list.replaceChildren();
  ui.models_empty.hidden = models.length > 0;
  const total = models.reduce((sum, item) => sum + item.requests, 0);
  ui.request_total.textContent = `${total.toLocaleString()} ${total === 1 ? "request" : "requests"}`;

  models.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "model-row";

    const dot = document.createElement("span");
    dot.className = "model-dot";
    dot.style.setProperty("--dot", MODEL_COLORS[index % MODEL_COLORS.length]);
    dot.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = item.model;
    name.title = item.model;

    const count = document.createElement("span");
    count.className = "model-requests";
    count.textContent = `${item.requests.toLocaleString()} ${item.requests === 1 ? "request" : "requests"}`;

    row.append(dot, name, count);
    ui.models_list.append(row);
  });
}

function renderSnapshot(snapshot, { stale = false, staleReason = "" } = {}) {
  activeSnapshot = snapshot;
  ui.username.textContent = snapshot.username || "Ollama user";
  ui.email.textContent = snapshot.email || "Email unavailable";
  ui.subscription.textContent = snapshot.subscription || "Unknown";
  ui.avatar.textContent = (snapshot.username || snapshot.email || "O").trim().charAt(0).toUpperCase();
  renderMeter("session", snapshot.session);
  renderMeter("weekly", snapshot.weekly);
  renderModels(snapshot.models);

  ui.stale_notice.hidden = !stale;
  ui.stale_notice.textContent = stale
    ? `Showing the last saved result. ${staleReason || "Ollama could not be reached."}`
    : "";

  updateCountdowns();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdowns, 30_000);
  show(ui.usage_view);
}

async function readCache() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const snapshot = result[CACHE_KEY];
  if (!snapshot || !Number.isFinite(snapshot.fetchedAt)) return null;
  if (Date.now() - snapshot.fetchedAt > CACHE_MAX_AGE) {
    await chrome.storage.local.remove(CACHE_KEY);
    return null;
  }
  return snapshot;
}

async function fetchUsage() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(SETTINGS_URL, {
      credentials: "include",
      headers: { Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 429) throw new Error("Ollama is rate limiting requests. Please wait a minute and retry.");
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    if (new URL(response.url).pathname.startsWith("/signin")) throw new OllamaAuthError();

    const html = await response.text();
    const snapshot = { ...parseOllamaSettings(html), fetchedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: snapshot });
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

async function refresh({ showLoader = false } = {}) {
  if (showLoader) show(ui.loading_view);
  setBusy(true);
  try {
    renderSnapshot(await fetchUsage());
  } catch (error) {
    if (error instanceof OllamaAuthError) {
      await chrome.storage.local.remove(CACHE_KEY);
      activeSnapshot = null;
      show(ui.signed_out_view);
      return;
    }

    const cached = await readCache();
    const message = error?.name === "AbortError"
      ? "The request to Ollama timed out."
      : (error?.message || "Ollama did not return usage data.");
    if (cached) {
      renderSnapshot(cached, { stale: true, staleReason: message });
    } else {
      ui.error_message.textContent = message;
      show(ui.error_view);
    }
  } finally {
    setBusy(false);
  }
}

function openUrl(url) {
  chrome.tabs.create({ url });
}

ui.refresh_button.addEventListener("click", () => refresh());
ui.retry_button.addEventListener("click", () => refresh({ showLoader: true }));
ui.sign_in_button.addEventListener("click", () => openUrl(SIGN_IN_URL));
ui.open_settings_button.addEventListener("click", () => openUrl(SETTINGS_URL));

refresh({ showLoader: true });
