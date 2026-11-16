// Retain opaque fingerprints only; names, email, and submission contents never
// enter browser storage. The first snapshot establishes a quiet baseline.
export async function newQueueItems(storage, key, items) {
  const fingerprints = await Promise.all(items.map(async item => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(item.key)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  }));
  let previous;
  try { previous = JSON.parse(storage.getItem(key) || 'null'); } catch { return []; }
  const seen = new Set(Array.isArray(previous) ? previous : []);
  const fresh = Array.isArray(previous) ? items.filter((_,index) => !seen.has(fingerprints[index])) : [];
  // Store only the current snapshot. An item removed then resubmitted is new.
  try { storage.setItem(key, JSON.stringify([...new Set(fingerprints)])); } catch { return []; }
  return fresh;
}
