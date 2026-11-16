import { NOTE_AID_CATEGORIES } from './noteAidWorkspace.js';

// Use the same aid families as the clinical workspace, without its access filters.
export const THERAPY_GENERATOR_CATEGORIES = NOTE_AID_CATEGORIES.map(({ id, label }) => ({ id, label }));

export function categorizeTherapyGenerators(tools = []) {
  return tools.map(tool => {
    const family = NOTE_AID_CATEGORIES.find(category => category.aids.some(aid => aid.toolId === tool.id));
    const aid = family?.aids.find(item => item.toolId === tool.id);
    return { ...tool, categoryId: family?.id || 'additional', guidance: aid?.guidance || tool.description || '' };
  });
}
