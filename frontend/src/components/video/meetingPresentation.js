/** Vonage exposes element as a DOM property; support older wrappers as well. */
export function mediaElement(owner) {
  return typeof owner?.element === 'function' ? owner.element() : owner?.element || null;
}

/** Fit landscape tiles into the available stage, including full-screen rows. */
export function tileGrid(count, width, height, size = 'm') {
  if (!count) return { columns: 1, rows: 1 };
  const minWidth = { mini: 80, s: 150, m: 240, l: 340 }[size] || 240;
  const maxColumns = Math.min(count, Math.max(1, Math.floor(width / minWidth)));
  let best = { columns: 1, rows: count, score: -Infinity };
  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(count / columns);
    const tileWidth = (width - 6 * (columns - 1)) / columns;
    const tileHeight = (height - 6 * (rows - 1)) / rows;
    const area = Math.min(tileWidth, tileHeight * 16 / 9) ** 2;
    const score = area * (count / (columns * rows));
    if (score > best.score) best = { columns, rows, score };
  }
  return { columns: best.columns, rows: best.rows };
}

/** Smoothed levels with a release window and a minimum speaker dwell time. */
export function createSpeakerTracker() {
  const samples = new Map();
  let active = '';
  let switchedAt = -Infinity;
  return {
    update(key, level, now) {
      const previous = samples.get(key);
      const smoothed = Math.max(level, (previous?.level || 0) * 0.65);
      samples.set(key, { level: smoothed, at: now, spokeAt: level >= 0.035 ? now : previous?.spokeAt ?? -Infinity });
    },
    remove(key) { samples.delete(key); if (active === key) active = ''; },
    clear() { samples.clear(); active = ''; switchedAt = -Infinity; },
    snapshot(now) {
      const speaking = {};
      let candidate = '';
      let loudest = 0;
      for (const [key, sample] of samples) {
        if (now - sample.spokeAt > 700 || now - sample.at > 1000) continue;
        speaking[key] = true;
        if (sample.level > loudest) { candidate = key; loudest = sample.level; }
      }
      if (candidate && candidate !== active && now - switchedAt >= 1000
        && (!speaking[active] || loudest > (samples.get(active)?.level || 0) * 1.35)) {
        active = candidate;
        switchedAt = now;
      }
      return { speaking, active };
    }
  };
}
