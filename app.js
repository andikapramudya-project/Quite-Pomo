const STORAGE_KEY = "quiet-pomo-state-v1";
const FocusData = QuietPomoData;

const THEMES = {
  paper: { bg: "#ffffff" },
  sage: { bg: "#dfe8dc" },
  clay: { bg: "#efd6cb" }, // Read old installations; offered as a saved custom palette after migration.
  ink: { bg: "#202124" },
};

const MODES = ["pomodoro", "shortBreak", "longBreak"];
const MODE_LABELS = {
  pomodoro: "Pomodoro",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

const DEFAULT_STATE = {
  mode: "pomodoro",
  isRunning: false,
  remainingSeconds: 25 * 60,
  settings: {
    pomodoro: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartPomodoros: false,
    alarmSound: "assets/notification/victory.mp3",
    ambientSound: "assets/audio/fire-burning.m4a",
    ambientVolume: 45,
    notificationText: "Waktunya berpindah mode. Ambil napas sebentar.",
    theme: "paper",
    customColor: "#ffffff",
    useCustomColor: false,
    defaultThemeVersion: 2,
    customThemes: [],
  },
  stats: {
    date: FocusData.dateKey(),
    sessions: 0,
    focusSeconds: 0,
  },
  tasks: [],
  activeTaskId: null,
  history: [],
  cycleSessions: 0,
};

let state = loadState();
let timerId = null;
let lastTickAt = null;
let audioContext = null;
let ambientAudio = null;
let historyPeriod = "1";
let historyDate = "";
let selectedHistory = new Set();
let toastTimeout = null;
let confirmAction = null;
let notificationRequestPending = false;
let timerWorker = null;
let scheduledAlarm = null;
let alarmGeneration = 0;
const alarmBuffers = new Map();
const expandedTasks = new Set();

const ICONS = {
  bell: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-bell" /></svg>
  `,
  bellOff: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-bell-off" /></svg>
  `,
};

function uiIcon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-${name}" /></svg>`;
}

const elements = {
  timerDisplay: document.querySelector("#timerDisplay"),
  timerTitle: document.querySelector("#timerTitle"),
  progressFill: document.querySelector("#progressFill"),
  currentTask: document.querySelector("#currentTask"),
  startPause: document.querySelector("#startPause"),
  resetTimer: document.querySelector("#resetTimer"),
  skipMode: document.querySelector("#skipMode"),
  modeTabs: document.querySelectorAll(".mode-tab"),
  sessionCount: document.querySelector("#sessionCount"),
  focusMinutes: document.querySelector("#focusMinutes"),
  finishEstimate: document.querySelector("#finishEstimate"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskEstimate: document.querySelector("#taskEstimate"),
  taskList: document.querySelector("#taskList"),
  taskSummary: document.querySelector("#taskSummary"),
  pomodoroDuration: document.querySelector("#pomodoroDuration"),
  shortBreakDuration: document.querySelector("#shortBreakDuration"),
  longBreakDuration: document.querySelector("#longBreakDuration"),
  longBreakInterval: document.querySelector("#longBreakInterval"),
  autoStartBreaks: document.querySelector("#autoStartBreaks"),
  autoStartPomodoros: document.querySelector("#autoStartPomodoros"),
  alarmSound: document.querySelector("#alarmSound"),
  alarmSelect: document.querySelector("#alarmSelect"),
  alarmSoundButton: document.querySelector("#alarmSoundButton"),
  alarmSoundLabel: document.querySelector("#alarmSoundLabel"),
  alarmSoundMenu: document.querySelector("#alarmSoundMenu"),
  alarmSoundOptions: document.querySelectorAll("#alarmSoundMenu [data-value]"),
  ambientSound: document.querySelector("#ambientSound"),
  ambientSelect: document.querySelector("#ambientSelect"),
  ambientSoundButton: document.querySelector("#ambientSoundButton"),
  ambientSoundLabel: document.querySelector("#ambientSoundLabel"),
  ambientSoundMenu: document.querySelector("#ambientSoundMenu"),
  ambientSoundOptions: document.querySelectorAll("#ambientSoundMenu [data-value]"),
  ambientVolume: document.querySelector("#ambientVolume"),
  notificationText: document.querySelector("#notificationText"),
  customColor: document.querySelector("#customColor"),
  themeSwatches: document.querySelectorAll(".theme-swatch"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsDrawer: document.querySelector("#settingsDrawer"),
  settingsClose: document.querySelector("#settingsClose"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  notificationPermission: document.querySelector("#notificationPermission"),
  resetDay: document.querySelector("#resetDay"),
  customThemes: document.querySelector("#customThemes"),
  customThemeForm: document.querySelector("#customThemeForm"),
  customThemeName: document.querySelector("#customThemeName"),
  drawerTabs: document.querySelectorAll(".drawer-tabs [data-panel]"),
  statisticsPanel: document.querySelector("#statisticsPanel"),
  periodTabs: document.querySelectorAll("[data-period]"),
  historyDate: document.querySelector("#historyDate"),
  clearHistoryDate: document.querySelector("#clearHistoryDate"),
  historyFocus: document.querySelector("#historyFocus"),
  historySessions: document.querySelector("#historySessions"),
  focusChart: document.querySelector("#focusChart"),
  chartCaption: document.querySelector("#chartCaption"),
  historyList: document.querySelector("#historyList"),
  selectAllHistory: document.querySelector("#selectAllHistory"),
  deleteHistory: document.querySelector("#deleteHistory"),
  exportHistory: document.querySelector("#exportHistory"),
  importHistory: document.querySelector("#importHistory"),
  importHistoryFile: document.querySelector("#importHistoryFile"),
  statusMessage: document.querySelector("#statusMessage"),
  storageWarning: document.querySelector("#storageWarning"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmDescription: document.querySelector("#confirmDescription"),
  confirmAccept: document.querySelector("#confirmAccept"),
  confirmCancel: document.querySelector("#confirmCancel"),
  confirmImportOptions: document.querySelector("#confirmImportOptions"),
  confirmImportCurrent: document.querySelector("#confirmImportCurrent"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && typeof saved === "object" ? mergeState(DEFAULT_STATE, saved) : cloneDefaultState();
  } catch {
    return cloneDefaultState();
  }
}

function cloneDefaultState() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
  fresh.stats.id = FocusData.makeId();
  return fresh;
}

function mergeState(base, saved) {
  const merged = {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved.settings || {}) },
    stats: { ...base.stats, ...(saved.stats || {}) },
    tasks: (Array.isArray(saved.tasks) ? saved.tasks : []).filter((task) => task && typeof task.name === "string").map((task) => ({
      ...task,
      id: typeof task.id === "string" ? task.id : FocusData.makeId(),
      estimate: Math.max(1, Math.min(20, Number(task.estimate) || 1)),
      done: Math.max(0, Number(task.done) || 0),
      completed: typeof task.completed === "boolean" ? task.completed : Number(task.done) >= Number(task.estimate),
      subtasks: (Array.isArray(task.subtasks) ? task.subtasks : []).filter((subtask) => subtask && typeof subtask.name === "string").map((subtask) => ({
        id: typeof subtask.id === "string" ? subtask.id : FocusData.makeId(), name: subtask.name, completed: subtask.completed === true,
      })),
    })),
    isRunning: false,
    cycleSessions: Math.max(0, Number(saved.cycleSessions ?? saved.stats?.sessions) || 0),
  };

  merged.settings.customThemes = (Array.isArray(saved.settings?.customThemes) ? saved.settings.customThemes : [])
    .filter((theme) => theme && typeof theme.id === "string" && /^#[\da-f]{6}$/i.test(theme.bg))
    .map((theme) => ({ id: theme.id, bg: theme.bg, name: String(theme.name || theme.bg).slice(0, 24) }));
  if (merged.settings.useCustomColor || merged.settings.theme === "clay") {
    const bg = merged.settings.useCustomColor ? merged.settings.customColor : THEMES.clay.bg;
    if (/^#[\da-f]{6}$/i.test(bg)) {
      const theme = { id: FocusData.makeId(), bg, name: merged.settings.theme === "clay" ? "Clay" : "Custom" };
      merged.settings.customThemes.push(theme);
      merged.settings.theme = `custom:${theme.id}`;
    }
    merged.settings.useCustomColor = false;
  }
  if (!merged.tasks.some((task) => task.id === merged.activeTaskId && !task.completed)) {
    merged.activeTaskId = merged.tasks.find((task) => !task.completed)?.id || null;
  }
  return FocusData.migrate(merged, saved);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, isRunning: false }));
    elements.storageWarning.hidden = true;
    return true;
  } catch {
    elements.storageWarning.hidden = false;
    return false;
  }
}

