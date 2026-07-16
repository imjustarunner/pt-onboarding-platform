/**
 * Per-user localStorage overrides + custom tools for the Tools & Aids hub (MVP).
 * Keys are scoped by user id. No DB migration.
 */

const OVERRIDES_PREFIX = 'tools-aids-overrides:';
const CUSTOM_PREFIX = 'tools-aids-custom:';

/** @typedef {'assessment' | 'game' | 'ai'} ToolKind */

/**
 * @typedef {Object} ToolOverrideFields
 * @property {string} [title]
 * @property {string} [littleName]
 * @property {string} [population]
 * @property {string} [description]
 * @property {string} [imageUrl] - data URL or http(s) URL
 */

export function overridesStorageKey(userId) {
  return `${OVERRIDES_PREFIX}${userId || 'anon'}`;
}

export function customToolsStorageKey(userId) {
  return `${CUSTOM_PREFIX}${userId || 'anon'}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string|number} userId
 * @returns {Record<string, ToolOverrideFields>}
 */
export function getToolOverrides(userId) {
  const data = readJson(overridesStorageKey(userId), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

/**
 * @param {string|number} userId
 * @param {string} toolId
 * @param {ToolOverrideFields} fields
 */
export function saveToolOverride(userId, toolId, fields) {
  const id = String(toolId || '').trim();
  if (!id) return getToolOverrides(userId);
  const all = { ...getToolOverrides(userId) };
  const prev = all[id] && typeof all[id] === 'object' ? all[id] : {};
  const next = { ...prev };
  for (const key of ['title', 'littleName', 'population', 'description', 'imageUrl']) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      const v = fields[key];
      if (v == null || String(v).trim() === '') delete next[key];
      else next[key] = String(v);
    }
  }
  if (Object.keys(next).length) all[id] = next;
  else delete all[id];
  writeJson(overridesStorageKey(userId), all);
  return all;
}

/**
 * @param {string|number} userId
 * @param {string} toolId
 */
export function clearToolOverride(userId, toolId) {
  const all = { ...getToolOverrides(userId) };
  delete all[String(toolId)];
  writeJson(overridesStorageKey(userId), all);
  return all;
}

/**
 * Merge catalog/base tool with override fields.
 * @template {Record<string, any>} T
 * @param {T} tool
 * @param {ToolOverrideFields|null|undefined} override
 * @returns {T & ToolOverrideFields}
 */
export function applyToolOverride(tool, override) {
  if (!tool) return tool;
  if (!override || typeof override !== 'object') return { ...tool };
  const merged = { ...tool };
  if (override.title) merged.title = override.title;
  if (override.littleName != null) merged.littleName = override.littleName;
  if (override.population) merged.population = override.population;
  if (override.description) merged.description = override.description;
  if (override.imageUrl) merged.imageUrl = override.imageUrl;
  return merged;
}

/**
 * @param {string|number} userId
 * @returns {Array<Record<string, any>>}
 */
export function listCustomTools(userId) {
  const list = readJson(customToolsStorageKey(userId), []);
  return Array.isArray(list) ? list.filter((t) => t && t.id) : [];
}

/**
 * @param {string|number} userId
 * @param {Array<Record<string, any>>} tools
 */
export function saveCustomTools(userId, tools) {
  writeJson(customToolsStorageKey(userId), Array.isArray(tools) ? tools : []);
}

/**
 * Duplicate a tool into the user's custom list (new id).
 * @param {string|number} userId
 * @param {Record<string, any>} source
 * @param {ToolKind} [kind]
 */
export function duplicateTool(userId, source, kind = 'assessment') {
  if (!source) return null;
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  const baseId = String(source.id || 'tool').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const newId = `custom-${baseId}-${stamp}${rand}`;
  const copy = {
    ...source,
    id: newId,
    title: `${source.title || source.displayName || 'Tool'} (copy)`,
    littleName: source.littleName || '',
    isCustom: true,
    duplicatedFrom: source.id || null,
    kind,
    // Custom copies keep path for open/copy when present; games may lack path.
    path: source.path || null,
    assignMode: source.assignMode || 'public_link',
    clinicalKind: source.clinicalKind || 'non_clinical',
    durationEstimate: source.durationEstimate || '',
    population: source.population || '',
    description: source.description || '',
    tags: Array.isArray(source.tags) ? [...source.tags] : [],
    imageUrl: source.imageUrl || '',
    createdAt: new Date().toISOString()
  };
  const list = listCustomTools(userId);
  list.unshift(copy);
  saveCustomTools(userId, list);
  return copy;
}

/**
 * Update a custom tool in the custom list (full replace of editable fields).
 * @param {string|number} userId
 * @param {string} toolId
 * @param {ToolOverrideFields & Record<string, any>} fields
 */
export function updateCustomTool(userId, toolId, fields) {
  const id = String(toolId);
  const list = listCustomTools(userId);
  const idx = list.findIndex((t) => String(t.id) === id);
  if (idx < 0) return null;
  const next = { ...list[idx], ...fields, id };
  list[idx] = next;
  saveCustomTools(userId, list);
  return next;
}

/**
 * Resolve display tool: custom entry or catalog + override.
 * @param {string|number} userId
 * @param {Record<string, any>} tool
 */
export function resolveDisplayTool(userId, tool) {
  if (!tool) return tool;
  if (tool.isCustom) return { ...tool };
  const overrides = getToolOverrides(userId);
  return applyToolOverride(tool, overrides[tool.id]);
}
