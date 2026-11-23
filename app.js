/* Quiet Pomo — application.
 * Sections: constants · state & persistence · theme · timer engine · audio · notifications ·
 * tasks · statistics & backup · presentation (render*) · navigation, sheets & dialogs · events.
 * Domain rules (timer accounting, task progress, archive/rollover, backup merge) are unchanged
 * from the previous version; presentation code only reads state and calls those functions. */
const STORAGE_KEY = "quiet-pomo-state-v1";
const FocusData = QuietPomoData;
const Motion = QuietMotion;

const MODES = ["pomodoro", "shortBreak", "longBreak"];
const MODE_LABELS = { pomodoro: "Fokus", shortBreak: "Rehat singkat", longBreak: "Rehat panjang" };

const ALARM_SOUNDS = [
  ["assets/notification/alarm-beep.mp3", "Bip alarm"],
  ["assets/notification/beeps.mp3", "Bip beruntun"],
  ["assets/notification/bell.wav", "Lonceng"],
  ["assets/notification/musical1.mp3", "Melodi 1"],
  ["assets/notification/musical2.mp3", "Melodi 2"],
  ["assets/notification/piano-music.mp3", "Piano"],
  ["assets/notification/ring-tone.mp3", "Nada dering"],
  ["assets/notification/timer.mp3", "Timer dapur"],
  ["assets/notification/victory.mp3", "Kemenangan"],
];
const AMBIENT_SOUNDS = [
  ["", "Mati"],
  ["assets/audio/coffee-shop.m4a", "Kedai kopi"],
  ["assets/audio/fast-ticking.m4a", "Detak cepat"],
  ["assets/audio/fire-burning.m4a", "Api unggun"],
  ["assets/audio/library.m4a", "Perpustakaan"],
  ["assets/audio/ocean-shore.m4a", "Tepi pantai"],
  ["assets/audio/rain.m4a", "Hujan"],
  ["assets/audio/stream.m4a", "Aliran sungai"],
  ["assets/audio/ticking.m4a", "Detak jam"],
  ["assets/audio/wind-through-trees.m4a", "Angin di pepohonan"],
  ["assets/audio/wind-with-crickets.m4a", "Angin & jangkrik"],
];
const soundLabel = (list, value) => list.find(([path]) => path === value)?.[1] || list[0][1];

// Background colors identify themes in saved data and drive the custom palette resolver.
const THEMES = {
  paper: { bg: "#f6f5f1" },
  sage: { bg: "#dfe8dc" },
  clay: { bg: "#efd6cb" }, // Read old installations; offered as a saved custom palette after migration.
  ink: { bg: "#161719" },
};