function modeDuration(mode = state.mode) {
  return Math.max(1, Number(state.settings[mode] || DEFAULT_STATE.settings[mode])) * 60;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function activeTask() {
  return state.tasks.find((task) => task.id === state.activeTaskId && !task.completed) || null;
}

function remainingPomodoros() {
  return state.tasks.reduce((total, task) => total + (task.completed ? 0 : Math.max(0, task.estimate - task.done)), 0);
}

function updateDocumentTitle() {
  const status = state.isRunning ? MODE_LABELS[state.mode] : "Paused";
  document.title = `${formatTime(state.remainingSeconds)} - ${status} | Quiet Pomo`;
}

function render() {
  if (!state.isRunning) FocusData.rollover(state);
  renderTimer();
  renderTasks();
  renderSettings();
  renderTheme();
  renderCustomThemes();
  renderNotificationButton();
  if (!elements.statisticsPanel.hidden) renderStatistics();
  saveState();
}

function renderTimer() {
  const duration = modeDuration();
  const elapsed = Math.max(0, duration - state.remainingSeconds);
  const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const task = activeTask();

  elements.timerDisplay.textContent = formatTime(state.remainingSeconds);
  elements.progressFill.style.transform = `scaleX(${progress / 100})`;
  elements.timerTitle.textContent = state.mode === "pomodoro" ? "Working on" : "Taking a break";
  elements.currentTask.textContent = state.mode === "pomodoro" ? (task ? task.name : "Time to focus") : "Enjoy your break";
  elements.startPause.textContent = state.isRunning ? "Pause" : "Start";
  elements.sessionCount.textContent = String(state.stats.sessions);
  elements.focusMinutes.textContent = `${Math.floor(state.stats.focusSeconds / 60)}m`;
  elements.taskSummary.textContent = `${remainingPomodoros()} left`;

  elements.modeTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === state.mode);
    tab.setAttribute("aria-selected", String(tab.dataset.mode === state.mode));
    tab.tabIndex = tab.dataset.mode === state.mode ? 0 : -1;
  });
  document.querySelector("#timerPanel").setAttribute("aria-labelledby", `${state.mode}Tab`);

  renderFinishEstimate();
  updateDocumentTitle();
}

function notificationPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
}

function renderNotificationButton(permission = notificationPermissionState()) {
  const allowed = permission === "granted";
  const button = elements.notificationPermission;
  // Both the initial icon and live updates use the same SVG geometry.
  if (button.dataset.permission !== permission) {
    button.querySelector(".button-icon").innerHTML = allowed ? ICONS.bell : ICONS.bellOff;
  }
  const label = {
    granted: "Notifikasi aktif",
    default: "Aktifkan notifikasi",
    denied: "Notifikasi diblokir — periksa izin situs di Chrome",
    unsupported: "Browser ini belum mendukung notifikasi",
    insecure: "Notifikasi membutuhkan HTTPS atau localhost",
  }[permission] || "Aktifkan notifikasi";
  button.dataset.permission = permission;
  button.title = label;
  button.setAttribute("aria-label", label);
}

async function watchNotificationPermission() {
  if (!("Notification" in window) || !navigator.permissions?.query) return;
  try {
    const permission = await navigator.permissions.query({ name: "notifications" });
    permission.addEventListener("change", () => renderNotificationButton());
    renderNotificationButton();
  } catch {
    // Browsers without this permission query still synchronize on focus/visibility.
  }
}

function renderSettings() {
  elements.pomodoroDuration.value = state.settings.pomodoro;
  elements.shortBreakDuration.value = state.settings.shortBreak;
  elements.longBreakDuration.value = state.settings.longBreak;
  elements.longBreakInterval.value = state.settings.longBreakInterval;
  elements.autoStartBreaks.checked = state.settings.autoStartBreaks;
  elements.autoStartPomodoros.checked = state.settings.autoStartPomodoros;
  elements.alarmSound.value = state.settings.alarmSound;
  renderAlarmSelect();
  elements.ambientSound.value = state.settings.ambientSound;
  renderAmbientSelect();
  elements.ambientVolume.value = state.settings.ambientVolume;
  elements.ambientVolume.style.setProperty("--ambient-level", `${state.settings.ambientVolume}%`);
  elements.notificationText.value = state.settings.notificationText;
  elements.customColor.value = state.settings.customColor;
}

