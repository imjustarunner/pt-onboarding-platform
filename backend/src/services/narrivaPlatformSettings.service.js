import NarrivaGeneratorSettings from '../models/NarrivaGeneratorSettings.model.js';
import { addNarrivaWritingGuidance } from '../config/narrivaGeneratorPolicy.js';

let cached = null;
export function invalidateNarrivaSettings() { cached = null; }
export async function loadNarrivaSettings({ refresh = false } = {}) {
  if (!refresh && cached && Date.now() - cached.loadedAt < 5000) return cached.value;
  const value = await NarrivaGeneratorSettings.get();
  cached = { loadedAt: Date.now(), value };
  return value;
}
export async function applyNarrivaWritingGuidance({ prompt, toolId, alreadyApplied = false, expectedSettingsVersion }) {
  const settings = await loadNarrivaSettings();
  if (expectedSettingsVersion !== undefined && Number(expectedSettingsVersion) !== Number(settings.version)) throw Object.assign(new Error('Narriva writing settings changed. Run the compliance check again before generating; your source facts are preserved.'), { status: 409, code: 'NARRIVA_SETTINGS_CHANGED' });
  if (alreadyApplied) return { prompt, settingsVersion: settings.version };
  return { prompt: addNarrivaWritingGuidance({ prompt, toolId, configuration: settings.configuration }), settingsVersion: settings.version };
}