// Hand-tuned tokens for the three built-in themes. Custom palettes are resolved in resolveCustomTokens().
const THEME_TOKENS = {
  paper: {
    scheme: "light", bg: "#f6f5f1", surface: "#fdfcfa", surface2: "#ebe9e3", surface3: "#e2dfd7",
    text: "#1d1c19", muted: "#615e56", fieldLine: "#87837a", line: "rgba(29, 28, 25, .10)", lineStrong: "rgba(29, 28, 25, .2)",
    control: "#1d1c19", onControl: "#fbfaf7", toneFocus: "#1d1c19", toneRest: "#3b6656", danger: "#a3372a",
    scrim: "rgba(29, 28, 25, .28)", shadowTint: "29, 28, 25",
  },
  sage: {
    scheme: "light", bg: "#dfe8dc", surface: "#eef3ec", surface2: "#d0dbcc", surface3: "#c5d2c1",
    text: "#17251c", muted: "#43554a", fieldLine: "#647769", line: "rgba(23, 37, 28, .11)", lineStrong: "rgba(23, 37, 28, .22)",
    control: "#1d3527", onControl: "#f1f6ef", toneFocus: "#1d3527", toneRest: "#2b5a6a", danger: "#8f2f22",
    scrim: "rgba(23, 37, 28, .3)", shadowTint: "23, 37, 28",
  },
  ink: {
    scheme: "dark", bg: "#161719", surface: "#1e1f22", surface2: "#27292d", surface3: "#303237",
    text: "#f0efeb", muted: "#a9a7a0", fieldLine: "#7b7973", line: "rgba(240, 239, 235, .10)", lineStrong: "rgba(240, 239, 235, .2)",
    control: "#f0efeb", onControl: "#161719", toneFocus: "#f0efeb", toneRest: "#92c3b0", danger: "#f19484",
    scrim: "rgba(0, 0, 0, .55)", shadowTint: "0, 0, 0",
  },
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

const DURATION_LIMITS = {
  pomodoro: [1, 180, "Fokus"], shortBreak: [1, 90, "Rehat singkat"], longBreak: [1, 120, "Rehat panjang"], longBreakInterval: [2, 12, "Interval rehat panjang"],
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
let confirmOpener = null;
let notificationRequestPending = false;
let timerWorker = null;
let scheduledAlarm = null;
let alarmGeneration = 0;
const alarmBuffers = new Map();
const expandedTasks = new Set();

// Presentation-only state. Never persisted.
const ui = {
  view: "focus",
  rulerKey: "",
  lastMode: null,
  lastTimerState: null,
  completion: null,
  tasksSignature: "",
  doneCollapsed: false,
  newTaskId: null,
  statusAction: null,
  sheetOpener: null,
  cycleFilled: -1,
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  body: document.body,
  timerDisplay: $("#timerDisplay"),
  timerTitle: $("#timerTitle"),
  timerStatusText: $("#timerStatusText"),
  ruler: $("#ruler"),
  rulerCaption: $("#rulerCaption"),
  currentTask: $("#currentTask"),
  contextMeta: $("#contextMeta"),
  contextCard: $("#contextCard"),
  contextIconUse: $("#contextIconUse"),
  changeTask: $("#changeTask"),
  startPause: $("#startPause"),
  startPauseLabel: $("#startPauseLabel"),
  resetTimer: $("#resetTimer"),
  skipMode: $("#skipMode"),
  modeSwitch: $("#modeSwitch"),
  modeTabs: document.querySelectorAll(".mode-option"),
  ambienceQuick: $("#ambienceQuick"),
  ambienceQuickLabel: $("#ambienceQuickLabel"),
  sessionCount: $("#sessionCount"),
  focusMinutes: $("#focusMinutes"),
  finishEstimate: $("#finishEstimate"),
  cycleDots: $("#cycleDots"),
  cycleLabel: $("#cycleLabel"),
  navItems: document.querySelectorAll("[data-nav]"),
  navTaskBadge: $("#navTaskBadge"),
  miniTimer: $("#miniTimer"),
  miniTime: $("#miniTime"),
  miniLabel: $("#miniLabel"),
  miniToggle: $("#miniToggle"),
  taskForm: $("#taskForm"),
  taskInput: $("#taskInput"),
  taskEstimate: $("#taskEstimate"),
  taskFormHint: $("#taskFormHint"),
  taskList: $("#taskList"),
  taskDoneGroup: $("#taskDoneGroup"),
  taskDoneList: $("#taskDoneList"),
  taskDoneToggle: $("#taskDoneToggle"),
  taskDoneLabel: $("#taskDoneLabel"),
  taskSummary: $("#taskSummary"),
  taskSheet: $("#taskSheet"),
  taskPickList: $("#taskPickList"),
  taskSheetManage: $("#taskSheetManage"),
  ambienceSheet: $("#ambienceSheet"),
  ambienceChoices: $("#ambienceChoices"),
  ambienceHint: $("#ambienceHint"),
  ambienceSettings: $("#ambienceSettings"),
  ambienceSettingsValue: $("#ambienceSettingsValue"),
  pomodoroDuration: $("#pomodoroDuration"),
  shortBreakDuration: $("#shortBreakDuration"),
  longBreakDuration: $("#longBreakDuration"),
  longBreakInterval: $("#longBreakInterval"),
  durationError: $("#durationError"),
  autoStartBreaks: $("#autoStartBreaks"),
  autoStartPomodoros: $("#autoStartPomodoros"),
  alarmChoices: $("#alarmChoices"),
  ambientVolume: $("#ambientVolume"),
  ambientVolumeValue: $("#ambientVolumeValue"),
  ambientVolumeQuick: $("#ambientVolumeQuick"),
  ambientVolumeQuickValue: $("#ambientVolumeQuickValue"),
  notificationText: $("#notificationText"),
  notificationPermission: $("#notificationPermission"),
  permissionTitle: $("#permissionTitle"),
  permissionHint: $("#permissionHint"),
  permissionAction: $("#permissionAction"),
  permissionIconUse: $("#permissionIconUse"),
  customColor: $("#customColor"),
  themeSwatches: document.querySelectorAll(".theme-swatch"),
  customThemes: $("#customThemes"),
  customThemeForm: $("#customThemeForm"),
  customThemeName: $("#customThemeName"),
  statisticsPanel: $("#statisticsPanel"),
  resetDay: $("#resetDay"),
  todayCardFocus: $("#todayCardFocus"),
  todayCardSessions: $("#todayCardSessions"),
  periodTabs: document.querySelectorAll("[data-period]"),
  historyDate: $("#historyDate"),
  clearHistoryDate: $("#clearHistoryDate"),
  historyFocus: $("#historyFocus"),
  historySessions: $("#historySessions"),
  historyAverage: $("#historyAverage"),
  historyBest: $("#historyBest"),
  chartFigure: $("#chartFigure"),
  focusChart: $("#focusChart"),
  chartCaption: $("#chartCaption"),
  chartMax: $("#chartMax"),
  historyList: $("#historyList"),
  selectAllHistory: $("#selectAllHistory"),
  deleteHistory: $("#deleteHistory"),
  exportHistory: $("#exportHistory"),
  importHistory: $("#importHistory"),
  importHistoryFile: $("#importHistoryFile"),
  statusMessage: $("#statusMessage"),
  statusText: $("#statusText"),
  statusAction: $("#statusAction"),
  storageWarning: $("#storageWarning"),
  confirmDialog: $("#confirmDialog"),
  confirmTitle: $("#confirmTitle"),
  confirmDescription: $("#confirmDescription"),
  confirmIconUse: $("#confirmIconUse"),
  confirmAccept: $("#confirmAccept"),
  confirmCancel: $("#confirmCancel"),
  confirmImportOptions: $("#confirmImportOptions"),
  confirmImportCurrent: $("#confirmImportCurrent"),
  themeColorMeta: document.querySelector('meta[name="theme-color"]'),
};

const desktopQuery = window.matchMedia("(min-width: 1024px)");
const isDesktop = () => desktopQuery.matches;

function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#i-${name}" /></svg>`;
}

/* ───────────────────────── State & persistence ───────────────────────── */

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

/* ───────────────────────── Theme ───────────────────────── */

const hexToRgb = (hex) => hex.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16));
const rgbToHex = (rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
const mixHex = (from, to, amount) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex(a.map((value, index) => value + (b[index] - value) * amount));
};
function relativeLuminance(hex) {
  return hexToRgb(hex).reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
}
const contrastRatio = (a, b) => {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
// Blend a color toward the text color until it reaches the contrast target on every surface.
function readableOn(surfaces, start, text, minimum) {
  for (let step = 0; step <= 100; step += 1) {
    const candidate = mixHex(start, text, step / 100);
    if (surfaces.every((surface) => contrastRatio(candidate, surface) >= minimum)) return candidate;
  }
  return text;
}

function resolveCustomTokens(bg) {
  const dark = relativeLuminance(bg) < .179;
  // Custom palettes can sit close to the light/dark crossover: text is pure black/white and
  // every derived surface moves away from the text so contrast never drops below the target.
  const text = dark ? "#ffffff" : "#000000";
  const away = dark ? "#000000" : "#ffffff";
  const surfaces = dark
    ? [bg, mixHex(bg, away, .18), mixHex(bg, away, .32), mixHex(bg, away, .42)]
    : [bg, mixHex(bg, away, .6), mixHex(bg, away, .22), mixHex(bg, away, .34)];
  const [, surface, surface2, surface3] = surfaces;
  const muted = readableOn(surfaces, bg, text, 4.5);
  const rgb = hexToRgb(text).join(", ");
  return {
    scheme: dark ? "dark" : "light", bg, surface, surface2, surface3, text, muted,
    fieldLine: readableOn(surfaces, bg, text, 3),
    line: `rgba(${rgb}, .12)`, lineStrong: `rgba(${rgb}, .24)`,
    control: text, onControl: dark ? "#000000" : "#ffffff",
    toneFocus: text, toneRest: muted,
    danger: readableOn(surfaces, dark ? "#ff8a7a" : "#c0392b", text, 4.5),
    scrim: dark ? "rgba(0, 0, 0, .6)" : "rgba(0, 0, 0, .3)", shadowTint: "0, 0, 0",
  };
}

function currentThemeTokens() {
  const custom = state.settings.customThemes.find((theme) => `custom:${theme.id}` === state.settings.theme);
  if (custom) return { key: "custom", tokens: resolveCustomTokens(custom.bg) };
  const key = THEME_TOKENS[state.settings.theme] ? state.settings.theme : "paper";
  return { key, tokens: THEME_TOKENS[key] };
}

function applyTokens(target, tokens) {
  const map = {
    "--bg": tokens.bg, "--surface": tokens.surface, "--surface-2": tokens.surface2, "--surface-3": tokens.surface3,
    "--text": tokens.text, "--muted": tokens.muted, "--field-line": tokens.fieldLine, "--line": tokens.line,
    "--line-strong": tokens.lineStrong, "--control": tokens.control, "--on-control": tokens.onControl,
    "--focus": tokens.text, "--tone-focus": tokens.toneFocus, "--tone-rest": tokens.toneRest,
    "--danger": tokens.danger, "--scrim": tokens.scrim, "--shadow-tint": tokens.shadowTint,
  };
  Object.entries(map).forEach(([key, value]) => target.style.setProperty(key, value));
}

function renderTheme() {
  const { key, tokens } = currentThemeTokens();
  const root = document.documentElement;
  applyTokens(root, tokens);
  root.style.colorScheme = tokens.scheme;
  document.body.dataset.theme = key;
  document.body.dataset.scheme = tokens.scheme;
  elements.themeColorMeta?.setAttribute("content", tokens.bg);
  elements.themeSwatches.forEach((swatch) => {
    const selected = swatch.dataset.theme === state.settings.theme;
    swatch.setAttribute("aria-pressed", String(selected));
    if (!swatch.dataset.painted) {
      applyTokens(swatch.querySelector(".theme-preview"), THEME_TOKENS[swatch.dataset.theme]);
      swatch.dataset.painted = "true";
    }
  });
}

function selectTheme(theme) {
  if (state.settings.theme === theme) return;
  state.settings.theme = theme;
  state.settings.useCustomColor = false;
  saveState();
  Motion.crossfade(() => render());
}

/* ───────────────────────── Timer engine ───────────────────────── */

function modeDuration(mode = state.mode) {
  return Math.max(1, Number(state.settings[mode] || DEFAULT_STATE.settings[mode])) * 60;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function timerState() {
  if (state.isRunning) return "running";
  return state.remainingSeconds < modeDuration() ? "paused" : "idle";
}

function activeTask() {
  return state.tasks.find((task) => task.id === state.activeTaskId && !task.completed) || null;
}

function remainingPomodoros() {
  return state.tasks.reduce((total, task) => total + (task.completed ? 0 : Math.max(0, task.estimate - task.done)), 0);
}

function setMode(mode, options = {}) {
  if (!MODES.includes(mode)) return;
  if (state.isRunning) runSecond();
  state.mode = mode;
  state.isRunning = false;
  state.remainingSeconds = options.keepRemaining ? state.remainingSeconds : modeDuration(mode);
  stopTimer();
  ui.completion = null;
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
  if (ui.view === "stats") renderStatistics();
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
  markCompletion(completedMode, shouldAutoStart); // Presentation hook: status line, cycle mark, toast.
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
  ui.completion = null;
  render();

  if (shouldAutoStart) {
    startTimer();
  }
}

function resetTimer() {
  pauseTimer();
  state.remainingSeconds = modeDuration();
  ui.completion = null;
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

/* ───────────────────────── Audio ───────────────────────── */

function ensureAudio() {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {
      showStatus("Audio belum diizinkan. Aktifkan suara situs lalu tekan Mulai lagi.");
    });
  } catch { /* The timer still works in browsers without Web Audio. */ }
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
    showStatus("Suara latar tidak dapat diputar, jadi dimatikan. Periksa izin suara situs.");
    render();
  });
}

function stopAmbientSound() {
  if (!ambientAudio) return;
  ambientAudio.pause();
}

/* ───────────────────────── Notifications ───────────────────────── */

function notifyUser(completedMode) {
  const message = state.settings.notificationText.trim() || "Timer selesai.";
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(completedMode === "pomodoro" ? "Sesi fokus selesai" : "Rehat selesai", {
      body: message,
    });
  }
}

function notificationPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
}

const PERMISSION_COPY = {
  granted: ["Notifikasi aktif", "Notifikasi browser aktif", "Kamu akan diberi tahu saat sesi fokus atau rehat selesai.", "Kirim contoh"],
  default: ["Aktifkan notifikasi", "Notifikasi browser belum aktif", "Izinkan agar kamu tahu saat sesi selesai di tab lain.", "Izinkan"],
  denied: ["Notifikasi diblokir — periksa izin situs", "Notifikasi diblokir", "Buka pengaturan situs di browser, ubah izin Notifikasi menjadi Izinkan, lalu muat ulang.", "Cara membuka"],
  unsupported: ["Browser ini belum mendukung notifikasi", "Browser belum mendukung notifikasi", "Alarm suara tetap berbunyi saat sesi selesai.", ""],
  insecure: ["Notifikasi membutuhkan HTTPS atau localhost", "Butuh HTTPS atau localhost", "Buka Quiet Pomo lewat HTTPS atau localhost untuk memakai notifikasi.", ""],
};

