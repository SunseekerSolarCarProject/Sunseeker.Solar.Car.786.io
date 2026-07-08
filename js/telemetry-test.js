// Public read endpoints from the cagedmotion telemetry API.
// This test page uses a specific database day so old sample data is easier to inspect.
const HISTORY_URL =
  "https://cagedmotion.com/ingest-api/run_wsgi.py/api/telemetry/history?limit=500&date=2026-07-06"; //or &hour=24
const LATEST_URL =
  "https://cagedmotion.com/ingest-api/run_wsgi.py/api/telemetry/latest";

// Page elements that receive the connection status, response metadata, and point list.
const statusEl = document.getElementById("telemetryStatus");
const metaEl = document.getElementById("telemetryMeta");
const listEl = document.getElementById("telemetryList");
const refreshButton = document.getElementById("telemetryRefresh");

// Keep null/blank telemetry fields readable in the UI.
function formatValue(value, fallback = "--") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return value;
}

// The history endpoint should return points, but this accepts a few older shapes too.
function getTelemetryRecords(data) {
  return data.points || data.events || data.samples || data.history || [];
}

// Show the server-side sampling/window information returned with history responses.
function renderTelemetryMeta(data) {
  const window = data.window || {};
  metaEl.innerHTML = `
    <div>
      <dt>Window</dt>
      <dd>${formatValue(window.label)}</dd>
    </div>
    <div>
      <dt>Start</dt>
      <dd>${formatValue(window.start)}</dd>
    </div>
    <div>
      <dt>End</dt>
      <dd>${formatValue(window.end)}</dd>
    </div>
    <div>
      <dt>Total rows</dt>
      <dd>${formatValue(data.total_rows)}</dd>
    </div>
    <div>
      <dt>Returned</dt>
      <dd>${formatValue(data.returned)}</dd>
    </div>
    <div>
      <dt>Limit</dt>
      <dd>${formatValue(data.limit)}</dd>
    </div>
  `;
}

// Render each public telemetry DTO as a simple list item.
function renderTelemetryList(records, sourceLabel) {
  listEl.innerHTML = "";

  if (!records.length) {
    statusEl.textContent = `Connected to ${sourceLabel}, but no telemetry points were returned for this window.`;
    return;
  }

  statusEl.textContent = `Loaded ${records.length} telemetry point(s) from ${sourceLabel}.`;

  records.forEach((record, index) => {
    const position = record.position || record;
    const speed = record.speed || record;
    const battery = record.battery || {};
    const telemetry = record.telemetry || {};
    const timestamp = record.timestamp || record.received_at || record.sample_time;

    const item = document.createElement("li");
    item.className = "telemetry-list-item";
    item.innerHTML = `
      <strong>#${index + 1}</strong>
      <span>Time: ${formatValue(timestamp)}</span>
      <span>Lat: ${formatValue(position.lat)}</span>
      <span>Lon: ${formatValue(position.lon)}</span>
      <span>Speed: ${formatValue(speed.vehicle_mph || speed.gps_mph)} mph</span>
      <span>Battery: ${formatValue(battery.soc_pct)}%</span>
      <span>Status: ${formatValue(telemetry.status || record.status)}</span>
    `;
    listEl.appendChild(item);
  });
}

// Fetch JSON and turn HTTP errors into exceptions so fallback handling can run.
async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Try full history first. If it is unavailable, fall back to the latest single point.
async function loadTelemetry() {
  statusEl.textContent = "Loading telemetry...";
  metaEl.innerHTML = "";
  listEl.innerHTML = "";
  refreshButton.disabled = true;

  try {
    const historyData = await fetchJson(HISTORY_URL);
    renderTelemetryMeta(historyData);
    renderTelemetryList(getTelemetryRecords(historyData), "history endpoint");
  } catch (historyError) {
    try {
      const latestData = await fetchJson(LATEST_URL);
      renderTelemetryList(latestData.latest ? [latestData.latest] : [], "latest endpoint");
    } catch (latestError) {
      statusEl.textContent =
        "Unable to load telemetry. Check the cagedmotion API route and allowed origin/CORS settings.";
    }
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadTelemetry);
loadTelemetry();
