// Shared by enrollment and Exchange. Client gender never supplies this preference.
export function normalizeProviderGender(value) {
  const gender = String(value || '').toLowerCase().trim();
  if (/^(female|woman|women|she\/her)\b/.test(gender)) return 'female';
  if (/^(male|man|men|he\/him)\b/.test(gender)) return 'male';
  if (/^(nonbinary|non-binary|non binary|they\/them)\b/.test(gender)) return 'nonbinary';
  return gender;
}
export const noTherapistGenderPreference = value => ['', 'any', 'either', 'all', 'no preference', 'no_preference', 'no-preference', 'none', 'not specified', 'unspecified', 'not provided'].includes(normalizeProviderGender(value));
export function providerGenderMatches(preference, providerGender) {
  return noTherapistGenderPreference(preference) || (['male', 'female', 'nonbinary'].includes(normalizeProviderGender(preference))
    && normalizeProviderGender(preference) === normalizeProviderGender(providerGender));
}
export function validateProviderGenderPreference(value) {
  if (noTherapistGenderPreference(value)) return '';
  const normalized = normalizeProviderGender(value);
  if (!['male', 'female', 'nonbinary'].includes(normalized)) throw Object.assign(new Error('Choose a therapist gender preference or No preference.'), {status:400});
  return normalized;
}