function renderNotificationButton(permission = notificationPermissionState()) {
  const allowed = permission === "granted";
  const [label, title, hint, action] = PERMISSION_COPY[permission] || PERMISSION_COPY.default;
  const button = elements.notificationPermission;
  if (button.dataset.permission !== permission) {
    const icon = allowed ? "#i-bell" : "#i-bell-off";
    button.querySelector("use").setAttribute("href", icon);
    elements.permissionIconUse.setAttribute("href", icon);
  }
  button.dataset.permission = permission;
  // A permanent "no" lives in Settings only; the header keeps just the actionable states.
  button.hidden = permission === "denied" || permission === "unsupported" || permission === "insecure";
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  elements.permissionTitle.textContent = title;
  elements.permissionHint.textContent = hint;
  elements.permissionAction.textContent = action;
  elements.permissionAction.hidden = !action;
  elements.permissionAction.closest(".permission-row").dataset.permission = permission;
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

function sendTestNotification() {
  try {
    new Notification("Quiet Pomo", { body: state.settings.notificationText.trim() || "Timer selesai." });
    showStatus("Contoh notifikasi dikirim.");
  } catch {
    showStatus("Contoh notifikasi tidak dapat ditampilkan di browser ini.");
  }
}

/* ───────────────────────── Tasks ───────────────────────── */

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
  ui.newTaskId = task.id;
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

function toggleTaskCompleted(task) {
  if (state.isRunning) runSecond();
  task.completed = !task.completed;
  if (task.completed) task.subtasks.forEach((subtask) => { subtask.completed = true; });
  if (task.completed && state.activeTaskId === task.id) selectNextTask();
  else if (!task.completed && !activeTask()) state.activeTaskId = task.id;
  render();
}

function selectTask(task) {
  if (state.isRunning) runSecond();
  if (task.completed) return;
  state.activeTaskId = task.id;
  render();
}

function deleteTaskWithUndo(id) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index < 0) return;
  const removed = JSON.parse(JSON.stringify(state.tasks[index]));
  const wasActive = state.activeTaskId === id;
  deleteTask(id);
  showStatus(`Tugas “${truncate(removed.name, 40)}” dihapus.`, {
    label: "Urungkan",
    run: () => {
      if (state.tasks.some((task) => task.id === removed.id)) return;
      state.tasks.splice(Math.min(index, state.tasks.length), 0, removed);
      if (wasActive && !removed.completed) state.activeTaskId = removed.id;
      render();
      showStatus("Tugas dikembalikan.");
    },
  });
}

const truncate = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/* ───────────────────────── Day reset ───────────────────────── */

function resetDay() {
  const minutes = formatFocus(state.stats.focusSeconds);
  askConfirmation(
    "Arsipkan progres hari ini?",
    `${state.stats.sessions} sesi dan ${minutes} fokus akan disimpan ke Riwayat, lalu penghitung hari ini dan timer mulai dari nol. Tugas, tema, dan pengaturan tidak berubah. Ini berbeda dengan Ulang timer, yang hanya mengembalikan waktu sesi saat ini.`,
    "Arsipkan & mulai dari nol",
    () => {
      pauseTimer();
      const previous = JSON.parse(JSON.stringify(state));
      FocusData.archive(state, "reset");
      state.stats = { id: FocusData.makeId(), date: FocusData.dateKey(), sessions: 0, focusSeconds: 0 };
      state.cycleSessions = 0;
      state.mode = "pomodoro";
      state.remainingSeconds = modeDuration();
      ui.completion = null;
      if (!saveState()) {
        state = previous;
        showStatus("Arsip dibatalkan karena progres belum bisa disimpan.");
      } else {
        showStatus("Progres tersimpan di Riwayat. Siap untuk sesi baru.");
      }
      render();
    },
    { icon: "archive" },
  );
}

/* ───────────────────────── Presentation ───────────────────────── */

function render() {
  if (!state.isRunning) FocusData.rollover(state);
  renderTheme();
  renderTimer();
  renderTasks();
  renderSettings();
  renderCustomThemes();
  renderNotificationButton();
  if (ui.view === "stats") renderStatistics();
  saveState();
}

function updateDocumentTitle(status) {
  document.title = `${formatTime(state.remainingSeconds)} · ${status} — Quiet Pomo`;
}

const STATUS_COPY = {
  idle: { pomodoro: "Siap fokus", shortBreak: "Siap rehat singkat", longBreak: "Siap rehat panjang" },
  running: { pomodoro: "Fokus berjalan", shortBreak: "Rehat singkat berjalan", longBreak: "Rehat panjang berjalan" },
  paused: { pomodoro: "Fokus dijeda", shortBreak: "Rehat dijeda", longBreak: "Rehat dijeda" },
};
const BREAK_COPY = {
  shortBreak: "Lepaskan pandangan dari layar sejenak.",
  longBreak: "Berdiri, minum air, biarkan pikiran mengendap.",
};

function renderTimer() {
  const mode = state.mode;
  const status = timerState();
  const duration = modeDuration();
  const elapsed = Math.max(0, duration - state.remainingSeconds);
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
  const task = activeTask();
  const isBreak = mode !== "pomodoro";

  elements.body.dataset.timerMode = mode;
  elements.body.dataset.timer = status;
  elements.body.dataset.rest = String(isBreak);
  elements.timerDisplay.textContent = formatTime(state.remainingSeconds);
  elements.timerDisplay.setAttribute("aria-label", `Waktu tersisa ${formatTime(state.remainingSeconds)}, ${MODE_LABELS[mode]}`);

  renderRuler(duration, progress, status);

  let statusText = STATUS_COPY[status][mode];
  if (status === "idle" && ui.completion) {
    statusText = ui.completion.mode === "pomodoro" ? "Sesi fokus selesai · waktunya rehat" : "Rehat selesai · siap fokus lagi";
  }
  elements.timerStatusText.textContent = statusText;
  elements.body.dataset.completed = String(Boolean(ui.completion && status === "idle"));

  const modeIndex = MODES.indexOf(mode);
  elements.modeSwitch.style.setProperty("--mode-index", modeIndex);
  elements.modeTabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-checked", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });

  const startLabel = status === "running" ? "Jeda" : status === "paused" ? "Lanjutkan" : isBreak ? "Mulai rehat" : "Mulai fokus";
  if (elements.startPauseLabel.textContent !== startLabel) {
    elements.startPauseLabel.textContent = startLabel;
    elements.startPause.querySelector("use").setAttribute("href", status === "running" ? "#i-pause" : "#i-play");
    if (ui.lastTimerState !== null) Motion.enter(elements.startPause.querySelector(".icon"), { y: 0, scale: .6, duration: Motion.DURATION.base });
  }
  elements.startPause.setAttribute("aria-keyshortcuts", "Space");
  elements.resetTimer.disabled = status === "idle";

  // Context: the active task while focusing, a short rest prompt while on a break.
  elements.timerTitle.textContent = isBreak ? MODE_LABELS[mode] : task ? "Sedang dikerjakan" : "Tanpa tugas terpilih";
  elements.currentTask.textContent = isBreak ? BREAK_COPY[mode] : task ? task.name : "Fokus bebas";
  elements.currentTask.title = !isBreak && task ? task.name : "";
  const openTasks = state.tasks.filter((item) => !item.completed);
  let meta = "";
  if (!isBreak && task) {
    const doneSubtasks = task.subtasks.filter((subtask) => subtask.completed).length;
    meta = `Pomodoro ${Math.min(task.done + 1, task.estimate)}/${task.estimate}${task.done >= task.estimate ? " · estimasi tercapai" : ""}${task.subtasks.length ? ` · Subtugas ${doneSubtasks}/${task.subtasks.length}` : ""}`;
  } else if (!isBreak) {
    meta = openTasks.length ? "Pilih tugas agar progresnya tercatat otomatis." : "Tambahkan tugas agar progresnya tercatat otomatis.";
  } else if (task) {
    meta = `Berikutnya: ${task.name}`;
  }
  elements.contextMeta.textContent = meta;
  elements.contextMeta.hidden = !meta;
  elements.changeTask.textContent = openTasks.length ? (task ? "Ganti" : "Pilih tugas") : "Tambah tugas";
  elements.changeTask.setAttribute("aria-label", openTasks.length ? "Ganti tugas yang difokuskan" : "Tambah tugas baru");
  const contextKind = isBreak ? "rest" : task ? "task" : "free";
  if (elements.contextCard.dataset.kind !== contextKind) {
    elements.contextIconUse.setAttribute("href", contextKind === "rest" ? "#i-leaf" : contextKind === "task" ? "#i-target" : "#i-focus");
  }
  elements.contextCard.dataset.kind = contextKind;

  const ambience = soundLabel(AMBIENT_SOUNDS, state.settings.ambientSound);
  elements.ambienceQuickLabel.textContent = state.settings.ambientSound ? `${ambience} · ${state.settings.ambientVolume}%` : "Suara latar: Mati";
  elements.ambienceQuick.setAttribute("aria-label", `Suara latar: ${ambience}${state.settings.ambientSound ? `, volume ${state.settings.ambientVolume}%` : ""}. Ubah suara latar`);
  elements.ambienceQuick.dataset.on = String(Boolean(state.settings.ambientSound));

  elements.sessionCount.textContent = String(state.stats.sessions);
  elements.focusMinutes.textContent = formatFocus(state.stats.focusSeconds);
  renderFinishEstimate();
  renderCycle();
  renderMiniTimer(status);

  if (ui.lastMode && ui.lastMode !== mode) {
    // Focus → rest settles downward; rest → focus rises. The value is already final.
    const y = isBreak ? -10 : 10;
    Motion.enter(elements.timerDisplay, { y, duration: Motion.DURATION.slow });
    Motion.enter(elements.contextCard, { y: y / 2, duration: Motion.DURATION.slow, delay: 40 });
  }
  ui.lastMode = mode;
  ui.lastTimerState = status;
  updateDocumentTitle(status === "running" ? MODE_LABELS[mode] : status === "paused" ? "Dijeda" : "Siap");
}

