import api from '../services/api.js';

export async function lookupUsZipCityState(zip) {
  const digits = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (digits.length !== 5) return null;
  try {
    const { data } = await api.get(`/public/us-zip/${digits}`, { skipGlobalLoading: true });
    if (!data?.found) return null;
    const city = String(data.city || '').trim();
    const state = String(data.state || '').trim();
    if (!city && !state) return null;
    return { city, state };
  } catch {
    return null;
  }
}
