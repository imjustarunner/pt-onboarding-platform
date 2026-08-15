export async function lookupUsZipCityState(zip) {
  const digits = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (digits.length !== 5) return null;
  const resp = await fetch(`https://api.zippopotam.us/us/${digits}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  const place = Array.isArray(data?.places) ? data.places[0] : null;
  if (!place) return null;
  return {
    city: String(place['place name'] || '').trim(),
    state: String(place['state abbreviation'] || place.state || '').trim()
  };
}