function renderRuler(duration, progress, status) {
  const minutes = Math.round(duration / 60);
  const key = `${state.mode}:${minutes}`;
  if (ui.rulerKey !== key) {
    ui.rulerKey = key;
    const perTick = minutes > 60 ? 5 : 1;
    const segments = Math.max(1, Math.ceil(minutes / perTick));
    const majorEvery = perTick === 5 ? 3 : 5;
    const ticks = Array.from({ length: segments + 1 }, (_, index) => `<i${index % majorEvery === 0 || index === segments ? ' class="major"' : ""}></i>`).join("");
    elements.ruler.querySelectorAll(".ruler-ticks").forEach((layer) => { layer.innerHTML = ticks; });
    elements.ruler.dataset.dense = String(segments > 40);
  }
  elements.ruler.style.setProperty("--p", progress.toFixed(5));
  if (status === "running") {
    const end = new Date(Date.now() + state.remainingSeconds * 1000);
    elements.rulerCaption.textContent = `Selesai pukul ${end.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (status === "paused") {
    elements.rulerCaption.textContent = `Dijeda · sisa ${Math.ceil(state.remainingSeconds / 60)} menit dari ${minutes}`;
  } else {
    elements.rulerCaption.textContent = `${minutes} menit ${state.mode === "pomodoro" ? "fokus" : "rehat"}`;
  }
}

function renderCycle() {
  const interval = Math.max(2, Number(state.settings.longBreakInterval) || 4);
  let filled = state.cycleSessions % interval;
  if (filled === 0 && state.cycleSessions > 0 && state.mode === "longBreak") filled = interval;
  if (elements.cycleDots.children.length !== interval) {
    elements.cycleDots.innerHTML = Array.from({ length: interval }, () => "<i></i>").join("");
  }
  [...elements.cycleDots.children].forEach((dot, index) => dot.classList.toggle("filled", index < filled));
  elements.cycleLabel.textContent = filled >= interval ? "Waktunya rehat panjang" : "Menuju rehat panjang";
  elements.cycleDots.setAttribute("aria-label", `${filled} dari ${interval} sesi menuju rehat panjang`);
  if (ui.cycleFilled >= 0 && filled > ui.cycleFilled) Motion.pop(elements.cycleDots.children[filled - 1], 1.6);
  ui.cycleFilled = filled;
}

function renderFinishEstimate() {
  const left = remainingPomodoros();
  if (!left) {
    elements.finishEstimate.textContent = "—";
    elements.finishEstimate.title = "Tambahkan estimasi tugas untuk melihat perkiraan selesai.";
    return;
  }

  const focus = left * state.settings.pomodoro;
  const breaks = Math.max(0, left - 1) * state.settings.shortBreak;
  const longBreaks = Math.floor(Math.max(0, left - 1) / state.settings.longBreakInterval) * state.settings.longBreak;
  const date = new Date(Date.now() + (focus + breaks + longBreaks) * 60 * 1000);
  elements.finishEstimate.textContent = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  elements.finishEstimate.title = `${left} pomodoro tersisa dari semua tugas`;
}

function renderMiniTimer(status = timerState()) {
  const onStage = ui.view === "focus" || (ui.view === "tasks" && isDesktop());
  const visible = !onStage && status !== "idle";
  if (elements.miniTimer.hidden === visible) {
    elements.miniTimer.hidden = !visible;
    if (visible) Motion.enter(elements.miniTimer, { y: -4, duration: Motion.DURATION.base });
  }
  if (!visible) return;
  elements.miniTime.textContent = formatTime(state.remainingSeconds);
  elements.miniLabel.textContent = status === "paused" ? "Dijeda" : MODE_LABELS[state.mode];
  const running = status === "running";
  elements.miniToggle.querySelector("use").setAttribute("href", running ? "#i-pause" : "#i-play");
  elements.miniToggle.setAttribute("aria-label", running ? "Jeda timer" : "Lanjutkan timer");
}

function markCompletion(completedMode, autoStart) {
  ui.completion = { mode: completedMode, at: Date.now() };
  const message = completedMode === "pomodoro"
    ? `Sesi fokus selesai — ${state.stats.sessions} sesi hari ini. ${autoStart ? "Rehat dimulai." : "Waktunya rehat."}`
    : `Rehat selesai. ${autoStart ? "Sesi fokus dimulai." : "Siap fokus lagi?"}`;
  showStatus(message);
  requestAnimationFrame(() => {
    const fill = elements.ruler.querySelector(".ruler-fill");
    if (!fill || typeof fill.animate !== "function") return;
    fill.animate(Motion.reduced()
      ? [{ opacity: 1 }, { opacity: .4 }, { opacity: 1 }]
      : [{ opacity: 1, transform: "scaleY(1)" }, { opacity: .2, transform: "scaleY(1.6)", offset: .35 }, { opacity: 1, transform: "scaleY(1)" }],
    { duration: Motion.DURATION.calm, easing: Motion.EASE.out });
  });
}

/* Tasks */

function pomodoroDots(task) {
  const total = Math.min(task.estimate, 20);
  return `<span class="pomo-dots" aria-hidden="true">${Array.from({ length: total }, (_, index) => `<i${index < task.done ? ' class="done"' : ""}></i>`).join("")}</span>`;
}

function taskMetaText(task) {
  const parts = [`${task.done}/${task.estimate} pomodoro`];
  if (task.subtasks.length) parts.push(`subtugas ${task.subtasks.filter((subtask) => subtask.completed).length}/${task.subtasks.length}`);
  return parts.join(" · ");
}

function buildTaskRow(task) {
  const active = task.id === state.activeTaskId && !task.completed;
  const expanded = expandedTasks.has(task.id);
  const item = document.createElement("article");
  item.className = "task";
  item.dataset.key = task.id;
  item.dataset.taskId = task.id;
  item.dataset.active = String(active);
  item.dataset.completed = String(task.completed);
  item.dataset.expanded = String(expanded);
  if (ui.newTaskId === task.id) item.dataset.enter = "true";
  const detailId = `task-detail-${task.id}`;
  const safeName = escapeHtml(task.name);

  item.innerHTML = `
    <div class="task-main">
      <button class="task-check" type="button" role="checkbox" data-role="check" aria-checked="${task.completed}" aria-label="${task.completed ? "Buka kembali" : "Tandai selesai"}: ${safeName}">
        <svg class="check-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4L19 7" /></svg>
      </button>
      <button class="task-body task-select" type="button" data-role="select" aria-pressed="${active}" ${task.completed ? "disabled" : ""} aria-label="${active ? "Sedang difokuskan" : task.completed ? "Selesai" : "Fokuskan"}: ${safeName}">
        <span class="task-name">${safeName}</span>
        <span class="task-meta">${pomodoroDots(task)}<span>${taskMetaText(task)}</span>${active ? `<span class="active-chip">Sedang fokus</span>` : ""}</span>
      </button>
      ${task.completed || active ? "" : `<span class="task-focus-mark" aria-hidden="true">${icon("target")}</span>`}
      <button class="task-expand" type="button" data-role="expand" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="Detail tugas: ${safeName}">${icon("chevron")}</button>
    </div>
    <div class="task-detail" id="${detailId}" ${expanded ? "" : "hidden"}>
      <div class="task-detail-row">
        <span class="detail-label">Estimasi</span>
        <div class="estimate stepper" role="group" aria-label="Estimasi pomodoro: ${safeName}">
          <button type="button" data-role="minus" aria-label="Kurangi estimasi: ${safeName}" ${task.estimate <= 1 ? "disabled" : ""}>${icon("minus")}</button>
          <strong aria-live="polite">${task.estimate}</strong>
          <button type="button" data-role="plus" aria-label="Tambah estimasi: ${safeName}" ${task.estimate >= 20 ? "disabled" : ""}>${icon("plus")}</button>
        </div>
        <button class="text-button danger-text task-delete" type="button" data-role="delete" aria-label="Hapus tugas: ${safeName}">${icon("trash")}<span>Hapus</span></button>
      </div>
      <div class="subtasks">
        <p class="detail-label">Subtugas${task.subtasks.length ? ` · ${task.subtasks.filter((subtask) => subtask.completed).length}/${task.subtasks.length}` : ""}</p>
        <div class="subtask-list"></div>
        <form class="subtask-form" novalidate>
          <input type="text" maxlength="200" placeholder="Langkah kecil berikutnya…" aria-label="Subtugas baru untuk ${safeName}" data-role="subtask-input" />
          <button type="submit" class="button" data-role="subtask-add">Tambah</button>
        </form>
      </div>
    </div>`;

  item.querySelector('[data-role="check"]').addEventListener("click", () => toggleTaskCompleted(task));
  item.querySelector('[data-role="select"]').addEventListener("click", () => selectTask(task));
  item.querySelector('[data-role="expand"]').addEventListener("click", () => {
    expandedTasks.has(task.id) ? expandedTasks.delete(task.id) : expandedTasks.add(task.id);
    renderTasks();
    const detail = document.getElementById(detailId);
    if (detail && !detail.hidden) Motion.enter(detail, { y: -4, duration: Motion.DURATION.base });
  });
  item.querySelector('[data-role="minus"]').addEventListener("click", () => {
    task.estimate = Math.max(1, task.estimate - 1);
    task.done = Math.min(task.done, task.estimate);
    render();
  });
  item.querySelector('[data-role="plus"]').addEventListener("click", () => {
    task.estimate = Math.min(20, task.estimate + 1);
    render();
  });
  item.querySelector('[data-role="delete"]').addEventListener("click", () => deleteTaskWithUndo(task.id));

  const list = item.querySelector(".subtask-list");
  task.subtasks.forEach((subtask) => {
    const row = document.createElement("div");
    row.className = "subtask-row";
    row.dataset.key = subtask.id;
    row.dataset.completed = String(subtask.completed);
    const label = document.createElement("label");
    label.className = "check-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subtask.completed;
    checkbox.dataset.role = `subtask-check-${subtask.id}`;
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
    label.append(checkbox, name);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button subtask-remove";
    remove.dataset.role = `subtask-remove-${subtask.id}`;
    remove.innerHTML = icon("close");
    remove.setAttribute("aria-label", `Hapus subtugas: ${subtask.name}`);
    remove.addEventListener("click", () => {
      task.subtasks = task.subtasks.filter((entry) => entry.id !== subtask.id);
      render();
    });
    row.append(label, remove);
    list.append(row);
  });

  const form = item.querySelector(".subtask-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    const name = input.value.trim();
    if (!name) {
      input.setAttribute("aria-invalid", "true");
      input.placeholder = "Tulis subtugas dulu…";
      input.focus();
      return;
    }
    task.subtasks.push({ id: FocusData.makeId(), name, completed: false });
    task.completed = false;
    if (!activeTask()) state.activeTaskId = task.id;
    expandedTasks.add(task.id);
    render();
    document.querySelector(`[data-task-id="${CSS.escape(task.id)}"] .subtask-form input`)?.focus();
  });
  return item;
}

function renderTasks() {
  const open = state.tasks.filter((task) => !task.completed);
  const done = state.tasks.filter((task) => task.completed);
  const left = remainingPomodoros();
  elements.taskSummary.textContent = state.tasks.length
    ? `${open.length} aktif · ${left} pomodoro tersisa${done.length ? ` · ${done.length} selesai` : ""}`
    : "Belum ada tugas";
  elements.navTaskBadge.textContent = open.length ? String(open.length) : "";
  elements.navTaskBadge.hidden = !open.length;

  const signature = JSON.stringify([state.tasks, state.activeTaskId, [...expandedTasks], ui.doneCollapsed]);
  if (signature === ui.tasksSignature) return;
  ui.tasksSignature = signature;

  // Keep keyboard focus on the same control of the same task after the rebuild.
  const focused = document.activeElement;
  const focusedRow = focused?.closest?.("[data-task-id]");
  const snapshot = focusedRow && (elements.taskList.contains(focusedRow) || elements.taskDoneList.contains(focusedRow))
    ? { id: focusedRow.dataset.taskId, role: focused.dataset.role, value: focused.matches("input[type=text]") ? focused.value : null }
    : null;

  Motion.flip([elements.taskList, elements.taskDoneList], () => {
    elements.taskList.replaceChildren();
    elements.taskDoneList.replaceChildren();
    if (!open.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.dataset.key = "empty";
      empty.innerHTML = state.tasks.length
        ? `<p class="empty-title">Semua tugas selesai.</p><p class="field-hint">Tambahkan tugas berikutnya, atau beristirahatlah — kamu pantas mendapatkannya.</p>`
        : `<p class="empty-title">Belum ada tugas hari ini.</p><p class="field-hint">Tulis satu hal yang ingin kamu selesaikan. Kamu juga bisa langsung mulai fokus tanpa tugas.</p>`;
      elements.taskList.append(empty);
    }
    open.forEach((task) => elements.taskList.append(buildTaskRow(task)));
    done.forEach((task) => elements.taskDoneList.append(buildTaskRow(task)));
  });
  ui.newTaskId = null;
  elements.taskDoneGroup.hidden = !done.length;
  elements.taskDoneLabel.textContent = `Selesai (${done.length})`;
  elements.taskDoneToggle.setAttribute("aria-expanded", String(!ui.doneCollapsed));
  elements.taskDoneList.hidden = ui.doneCollapsed;

  if (snapshot) {
    const row = document.querySelector(`[data-task-id="${CSS.escape(snapshot.id)}"]:not(.is-ghost)`);
    let target = snapshot.role ? row?.querySelector(`[data-role="${CSS.escape(snapshot.role)}"]`) : null;
    if (target && snapshot.value !== null) target.value = snapshot.value;
    if (!target || target.disabled) target = row?.querySelector('[data-role="check"]') || elements.taskInput;
    target?.focus({ preventScroll: true });
  }
  if (elements.taskSheet.open) renderTaskPicker();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function renderTaskPicker() {
  const open = state.tasks.filter((task) => !task.completed);
  elements.taskPickList.replaceChildren();
  if (!open.length) {
    elements.taskPickList.innerHTML = '<div class="empty-state"><p class="empty-title">Belum ada tugas aktif.</p><p class="field-hint">Buka Kelola tugas untuk menambahkan.</p></div>';
    return;
  }
  open.forEach((task) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "pick-option";
    option.setAttribute("role", "radio");
    const selected = task.id === state.activeTaskId;
    option.setAttribute("aria-checked", String(selected));
    option.tabIndex = selected || (!activeTask() && task === open[0]) ? 0 : -1;
    option.innerHTML = `<span class="radio-mark" aria-hidden="true"></span><span class="pick-copy"><span class="pick-name">${escapeHtml(task.name)}</span><span class="task-meta">${pomodoroDots(task)}<span>${taskMetaText(task)}</span></span></span>`;
    option.addEventListener("click", () => {
      selectTask(task);
      closeSheet(elements.taskSheet);
      Motion.enter(elements.contextCard, { y: 4 });
    });
    elements.taskPickList.append(option);
  });
}

/* Settings */

function buildChoices(container, name, list, onChange) {
  if (container.childElementCount) return;
  list.forEach(([value, label]) => {
    const option = document.createElement("label");
    option.className = "choice";
    option.innerHTML = `<input type="radio" name="${name}" value="${value}" /><span class="choice-mark" aria-hidden="true">${icon("check")}</span><span class="choice-label">${label}</span>`;
    option.querySelector("input").addEventListener("change", (event) => onChange(event.target.value, option));
    container.append(option);
  });
}

function renderSettings() {
  const fields = [["pomodoroDuration", "pomodoro"], ["shortBreakDuration", "shortBreak"], ["longBreakDuration", "longBreak"], ["longBreakInterval", "longBreakInterval"]];
  fields.forEach(([element, key]) => {
    if (document.activeElement !== elements[element]) elements[element].value = state.settings[key];
  });
  elements.autoStartBreaks.checked = state.settings.autoStartBreaks;
  elements.autoStartPomodoros.checked = state.settings.autoStartPomodoros;
  elements.alarmChoices.querySelectorAll("input").forEach((input) => { input.checked = input.value === state.settings.alarmSound; });
  elements.ambienceChoices.querySelectorAll("input").forEach((input) => { input.checked = input.value === state.settings.ambientSound; });
  elements.ambienceSettingsValue.textContent = soundLabel(AMBIENT_SOUNDS, state.settings.ambientSound);
  renderVolume();
  if (document.activeElement !== elements.notificationText) elements.notificationText.value = state.settings.notificationText;
  elements.customColor.value = /^#[\da-f]{6}$/i.test(state.settings.customColor) ? state.settings.customColor : "#ffffff";
}

function renderVolume() {
  const volume = state.settings.ambientVolume;
  [[elements.ambientVolume, elements.ambientVolumeValue], [elements.ambientVolumeQuick, elements.ambientVolumeQuickValue]].forEach(([input, output]) => {
    if (document.activeElement !== input) input.value = volume;
    input.style.setProperty("--level", `${volume}%`);
    output.textContent = `${volume}%`;
  });
  const disabled = !state.settings.ambientSound;
  elements.ambientVolumeQuick.disabled = disabled;
  elements.ambientVolume.disabled = disabled;
  elements.ambienceHint.textContent = disabled
    ? "Pilih suara untuk menemani sesi. Suara diputar saat timer berjalan."
    : state.isRunning ? "Sedang diputar. Berhenti otomatis saat timer dijeda." : "Akan diputar saat timer berjalan.";
}

function renderCustomThemes() {
  const signature = JSON.stringify([state.settings.customThemes, state.settings.theme]);
  if (elements.customThemes.dataset.signature === signature) return;
  elements.customThemes.dataset.signature = signature;
  const focusedId = document.activeElement?.closest?.("[data-palette-id]")?.dataset.paletteId;
  elements.customThemes.replaceChildren();
  if (!state.settings.customThemes.length) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "Belum ada palet. Pilih warna latar di bawah, beri nama, lalu simpan.";
    elements.customThemes.append(empty);
  }
  state.settings.customThemes.forEach((theme) => {
    const item = document.createElement("div");
    item.className = "custom-theme";
    item.dataset.paletteId = theme.id;
    const selected = state.settings.theme === `custom:${theme.id}`;
    const tokens = resolveCustomTokens(theme.bg);
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "custom-theme-select";
    swatch.setAttribute("aria-pressed", String(selected));
    swatch.innerHTML = `<span class="custom-theme-color" style="background:${theme.bg};color:${tokens.text}" aria-hidden="true">Aa</span><span class="custom-theme-name"></span>`;
    swatch.querySelector(".custom-theme-name").textContent = theme.name;
    swatch.setAttribute("aria-label", `Palet ${theme.name} (${theme.bg.toUpperCase()})`);
    swatch.addEventListener("click", () => selectTheme(`custom:${theme.id}`));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button custom-theme-remove";
    remove.innerHTML = icon("close");
    remove.setAttribute("aria-label", `Hapus palet ${theme.name}`);
    remove.addEventListener("click", () => {
      const index = state.settings.customThemes.findIndex((item) => item.id === theme.id);
      const wasSelected = state.settings.theme === `custom:${theme.id}`;
      state.settings.customThemes = state.settings.customThemes.filter((item) => item.id !== theme.id);
      if (wasSelected) state.settings.theme = "paper";
      render();
      elements.customColor.focus();
      showStatus(`Palet ${theme.name} dihapus.`, {
        label: "Urungkan",
        run: () => {
          state.settings.customThemes.splice(index, 0, theme);
          if (wasSelected) state.settings.theme = `custom:${theme.id}`;
          render();
        },
      });
    });
    item.append(swatch, remove);
    elements.customThemes.append(item);
  });
  if (focusedId) elements.customThemes.querySelector(`[data-palette-id="${CSS.escape(focusedId)}"] .custom-theme-select`)?.focus();
}

/* Statistics */

function formatFocus(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (seconds > 0 && minutes === 0) return "<1m";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}j ${minutes % 60}m` : `${minutes}m`;
}

function formatDate(date, options = { day: "numeric", month: "short", year: "numeric" }) {
  return date ? new Date(`${date}T12:00:00`).toLocaleDateString("id-ID", options) : "Data sebelumnya";
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

  const byDate = new Map();
  entries.forEach((entry) => { if (entry.date && entry.focusSeconds > 0) byDate.set(entry.date, (byDate.get(entry.date) || 0) + entry.focusSeconds); });
  const multiDay = !historyDate && historyPeriod !== "1";
  if (multiDay && byDate.size) {
    elements.historyAverage.textContent = formatFocus([...byDate.values()].reduce((a, b) => a + b, 0) / byDate.size);
    elements.historyAverage.title = `${byDate.size} hari dengan sesi fokus`;
    const [bestDate, bestSeconds] = [...byDate.entries()].sort((a, b) => b[1] - a[1])[0];
    elements.historyBest.innerHTML = `${formatFocus(bestSeconds)}<span class="metric-note">${escapeHtml(formatDate(bestDate, { weekday: "short", day: "numeric", month: "short" }))}</span>`;
  } else {
    elements.historyAverage.textContent = "—";
    elements.historyAverage.title = multiDay ? "" : "Pilih 7 hari, 30 hari, atau Semua untuk melihat rata-rata.";
    elements.historyBest.textContent = "—";
  }

  elements.todayCardFocus.textContent = formatFocus(state.stats.focusSeconds);
  elements.todayCardSessions.textContent = `${state.stats.sessions} sesi`;
  elements.periodTabs.forEach((button) => button.setAttribute("aria-pressed", String(!historyDate && button.dataset.period === historyPeriod)));
  elements.clearHistoryDate.hidden = !historyDate;
  elements.historyDate.closest(".date-field").dataset.active = String(Boolean(historyDate));
  updateHistorySelection();
  elements.historyList.querySelectorAll("[data-history-id]").forEach((checkbox) => { checkbox.checked = selectedHistory.has(checkbox.dataset.historyId); });
  const signature = JSON.stringify([historyDate, historyPeriod, entries.map((entry) => [entry.id, entry.date, entry.sessions, Math.floor(entry.focusSeconds / 60), entry.focusSeconds > 0])]);
  if (signature === statisticsSignature) return;
  statisticsSignature = signature;
  renderFocusChart(entries);
  elements.historyList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state history-empty";
    empty.innerHTML = `<p class="empty-title">${historyDate ? "Tidak ada sesi pada tanggal ini." : "Belum ada progres di periode ini."}</p><p class="field-hint">Satu sesi fokus adalah awal yang baik.</p>`;
    const start = document.createElement("button");
    start.type = "button";
    start.className = "button";
    start.textContent = "Ke timer";
    start.addEventListener("click", () => setView("focus"));
    empty.append(start);
    elements.historyList.append(empty);
  }
  entries.forEach((entry, index) => {
    const row = document.createElement("label");
    row.className = "history-entry";
    row.dataset.current = String(entry.id === "current");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.historyId = entry.id;
    checkbox.checked = selectedHistory.has(entry.id);
    checkbox.disabled = entry.id === "current";
    checkbox.setAttribute("aria-label", entry.id === "current" ? "Progres aktif tidak dapat dihapus dari sini" : `Pilih arsip ${formatDate(entry.date)}`);
    const copy = document.createElement("span");
    copy.className = "history-copy";
    const title = document.createElement("strong");
    title.textContent = formatDate(entry.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const note = document.createElement("span");
    note.className = "field-hint";
    const reason = entry.id === "current" ? "Progres aktif" : entry.reason === "reset" ? "Diarsipkan manual" : entry.reason === "legacy" ? "Tanggal tidak tersedia" : entry.reason === "import" ? "Diimpor" : "Arsip harian";
    note.textContent = `${entry.sessions} sesi · ${reason}`;
    copy.append(title, note);
    const focus = document.createElement("strong");
    focus.className = "history-entry-focus";
    focus.textContent = formatFocus(entry.focusSeconds);
    row.append(checkbox, copy, focus);
    elements.historyList.append(row);
    if (index < 12) Motion.enter(row, { y: 4, duration: Motion.DURATION.base, delay: index * 18 });
  });
}

function updateHistorySelection() {
  const archives = visibleHistory();
  const count = archives.filter((entry) => selectedHistory.has(entry.id)).length;
  elements.selectAllHistory.checked = archives.length > 0 && count === archives.length;
  elements.selectAllHistory.indeterminate = count > 0 && count < archives.length;
  elements.selectAllHistory.disabled = !archives.length;
  elements.selectAllHistory.closest(".check-label").dataset.disabled = String(!archives.length);
  elements.deleteHistory.disabled = selectedHistory.size === 0;
  elements.deleteHistory.textContent = selectedHistory.size ? `Hapus (${selectedHistory.size})` : "Hapus terpilih";
}

function renderFocusChart(entries) {
  const now = new Date();
  const days = historyDate || historyPeriod === "1" ? 1 : historyPeriod === "7" ? 7 : 30;
  const byDate = new Map();
  entries.forEach((entry) => { if (entry.date) byDate.set(entry.date, (byDate.get(entry.date) || 0) + entry.focusSeconds); });
  const today = FocusData.dateKey(now);
  const dates = Array.from({ length: days }, (_, index) => {
    const date = historyDate ? new Date(`${historyDate}T12:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + index + 1);
    return { date: FocusData.dateKey(date), seconds: byDate.get(FocusData.dateKey(date)) || 0 };
  });
  const max = Math.max(60, ...dates.map((day) => day.seconds));
  elements.focusChart.replaceChildren();
  elements.chartFigure.hidden = days === 1;
  elements.chartCaption.textContent = `Waktu fokus per hari · ${days} hari terakhir${historyPeriod === "all" ? " (rentang grafik)" : ""}`;
  elements.focusChart.setAttribute("aria-label", `Grafik waktu fokus ${days} hari terakhir`);
  elements.chartMax.textContent = formatFocus(max);
  elements.focusChart.dataset.days = String(days);
  dates.forEach((day, index) => {
    const column = document.createElement("div");
    column.className = "chart-column";
    column.setAttribute("role", "listitem");
    column.title = `${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })} · ${formatFocus(day.seconds)}`;
    column.setAttribute("aria-label", column.title);
    column.dataset.today = String(day.date === today);
    const track = document.createElement("span");
    track.className = "chart-track";
    const bar = document.createElement("span");
    bar.className = "chart-bar";
    bar.style.height = `${day.seconds ? Math.max(3, day.seconds / max * 100) : 0}%`;
    bar.classList.toggle("empty", !day.seconds);
    track.append(bar);
    const label = document.createElement("span");
    label.className = "chart-label";
    label.setAttribute("aria-hidden", "true");
    label.textContent = days <= 7
      ? formatDate(day.date, { weekday: "short" }).replace(".", "")
      : index % 5 === 0 || index === days - 1 ? String(Number(day.date.slice(-2))) : "";
    column.append(track, label);
    elements.focusChart.append(column);
    if (day.seconds && typeof bar.animate === "function") {
      bar.animate(Motion.reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
        { duration: Motion.DURATION.slow, delay: Motion.reduced() ? 0 : index * (days > 7 ? 8 : 24), easing: Motion.EASE.out, fill: "backwards" });
    }
  });
}

/* Toast */

function showStatus(message, action = null) {
  clearTimeout(toastTimeout);
  elements.statusText.textContent = message;
  ui.statusAction = action;
  elements.statusAction.hidden = !action;
  elements.statusAction.textContent = action?.label || "";
  const wasHidden = elements.statusMessage.hidden;
  elements.statusMessage.hidden = false;
  Motion.enter(elements.statusMessage, { y: wasHidden ? 10 : 4, duration: Motion.DURATION.base });
  resumeStatusTimeout();
}

function hideStatus() {
  clearTimeout(toastTimeout);
  ui.statusAction = null;
  const toast = elements.statusMessage;
  if (toast.hidden) return;
  if (Motion.reduced() || typeof toast.animate !== "function") { toast.hidden = true; return; }
  const exit = toast.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(6px)" }], { duration: Motion.DURATION.quick, easing: Motion.EASE.in });
  exit.onfinish = () => { if (!ui.statusAction) toast.hidden = true; };
}

function resumeStatusTimeout() {
  clearTimeout(toastTimeout);
  if (elements.statusMessage.matches(":hover, :focus-within")) return;
  toastTimeout = setTimeout(hideStatus, ui.statusAction ? 7000 : 4000);
}

/* Dialogs & sheets */

function openDialog(dialog) {
  if (dialog.open) return;
  dialog.dataset.closing = "false";
  dialog.showModal();
}

function closeDialogAnimated(dialog, after) {
  if (!dialog.open) return;
  const finish = () => { dialog.dataset.closing = "false"; if (dialog.open) dialog.close(); after?.(); };
  if (Motion.reduced() || typeof dialog.animate !== "function") { finish(); return; }
  dialog.dataset.closing = "true";
  const desktop = isDesktop();
  const sheet = dialog.classList.contains("sheet") && !desktop;
  const animation = dialog.animate(sheet
    ? [{ transform: "none" }, { transform: "translateY(24px)", opacity: 0 }]
    : [{ opacity: 1 }, { opacity: 0, transform: "scale(.98)" }], { duration: Motion.DURATION.quick, easing: Motion.EASE.in });
  animation.onfinish = finish;
  animation.oncancel = finish;
}

function openSheet(sheet, opener = document.activeElement) {
  ui.sheetOpener = opener;
  if (sheet === elements.taskSheet) renderTaskPicker();
  if (sheet === elements.ambienceSheet) renderVolume();
  openDialog(sheet);
  const focusTarget = sheet.querySelector('[aria-checked="true"], input:checked') || sheet.querySelector(".pick-option, input, button");
  focusTarget?.focus();
}

function closeSheet(sheet) {
  const opener = ui.sheetOpener;
  ui.sheetOpener = null;
  closeDialogAnimated(sheet);
  if (opener?.isConnected && !opener.closest("[hidden]")) opener.focus();
}

function askConfirmation(title, description, accept, action, options = {}) {
  confirmOpener = document.activeElement;
  elements.confirmImportOptions.hidden = true;
  elements.confirmImportCurrent.checked = false;
  elements.confirmTitle.textContent = title;
  elements.confirmDescription.textContent = description;
  elements.confirmAccept.textContent = accept;
  elements.confirmAccept.classList.toggle("button-danger", options.tone === "danger");
  elements.confirmAccept.classList.toggle("button-primary", options.tone !== "danger");
  elements.confirmIconUse.setAttribute("href", `#i-${options.icon || "info"}`);
  elements.confirmDialog.dataset.tone = options.tone || "default";
  confirmAction = action;
  openDialog(elements.confirmDialog);
  elements.confirmCancel.focus();
}

function restoreConfirmFocus() {
  const opener = confirmOpener;
  confirmOpener = null;
  if (opener?.isConnected && !opener.disabled && !opener.closest("[hidden], [inert]")) opener.focus();
}

/* Navigation */

const VIEW_ORDER = ["focus", "tasks", "stats", "settings"];

function setView(view, { focusTarget = null } = {}) {
  if (!VIEW_ORDER.includes(view)) return;
  const previous = ui.view;
  ui.view = view;
  elements.body.dataset.view = view;
  const effective = isDesktop() && view === "tasks" ? "focus" : view;
  elements.navItems.forEach((item) => {
    if (!item.classList.contains("nav-item")) return;
    const current = item.dataset.nav === effective || (isDesktop() && effective === "focus" && item.dataset.nav === "tasks");
    if (item.dataset.nav === effective) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    item.dataset.current = String(current);
  });
  if (view === "stats") { statisticsSignature = ""; renderStatistics(); }
  renderMiniTimer();
  const previousEffective = isDesktop() && previous === "tasks" ? "focus" : previous;
  if (previousEffective !== effective) {
    const direction = Math.sign(VIEW_ORDER.indexOf(view) - VIEW_ORDER.indexOf(previous)) || 1;
    window.scrollTo({ top: 0 });
    const target = document.getElementById(`view-${effective}`);
    Motion.enter(target, { x: direction * 16, y: 0, duration: Motion.DURATION.slow });
    if (effective === "focus" && isDesktop()) Motion.enter(document.getElementById("view-tasks"), { x: direction * 16, y: 0, duration: Motion.DURATION.slow, delay: 40 });
  }
  if (focusTarget) focusTarget.focus({ preventScroll: !isDesktop() ? false : true });
  if (focusTarget && isDesktop()) focusTarget.scrollIntoView({ block: "nearest", behavior: Motion.reduced() ? "auto" : "smooth" });
}

function requestModeChange(mode) {
  if (mode === state.mode) return;
  if (state.isRunning && state.mode === "pomodoro") {
    askConfirmation(
      `Pindah ke ${MODE_LABELS[mode]}?`,
      "Sesi fokus yang sedang berjalan akan dihentikan. Waktu fokus yang sudah berjalan tetap tercatat, tetapi sesi ini tidak dihitung selesai dan tidak menambah progres tugas.",
      "Pindah mode",
      () => setMode(mode),
      { icon: "alert" },
    );
    return;
  }
  setMode(mode);
}

function clampSetting(key, raw) {
  const [min, max, label] = DURATION_LIMITS[key];
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || raw === "") return { value: state.settings[key], error: `${label} harus diisi angka ${min}–${max}. Nilai sebelumnya dipertahankan.` };
  if (value < min || value > max) {
    const clamped = Math.min(max, Math.max(min, value));
    return { value: clamped, error: `${label} hanya ${min}–${max}. Disimpan sebagai ${clamped}.` };
  }
  return { value, error: "" };
}

/* ───────────────────────── Events ───────────────────────── */

elements.startPause.addEventListener("click", () => {
  state.isRunning ? pauseTimer() : (ui.completion = null, startTimer());
});
elements.resetTimer.addEventListener("click", resetTimer);
elements.skipMode.addEventListener("click", skipMode);
elements.miniToggle.addEventListener("click", () => { state.isRunning ? pauseTimer() : startTimer(); });

elements.modeTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => requestModeChange(tab.dataset.mode));
  tab.addEventListener("keydown", (event) => {
    const directions = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -index, End: elements.modeTabs.length - 1 - index };
    if (!(event.key in directions)) return;
    event.preventDefault();
    const target = elements.modeTabs[(index + directions[event.key] + elements.modeTabs.length) % elements.modeTabs.length];
    target.focus();
    requestModeChange(target.dataset.mode);
  });
});