function renderAlarmSelect() {
  const value = state.settings.alarmSound;
  const selectedOption = [...elements.alarmSound.options].find((option) => option.value === value);
  elements.alarmSoundLabel.textContent = selectedOption ? selectedOption.textContent : "Victory";
  elements.alarmSoundButton.setAttribute("aria-label", `Suara alarm: ${elements.alarmSoundLabel.textContent}`);
  elements.alarmSoundOptions.forEach((option) => {
    const selected = option.dataset.value === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function renderAmbientSelect() {
  const value = state.settings.ambientSound;
  const selectedOption = [...elements.ambientSound.options].find((option) => option.value === value);
  elements.ambientSoundLabel.textContent = selectedOption ? selectedOption.textContent : "Off";
  elements.ambientSoundButton.setAttribute("aria-label", `Audio loop: ${elements.ambientSoundLabel.textContent}`);
  elements.ambientSoundOptions.forEach((option) => {
    const selected = option.dataset.value === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function renderTheme() {
  const custom = state.settings.customThemes.find((theme) => `custom:${theme.id}` === state.settings.theme);
  const theme = custom || THEMES[state.settings.theme] || THEMES.paper;
  const bg = theme.bg;
  const rgb = bg.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16));
  const luminance = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const dark = luminance < 0.179;
  // Custom palettes can sit close to the light/dark contrast crossover.
  // Move their surfaces away from the text, then resolve readable solid tokens.
  const text = custom ? (dark ? "#ffffff" : "#000000") : (dark ? "#fafafa" : "#242424");
  const mix = (amount, target = custom && dark ? 0 : 255) => `#${rgb.map((value) => Math.round(value + (target - value) * amount).toString(16).padStart(2, "0")).join("")}`;
  const relativeLuminance = (hex) => hex.match(/[\da-f]{2}/gi).reduce((sum, channel, index) => {
    const value = parseInt(channel, 16) / 255;
    return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
  const surfaces = state.settings.theme === "paper" ? [bg, bg, "#f5f5f7", bg, bg] :
    [bg, mix(dark ? .025 : .12), mix(dark ? .035 : .24), mix(dark ? .055 : .35), mix(dark ? .075 : .48)];
  const readableBlend = (minimum, initial) => {
    const foreground = text.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16));
    for (let step = initial; step <= 100; step += 1) {
      const candidate = `#${rgb.map((value, index) => Math.round(value + (foreground[index] - value) * step / 100).toString(16).padStart(2, "0")).join("")}`;
      const candidateLuminance = relativeLuminance(candidate);
      if (surfaces.every((surface) => {
        const backgroundLuminance = relativeLuminance(surface);
        return (Math.max(candidateLuminance, backgroundLuminance) + .05) / (Math.min(candidateLuminance, backgroundLuminance) + .05) >= minimum;
      })) return candidate;
    }
    return text;
  };
  const palette = {
    "--bg": bg, "--bg-soft": surfaces[1],
    "--surface": surfaces[2], "--surface-solid": surfaces[3],
    "--field": surfaces[4], "--text": text,
    "--muted": readableBlend(4.5, 65),
    "--field-line": readableBlend(3, 40),
    "--focus": text,
    "--line": dark ? "rgba(250,250,250,.14)" : "rgba(36,36,36,.12)",
    "--accent": text, "--accent-strong": text, "--control": text,
    "--control-ink": dark ? "#242424" : "#ffffff",
    "--on-control": dark ? "#242424" : "#ffffff",
    "--shadow": dark ? "0 8px 32px rgba(0,0,0,.10)" : "0 8px 32px rgba(36,36,36,.035)",
  };
  document.body.dataset.theme = dark ? "ink" : state.settings.theme;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  Object.entries(palette).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
  elements.themeSwatches.forEach((swatch) => {
    const selected = swatch.dataset.theme === state.settings.theme;
    swatch.classList.toggle("active", selected);
    swatch.setAttribute("aria-pressed", String(selected));
  });
}

function renderCustomThemes() {
  elements.customThemes.replaceChildren();
  if (!state.settings.customThemes.length) {
    const empty = document.createElement("p");
    empty.className = "field-note";
    empty.textContent = "Simpan warna favoritmu di sini.";
    elements.customThemes.append(empty);
  }
  state.settings.customThemes.forEach((theme) => {
    const item = document.createElement("div");
    item.className = "custom-theme";
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "custom-theme-select";
    const selected = state.settings.theme === `custom:${theme.id}`;
    swatch.classList.toggle("active", selected);
    swatch.setAttribute("aria-pressed", String(selected));
    swatch.title = `${theme.name} · ${theme.bg}`;
    const color = document.createElement("span");
    color.className = "custom-theme-color";
    color.style.backgroundColor = theme.bg;
    const name = document.createElement("span");
    name.textContent = theme.name;
    swatch.append(color, name);
    swatch.addEventListener("click", () => {
      state.settings.theme = `custom:${theme.id}`;
      render();
      elements.customThemes.querySelector('[aria-pressed="true"]')?.focus();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "custom-theme-remove";
    remove.innerHTML = uiIcon("close");
    remove.setAttribute("aria-label", `Hapus warna ${theme.name}`);
    remove.addEventListener("click", () => {
      state.settings.customThemes = state.settings.customThemes.filter((item) => item.id !== theme.id);
      if (selected) state.settings.theme = "paper";
      render();
      elements.customColor.focus();
      showStatus(`Warna ${theme.name} dihapus.`);
    });
    item.append(swatch, remove);
    elements.customThemes.append(item);
  });
}

function formatFocus(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (seconds > 0 && minutes === 0) return "<1m";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function formatDate(date) {
  return date ? new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Data sebelumnya";
}

function visibleHistory() {
  return state.history.filter((entry) => historyDate ? entry.date === historyDate : FocusData.inPeriod(entry, historyPeriod));
}

let statisticsSignature = "";
function renderStatistics() {
  const archives = visibleHistory().sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  const current = { ...state.stats, id: "current" };
  const entries = [...archives];
  if (FocusData.hasProgress(current) && (historyDate ? current.date === historyDate : FocusData.inPeriod(current, historyPeriod))) entries.unshift(current);
  const total = entries.reduce((sum, entry) => ({ sessions: sum.sessions + entry.sessions, focusSeconds: sum.focusSeconds + entry.focusSeconds }), { sessions: 0, focusSeconds: 0 });
  elements.historyFocus.textContent = formatFocus(total.focusSeconds);
  elements.historySessions.textContent = total.sessions;
  elements.periodTabs.forEach((button) => button.setAttribute("aria-pressed", String(!historyDate && button.dataset.period === historyPeriod)));
  elements.clearHistoryDate.hidden = !historyDate;
  updateHistorySelection();
  elements.historyList.querySelectorAll("[data-history-id]").forEach((checkbox) => { checkbox.checked = selectedHistory.has(checkbox.dataset.historyId); });
  const signature = JSON.stringify([historyDate, historyPeriod, entries.map((entry) => [entry.id, entry.date, entry.sessions, Math.floor(entry.focusSeconds / 60), entry.focusSeconds > 0])]);
  if (signature === statisticsSignature) return;
  statisticsSignature = signature;
  renderFocusChart(entries);
  elements.historyList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Belum ada progres di periode ini. Satu sesi fokus adalah awal yang baik.";
    elements.historyList.append(empty);
  }
  entries.forEach((entry) => {
    const row = document.createElement("label");
    row.className = "history-entry";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.historyId = entry.id;
    checkbox.checked = selectedHistory.has(entry.id);
    checkbox.disabled = entry.id === "current";
    checkbox.setAttribute("aria-label", `Pilih arsip ${formatDate(entry.date)}`);
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = formatDate(entry.date);
    const note = document.createElement("span");
    note.className = "field-note";
    const reason = entry.id === "current" ? "Progres aktif" : entry.reason === "reset" ? "Disimpan saat reset" : entry.reason === "legacy" ? "Tanggal tidak tersedia" : "Arsip harian";
    note.textContent = `${entry.sessions} sesi selesai · ${reason}`;
    copy.append(title, note);
    const focus = document.createElement("strong");
    focus.className = "history-entry-focus";
    focus.textContent = formatFocus(entry.focusSeconds);
    row.append(checkbox, copy, focus);
    elements.historyList.append(row);
  });
}

function updateHistorySelection() {
  const archives = visibleHistory();
  const count = archives.filter((entry) => selectedHistory.has(entry.id)).length;
  elements.selectAllHistory.checked = archives.length > 0 && count === archives.length;
  elements.selectAllHistory.indeterminate = count > 0 && count < archives.length;
  elements.selectAllHistory.disabled = !archives.length;
  elements.deleteHistory.disabled = selectedHistory.size === 0;
  elements.deleteHistory.textContent = selectedHistory.size ? `Hapus (${selectedHistory.size})` : "Hapus terpilih";
}

function renderFocusChart(entries) {
  const now = new Date();
  const days = historyDate || historyPeriod === "1" ? 1 : historyPeriod === "7" ? 7 : 30;
  const byDate = new Map();
  entries.forEach((entry) => { if (entry.date) byDate.set(entry.date, (byDate.get(entry.date) || 0) + entry.focusSeconds); });
  const dates = Array.from({ length: days }, (_, index) => {
    const date = historyDate ? new Date(`${historyDate}T12:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + index + 1);
    return { date: FocusData.dateKey(date), seconds: byDate.get(FocusData.dateKey(date)) || 0 };
  });
  const max = Math.max(60, ...dates.map((day) => day.seconds));
  elements.focusChart.replaceChildren();
  elements.focusChart.hidden = days === 1;
  elements.chartCaption.hidden = days === 1;
  elements.chartCaption.textContent = `Waktu fokus per hari · ${days} hari terakhir`;
  elements.focusChart.setAttribute("aria-label", `Grafik waktu fokus ${days} hari terakhir`);
  dates.forEach((day, index) => {
    const column = document.createElement("div");
    column.className = "chart-column";
    column.title = `${formatDate(day.date)} · ${formatFocus(day.seconds)}`;
    column.setAttribute("aria-label", column.title);
    const bar = document.createElement("span");
    bar.className = "chart-bar";
    bar.style.height = `${day.seconds ? Math.max(4, day.seconds / max * 100) : 2}%`;
    bar.classList.toggle("empty", !day.seconds);
    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = days <= 7 || index % 6 === 0 || index === days - 1 ? String(Number(day.date.slice(-2))) : "";
    column.append(bar, label);
    elements.focusChart.append(column);
  });
}

function showStatus(message) {
  clearTimeout(toastTimeout);
  elements.statusMessage.textContent = message;
  elements.statusMessage.hidden = false;
  resumeStatusTimeout();
}

function resumeStatusTimeout() {
  clearTimeout(toastTimeout);
  if (elements.statusMessage.matches(":hover, :focus-within")) return;
  toastTimeout = setTimeout(() => { elements.statusMessage.hidden = true; }, 4000);
}

elements.statusMessage.addEventListener("pointerenter", () => clearTimeout(toastTimeout));
elements.statusMessage.addEventListener("focusin", () => clearTimeout(toastTimeout));
elements.statusMessage.addEventListener("pointerleave", resumeStatusTimeout);
elements.statusMessage.addEventListener("focusout", resumeStatusTimeout);

function askConfirmation(title, description, accept, action) {
  elements.confirmImportOptions.hidden = true;
  elements.confirmImportCurrent.checked = false;
  elements.confirmTitle.textContent = title;
  elements.confirmDescription.textContent = description;
  elements.confirmAccept.textContent = accept;
  confirmAction = action;
  elements.confirmDialog.showModal();
  elements.confirmCancel.focus();
}

function renderTasks() {
  const focused = document.activeElement;
  const focusedTask = focused?.closest("[data-task-id]");
  const focusSnapshot = focusedTask && elements.taskList.contains(focusedTask) ? {
    id: focusedTask.dataset.taskId,
    row: [...elements.taskList.children].indexOf(focusedTask),
    control: [...focusedTask.querySelectorAll("button, input, summary")].indexOf(focused),
  } : null;
  elements.taskList.innerHTML = "";

  if (!state.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "task-item";
    empty.innerHTML = `
      <span class="task-check" aria-hidden="true">${uiIcon("plus")}</span>
      <div>
        <span class="task-name">Belum ada tugas</span>
        <span class="task-meta">Tambahkan satu tugas untuk mulai fokus.</span>
      </div>
    `;
    elements.taskList.append(empty);
    if (focusSnapshot) elements.taskInput.focus();
    return;
  }

  state.tasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = `task-item${task.id === state.activeTaskId ? " active" : ""}${task.completed ? " completed" : ""}`;
    item.dataset.taskId = task.id;

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.title = task.completed ? "Buka kembali tugas" : "Tandai tugas selesai";
    check.setAttribute("role", "checkbox");
    check.setAttribute("aria-checked", String(task.completed));
    check.setAttribute("aria-label", `${check.title}: ${task.name}`);
    check.innerHTML = task.completed ? uiIcon("check") : "";
    check.addEventListener("click", () => {
      if (state.isRunning) runSecond();
      task.completed = !task.completed;
      if (task.completed) task.subtasks.forEach((subtask) => { subtask.completed = true; });
      if (task.completed && state.activeTaskId === task.id) selectNextTask();
      else if (!task.completed && !activeTask()) state.activeTaskId = task.id;
      render();
    });

    const copy = document.createElement("div");
    const remaining = Math.max(0, task.estimate - task.done);
    copy.innerHTML = `
      <button type="button" class="task-name task-select" title="Pilih untuk fokus" ${task.completed ? "disabled" : ""}>${escapeHtml(task.name)}</button>
      <span class="task-meta">${task.id === state.activeTaskId ? "Dipilih · " : ""}${task.completed ? "Selesai · " : ""}${task.done}/${task.estimate} Pomodoro · ${remaining} tersisa</span>
    `;
    copy.querySelector(".task-select").addEventListener("click", () => {
      if (state.isRunning) runSecond();
      if (task.completed) return;
      state.activeTaskId = task.id;
      render();
    });

    const stepper = document.createElement("div");
    stepper.className = "stepper";
    stepper.innerHTML = `
      <button type="button" title="Kurangi estimasi" aria-label="Kurangi estimasi: ${escapeHtml(task.name)}">${uiIcon("minus")}</button>
      <strong>${task.estimate}</strong>
      <button type="button" title="Tambah estimasi" aria-label="Tambah estimasi: ${escapeHtml(task.name)}">${uiIcon("plus")}</button>
    `;
    const [minus, plus] = stepper.querySelectorAll("button");
    minus.addEventListener("click", () => {
      task.estimate = Math.max(1, task.estimate - 1);
      task.done = Math.min(task.done, task.estimate);
      render();
    });
    plus.addEventListener("click", () => {
      task.estimate = Math.min(20, task.estimate + 1);
      render();
    });

    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.title = "Hapus tugas";
    remove.setAttribute("aria-label", `Hapus tugas: ${task.name}`);
    remove.innerHTML = uiIcon("trash");
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(check, copy, stepper, remove);
    const details = document.createElement("details");
    details.className = "subtasks";
    details.open = expandedTasks.has(task.id);
    const summary = document.createElement("summary");
    summary.textContent = task.subtasks.length ? `Subtugas ${task.subtasks.filter((subtask) => subtask.completed).length}/${task.subtasks.length}` : "Tambah subtugas";
    details.append(summary);
    details.addEventListener("toggle", () => details.open ? expandedTasks.add(task.id) : expandedTasks.delete(task.id));
    task.subtasks.forEach((subtask) => {
      const row = document.createElement("div");
      row.className = "subtask-row";
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = subtask.completed;
      checkbox.addEventListener("change", () => {
        subtask.completed = checkbox.checked;
        if (!subtask.completed) {
          task.completed = false;
          if (!activeTask()) state.activeTaskId = task.id;
        }
        render();
      });
      const name = document.createElement("span");
      name.textContent = subtask.name;
      name.className = subtask.completed ? "subtask-completed" : "";
      label.append(checkbox, name);
      const removeSubtask = document.createElement("button");
      removeSubtask.type = "button";
      removeSubtask.className = "task-delete";
      removeSubtask.innerHTML = uiIcon("close");
      removeSubtask.setAttribute("aria-label", `Hapus subtugas: ${subtask.name}`);
      removeSubtask.addEventListener("click", () => {
        task.subtasks = task.subtasks.filter((entry) => entry.id !== subtask.id);
        render();
      });
      row.append(label, removeSubtask);
      details.append(row);
    });
    const form = document.createElement("form");
    form.className = "subtask-form";
    form.innerHTML = '<input type="text" maxlength="200" placeholder="Tulis bagian tugas..." aria-label="Nama subtugas" required /><button type="submit" class="small-button">Tambah</button>';
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.querySelector("input").value.trim();
      if (!name) return;
      task.subtasks.push({ id: FocusData.makeId(), name, completed: false });
      task.completed = false;
      if (!activeTask()) state.activeTaskId = task.id;
      expandedTasks.add(task.id);
      render();
      elements.taskList.querySelector(`[data-task-id="${CSS.escape(task.id)}"] .subtask-form input`)?.focus();
    });
    details.append(form);
    item.append(details);
    elements.taskList.append(item);
  });
  if (focusSnapshot && focusSnapshot.control >= 0) {
    const rows = [...elements.taskList.children];
    const row = rows.find((item) => item.dataset.taskId === focusSnapshot.id) || rows[Math.min(focusSnapshot.row, rows.length - 1)];
    const controls = row?.querySelectorAll("button, input, summary");
    const target = controls?.[focusSnapshot.control];
    (target && !target.disabled ? target : row?.querySelector(".task-check"))?.focus({ preventScroll: true });
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function renderFinishEstimate() {
  const left = remainingPomodoros();
  if (!left) {
    elements.finishEstimate.textContent = "--:--";
    return;
  }

  const focus = left * state.settings.pomodoro;
  const breaks = Math.max(0, left - 1) * state.settings.shortBreak;
  const longBreaks = Math.floor(Math.max(0, left - 1) / state.settings.longBreakInterval) * state.settings.longBreak;
  const date = new Date(Date.now() + (focus + breaks + longBreaks) * 60 * 1000);
  elements.finishEstimate.textContent = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function setMode(mode, options = {}) {
  if (!MODES.includes(mode)) return;
  if (state.isRunning) runSecond();
  state.mode = mode;
  state.isRunning = false;
  state.remainingSeconds = options.keepRemaining ? state.remainingSeconds : modeDuration(mode);
  stopTimer();
  render();
}

function startTimer() {
  if (state.isRunning) return;
  FocusData.rollover(state);
  ensureAudio();
  state.isRunning = true;
  lastTickAt = Date.now();
  timerId = window.setInterval(runSecond, 250);
  startTimerWorker();
  scheduleAlarm();
  updateAmbientSound();
  render();
}

function pauseTimer() {
  if (state.isRunning) runSecond();
  state.isRunning = false;
  stopTimer();
  render();
}

function stopTimer(preserveStartedAlarm = false) {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  timerWorker?.terminate();
  timerWorker = null;
  const alarmStarted = cancelScheduledAlarm(preserveStartedAlarm);
  stopAmbientSound();
  return alarmStarted;
}

function runSecond() {
  if (!state.isRunning) return;
  const now = Date.now();
  const delta = Math.floor((now - lastTickAt) / 1000);
  if (delta < 1) return;

  const startedAt = lastTickAt;
  const elapsed = Math.min(delta, state.remainingSeconds);
  lastTickAt += delta * 1000;
  state.remainingSeconds -= elapsed;

  if (state.mode === "pomodoro") {
    FocusData.recordFocus(state, startedAt, elapsed);
  }

  if (state.remainingSeconds <= 0) {
    completeMode(new Date(startedAt + elapsed * 1000));
    return;
  }

  FocusData.rollover(state, new Date(now));
  renderTimer();
  if (!elements.statisticsPanel.hidden) renderStatistics();
  saveState();
}

function completeMode(completedAt = new Date()) {
  const completedMode = state.mode;
  const alarmStarted = stopTimer(true);
  state.isRunning = false;
  state.remainingSeconds = 0;

  if (completedMode === "pomodoro") {
    FocusData.rollover(state, completedAt);
    state.stats.sessions += 1;
    state.cycleSessions += 1;
    completeActiveTaskStep();
  }

  if (!alarmStarted) playAlarm();
  notifyUser(completedMode);

  const nextMode = nextModeAfter(completedMode);
  const shouldAutoStart =
    completedMode === "pomodoro" ? state.settings.autoStartBreaks : state.settings.autoStartPomodoros;

  state.mode = nextMode;
  state.remainingSeconds = modeDuration(nextMode);
  render();

  if (shouldAutoStart) {
    startTimer();
  }
}

function nextModeAfter(mode) {
  if (mode !== "pomodoro") return "pomodoro";
  return shouldUseLongBreak(state.cycleSessions) ? "longBreak" : "shortBreak";
}

function shouldUseLongBreak(sessionCount) {
  const interval = Math.max(2, Number(state.settings.longBreakInterval) || DEFAULT_STATE.settings.longBreakInterval);
  return sessionCount > 0 && sessionCount % interval === 0;
}

function completeActiveTaskStep() {
  const task = activeTask();
  if (!task) return;
  task.done = Math.min(task.estimate, task.done + 1);
  if (task.done >= task.estimate && task.subtasks.every((subtask) => subtask.completed)) {
    task.completed = true;
    selectNextTask();
  }
}

function selectNextTask() {
  state.activeTaskId = state.tasks.find((task) => !task.completed)?.id || null;
}

function skipMode() {
  if (state.isRunning) runSecond();
  const skippedMode = state.mode;
  const wasRunning = state.isRunning;
  const shouldAutoStart =
    wasRunning || (skippedMode === "pomodoro" ? state.settings.autoStartBreaks : state.settings.autoStartPomodoros);

  stopTimer();
  state.isRunning = false;

  if (skippedMode === "pomodoro") {
    state.cycleSessions += 1;
    state.mode = shouldUseLongBreak(state.cycleSessions) ? "longBreak" : "shortBreak";
  } else {
    state.mode = "pomodoro";
  }

  state.remainingSeconds = modeDuration(state.mode);
  render();

  if (shouldAutoStart) {
    startTimer();
  }
}

function addTask(name, estimate) {
  const task = {
    id: FocusData.makeId(),
    name,
    estimate: Math.max(1, Math.min(20, Number(estimate) || 1)),
    done: 0,
    completed: false,
    subtasks: [],
  };
  state.tasks.push(task);
  if (!state.activeTaskId) state.activeTaskId = task.id;
  render();
}

function deleteTask(id) {
  if (state.isRunning) runSecond();
  state.tasks = state.tasks.filter((task) => task.id !== id);
  if (state.activeTaskId === id) {
    selectNextTask();
  }
  render();
}

function applyDurationChange(key, value) {
  const previousDuration = modeDuration(state.mode);
  state.settings[key] = Math.max(1, Number(value) || DEFAULT_STATE.settings[key]);
  if (key === state.mode && !state.isRunning) {
    state.remainingSeconds = modeDuration(state.mode);
  } else if (key === state.mode) {
    state.remainingSeconds = Math.min(state.remainingSeconds, previousDuration);
    scheduleAlarm();
  }
  render();
}

function ensureAudio() {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {
      showStatus("Audio belum diizinkan. Aktifkan suara situs lalu tekan Start kembali.");
    });
  } catch { /* The timer still works in browsers without Web Audio. */ }
}

function startTimerWorker() {
  if (!window.Worker) return;
  try {
    timerWorker = new Worker("timer-worker.js");
    timerWorker.onmessage = () => runSecond();
    timerWorker.onerror = () => {
      timerWorker?.terminate();
      timerWorker = null;
    };
  } catch { /* The normal interval remains available, including file://. */ }
}

function cancelScheduledAlarm(preserveStarted = false) {
  alarmGeneration += 1;
  if (!scheduledAlarm) return false;
  const alarm = scheduledAlarm;
  scheduledAlarm = null;
  const started = audioContext.state === "running" && audioContext.currentTime >= alarm.at;
  if (!preserveStarted || !started) {
    alarm.source.onended = null;
    try { alarm.source.stop(); } catch { /* Already ended. */ }
    alarm.source.disconnect();
  }
  return started;
}

async function scheduleAlarm() {
  cancelScheduledAlarm();
  const generation = alarmGeneration;
  const sound = state.settings.alarmSound;
  if (!state.isRunning || !sound || !audioContext) return;
  const deadline = lastTickAt + state.remainingSeconds * 1000;
  try {
    let buffer = alarmBuffers.get(sound);
    if (!buffer) {
      const response = await fetch(sound);
      if (!response.ok) throw new Error("Alarm file unavailable");
      buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      alarmBuffers.set(sound, buffer);
    }
    if (generation !== alarmGeneration || !state.isRunning) return;
    // A delayed download must not play an alarm belonging to an expired mode.
    if (deadline <= Date.now()) { runSecond(); return; }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const at = audioContext.currentTime + (deadline - Date.now()) / 1000;
    scheduledAlarm = { source, at };
    source.onended = () => {
      source.disconnect();
      if (generation === alarmGeneration && state.isRunning) runSecond();
    };
    source.start(at);
  } catch {
    // HTML audio in completeMode is the fallback if decoding/fetch is unavailable.
  }
}

function beep(frequency, duration, volume = 0.08, type = "sine", delay = 0) {
  if (!audioContext) return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playAlarm() {
  const sound = state.settings.alarmSound;
  if (!sound) return;
  const alarmAudio = new Audio(sound);
  alarmAudio.volume = 1;
  alarmAudio.play().catch(() => showStatus("Alarm tidak dapat diputar. Periksa izin suara situs dan file audio."));
}

function updateAmbientSound() {
  if (!state.isRunning || !state.settings.ambientSound) {
    stopAmbientSound();
    return;
  }

  if (!ambientAudio) {
    ambientAudio = new Audio();
    ambientAudio.loop = true;
  }

  const source = state.settings.ambientSound;
  if (!ambientAudio.src.endsWith(source)) {
    ambientAudio.pause();
    ambientAudio.src = source;
    ambientAudio.currentTime = 0;
  }

  ambientAudio.volume = Math.max(0, Math.min(100, Number(state.settings.ambientVolume))) / 100;
  ambientAudio.play().catch(() => {
    state.settings.ambientSound = "";
    render();
  });
}

function stopAmbientSound() {
  if (!ambientAudio) return;
  ambientAudio.pause();
}

function notifyUser(completedMode) {
  const message = state.settings.notificationText.trim() || "Timer selesai.";
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(completedMode === "pomodoro" ? "Focus selesai" : "Break selesai", {
      body: message,
    });
  }
}

async function requestNotificationPermission() {
  if (notificationRequestPending) return;
  const current = notificationPermissionState();
  if (current === "granted") {
    renderNotificationButton();
    showStatus("Notifikasi sudah aktif.");
    return;
  }
  if (current === "unsupported" || current === "insecure" || current === "denied") {
    renderNotificationButton();
    showNotificationPermissionStatus(current);
    return;
  }
  notificationRequestPending = true;
  try {
    const permission = await Notification.requestPermission();
    renderNotificationButton(permission);
    showNotificationPermissionStatus(permission);
  } catch {
    renderNotificationButton();
    showStatus(location.protocol === "file:"
      ? "Chrome belum dapat mengaktifkan notifikasi dari file ini. Coba buka lewat localhost atau situs online."
      : "Izin notifikasi belum dapat diminta. Periksa izin situs di browser.");
  } finally {
    notificationRequestPending = false;
  }
}

function showNotificationPermissionStatus(permission) {
  if (permission === "granted") {
    showStatus("Notifikasi aktif.");
  } else if (permission === "unsupported") {
    showStatus("Browser ini belum mendukung notifikasi.");
  } else if (permission === "insecure") {
    showStatus("Buka lewat HTTPS atau localhost untuk mengaktifkan notifikasi.");
  } else if (location.protocol === "file:") {
    showStatus("Chrome belum mengizinkan notifikasi untuk file ini. Coba buka lewat localhost atau situs online.");
  } else {
    showStatus(permission === "denied"
      ? "Notifikasi diblokir. Ubah izin notifikasi pada pengaturan situs di browser."
      : "Izin notifikasi belum diberikan.");
  }
}

function resetDay() {
  askConfirmation("Mulai lagi hari ini?", "Progres fokus saat ini akan disimpan ke Statistics. Penghitung hari ini dan timer dimulai dari nol. Tugas, tema, dan pengaturan tetap tersimpan.", "Simpan & reset", () => {
    pauseTimer();
    const previous = JSON.parse(JSON.stringify(state));
    FocusData.archive(state, "reset");
    state.stats = { id: FocusData.makeId(), date: FocusData.dateKey(), sessions: 0, focusSeconds: 0 };
    state.cycleSessions = 0;
    state.mode = "pomodoro";
    state.remainingSeconds = modeDuration();
    if (!saveState()) {
      state = previous;
      showStatus("Reset dibatalkan karena progres belum bisa disimpan.");
    } else {
      showStatus("Progres tersimpan. Siap untuk sesi baru.");
    }
    render();
  });
}

function openSettingsDrawer() {
  elements.settingsDrawer.classList.add("open");
  elements.settingsDrawer.setAttribute("aria-hidden", "false");
  elements.settingsDrawer.inert = false;
  elements.settingsToggle.setAttribute("aria-expanded", "true");
  document.querySelector(".layout").inert = true;
  document.querySelector(".topbar").inert = true;
  document.body.style.overflow = "hidden";
  if (!elements.statisticsPanel.hidden) renderStatistics();
  elements.settingsClose.focus();
}

function closeSettingsDrawer() {
  elements.settingsDrawer.classList.remove("open");
  elements.settingsDrawer.inert = true;
  elements.settingsToggle.setAttribute("aria-expanded", "false");
  document.querySelector(".layout").inert = false;
  document.querySelector(".topbar").inert = false;
  document.body.style.overflow = "";
  closeAlarmSelect();
  closeAmbientSelect();
  elements.settingsToggle.focus();
  elements.settingsDrawer.setAttribute("aria-hidden", "true");
}

function openAlarmSelect() {
  closeAmbientSelect();
  elements.alarmSelect.classList.add("open");
  elements.alarmSoundButton.setAttribute("aria-expanded", "true");
  elements.alarmSoundMenu.inert = false;
  (elements.alarmSoundMenu.querySelector('[aria-selected="true"]') || elements.alarmSoundOptions[0])?.focus({ preventScroll: true });
}

function closeAlarmSelect() {
  elements.alarmSelect.classList.remove("open");
  elements.alarmSoundButton.setAttribute("aria-expanded", "false");
  elements.alarmSoundMenu.inert = true;
}

function toggleAlarmSelect() {
  if (elements.alarmSelect.classList.contains("open")) {
    closeAlarmSelect();
    return;
  }
  openAlarmSelect();
}

function openAmbientSelect() {
  closeAlarmSelect();
  elements.ambientSelect.classList.add("open");
  elements.ambientSoundButton.setAttribute("aria-expanded", "true");
  elements.ambientSoundMenu.inert = false;
  (elements.ambientSoundMenu.querySelector('[aria-selected="true"]') || elements.ambientSoundOptions[0])?.focus({ preventScroll: true });
}

function closeAmbientSelect() {
  elements.ambientSelect.classList.remove("open");
  elements.ambientSoundButton.setAttribute("aria-expanded", "false");
  elements.ambientSoundMenu.inert = true;
}

function toggleAmbientSelect() {
  if (elements.ambientSelect.classList.contains("open")) {
    closeAmbientSelect();
    return;
  }
  openAmbientSelect();
}

elements.startPause.addEventListener("click", () => {
  state.isRunning ? pauseTimer() : startTimer();
});

elements.resetTimer.addEventListener("click", () => {
  pauseTimer();
  state.remainingSeconds = modeDuration();
  render();
});

elements.skipMode.addEventListener("click", skipMode);

elements.modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

elements.modeTabs.forEach((tab, index) => {
  tab.addEventListener("keydown", (event) => {
    const directions = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: elements.modeTabs.length - 1 - index };
    if (!(event.key in directions)) return;
    event.preventDefault();
    const target = elements.modeTabs[(index + directions[event.key] + elements.modeTabs.length) % elements.modeTabs.length];
    setMode(target.dataset.mode);
    target.focus();
  });
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.taskInput.value.trim();
  if (!name) return;
  addTask(name, elements.taskEstimate.value);
  elements.taskInput.value = "";
  elements.taskEstimate.value = "1";
  elements.taskInput.focus();
});

[
  ["pomodoroDuration", "pomodoro"],
  ["shortBreakDuration", "shortBreak"],
  ["longBreakDuration", "longBreak"],
  ["longBreakInterval", "longBreakInterval"],
].forEach(([elementKey, settingKey]) => {
  elements[elementKey].addEventListener("change", (event) => {
    if (settingKey === "longBreakInterval") {
      state.settings.longBreakInterval = Math.max(2, Number(event.target.value) || 4);
      render();
      return;
    }
    applyDurationChange(settingKey, event.target.value);
  });
});

["autoStartBreaks", "autoStartPomodoros"].forEach((key) => {
  elements[key].addEventListener("change", (event) => {
    state.settings[key] = event.target.checked;
    render();
  });
});

elements.alarmSoundButton.addEventListener("click", toggleAlarmSelect);

elements.alarmSoundOptions.forEach((option) => {
  option.addEventListener("click", () => {
    state.settings.alarmSound = option.dataset.value;
    elements.alarmSound.value = state.settings.alarmSound;
    closeAlarmSelect();
    ensureAudio();
    if (state.isRunning) scheduleAlarm();
    playAlarm();
    render();
    elements.alarmSoundButton.focus();
  });
});

elements.alarmSound.addEventListener("change", () => {
  state.settings.alarmSound = elements.alarmSound.value;
  ensureAudio();
  if (state.isRunning) scheduleAlarm();
  playAlarm();
  render();
});

elements.ambientSoundButton.addEventListener("click", toggleAmbientSelect);

elements.ambientSoundOptions.forEach((option) => {
  option.addEventListener("click", () => {
    state.settings.ambientSound = option.dataset.value;
    elements.ambientSound.value = state.settings.ambientSound;
    closeAmbientSelect();
    updateAmbientSound();
    render();
    elements.ambientSoundButton.focus();
  });
});

// Listbox navigation changes focus; Enter/Space commits through the existing click handler.
[
  { root: elements.alarmSelect, button: elements.alarmSoundButton, menu: elements.alarmSoundMenu, options: elements.alarmSoundOptions, open: openAlarmSelect, close: closeAlarmSelect },
  { root: elements.ambientSelect, button: elements.ambientSoundButton, menu: elements.ambientSoundMenu, options: elements.ambientSoundOptions, open: openAmbientSelect, close: closeAmbientSelect },
].forEach(({ root, button, menu, options, open, close }) => {
  options.forEach((option) => { option.tabIndex = -1; });
  button.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    open();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Tab") return; // focusout closes after the browser moves focus.
    const index = [...options].indexOf(document.activeElement);
    const targets = { ArrowDown: (index + 1) % options.length, ArrowUp: (index - 1 + options.length) % options.length, Home: 0, End: options.length - 1 };
    if (!(event.key in targets)) return;
    event.preventDefault();
    options[targets[event.key]].focus();
  });
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) close();
  });
});

document.addEventListener("click", (event) => {
  if (!elements.alarmSelect.contains(event.target)) {
    closeAlarmSelect();
  }
  if (!elements.ambientSelect.contains(event.target)) {
    closeAmbientSelect();
  }
});

elements.ambientSound.addEventListener("change", () => {
  state.settings.ambientSound = elements.ambientSound.value;
  updateAmbientSound();
  render();
});

elements.ambientVolume.addEventListener("input", (event) => {
  state.settings.ambientVolume = Number(event.target.value);
  elements.ambientVolume.style.setProperty("--ambient-level", `${state.settings.ambientVolume}%`);
  updateAmbientSound();
  saveState();
});

elements.notificationText.addEventListener("input", (event) => {
  state.settings.notificationText = event.target.value;
  saveState();
});

elements.themeSwatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    state.settings.theme = swatch.dataset.theme;
    state.settings.useCustomColor = false;
    render();
  });
});

elements.customColor.addEventListener("input", (event) => {
  state.settings.customColor = event.target.value;
  saveState();
});

elements.customThemeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const bg = elements.customColor.value;
  let theme = state.settings.customThemes.find((item) => item.bg.toLowerCase() === bg.toLowerCase());
  if (!theme) {
    theme = { id: FocusData.makeId(), bg, name: elements.customThemeName.value.trim() || bg.toUpperCase() };
    state.settings.customThemes.push(theme);
  }
  state.settings.theme = `custom:${theme.id}`;
  elements.customThemeName.value = "";
  render();
  showStatus(`Warna ${theme.name} tersimpan.`);
});

function switchDrawerPanel(tab) {
  elements.drawerTabs.forEach((button) => {
    const selected = button === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.dataset.panel).hidden = !selected;
  });
  closeAlarmSelect();
  closeAmbientSelect();
  document.querySelector(".drawer-content").scrollTop = 0;
  if (!elements.statisticsPanel.hidden) renderStatistics();
}

elements.drawerTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => switchDrawerPanel(tab));
  tab.addEventListener("keydown", (event) => {
    const directions = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: elements.drawerTabs.length - 1 - index };
    if (!(event.key in directions)) return;
    event.preventDefault();
    const target = elements.drawerTabs[(index + directions[event.key] + elements.drawerTabs.length) % elements.drawerTabs.length];
    switchDrawerPanel(target);
    target.focus();
  });
});

elements.periodTabs.forEach((tab) => tab.addEventListener("click", () => {
  historyPeriod = tab.dataset.period;
  historyDate = "";
  elements.historyDate.value = "";
  selectedHistory.clear();
  renderStatistics();
}));
elements.historyDate.addEventListener("change", () => {
  historyDate = elements.historyDate.value;
  selectedHistory.clear();
  renderStatistics();
});
elements.clearHistoryDate.addEventListener("click", () => {
  historyDate = "";
  elements.historyDate.value = "";
  selectedHistory.clear();
  renderStatistics();
  elements.historyDate.focus();
});
elements.historyList.addEventListener("change", (event) => {
  const id = event.target.dataset.historyId;
  if (!id || id === "current") return;
  event.target.checked ? selectedHistory.add(id) : selectedHistory.delete(id);
  updateHistorySelection();
});
elements.selectAllHistory.addEventListener("change", () => {
  visibleHistory().forEach((entry) => elements.selectAllHistory.checked ? selectedHistory.add(entry.id) : selectedHistory.delete(entry.id));
  elements.historyList.querySelectorAll("[data-history-id]").forEach((checkbox) => { checkbox.checked = selectedHistory.has(checkbox.dataset.historyId); });
  updateHistorySelection();
});
elements.deleteHistory.addEventListener("click", () => {
  if (!selectedHistory.size) return;
  askConfirmation("Hapus arsip terpilih?", `${selectedHistory.size} arsip akan dihapus permanen. Progres aktif hari ini tetap tersimpan.`, "Hapus arsip", () => {
    const previous = state.history;
    state.history = state.history.filter((entry) => !selectedHistory.has(entry.id));
    if (!saveState()) {
      state.history = previous;
      showStatus("Arsip belum dihapus karena perubahan belum bisa disimpan.");
    } else {
      selectedHistory.clear();
      showStatus("Arsip terpilih dihapus.");
    }
    renderStatistics();
  });
});
elements.exportHistory.addEventListener("click", () => {
  if (state.isRunning) runSecond();
  const backup = { app: "Quiet Pomo", version: 3, exportedAt: new Date().toISOString(), current: state.stats, history: state.history };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `quiet-pomo-statistics-${FocusData.dateKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus("Cadangan statistik diunduh.");
});

elements.importHistory.addEventListener("click", () => elements.importHistoryFile.click());
elements.importHistoryFile.addEventListener("change", async () => {
  const file = elements.importHistoryFile.files[0];
  elements.importHistoryFile.value = "";
  if (!file) return;
  elements.importHistory.disabled = true;
  elements.importHistory.setAttribute("aria-busy", "true");
  elements.importHistory.textContent = "Membaca…";
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran cadangan maksimal 5 MB.");
    const backup = FocusData.parseBackup(JSON.parse(await file.text()));
    if (state.isRunning) runSecond();
    const snapshot = backup.current;
    const sameTotals = (entry) => entry.date === snapshot.date && entry.sessions === snapshot.sessions && entry.focusSeconds === snapshot.focusSeconds;
    const ambiguousSnapshot = snapshot.legacyCurrent && FocusData.hasProgress(snapshot) &&
      ![state.stats, ...state.history].some(sameTotals) &&
      [state.stats, ...state.history].some((entry) => entry.date === snapshot.date && FocusData.hasProgress(entry));
    elements.confirmImportCurrent.checked = false;
    const chosenBackup = () => ambiguousSnapshot && !elements.confirmImportCurrent.checked ?
      { ...backup, current: { ...snapshot, sessions: 0, focusSeconds: 0 } } : backup;
    const description = () => {
      const preview = FocusData.mergeBackup(state, chosenBackup());
      return `${preview.added} arsip baru dan ${preview.updated} pembaruan akan digabungkan. Statistik yang ada tetap disimpan. File ekspor ini hanya memuat statistik; tugas dan pengaturan tidak ikut diimpor.${ambiguousSnapshot && !elements.confirmImportCurrent.checked ? " Progres aktif ekspor lama tidak disertakan karena kemungkinan tumpang tindih." : ""}`;
    };
    askConfirmation("Impor statistik?", description(), "Gabungkan", () => {
      try {
        if (state.isRunning) runSecond();
        const merged = FocusData.mergeBackup(state, chosenBackup());
        const previous = { stats: state.stats, history: state.history };
        state.stats = merged.stats;
        state.history = merged.history;
        if (!saveState()) {
          state.stats = previous.stats;
          state.history = previous.history;
          showStatus("Impor dibatalkan karena penyimpanan browser gagal.");
          return;
        }
        selectedHistory.clear();
        historyPeriod = "all";
        historyDate = "";
        elements.historyDate.value = "";
        render();
        showStatus(`Impor selesai: ${merged.added} arsip baru, ${merged.updated} diperbarui.`);
      } catch (error) { showStatus(error.message); }
    });
    if (ambiguousSnapshot) {
      elements.confirmImportOptions.hidden = false;
      elements.confirmImportCurrent.onchange = () => { elements.confirmDescription.textContent = description(); };
    }
  } catch (error) {
    showStatus(error instanceof SyntaxError ? "File JSON tidak valid. Pilih file hasil Ekspor Quiet Pomo." : error.message);
  } finally {
    elements.importHistory.disabled = false;
    elements.importHistory.removeAttribute("aria-busy");
    elements.importHistory.textContent = "Impor";
  }
});
elements.confirmCancel.addEventListener("click", () => {
  confirmAction = null;
  elements.confirmDialog.close();
});
elements.confirmAccept.addEventListener("click", () => {
  const action = confirmAction;
  confirmAction = null;
  elements.confirmDialog.close();
  action?.();
});
elements.confirmDialog.addEventListener("close", () => {
  // A queued close event from the previous dialog must not erase a new action.
  if (!elements.confirmDialog.open) confirmAction = null;
});

elements.notificationPermission.addEventListener("click", requestNotificationPermission);
elements.resetDay.addEventListener("click", resetDay);
elements.settingsToggle.addEventListener("click", openSettingsDrawer);
elements.settingsClose.addEventListener("click", closeSettingsDrawer);
elements.drawerBackdrop.addEventListener("click", closeSettingsDrawer);

window.addEventListener("keydown", (event) => {
  if (elements.confirmDialog.open) return;
  if (event.key === "Tab" && elements.settingsDrawer.classList.contains("open")) {
    const focusable = [...elements.settingsDrawer.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, [tabindex="0"]')]
      .filter((element) => element.getClientRects().length && !element.closest("[inert]") && element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !elements.settingsDrawer.contains(document.activeElement))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }
  if (event.key === "Escape" && elements.alarmSelect.classList.contains("open")) {
    closeAlarmSelect();
    elements.alarmSoundButton.focus();
    return;
  }
  if (event.key === "Escape" && elements.ambientSelect.classList.contains("open")) {
    closeAmbientSelect();
    elements.ambientSoundButton.focus();
    return;
  }
  if (event.key === "Escape" && elements.settingsDrawer.classList.contains("open")) {
    closeSettingsDrawer();
  }
});

window.addEventListener("beforeunload", () => {
  if (state.isRunning) runSecond();
  saveState();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderNotificationButton();
  if (state.isRunning) runSecond();
  else if (FocusData.rollover(state)) render();
});
window.addEventListener("focus", () => renderNotificationButton());
window.setInterval(() => {
  if (!state.isRunning && FocusData.rollover(state)) render();
}, 1000);

function hasOption(select, value) {
  return [...select.options].some((option) => option.value === value);
}

if (!MODES.includes(state.mode)) state.mode = "pomodoro";
if (!state.remainingSeconds || state.remainingSeconds < 0) state.remainingSeconds = modeDuration();
if (!hasOption(elements.alarmSound, state.settings.alarmSound)) {
  state.settings.alarmSound = DEFAULT_STATE.settings.alarmSound;
}
if (!hasOption(elements.ambientSound, state.settings.ambientSound)) {
  state.settings.ambientSound = DEFAULT_STATE.settings.ambientSound;
}
closeAlarmSelect();
closeAmbientSelect();
render();
watchNotificationPermission();
