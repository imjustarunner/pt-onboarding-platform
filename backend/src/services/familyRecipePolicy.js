import { familyError } from './familyPolicy.js';
import { normalizeFamilyCuisine } from './familyCuisines.js';

const text = (value, max) => String(value || '').trim().slice(0, max);
export function normalizeRecipe(raw) {
  if (!raw || typeof raw !== 'object' || !text(raw.title, 200)) throw familyError('The recipe was incomplete. Please try another idea.', 502);
  if (!Array.isArray(raw.ingredients) || !raw.ingredients.length || raw.ingredients.length > 40 || !Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 30) throw familyError('The recipe needs ingredients and cooking steps. Try another idea.', 502);
  const ingredients = raw.ingredients.map(i => ({ name: text(i?.name, 120), quantity: text(i?.quantity, 70), category: text(i?.category, 60) || 'Groceries' }));
  if (ingredients.some(i => !i.name)) throw familyError('The recipe has an incomplete ingredient. Try another idea.', 502);
  const steps = raw.steps.map(s => text(s, 1500)).filter(Boolean);
  if (!steps.length) throw familyError('The recipe needs cooking steps.', 502);
  return { title: text(raw.title, 200), description: text(raw.description, 1000), cuisine: normalizeFamilyCuisine(raw.cuisine), servings: Math.max(1, Math.min(20, Number(raw.servings) || 4)), minutes: Math.max(1, Math.min(1440, Number(raw.minutes) || 30)), ingredients, steps };
}
export function parseRecipeResponse(value) {
  const clean = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let recipe;
  try { recipe = JSON.parse(clean); } catch { throw familyError('The recipe response could not be read. Please try again.', 502); }
  return normalizeRecipe(recipe);
}
export function ingredientIndexes(values, count) {
  if (!Array.isArray(values) || !values.length || values.length > 40) throw familyError('Choose at least one ingredient.');
  const indexes = [...new Set(values)];
  if (indexes.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw familyError('Choose ingredients from this recipe.');
  return indexes;
}
