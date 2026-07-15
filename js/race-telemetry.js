"use strict";

/*
 * Public race telemetry controller
 * --------------------------------
 * This script chooses the correct display for testing, FSGP, or ASC based on
 * Central Time. It loads live telemetry, slows FSGP polling when the car is
 * stationary, builds ASC history routes, and calculates route mileage.
 */

// API, polling, and history-response settings.
const TELEMETRY_API = "https://cagedmotion.com/ingest-api/run_wsgi.py/api/telemetry";
const HISTORY_LIVE_LIMIT = 10000;
// The final ASC request asks for 10,000, the API caps it at 10,000.
const HISTORY_FINAL_LIMIT = 10000;
const LIVE_REFRESH_MS = 30000;
const HISTORY_REFRESH_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 2 * 60 * 1000;
const FSGP_IDLE_SPEED_MPH = 0.5;
const FSGP_IDLE_AFTER_MS = 10 * 60 * 1000;
const FSGP_IDLE_CHECK_MS = 5 * 60 * 1000;
const DEFAULT_MAP_CENTER = [42.2917, -85.5872];
const DRIVER_PHOTO_DIRECTORY = "images/drivers";
const DRIVER_PHOTO_EXTENSIONS = ["jpg", "png", "webp", "jpeg"];

// Most photos need no configuration: "Jane Doe" becomes jane-doe.jpg. Add an
// override only when the database name and desired filename cannot match.
const DRIVER_PHOTO_OVERRIDES = {
  // "Jane Doe": "jane-racing.jpg"
};

// Event dates and ASC driving hours are interpreted in the race's local time.
const RACE_TIME_ZONE = "America/Chicago";
const FSGP_FIRST_DAY = "2026-07-21";
const FSGP_LAST_DAY = "2026-07-23";
const ASC_FIRST_DAY = "2026-07-25";
const ASC_LAST_DAY = "2026-08-01";
const DRIVE_START = "09:00";
const DRIVE_END = "18:00";
const DRIVE_START_MINUTES = 9 * 60;
const DRIVE_END_MINUTES = 18 * 60;

// Cache page elements once so later functions can update them efficiently.
const elements = {
  trackerHeading: document.getElementById("trackerHeading"),
  trackerDescription: document.getElementById("trackerDescription"),
  ascSchedule: document.getElementById("ascSchedule"),
  liveStatus: document.getElementById("telemetryStatus"),
  liveMeta: document.getElementById("trackingMeta"),
  liveRefresh: document.getElementById("trackingRefresh"),
  dayProgressPanel: document.getElementById("dayProgressPanel"),
  dayProgressLabel: document.getElementById("dayProgressLabel"),
  dayProgressValue: document.getElementById("dayProgressValue"),
  dayProgressTrack: document.getElementById("dayProgressTrack"),
  mileagePanel: document.getElementById("mileagePanel"),
  routeMileage: document.getElementById("routeMileage"),
  routeMileageNote: document.getElementById("routeMileageNote"),
  historyForm: document.getElementById("historyForm"),
  historyPanel: document.getElementById("historyPanel"),
  historyMode: document.getElementById("historyMode"),
  historyDate: document.getElementById("historyDate"),
  historyStart: document.getElementById("historyStart"),
  historyEnd: document.getElementById("historyEnd"),
  historyHours: document.getElementById("historyHours"),
  dayFields: document.getElementById("dayFields"),
  hourFields: document.getElementById("hourFields"),
  historySubmit: document.getElementById("historySubmit"),
  historyStatus: document.getElementById("historyStatus"),
  historyMeta: document.getElementById("historyMeta")
};

// Leaflet map and OpenStreetMap background tiles.
const map = L.map("solarMap", { scrollWheelZoom: false }).setView(DEFAULT_MAP_CENTER, 8);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const routeLayer = L.layerGroup().addTo(map);

// State shared between refreshes. The route layer is separate from the live marker.
let liveMarker = null;
let historyLoading = false;
let automaticallyLoadedDate = null;
let automaticallyLoadedPhase = null;
let fsgpStationarySince = null;
let lastLiveRequestAt = 0;
const driverPhotoCache = new Map();