elements.navItems.forEach((item) => item.addEventListener("click", (event) => {
  event.preventDefault();
  setView(item.dataset.nav);
}));

elements.changeTask.addEventListener("click", () => {
  if (!state.tasks.some((task) => !task.completed)) {
    setView("tasks", { focusTarget: elements.taskInput });
    return;
  }
  openSheet(elements.taskSheet, elements.changeTask);
});
elements.taskSheetManage.addEventListener("click", () => {
  closeSheet(elements.taskSheet);
  setView("tasks", { focusTarget: elements.taskInput });
});
elements.taskPickList.addEventListener("keydown", (event) => {
  const options = [...elements.taskPickList.querySelectorAll(".pick-option")];
  const index = options.indexOf(document.activeElement);
  const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  if (index < 0 || !(event.key in moves)) return;
  event.preventDefault();
  options[(index + moves[event.key] + options.length) % options.length].focus();
});
[elements.ambienceQuick, elements.ambienceSettings].forEach((button) => button.addEventListener("click", () => openSheet(elements.ambienceSheet, button)));

[elements.taskSheet, elements.ambienceSheet].forEach((sheet) => {
  sheet.addEventListener("cancel", (event) => { event.preventDefault(); closeSheet(sheet); });
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet || event.target.closest("[data-close]")) closeSheet(sheet);
  });
});

