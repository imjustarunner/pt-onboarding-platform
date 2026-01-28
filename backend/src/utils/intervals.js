function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

export function mergeIntervals(intervals) {
  const items = (intervals || [])
    .map((i) => ({
      start: i?.start instanceof Date ? i.start : (i?.start ? new Date(i.start) : null),
      end: i?.end instanceof Date ? i.end : (i?.end ? new Date(i.end) : null)
    }))
    .filter((i) => i.start && i.end && isValidDate(i.start) && isValidDate(i.end) && i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (items.length <= 1) return items;

  const merged = [];
  for (const cur of items) {
    if (!merged.length) {
      merged.push(cur);
      continue;
    }
    const prev = merged[merged.length - 1];
    if (cur.start.getTime() <= prev.end.getTime()) {
      if (cur.end.getTime() > prev.end.getTime()) prev.end = cur.end;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export function subtractInterval(base, busyMerged) {
  const start = base?.start instanceof Date ? base.start : new Date(base?.start);
  const end = base?.end instanceof Date ? base.end : new Date(base?.end);
  if (!isValidDate(start) || !isValidDate(end) || end <= start) return [];

  const busy = Array.isArray(busyMerged) ? busyMerged : mergeIntervals(busyMerged);
  let cursor = start;
  const out = [];

  for (const b of busy) {
    if (!b?.start || !b?.end) continue;
    const bs = b.start instanceof Date ? b.start : new Date(b.start);
    const be = b.end instanceof Date ? b.end : new Date(b.end);
    if (!isValidDate(bs) || !isValidDate(be) || be <= bs) continue;
    if (be <= cursor) continue;
    if (bs >= end) break;

    if (bs > cursor) {
      out.push({ start: cursor, end: bs });
    }
    if (be > cursor) cursor = be;
    if (cursor >= end) break;
  }

  if (cursor < end) out.push({ start: cursor, end });
  return out.filter((x) => x.end > x.start);
}

export function subtractIntervals(baseIntervals, busyIntervals) {
  const busyMerged = mergeIntervals(busyIntervals);
  const out = [];
  for (const b of baseIntervals || []) {
    const segments = subtractInterval(b, busyMerged);
    for (const s of segments) out.push(s);
  }
  return out;
}

export function slotizeIntervals(intervals, minutes = 60) {
  const slotMs = Math.max(1, Number(minutes || 60)) * 60 * 1000;
  const out = [];
  for (const i of intervals || []) {
    const start = i?.start instanceof Date ? i.start : new Date(i?.start);
    const end = i?.end instanceof Date ? i.end : new Date(i?.end);
    if (!isValidDate(start) || !isValidDate(end) || end <= start) continue;
    for (let t = start.getTime(); t + slotMs <= end.getTime(); t += slotMs) {
      out.push({
        start: new Date(t),
        end: new Date(t + slotMs)
      });
    }
  }
  return out;
}