// Return the date and time in Central Time regardless of the visitor's time zone.
function raceTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RACE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

// Determine whether the current ASC day is before, inside, or after its drive window.
// FSGP uses all-day telemetry, so it is identified here but has no hourly phase.
function raceWindow(date = new Date()) {
  const parts = raceTimeParts(date);
  const isFsgpDay = parts.date >= FSGP_FIRST_DAY && parts.date <= FSGP_LAST_DAY;
  const isAscDay = parts.date >= ASC_FIRST_DAY && parts.date <= ASC_LAST_DAY;
  const isEventDay = isAscDay;
  const startMinutes = DRIVE_START_MINUTES;
  const endMinutes = DRIVE_END_MINUTES;
  let phase = "outside";

  if (isEventDay && parts.minutes < startMinutes) phase = "before";
  if (isEventDay && parts.minutes >= startMinutes && parts.minutes < endMinutes) phase = "driving";
  if (isEventDay && parts.minutes >= endMinutes) phase = "charging";

  return {
    ...parts,
    isFsgpDay,
    isAscDay,
    isEventDay,
    startMinutes,
    endMinutes,
    phase
  };
}

// Convert minute-of-day values such as 540 into "9:00 AM".
function formatScheduleTime(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

// Convert a Central-Time wall clock value into an exact Date for local display.
// The short adjustment loop accounts for CST/CDT without hard-coding an offset.
function dateAtRaceTime(dateValue, minutes) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = desiredWallTime;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const displayed = raceTimeParts(new Date(timestamp));
    const [displayYear, displayMonth, displayDay] = displayed.date.split("-").map(Number);
    const displayedWallTime = Date.UTC(
      displayYear,
      displayMonth - 1,
      displayDay,
      Math.floor(displayed.minutes / 60),
      displayed.minutes % 60
    );
    timestamp += desiredWallTime - displayedWallTime;
  }

  return new Date(timestamp);
}

// Central Time remains authoritative; visitors outside that zone also see their time.
function formatRaceTimeForViewer(dateValue, minutes) {
  const centralTime = formatScheduleTime(minutes);
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!viewerTimeZone || viewerTimeZone === RACE_TIME_ZONE) {
    return `${centralTime} Central Time`;
  }

  const localTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(dateAtRaceTime(dateValue, minutes));
  return `${centralTime} Central Time (${localTime} for you)`;
}

// Format a daily schedule once in Central Time and once in the viewer's local zone.
function formatRaceRangeForViewer(dateValue, startMinutes, endMinutes) {
  const centralRange = `${formatScheduleTime(startMinutes)}–${formatScheduleTime(endMinutes)} Central Time`;
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!viewerTimeZone || viewerTimeZone === RACE_TIME_ZONE) return centralRange;

  const localFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
  const localStart = localFormatter.format(dateAtRaceTime(dateValue, startMinutes));
  const localEnd = localFormatter.format(dateAtRaceTime(dateValue, endMinutes));
  return `${centralRange} (${localStart}–${localEnd} for you)`;
}

// Centralized event switch. Update these date constants to change what the UI shows.
function currentEvent(date = new Date()) {
  const { date: raceDate } = raceTimeParts(date);

  if (raceDate >= FSGP_FIRST_DAY && raceDate <= FSGP_LAST_DAY) {
    return { type: "fsgp", name: "Formula Sun Grand Prix" };
  }

  if (raceDate >= ASC_FIRST_DAY && raceDate <= ASC_LAST_DAY) {
    return { type: "asc", name: "American Solar Challenge" };
  }

  return { type: "testing", name: "Vehicle Testing" };
}

// Formatting helpers keep null API fields from breaking or cluttering the display.
function formatValue(value, suffix = "") {
  return value === null || value === undefined || value === ""
    ? "Unavailable"
    : `${value}${suffix}`;
}