/* Task form */

function setTaskFormError(message) {
  elements.taskFormHint.textContent = message || "Estimasi 1–20 pomodoro";
  elements.taskFormHint.classList.toggle("is-error", Boolean(message));
  if (message) elements.taskInput.setAttribute("aria-invalid", "true"); else elements.taskInput.removeAttribute("aria-invalid");
}

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.taskInput.value.trim();
  if (!name) {
    setTaskFormError("Tulis nama tugas terlebih dahulu.");
    elements.taskInput.focus();
    return;
  }
  addTask(name, Math.max(1, Math.min(20, Number(elements.taskEstimate.value) || 1)));
  elements.taskInput.value = "";
  elements.taskEstimate.value = "1";
  setTaskFormError("");
  elements.taskInput.focus();
});
elements.taskInput.addEventListener("input", () => {
  if (elements.taskInput.hasAttribute("aria-invalid")) setTaskFormError("");
  if (elements.taskInput.value.length >= 180) {
    elements.taskFormHint.textContent = `${elements.taskInput.value.length}/200 karakter`;
  }
});
elements.taskForm.querySelectorAll(".estimate-step").forEach((button) => button.addEventListener("click", () => {
  const next = Math.max(1, Math.min(20, (Number(elements.taskEstimate.value) || 1) + Number(button.dataset.step)));
  elements.taskEstimate.value = String(next);
}));
elements.taskEstimate.addEventListener("change", () => {
  elements.taskEstimate.value = String(Math.max(1, Math.min(20, Math.round(Number(elements.taskEstimate.value)) || 1)));
});
elements.taskDoneToggle.addEventListener("click", () => {
  ui.doneCollapsed = !ui.doneCollapsed;
  renderTasks();
});

