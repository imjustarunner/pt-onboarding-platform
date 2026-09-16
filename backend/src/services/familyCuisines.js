// One catalog powers recipe generation and the takeout picker via the household tools API.
export const FAMILY_CUISINES = Object.freeze([
  'Italian', 'Mexican', 'Thai', 'Chinese', 'Japanese', 'Indian', 'Korean',
  'Vietnamese', 'Greek', 'Mediterranean', 'Middle Eastern', 'American',
  'French', 'Spanish', 'Caribbean', 'Cajun / Creole', 'Ethiopian', 'German',
  'Brazilian', 'Tex-Mex', 'Filipino', 'Hawaiian', 'Southern / Soul Food'
]);

export function normalizeFamilyCuisine(value) {
  if (value === undefined || value === null || value === '') return null;
  const cuisine = typeof value === 'string' && FAMILY_CUISINES.find(c => c.toLowerCase() === value.trim().toLowerCase());
  if (!cuisine) throw Object.assign(new Error('Choose a cuisine from the available options.'), { status: 400 });
  return cuisine;
}