function formatNumber(value, digits = 1, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}${suffix}` : "Unavailable";
}

// Accept lap durations as milliseconds, seconds, or an already formatted value.
// Generic numeric values above 10,000 are treated as milliseconds because an
// FSGP lap will not realistically take that many seconds.
function formatLapTime(value, unit = "auto") {
  if (value === null || value === undefined || value === "") return "Unavailable";

  if (typeof value === "string" && value.includes(":")) return value;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return "Unavailable";

  const totalSeconds = unit === "milliseconds" || (unit === "auto" && numericValue >= 10000)
    ? numericValue / 1000
    : numericValue;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsText = seconds.toFixed(1).padStart(4, "0");

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secondsText}`
    : `${minutes}:${secondsText}`;
}

// Read the common lap-time key variants used by telemetry producers.
function raceLapTime(race, name) {
  const lapTimes = race.lap_times || {};
  const millisecondValue = race[`${name}_lap_time_ms`] ?? lapTimes[`${name}_ms`];
  if (millisecondValue !== null && millisecondValue !== undefined) {
    return formatLapTime(millisecondValue, "milliseconds");
  }

  const secondValue = race[`${name}_lap_time_seconds`] ?? race[`${name}_lap_time_s`] ??
    lapTimes[`${name}_seconds`] ?? lapTimes[`${name}_s`];
  if (secondValue !== null && secondValue !== undefined) {
    return formatLapTime(secondValue, "seconds");
  }

  const genericValue = race[`${name}_lap_time`] ?? lapTimes[name];
  return formatLapTime(genericValue);
}

// API timestamps currently omit a time-zone suffix; telemetry.timestamp is UTC.
function parseApiTimestamp(value) {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function recordDate(record) {
  return parseApiTimestamp(record.timestamp) || parseApiTimestamp(record.received_at);
}

function formatTimestamp(record) {
  const date = recordDate(record);
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date)
    : "Unavailable";
}

