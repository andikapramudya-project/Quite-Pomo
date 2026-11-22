/* Date-based focus storage. Shared by the timer and statistics view. */
(() => {
  const nonNegative = (value) => Math.max(0, Math.floor(Number(value) || 0));
  const dateKey = (date = new Date()) => {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const validDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    return dateKey(new Date(`${value}T12:00:00`)) === value;
  };
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const hasProgress = (stats) => stats.sessions > 0 || stats.focusSeconds > 0;

  function archive(state, reason, now = new Date()) {
    if (!hasProgress(state.stats)) return null;
    const entry = {
      id: makeId(), date: state.stats.date, sessions: state.stats.sessions,
      focusSeconds: state.stats.focusSeconds, savedAt: now.toISOString(), reason,
      sourceId: state.stats.id || null,
    };
    state.history.push(entry);
    return entry;
  }

  function rollover(state, now = new Date()) {
    const today = dateKey(now);
    if (state.stats.date === today) return false;
    archive(state, "day", now);
    state.stats = { id: makeId(), date: today, sessions: 0, focusSeconds: 0 };
    return true;
  }

  function migrate(state, saved, now = new Date()) {
    state.history = (Array.isArray(saved?.history) ? saved.history : [])
      .filter((entry) => entry && typeof entry.id === "string")
      .map((entry) => ({
        id: entry.id, date: validDate(entry.date) ? entry.date : null,
        sessions: nonNegative(entry.sessions), focusSeconds: Math.max(0, Number(entry.focusSeconds) || 0),
        savedAt: entry.savedAt, reason: entry.reason || "legacy",
        sourceId: typeof entry.sourceId === "string" ? entry.sourceId : null,
      }));
    state.stats = {
      id: typeof saved?.stats?.id === "string" ? saved.stats.id : makeId(),
      date: validDate(saved?.stats?.date) ? saved.stats.date : dateKey(now),
      sessions: nonNegative(saved?.stats?.sessions),
      focusSeconds: Math.max(0, Number(saved?.stats?.focusSeconds) || 0),
    };
    if (saved && !validDate(saved.stats?.date) && hasProgress(state.stats)) {
      state.stats.date = null;
      archive(state, "legacy", now);
      state.stats = { id: makeId(), date: dateKey(now), sessions: 0, focusSeconds: 0 };
    }
    rollover(state, now);
    return state;
  }

  // Split actual elapsed focus at local midnight, even after a background-tab delay.
  function recordFocus(state, startMs, seconds) {
    let cursor = startMs;
    const endMs = startMs + seconds * 1000;
    while (cursor < endMs) {
      const date = new Date(cursor);
      rollover(state, date);
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      const end = Math.min(endMs, midnight);
      state.stats.focusSeconds += (end - cursor) / 1000;
      cursor = end;
    }
  }

  function inPeriod(entry, period, now = new Date()) {
    if (period === "all") return true;
    if (!validDate(entry.date)) return false;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (Number(period) || 1) + 1);
    return entry.date >= dateKey(start) && entry.date <= dateKey(now);
  }

  function parseBackup(backup) {
    if (!backup || backup.app !== "Quiet Pomo" || ![1, 2, 3].includes(backup.version)) {
      throw new Error("File bukan cadangan Quiet Pomo yang didukung (versi 1–3).");
    }
    if (!Array.isArray(backup.history) || !backup.current || typeof backup.current !== "object") {
      throw new Error("Cadangan harus memuat current dan history.");
    }
    const identifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
    const validate = (entry, current = false) => {
      if (!entry || (entry.date !== null && !validDate(entry.date)) ||
          !Number.isSafeInteger(entry.sessions) || entry.sessions < 0 ||
          typeof entry.focusSeconds !== "number" || !Number.isFinite(entry.focusSeconds) || entry.focusSeconds < 0 ||
          entry.focusSeconds > Number.MAX_SAFE_INTEGER || (!current && !identifier(entry.id)) ||
          (entry.sourceId != null && !identifier(entry.sourceId)) ||
          (current && entry.id != null && !identifier(entry.id))) {
        throw new Error("Cadangan berisi tanggal, ID, atau angka statistik yang tidak valid.");
      }
      return {
        id: current ? (entry.id || `legacy-current:${entry.date}:${entry.sessions}:${entry.focusSeconds}`) : entry.id,
        date: entry.date, sessions: entry.sessions, focusSeconds: entry.focusSeconds,
        savedAt: typeof entry.savedAt === "string" ? entry.savedAt : backup.exportedAt,
        reason: current ? "import" : String(entry.reason || "import"),
        sourceId: current ? (entry.id || null) : (entry.sourceId || null),
        legacyCurrent: current && !entry.id,
      };
    };
    return { current: validate(backup.current, true), history: backup.history.map((entry) => validate(entry)) };
  }

  // Imported active snapshots become archives so they never reset today's timer.
  // v3 source IDs merge successive snapshots by their maximum cumulative totals.
  function mergeBackup(state, backup) {
    const result = { stats: { ...state.stats }, history: state.history.map((entry) => ({ ...entry })) };
    let added = 0;
    let updated = 0;
    for (const entry of [...backup.history, backup.current]) {
      if (!hasProgress(entry)) continue;
      const sameTotals = (item) => item.date === entry.date && item.sessions === entry.sessions && item.focusSeconds === entry.focusSeconds;
      let existing = entry.sourceId && result.stats.id === entry.sourceId ? result.stats :
        result.history.find((item) => item.id === entry.id || (entry.sourceId && item.sourceId === entry.sourceId));
      if (!existing && entry.legacyCurrent && (sameTotals(result.stats) || result.history.some(sameTotals))) continue;
      if (existing) {
        if (existing.date !== entry.date) throw new Error("ID statistik yang sama memiliki tanggal berbeda. Impor dibatalkan.");
        const sessions = Math.max(existing.sessions, entry.sessions);
        const focusSeconds = Math.max(existing.focusSeconds, entry.focusSeconds);
        if (sessions !== existing.sessions || focusSeconds !== existing.focusSeconds) updated += 1;
        existing.sessions = sessions;
        existing.focusSeconds = focusSeconds;
      } else {
        const { legacyCurrent, ...archiveEntry } = entry;
        result.history.push(archiveEntry);
        added += 1;
      }
    }
    const total = result.history.reduce((sum, entry) => sum + entry.focusSeconds, result.stats.focusSeconds);
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw new Error("Total statistik terlalu besar.");
    return { ...result, added, updated };
  }

  globalThis.QuietPomoData = { dateKey, validDate, makeId, hasProgress, archive, rollover, migrate, recordFocus, inPeriod, parseBackup, mergeBackup };
})();