/* Settings */

[
  ["pomodoroDuration", "pomodoro"],
  ["shortBreakDuration", "shortBreak"],
  ["longBreakDuration", "longBreak"],
  ["longBreakInterval", "longBreakInterval"],
].forEach(([elementKey, settingKey]) => {
  elements[elementKey].addEventListener("change", (event) => {
    const { value, error } = clampSetting(settingKey, event.target.value);
    elements.durationError.textContent = error;
    elements.durationError.hidden = !error;
    event.target.value = value;
    if (error) event.target.setAttribute("aria-invalid", "true"); else event.target.removeAttribute("aria-invalid");
    if (settingKey === "longBreakInterval") {
      state.settings.longBreakInterval = Math.max(2, Number(value) || 4);
      render();
      return;
    }
    applyDurationChange(settingKey, value);
  });
});

["autoStartBreaks", "autoStartPomodoros"].forEach((key) => {
  elements[key].addEventListener("change", (event) => {
    state.settings[key] = event.target.checked;
    render();
  });
});

buildChoices(elements.alarmChoices, "alarm", ALARM_SOUNDS, (value, option) => {
  state.settings.alarmSound = value;
  ensureAudio();
  if (state.isRunning) scheduleAlarm();
  playAlarm();
  render();
  Motion.pop(option.querySelector(".choice-mark"), 1.2);
});
buildChoices(elements.ambienceChoices, "ambience", AMBIENT_SOUNDS, (value, option) => {
  state.settings.ambientSound = value;
  updateAmbientSound();
  render();
  Motion.pop(option.querySelector(".choice-mark"), 1.2);
});