// Reject missing, invalid, and 0,0 GPS positions before mapping or calculating miles.
function hasValidPosition(record) {
  const position = record && record.position;
  const lat = Number(position && position.lat);
  const lon = Number(position && position.lon);

  return Boolean(
    position &&
    position.gps_valid &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

// Apply both the message and its visual state class (online, warning, stale, etc.).
function setStatus(element, message, state) {
  element.textContent = message;
  element.className = element === elements.liveStatus
    ? `tracker-status is-${state}`
    : `history-status is-${state}`;
}

// Build one definition-list card without inserting untrusted API data as HTML.
function addSummaryItem(container, label, value) {
  const item = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  item.append(term, description);
  container.appendChild(item);
}

// Turn the database name into a predictable, URL-safe photo filename.
function driverPhotoSlug(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function driverInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function driverPhotoCandidates(name) {
  const override = DRIVER_PHOTO_OVERRIDES[name];
  if (override) return [`${DRIVER_PHOTO_DIRECTORY}/${encodeURIComponent(override)}`];

  const slug = driverPhotoSlug(name);
  return slug
    ? DRIVER_PHOTO_EXTENSIONS.map((extension) => `${DRIVER_PHOTO_DIRECTORY}/${slug}.${extension}`)
    : [];
}

// Render the current driver prominently and fall back to initials until a
// matching photo is added to images/drivers.
function addDriverSummaryItem(container, driverValue) {
  const hasDriver = typeof driverValue === "string" && driverValue.trim() !== "";
  const driverName = hasDriver ? driverValue.trim() : "Not assigned";
  const item = document.createElement("div");
  const portrait = document.createElement("div");
  const fallback = document.createElement("span");
  const text = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  item.className = "driver-summary";
  portrait.className = "driver-portrait";
  fallback.className = "driver-initials";
  fallback.textContent = hasDriver ? driverInitials(driverName) : "—";
  fallback.setAttribute("aria-hidden", "true");
  term.textContent = "Current driver";
  description.textContent = driverName;
  text.append(term, description);
  portrait.appendChild(fallback);
  item.append(portrait, text);
  container.appendChild(item);

  if (!hasDriver) return;

  const cachedPhoto = driverPhotoCache.get(driverName);
  if (cachedPhoto === false) return;

  const candidates = cachedPhoto ? [cachedPhoto] : driverPhotoCandidates(driverName);
  if (!candidates.length) return;

  const image = document.createElement("img");
  let candidateIndex = 0;
  image.alt = "";
  image.hidden = true;
  image.addEventListener("load", () => {
    driverPhotoCache.set(driverName, candidates[candidateIndex]);
    image.hidden = false;
    portrait.classList.add("has-photo");
  });
  image.addEventListener("error", () => {
    candidateIndex += 1;
    if (candidateIndex < candidates.length) {
      image.src = candidates[candidateIndex];
      return;
    }
    driverPhotoCache.set(driverName, false);
    image.remove();
  });
  portrait.appendChild(image);
  image.src = candidates[candidateIndex];
}

// Cache-busting prevents the public tracker from receiving an old proxy response.
async function fetchJson(url) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`);

  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "The telemetry service returned an error");
  return data;
}

// Create the live marker once, then move the existing marker on later refreshes.
function updateLiveMarker(telemetry) {
  if (!hasValidPosition(telemetry)) return;

  const point = [Number(telemetry.position.lat), Number(telemetry.position.lon)];
  const popup = `Latest valid position<br>${formatTimestamp(telemetry)}`;

  if (!liveMarker) {
    liveMarker = L.marker(point).addTo(map).bindPopup(popup);
  } else {
    liveMarker.setLatLng(point).setPopupContent(popup);
  }

  if (!routeLayer.getLayers().length) map.setView(point, 13);
}

// Render common live fields, plus FSGP-only lap fields during July 21–23.
function renderLatest(telemetry) {
  const timestamp = recordDate(telemetry);
  const age = timestamp ? Math.max(0, Date.now() - timestamp.getTime()) : Infinity;
  const fresh = age <= STALE_AFTER_MS;
  const gpsValid = hasValidPosition(telemetry);
  const speed = telemetry.speed && (telemetry.speed.vehicle_mph ?? telemetry.speed.gps_mph);
  const numericSpeed = Number(speed);

  // FSGP backs off to five-minute checks after ten stationary minutes.
  if (currentEvent().type === "fsgp") {
    if (Number.isFinite(numericSpeed) && numericSpeed > FSGP_IDLE_SPEED_MPH) {
      fsgpStationarySince = null;
    } else if (fsgpStationarySince === null) {
      fsgpStationarySince = Date.now();
    }
  } else {
    fsgpStationarySince = null;
  }

  elements.liveMeta.replaceChildren();
  addDriverSummaryItem(elements.liveMeta, telemetry.driver);
  addSummaryItem(elements.liveMeta, "Vehicle", formatValue(telemetry.vehicle_year));
  addSummaryItem(elements.liveMeta, "Last update", formatTimestamp(telemetry));
  addSummaryItem(elements.liveMeta, "Speed", formatNumber(speed, 1, " mph"));
  addSummaryItem(elements.liveMeta, "Battery", formatNumber(telemetry.battery && telemetry.battery.soc_pct, 1, "%"));
  addSummaryItem(elements.liveMeta, "GPS", gpsValid ? "Valid fix" : "No valid fix");
  addSummaryItem(elements.liveMeta, "Position", gpsValid
    ? `${Number(telemetry.position.lat).toFixed(5)}, ${Number(telemetry.position.lon).toFixed(5)}`
    : "Unavailable");

  // Lap information is useful at FSGP but not needed in the ASC route display.
  if (currentEvent().type === "fsgp") {
    const race = telemetry.race || {};
    addSummaryItem(elements.liveMeta, "Lap count", formatValue(race.lap_count));
    addSummaryItem(elements.liveMeta, "Lap status", formatValue(race.lap_status));
    addSummaryItem(elements.liveMeta, "Current lap time", raceLapTime(race, "current"));
    addSummaryItem(elements.liveMeta, "Latest lap time", raceLapTime(race, "latest"));
    addSummaryItem(elements.liveMeta, "Last lap time", raceLapTime(race, "last"));
    addSummaryItem(elements.liveMeta, "Best lap time", raceLapTime(race, "best"));
    addSummaryItem(elements.liveMeta, "Average lap time", raceLapTime(race, "average"));
  }

  const window = raceWindow();

  if (window.phase === "charging") {
    setStatus(elements.liveStatus, "Today’s scheduled driving window is complete. Live telemetry updates are paused.", "stale");
  } else if (window.phase === "before") {
    setStatus(elements.liveStatus, `Today’s live telemetry begins at ${formatScheduleTime(window.startMinutes)} Central.`, "loading");
  } else if (!fresh) {
    setStatus(elements.liveStatus, "Telemetry connected, but the latest vehicle update is stale.", "stale");
  } else if (!gpsValid) {
    setStatus(elements.liveStatus, "Vehicle telemetry is current, but GPS does not have a valid fix.", "warning");
  } else {
    setStatus(elements.liveStatus, "Vehicle telemetry is online and GPS is valid.", "online");
  }

  if (
    currentEvent().type === "fsgp" &&
    fsgpStationarySince !== null &&
    Date.now() - fsgpStationarySince >= FSGP_IDLE_AFTER_MS
  ) {
    setStatus(elements.liveStatus, "The car is stationary. Frequent live updates are paused; movement checks continue every five minutes.", "stale");
  }

  updateLiveMarker(telemetry);
}

// Fetch a single latest record and convert request errors into a public status.
async function loadLatest() {
  lastLiveRequestAt = Date.now();
  elements.liveRefresh.disabled = true;
  setStatus(elements.liveStatus, "Loading the latest vehicle telemetry…", "loading");

  try {
    const data = await fetchJson(`${TELEMETRY_API}/latest`);
    if (!data.latest) throw new Error("No latest telemetry record was returned");
    renderLatest(data.latest);
  } catch (error) {
    console.error(error);
    const window = raceWindow();
    if (window.phase === "charging") {
      setStatus(elements.liveStatus, "Live updates are paused for charging. Today’s completed driving progress and route remain displayed.", "stale");
    } else {
      setStatus(elements.liveStatus, "Live telemetry is unavailable. Please try again shortly.", "offline");
    }
  } finally {
    elements.liveRefresh.disabled = false;
  }
}

// Filter a full API date response using Central-Time clock values.
function filterDayByTime(points, selectedDate, start, end) {
  return points.filter((point) => {
    const timestamp = recordDate(point);
    if (!timestamp) return false;
    const raceTime = raceTimeParts(timestamp);
    if (raceTime.date !== selectedDate) return false;
    return start <= end
      ? raceTime.time >= start && raceTime.time <= end
      : raceTime.time >= start || raceTime.time <= end;
  });
}

// The server currently returns a 24-hour window, so shorter hour choices are filtered here.
function filterRecentHours(points, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return points.filter((point) => {
    const timestamp = recordDate(point);
    return timestamp && timestamp.getTime() >= cutoff;
  });
}

// Great-circle distance between consecutive GPS positions.
function haversineMiles(first, second) {
  const radiusMiles = 3958.8;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(Number(first.position.lat));
  const lat2 = toRadians(Number(second.position.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(Number(second.position.lon) - Number(first.position.lon));
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sum every segment in the selected route to estimate total traveled mileage.
function routeDistance(points) {
  return points.slice(1).reduce((total, point, index) => total + haversineMiles(points[index], point), 0);
}

// Populate technical history totals. This panel remains hidden from the public layout.
function renderHistoryMeta(data, receivedPoints, selectedPoints, validPoints) {
  elements.historyMeta.replaceChildren();
  addSummaryItem(elements.historyMeta, "API window", data.window && data.window.label ? data.window.label : "Unavailable");
  addSummaryItem(elements.historyMeta, "Rows received", `${receivedPoints.length} of ${data.total_rows ?? receivedPoints.length}`);
  addSummaryItem(elements.historyMeta, "Rows in selection", String(selectedPoints.length));
  addSummaryItem(elements.historyMeta, "Valid GPS points", String(validPoints.length));
  addSummaryItem(elements.historyMeta, "Estimated route", validPoints.length > 1
    ? `${routeDistance(validPoints).toFixed(1)} miles`
    : "Unavailable");
}

// Replace the old route with a polyline and start/end markers.
function drawRoute(points) {
  routeLayer.clearLayers();
  if (!points.length) return;

  const latLngs = points.map((point) => [Number(point.position.lat), Number(point.position.lon)]);
  const line = L.polyline(latLngs, { color: "#4a2e2a", weight: 5, opacity: 0.9 }).addTo(routeLayer);

  L.circleMarker(latLngs[0], {
    radius: 7,
    color: "#ffffff",
    weight: 2,
    fillColor: "#16803c",
    fillOpacity: 1
  }).addTo(routeLayer).bindPopup(`Route start<br>${formatTimestamp(points[0])}`);

  if (points.length > 1) {
    L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#b42318",
      fillOpacity: 1
    }).addTo(routeLayer).bindPopup(`Route end<br>${formatTimestamp(points[points.length - 1])}`);
  }

  map.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 15 });
}

// Construct either a date-history or recent-hours API request.
function historyUrl(limit = HISTORY_LIVE_LIMIT) {
  const params = new URLSearchParams({ limit: String(limit) });

  if (elements.historyMode.value === "day") {
    if (!elements.historyDate.value) throw new Error("Choose a travel date");
    if (elements.historyStart.value > elements.historyEnd.value) {
      throw new Error("For a travel day, the end time must be after the start time");
    }
    params.set("date", elements.historyDate.value);
  } else {
    const hours = Number(elements.historyHours.value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      throw new Error("Recent hours must be a whole number from 1 to 24");
    }
    params.set("hour", String(hours));
  }

  return `${TELEMETRY_API}/history?${params}`;
}

// Load, filter, sort, map, and summarize one telemetry-history response.
async function loadHistory(event, limit = HISTORY_LIVE_LIMIT) {
  if (event) event.preventDefault();
  if (historyLoading) return false;
  historyLoading = true;
  let succeeded = false;
  elements.historySubmit.disabled = true;
  elements.historyMeta.replaceChildren();
  setStatus(elements.historyStatus, "Loading travel history…", "loading");

  try {
    const data = await fetchJson(historyUrl(limit));
    const allPoints = Array.isArray(data.points) ? data.points : [];
    const selectedPoints = elements.historyMode.value === "day"
      ? filterDayByTime(
        allPoints,
        elements.historyDate.value,
        elements.historyStart.value || DRIVE_START,
        elements.historyEnd.value || DRIVE_END
      )
      : filterRecentHours(allPoints, Number(elements.historyHours.value));
    const validPoints = selectedPoints
      .filter(hasValidPosition)
      .sort((a, b) => (recordDate(a)?.getTime() || 0) - (recordDate(b)?.getTime() || 0));

    drawRoute(validPoints);
    renderHistoryMeta(data, allPoints, selectedPoints, validPoints);

    const truncated = Number(data.total_rows) > allPoints.length;
    updateRouteMileage(validPoints, data, limit, truncated);
    succeeded = true;

    if (!validPoints.length) {
      setStatus(elements.historyStatus, "History loaded, but this window contains no valid GPS positions.", "warning");
    } else if (truncated) {
      setStatus(elements.historyStatus, `Route loaded, but the API limited the response to ${allPoints.length} of ${data.total_rows} rows.`, "warning");
    } else {
      setStatus(elements.historyStatus, `Route loaded from ${validPoints.length} valid GPS points.`, "success");
    }
  } catch (error) {
    console.error(error);
    setStatus(elements.historyStatus, error.message || "Unable to load travel history.", "error");
  } finally {
    historyLoading = false;
    elements.historySubmit.disabled = false;
  }

  return succeeded;
}

// Keep mileage visible during ASC and disclose when the API capped the response.
function updateRouteMileage(validPoints, data, requestedLimit, truncated) {
  if (!validPoints.length) {
    elements.routeMileage.textContent = "No valid GPS mileage available";
  } else {
    elements.routeMileage.textContent = `${routeDistance(validPoints).toFixed(1)} miles`;
  }

  const appliedLimit = Number(data.limit) || requestedLimit;
  if (appliedLimit < requestedLimit) {
    elements.routeMileageNote.textContent = `Requested ${requestedLimit.toLocaleString()} points; the API capped this route at ${appliedLimit.toLocaleString()} points.`;
  } else if (truncated) {
    elements.routeMileageNote.textContent = `Mileage uses ${validPoints.length.toLocaleString()} valid GPS points from a truncated history response.`;
  } else {
    elements.routeMileageNote.textContent = `Calculated from ${validPoints.length.toLocaleString()} valid GPS points.`;
  }
}

// The ASC progress bar represents elapsed time in the 9 AM–6 PM driving window.
function updateDayProgress() {
  const window = raceWindow();
  const event = currentEvent();
  let percent = 0;
  let label = "FSGP live telemetry begins July 21";

  if (window.isEventDay) {
    elements.dayProgressLabel.textContent = event.type === "fsgp"
      ? "FSGP track-day progress"
      : "ASC driving-day progress";

    if (window.phase === "before") {
      label = `Today’s ${event.name} telemetry begins at ${formatRaceTimeForViewer(window.date, window.startMinutes)}`;
    } else if (window.phase === "driving") {
      percent = ((window.minutes - window.startMinutes) / (window.endMinutes - window.startMinutes)) * 100;
      label = `${Math.floor(percent)}% of today’s ${formatRaceRangeForViewer(window.date, window.startMinutes, window.endMinutes)} window complete`;
    } else {
      percent = 100;
      label = `Today’s ${event.name} driving window is complete`;
    }
  } else if (window.date < FSGP_FIRST_DAY) {
    elements.dayProgressLabel.textContent = "Upcoming race-day progress";
  } else if (window.date < ASC_FIRST_DAY) {
    elements.dayProgressLabel.textContent = "Upcoming race-day progress";
    label = `ASC daily tracking begins July 25 at ${formatRaceTimeForViewer(ASC_FIRST_DAY, DRIVE_START_MINUTES)}`;
  } else if (window.date > ASC_LAST_DAY) {
    elements.dayProgressLabel.textContent = "Race progress";
    percent = 100;
    label = "American Solar Challenge 2026 is complete";
  }

  const roundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  elements.dayProgressValue.textContent = label;
  elements.dayProgressTrack.value = roundedPercent;
  elements.dayProgressTrack.textContent = `${roundedPercent}%`;
  elements.dayProgressTrack.setAttribute("aria-valuenow", String(roundedPercent));
  elements.dayProgressTrack.setAttribute("aria-valuetext", label);
}

// Change headings/visible cards for testing, FSGP, and ASC without editing HTML dates.
function updateTrackingPresentation() {
  const window = raceWindow();
  const event = currentEvent();
  const pausedForRaceSchedule = window.isEventDay && window.phase !== "driving";

  elements.liveMeta.hidden = pausedForRaceSchedule;
  elements.liveRefresh.hidden = pausedForRaceSchedule;
  elements.historyPanel.hidden = true;
  elements.mileagePanel.hidden = event.type !== "asc";
  elements.dayProgressPanel.hidden = event.type === "fsgp";
  elements.ascSchedule.innerHTML = `<strong>Daily driving window:</strong> ${formatRaceRangeForViewer(ASC_FIRST_DAY, DRIVE_START_MINUTES, DRIVE_END_MINUTES)}`;

  if (event.type === "fsgp") {
    elements.trackerHeading.textContent = "FSGP Live Telemetry";
    elements.trackerDescription.textContent = "Follow live vehicle data, lap counts, and lap times during the Formula Sun Grand Prix.";
  } else if (event.type === "asc") {
    elements.trackerHeading.textContent = "ASC Live Route Tracking";
    elements.trackerDescription.textContent = "Follow live vehicle data, today’s route mileage, and driving-day progress.";
  } else {
    elements.trackerHeading.textContent = "Live Solar Car Tracking";
    elements.trackerDescription.textContent = "View the latest vehicle status and GPS route progress.";
  }

  if (window.phase === "before") {
    setStatus(elements.liveStatus, `Live updates will begin at ${formatRaceTimeForViewer(window.date, window.startMinutes)}.`, "loading");
  } else if (window.phase === "charging") {
    const message = window.isAscDay
      ? "Live updates are paused for charging. Today’s completed progress, mileage, and route remain displayed."
      : "Today’s FSGP track window is complete. Live telemetry updates are paused.";
    setStatus(elements.liveStatus, message, "stale");
  }
}

// FSGP normally polls every 30 seconds. After ten stationary minutes, it checks
// every five minutes so movement can still be detected and fast polling resumed.
function shouldAutomaticallyLoadLiveData() {
  const window = raceWindow();
  const event = currentEvent();

  if (event.type === "fsgp") {
    const stationaryLongEnough =
      fsgpStationarySince !== null &&
      Date.now() - fsgpStationarySince >= FSGP_IDLE_AFTER_MS;
    return !stationaryLongEnough || Date.now() - lastLiveRequestAt >= FSGP_IDLE_CHECK_MS;
  }

  return !window.isEventDay || window.phase === "driving";
}

// ASC history refreshes during driving and once more at day end with limit=10,000.
async function loadAutomaticRaceDayHistory(force = false) {
  const window = raceWindow();
  if (!window.isAscDay || window.phase === "before") return;
  if (
    !force &&
    automaticallyLoadedDate === window.date &&
    automaticallyLoadedPhase === window.phase
  ) return;

  elements.historyMode.value = "day";
  elements.historyDate.value = window.date;
  elements.historyStart.value = DRIVE_START;
  elements.historyEnd.value = DRIVE_END;
  updateHistoryMode();
  const requestedLimit = window.phase === "charging"
    ? HISTORY_FINAL_LIMIT
    : HISTORY_LIVE_LIMIT;
  const loaded = await loadHistory(null, requestedLimit);

  if (loaded) {
    automaticallyLoadedDate = window.date;
    automaticallyLoadedPhase = window.phase;
  }
}

// Retained for background history requests even though the public history tab is hidden.
function updateHistoryMode() {
  const dayMode = elements.historyMode.value === "day";
  elements.dayFields.hidden = !dayMode;
  elements.hourFields.hidden = dayMode;
  elements.historyDate.required = dayMode;
  elements.historyHours.required = !dayMode;
}

// Update both race countdown elements once per minute.
function updateCountdowns() {
  document.querySelectorAll(".countdown[data-date]").forEach((element) => {
    const start = new Date(element.dataset.date);
    const difference = start.getTime() - Date.now();

    if (Number.isNaN(start.getTime())) {
      element.textContent = "Race date unavailable";
    } else if (difference <= 0) {
      element.textContent = "Race underway or completed";
    } else {
      const days = Math.floor(difference / 86400000);
      const hours = Math.floor((difference % 86400000) / 3600000);
      element.textContent = `Countdown: ${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"}`;
    }
  });
}

/*
 * Page startup and recurring work
 * --------------------------------
 * - Live data: every 30 seconds when allowed by the current event state.
 * - Presentation/countdowns: every minute.
 * - ASC route history: every five minutes while driving.
 */
elements.historyDate.value = raceTimeParts().date;
elements.liveRefresh.addEventListener("click", loadLatest);
elements.historyMode.addEventListener("change", updateHistoryMode);
elements.historyForm.addEventListener("submit", loadHistory);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && shouldAutomaticallyLoadLiveData()) loadLatest();
});

updateHistoryMode();
updateCountdowns();
updateDayProgress();
updateTrackingPresentation();
if (shouldAutomaticallyLoadLiveData()) loadLatest();
loadAutomaticRaceDayHistory();
setInterval(() => {
  if (!document.hidden && shouldAutomaticallyLoadLiveData()) loadLatest();
}, LIVE_REFRESH_MS);
setInterval(() => {
  updateCountdowns();
  updateDayProgress();
  updateTrackingPresentation();
  loadAutomaticRaceDayHistory();
}, 60000);
setInterval(() => {
  if (!document.hidden && raceWindow().phase === "driving") {
    loadAutomaticRaceDayHistory(true);
  }
}, HISTORY_REFRESH_MS);
