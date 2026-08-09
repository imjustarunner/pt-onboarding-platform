const NAV_KEY = 'pt_command_palette_nav_history';
const ASK_KEY = 'pt_command_palette_ask_history';
const NAV_FREQ_KEY = 'pt_command_palette_nav_freq';
const ASK_FREQ_KEY = 'pt_command_palette_ask_freq';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function normalizeNavEntry(entry) {
  if (!entry?.path) return null;
  return {
    path: String(entry.path),
    title: String(entry.title || entry.label || 'Page').slice(0, 120),
    section: String(entry.section || entry.description || '').slice(0, 80),
    at: Date.now()
  };
}

function normalizeAskEntry(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return null;
  return { prompt: text.slice(0, 300), at: Date.now() };
}

export function getNavHistory() {
  return readJson(NAV_KEY, []);
}

export function getAskHistory() {
  return readJson(ASK_KEY, []);
}

export function recordNavSelection(entry) {
  const normalized = normalizeNavEntry(entry);
  if (!normalized) return;
  const list = getNavHistory().filter((e) => e.path !== normalized.path);
  list.unshift(normalized);
  writeJson(NAV_KEY, list.slice(0, 12));

  const freq = readJson(NAV_FREQ_KEY, {});
  const key = normalized.path;
  freq[key] = (freq[key] || 0) + 1;
  writeJson(NAV_FREQ_KEY, freq);
}

export function recordAskPrompt(prompt) {
  const normalized = normalizeAskEntry(prompt);
  if (!normalized) return;
  const list = getAskHistory().filter((e) => e.prompt.toLowerCase() !== normalized.prompt.toLowerCase());
  list.unshift(normalized);
  writeJson(ASK_KEY, list.slice(0, 12));

  const freq = readJson(ASK_FREQ_KEY, {});
  const key = normalized.prompt.toLowerCase();
  freq[key] = (freq[key] || 0) + 1;
  writeJson(ASK_FREQ_KEY, freq);
}

export function getFrequentNav(limit = 6) {
  const freq = readJson(NAV_FREQ_KEY, {});
  const history = getNavHistory();
  const byPath = new Map(history.map((h) => [h.path, h]));
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([path]) => byPath.get(path) || { path, title: path.split('/').filter(Boolean).pop() || 'Page', section: '' })
    .filter((e) => e.path);
}

export function getFrequentAsk(limit = 6) {
  const freq = readJson(ASK_FREQ_KEY, {});
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([prompt]) => ({ prompt }));
}