[elements.ambientVolume, elements.ambientVolumeQuick].forEach((input) => input.addEventListener("input", (event) => {
  state.settings.ambientVolume = Number(event.target.value);
  renderVolume();
  updateAmbientSound();
  renderTimer();
  saveState();
}));

elements.notificationText.addEventListener("input", (event) => {
  state.settings.notificationText = event.target.value;
  saveState();
});

elements.permissionAction.addEventListener("click", () => {
  const permission = notificationPermissionState();
  if (permission === "granted") sendTestNotification();
  else requestNotificationPermission();
});

elements.themeSwatches.forEach((swatch) => swatch.addEventListener("click", () => selectTheme(swatch.dataset.theme)));

elements.customColor.addEventListener("input", (event) => {
  state.settings.customColor = event.target.value;
  saveState();
});

elements.customThemeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const bg = elements.customColor.value;
  let theme = state.settings.customThemes.find((item) => item.bg.toLowerCase() === bg.toLowerCase());
  const existed = Boolean(theme);
  if (!theme) {
    theme = { id: FocusData.makeId(), bg, name: elements.customThemeName.value.trim() || bg.toUpperCase() };
    state.settings.customThemes.push(theme);
  }
  elements.customThemeName.value = "";
  selectTheme(`custom:${theme.id}`);
  render();
  Motion.pop(elements.customThemes.querySelector(`[data-palette-id="${CSS.escape(theme.id)}"] .custom-theme-color`), 1.15);
  showStatus(existed ? `Warna ini sudah tersimpan sebagai ${theme.name}. Palet dipakai.` : `Palet ${theme.name} tersimpan dan dipakai.`);
});

/* Statistics */

elements.resetDay.addEventListener("click", resetDay);
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
  askConfirmation("Hapus arsip terpilih?", `${selectedHistory.size} arsip akan dihapus permanen dan tidak bisa dikembalikan. Penghitung hari ini tetap utuh. Ekspor dulu bila ingin menyimpan cadangan.`, "Hapus permanen", () => {
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
  }, { tone: "danger", icon: "trash" });
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
  const label = elements.importHistory.querySelector("span");
  elements.importHistory.disabled = true;
  elements.importHistory.setAttribute("aria-busy", "true");
  label.textContent = "Membaca…";
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
      return `${preview.added} arsip baru dan ${preview.updated} pembaruan akan digabungkan. Statistik yang ada tetap disimpan dan data yang sama tidak digandakan. Tugas dan pengaturan tidak ikut diimpor.${ambiguousSnapshot && !elements.confirmImportCurrent.checked ? " Progres aktif dari ekspor lama tidak disertakan karena kemungkinan tumpang tindih." : ""}`;
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
        renderStatistics();
        showStatus(`Impor selesai: ${merged.added} arsip baru, ${merged.updated} diperbarui.`);
      } catch (error) { showStatus(error.message); }
    }, { icon: "upload" });
    if (ambiguousSnapshot) {
      elements.confirmImportOptions.hidden = false;
      elements.confirmImportCurrent.onchange = () => { elements.confirmDescription.textContent = description(); };
    }
  } catch (error) {
    showStatus(error instanceof SyntaxError ? "File JSON tidak valid. Pilih file hasil Ekspor Quiet Pomo." : error.message);
  } finally {
    elements.importHistory.disabled = false;
    elements.importHistory.removeAttribute("aria-busy");
    label.textContent = "Impor";
  }
});

/* Confirm dialog */

elements.confirmCancel.addEventListener("click", () => {
  confirmAction = null;
  closeDialogAnimated(elements.confirmDialog);
  restoreConfirmFocus();
});
elements.confirmAccept.addEventListener("click", () => {
  const action = confirmAction;
  confirmAction = null;
  closeDialogAnimated(elements.confirmDialog);
  action?.();
  restoreConfirmFocus();
});
elements.confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  confirmAction = null;
  closeDialogAnimated(elements.confirmDialog);
  restoreConfirmFocus();
});
elements.confirmDialog.addEventListener("close", () => {
  // A queued close event from the previous dialog must not erase a new action.
  if (!elements.confirmDialog.open) confirmAction = null;
});

/* Toast */

elements.statusAction.addEventListener("click", () => {
  const action = ui.statusAction;
  ui.statusAction = null;
  hideStatus();
  action?.run();
});
elements.statusMessage.addEventListener("pointerenter", () => clearTimeout(toastTimeout));
elements.statusMessage.addEventListener("focusin", () => clearTimeout(toastTimeout));
elements.statusMessage.addEventListener("pointerleave", resumeStatusTimeout);
elements.statusMessage.addEventListener("focusout", resumeStatusTimeout);

/* Global */

elements.notificationPermission.addEventListener("click", requestNotificationPermission);

window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  const target = event.target;
  const typing = target.closest?.("input, textarea, select, button, [contenteditable], a, [role=radio], [role=checkbox]");
  if (event.code === "Space" && !typing && (ui.view === "focus" || isDesktop())) {
    event.preventDefault();
    elements.startPause.click();
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
desktopQuery.addEventListener?.("change", () => setView(ui.view));

/* ───────────────────────── Start ───────────────────────── */

if (!MODES.includes(state.mode)) state.mode = "pomodoro";
if (!state.remainingSeconds || state.remainingSeconds < 0) state.remainingSeconds = modeDuration();
if (!ALARM_SOUNDS.some(([path]) => path === state.settings.alarmSound)) {
  state.settings.alarmSound = DEFAULT_STATE.settings.alarmSound;
}
if (!AMBIENT_SOUNDS.some(([path]) => path === state.settings.ambientSound)) {
  state.settings.ambientSound = DEFAULT_STATE.settings.ambientSound;
}
render();
setView("focus");
watchNotificationPermission();
requestAnimationFrame(() => document.body.classList.add("is-ready"));
