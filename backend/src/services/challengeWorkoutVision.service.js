/**
 * Google Vision OCR service for workout screenshot parsing.
 *
 * scanWorkoutScreenshot()  — calls Vision API synchronously, returns extracted fields
 * parseVisionText()        — multi-app parser that maps raw OCR text to workout fields
 * enqueueWorkoutVision()   — stores a job record (for audit/history); called after submit
 *
 * Supported app layouts (auto-detected):
 *   • Strava         — label ABOVE value, two-column grid
 *   • Garmin Connect — value ABOVE label, single column
 *   • Apple Watch / Fitness app — value ABOVE label
 *   • Nike Run Club  — label: value inline
 *   • Coros          — label ABOVE value
 *   • Generic        — tries all strategies, picks best result
 */
import pool from '../config/database.js';

// ── Vision API client (lazy-initialized so app starts without credentials) ──

let _visionClient = null;
const getVisionClient = async () => {
  if (_visionClient) return _visionClient;
  const { ImageAnnotatorClient } = await import('@google-cloud/vision');
  _visionClient = new ImageAnnotatorClient();
  return _visionClient;
};

// ── OCR text parser ──────────────────────────────────────────────────────────

/**
 * Parse raw OCR text from a fitness app screenshot into structured workout fields.
 * Returns null for any field that cannot be confidently extracted.
 */
export const parseVisionText = (rawText) => {
  if (!rawText) return {};

  const rawLines = rawText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const textLow = rawText.toLowerCase();

  // ── Detect which app this screenshot is from ─────────────────────────────
  const APP = detectApp(rawText, rawLines);

  // ── Pre-process: join labels split across two lines ───────────────────────
  // Nike Run Club (and others) wrap long labels: "Elevation\nGain", "Avg.\nPace", etc.
  // Join adjacent lines when they form a known multi-word label.
  const JOINABLE_PAIRS = [
    /^elevation$/i,           // + "Gain" → "Elevation Gain"
    /^avg\.?$/i,              // + "Pace" / "Heart Rate" / "HR" → "Avg. Pace" etc.
    /^avg\.?\s+heart$/i,      // + "Rate" → "Avg. Heart Rate"
    /^heart$/i,               // + "Rate" → "Heart Rate"
    /^moving$/i,              // + "Time" → "Moving Time"
    /^total$/i,               // + "Time" / "Calories" / "Ascent"
    /^active$/i,              // + "Calories"
  ];
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cur = rawLines[i];
    const next = rawLines[i + 1] || '';
    if (JOINABLE_PAIRS.some(re => re.test(cur)) && next && !/^\d/.test(next)) {
      lines.push(`${cur} ${next}`);
      i++; // consume next line
    } else {
      lines.push(cur);
    }
  }
  // Also build a version with no timestamps for duration scanning
  const linesNoTSRaw = lines;

  // ── Helper: parse possibly comma-formatted number → integer ─────────────
  // Handles "1,126" → 1126, "122" → 122, "1.14" → 1  (int only)
  const parseCommaInt = (str) => {
    if (!str) return null;
    const cleaned = String(str).replace(/,/g, '');
    const m = cleaned.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  };

  // ── Helper: time string → { minutes, seconds } ──────────────────────────
  const parseTimeStr = (str) => {
    if (!str) return null;
    // Reject no-data markers
    if (/^[-–—]+$/.test(str.trim())) return null;
    // h:mm:ss  →  e.g. "1:25:11"
    const t3 = str.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    // mm:ss (colon style) — exclude timestamps like "10:49 AM"
    const t2 = str.match(/(\d{1,3}):(\d{2})(?!\s*[APap][Mm])(?!\d)/);
    // Strava feed card: "34m 29s" or "1h 03m 59s" suffix style
    const tMS = str.match(/(\d{1,3})\s*m\s+(\d{2})\s*s/i);
    const tHMS = str.match(/(\d{1,2})\s*h\s+(\d{1,2})\s*m(?:\s+(\d{2})\s*s)?/i);
    // Nike Run Club pace: 12'13" (apostrophe + double-quote or inches mark)
    const tNRC = str.match(/(\d{1,3})['''`](\d{2})["""''`]?/);
    if (t3)   return { minutes: parseInt(t3[1]) * 60 + parseInt(t3[2]), seconds: parseInt(t3[3]) };
    if (tHMS) return { minutes: parseInt(tHMS[1]) * 60 + parseInt(tHMS[2]), seconds: parseInt(tHMS[3] || '0') };
    if (tMS)  return { minutes: parseInt(tMS[1]), seconds: parseInt(tMS[2]) };
    if (t2)   return { minutes: parseInt(t2[1]), seconds: parseInt(t2[2]) };
    if (tNRC) return { minutes: parseInt(tNRC[1]), seconds: parseInt(tNRC[2]) };
    return null;
  };

  // ── Label lookup helpers ─────────────────────────────────────────────────

  /**
   * Split a line on 2+ spaces/tabs into column parts.
   * Returns the array if multi-column, otherwise null.
   */
  const splitColumns = (line) => {
    if (!line) return null;
    const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts : null;
  };

  /**
   * Strava / Coros style: label appears, then value is on the NEXT non-empty line.
   * Also handles inline "Label  1.14 mi" on the same line.
   * Also handles multi-column label rows: "Moving Time  Elevation Gain" where
   * the value row above is also multi-column.
   */
  const valueAfterLabel = (labelRegex) => {
    for (let i = 0; i < lines.length; i++) {
      // ── exact match (whole line = label) ──
      if (labelRegex.test(lines[i])) {
        const stripped = lines[i].replace(labelRegex, '').trim();
        if (stripped && /\d/.test(stripped)) return stripped;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j]) return lines[j];
        }
        return null;
      }
      // ── multi-column label row: "Moving Time  Elevation Gain" ──
      const labelParts = splitColumns(lines[i]);
      if (!labelParts) continue;
      const colIdx = labelParts.findIndex(p => labelRegex.test(p));
      if (colIdx < 0) continue;
      // Look at the NEXT value row (same column index)
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j]) continue;
        const valParts = splitColumns(lines[j]);
        if (valParts && colIdx < valParts.length) return valParts[colIdx];
        return lines[j]; // single-value fallback
      }
    }
    return null;
  };

  /**
   * Garmin / Apple Watch / NRC style: value appears, then label is on the NEXT non-empty line.
   * Also handles multi-column value/label rows where Vision collapses columns onto one line.
   */
  const valueBeforeLabel = (labelRegex) => {
    for (let i = 1; i < lines.length; i++) {
      // ── exact match ──
      if (labelRegex.test(lines[i])) {
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j]) return lines[j];
        }
        return null;
      }
      // ── multi-column label row: "Avg Heart Rate  Avg Pace" or "Total Time  Total Calories" ──
      const labelParts = splitColumns(lines[i]);
      if (!labelParts) continue;
      const colIdx = labelParts.findIndex(p => labelRegex.test(p));
      if (colIdx < 0) continue;
      // Look at the PREVIOUS value row (same column index)
      for (let j = i - 1; j >= 0; j--) {
        if (!lines[j]) continue;
        const valParts = splitColumns(lines[j]);
        if (valParts && colIdx < valParts.length) return valParts[colIdx];
        return lines[j]; // single-value fallback
      }
    }
    return null;
  };

  /**
   * Try both directions; return whichever has a digit value first.
   */
  const valueEither = (labelRegex) => {
    const after  = valueAfterLabel(labelRegex);
    const before = valueBeforeLabel(labelRegex);
    // Strava/Coros: label first, value below → prefer "after"
    if (APP === 'strava' || APP === 'coros') return after || before;
    // Garmin, Apple Watch, Nike Run Club: value first, label below → prefer "before"
    if (APP === 'garmin' || APP === 'apple' || APP === 'nike') return before || after;
    // Generic: prefer whichever actually contains a digit, bias toward before
    const hasDigit = (s) => s && /\d/.test(s);
    return hasDigit(before) ? before : (hasDigit(after) ? after : null);
  };

  // ── Label regexes (cover all app label variations) ──────────────────────
  const RE = {
    // "distance" label OR standalone "miles" / "km" label (Nike puts "Miles" below the number)
    distance:   /^(?:distance|miles?|kilometers?)$/i,
    movingTime: /^(?:moving\s*time|elapsed\s*time|duration|total\s*time|time)$/i,
    pace:       /^(?:avg\.?\s*pace|average\s*pace|pace|avg\.?\s*speed)$/i,
    heartRate:  /^(?:avg\.?\s*h(?:eart\s*)?r(?:ate)?|average\s*heart\s*rate|heart\s*rate|avg\s*hr|heart\s*rate\s*\(bpm\))$/i,
    calories:   /^(?:total\s*cal(?:ories?)?|active\s*calories?|calories?|kcal|energy)$/i,
    elevation:  /^(?:elevation\s*gain|elev(?:ation)?\.?\s*gain|total\s*ascent|ascent)$/i,
  };

  /**
   * When a two-column layout puts two values on one line (e.g. "163 bpm  8:25 /mi"),
   * extract either the first or last numeric token from the line.
   * side: 'first' | 'last'
   */
  const extractSideValue = (line, side) => {
    if (!line) return null;
    // Split on 2+ spaces or tab — common separator for side-by-side columns
    const parts = line.split(/\s{2,}|\t/);
    if (parts.length < 2) return null; // single value line, use as-is
    return side === 'last' ? parts[parts.length - 1].trim() : parts[0].trim();
  };

  // ── Distance ─────────────────────────────────────────────────────────────
  let distanceMiles = null;

  // Label-based (try both directions)
  const rawDist = valueEither(RE.distance);
  if (rawDist) {
    const mMi = rawDist.match(/(\d+\.?\d*)\s*mi(?:les?)?/i);
    const mKm = rawDist.match(/(\d+\.?\d*)\s*km/i);
    const mBare = rawDist.match(/^(\d+\.\d+)$/); // e.g. "1.14" alone on a line
    if (mMi)   distanceMiles = parseFloat(mMi[1]);
    else if (mKm)  distanceMiles = parseFloat(mKm[1]) * 0.621371;
    else if (mBare) distanceMiles = parseFloat(mBare[1]);
  }

  // Free-form regex fallback (handles "1.14 mi" anywhere in text)
  if (distanceMiles == null) {
    const mMi = rawText.match(/(\d+\.?\d*)\s*mi(?:les?)?/i);
    const mKm = rawText.match(/(\d+\.?\d*)\s*km/i);
    if (mMi) distanceMiles = parseFloat(mMi[1]);
    else if (mKm) distanceMiles = parseFloat(mKm[1]) * 0.621371;
  }

  // Bare number on line before/after a "mi" or "miles" line
  if (distanceMiles == null) {
    for (let i = 0; i + 1 < lines.length; i++) {
      if (/^mi(?:les?)?$/i.test(lines[i + 1])) {
        const m = lines[i].match(/(\d+\.?\d*)$/);
        if (m) { distanceMiles = parseFloat(m[1]); break; }
      }
    }
  }

  if (distanceMiles != null) distanceMiles = Math.round(distanceMiles * 100) / 100;

  // ── Duration ─────────────────────────────────────────────────────────────
  let durationMinutes = null;
  let durationSeconds = null;

  // Strip timestamps before scanning so "10:49 AM" doesn't get picked
  const textNoTimestamp = rawText
    .replace(/\b\d{1,2}:\d{2}\s*[APap][Mm]\b/g, '')     // 10:49 AM
    .replace(/\byesterday\b|\btoday\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');

  // Build a cleaned line array from our pre-processed (label-joined) lines, minus timestamps
  const linesNoTS = lines.map(l =>
    l.replace(/\b\d{1,2}:\d{2}\s*[APap][Mm]\b/g, '').replace(/\byesterday\b|\btoday\b/gi, '').trim()
  ).filter(Boolean);

  // Strava uses "Moving Time"; Garmin uses "Total Time"; Apple Watch uses "Duration" / "Time"
  const valueAfterLabelInSet = (labelRegex, src) => {
    for (let i = 0; i < src.length; i++) {
      if (!labelRegex.test(src[i])) continue;
      const stripped = src[i].replace(labelRegex, '').trim();
      if (stripped && /\d/.test(stripped)) return stripped;
      for (let j = i + 1; j < src.length; j++) {
        if (src[j]) return src[j];
      }
    }
    return null;
  };
  const valueBeforeLabelInSet = (labelRegex, src) => {
    for (let i = 1; i < src.length; i++) {
      if (!labelRegex.test(src[i])) continue;
      for (let j = i - 1; j >= 0; j--) {
        if (src[j]) return src[j];
      }
    }
    return null;
  };

  const rawDurAfter  = valueAfterLabelInSet(RE.movingTime, linesNoTS);
  const rawDurBefore = valueBeforeLabelInSet(RE.movingTime, linesNoTS);
  const rawDur = (APP === 'strava' || APP === 'coros')
    ? (rawDurAfter || rawDurBefore)
    : (rawDurBefore || rawDurAfter);  // garmin, apple, nike: value above label

  const labelDur = rawDur ? parseTimeStr(rawDur) : null;
  if (labelDur) {
    durationMinutes = labelDur.minutes;
    durationSeconds = labelDur.seconds;
  } else {
    // Free-form — use timestamp-stripped text
    const durHM = textNoTimestamp.match(/(\d+)\s*h\s*(\d+)\s*m(?:in)?(?!\s*\d)/i);
    const durMS = textNoTimestamp.match(/(\d+)\s*m(?:in)?\s*(\d+)\s*s/i);
    const dur3  = textNoTimestamp.match(/(\d{1,2}):(\d{2}):(\d{2})/);

    // Collect all mm:ss NOT followed by AM/PM and NOT matching a pace (too short)
    const dur2Matches = [...textNoTimestamp.matchAll(/(\d{1,3}):(\d{2})(?!\d)/g)]
      .filter(m => {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        return secs < 60 && mins >= 1;
      });

    if (dur3) {
      durationMinutes = parseInt(dur3[1]) * 60 + parseInt(dur3[2]);
      durationSeconds = parseInt(dur3[3]);
    } else if (durHM) {
      durationMinutes = parseInt(durHM[1]) * 60 + parseInt(durHM[2]);
      durationSeconds = 0;
    } else if (durMS) {
      durationMinutes = parseInt(durMS[1]);
      durationSeconds = parseInt(durMS[2]);
    } else if (dur2Matches.length > 0) {
      // If we have pace context (mi or km), exclude values that look like paces (< 20 min)
      // and prefer values in the 5–300 min range (workout durations)
      const hasPaceContext = /\/\s*mi|\/\s*km|min\/mi|min\/km/i.test(rawText);
      let best = null;
      for (const m of dur2Matches) {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        if (secs >= 60) continue;
        // If pace context exists, skip values < 20 min (likely a pace reading)
        if (hasPaceContext && mins < 20) continue;
        if (best === null || mins > parseInt(best[1])) best = m;
      }
      // If filtering was too aggressive, retry without pace filter
      if (!best && dur2Matches.length > 0) {
        for (const m of dur2Matches) {
          const mins = parseInt(m[1]);
          const secs = parseInt(m[2]);
          if (secs >= 60) continue;
          if (best === null || mins > parseInt(best[1])) best = m;
        }
      }
      if (best) {
        durationMinutes = parseInt(best[1]);
        durationSeconds = parseInt(best[2]);
      }
    }
  }

  // ── Pace ─────────────────────────────────────────────────────────────────
  let paceSecondsPerMile = null;

  const rawPace = valueEither(RE.pace);
  if (rawPace) {
    const pt = parseTimeStr(rawPace);
    if (pt) {
      const isKm = /km|kilometer/i.test(rawPace + rawText.slice(0, 200));
      paceSecondsPerMile = isKm
        ? Math.round((pt.minutes * 60 + pt.seconds) * 1.60934)
        : pt.minutes * 60 + pt.seconds;
    }
  }
  if (paceSecondsPerMile == null) {
    const paceMi  = rawText.match(/(\d+)[':'](\d{2})['""]?\s*(?:\/\s*mi|min\/mi|per\s*mi)/i);
    const paceKm  = rawText.match(/(\d+)[':'](\d{2})['""]?\s*(?:\/\s*km|min\/km|per\s*km)/i);
    // NRC apostrophe format: 12'13" — only use if "avg. pace" label nearby
    const paceNRC = /avg\.?\s*pace/i.test(rawText)
      ? rawText.match(/(\d{1,3})['''`](\d{2})["""']?/)
      : null;
    if (paceMi)       paceSecondsPerMile = parseInt(paceMi[1]) * 60 + parseInt(paceMi[2]);
    else if (paceKm)  paceSecondsPerMile = Math.round((parseInt(paceKm[1]) * 60 + parseInt(paceKm[2])) * 1.60934);
    else if (paceNRC) paceSecondsPerMile = parseInt(paceNRC[1]) * 60 + parseInt(paceNRC[2]);
  }
  // Compute from distance + duration as last resort
  if (paceSecondsPerMile == null && distanceMiles && durationMinutes != null) {
    paceSecondsPerMile = Math.round((durationMinutes * 60 + (durationSeconds || 0)) / distanceMiles);
  }

  // ── Calories ─────────────────────────────────────────────────────────────
  let caloriesBurned = null;

  const rawCalLine = valueEither(RE.calories);
  if (rawCalLine) {
    // If the line has two columns (e.g. "26:11  408"), Calories is on the RIGHT → take last token
    const calSrc = extractSideValue(rawCalLine, 'last') ?? rawCalLine;
    const cm = calSrc.replace(/,/g, '').match(/(\d{2,6})/);
    if (cm) caloriesBurned = parseInt(cm[1]);
  }
  if (caloriesBurned == null) {
    // Free-form: "1,126 Cal", "408 Cal", "Calories: 408"
    const textNoComma = rawText.replace(/,(?=\d{3})/g, '');
    const calMatch = textNoComma.match(/(\d{2,6})\s*(?:k?cal|calories?)/i)
      || textNoComma.match(/calories?[:\s]+(\d{2,6})/i);
    if (calMatch) caloriesBurned = parseInt(calMatch[1]);
  }

  // ── Average Heart Rate ────────────────────────────────────────────────────
  let averageHeartrate = null;

  // For heart rate, ALWAYS try the label-based approach first to avoid picking
  // up elevation gain numbers (e.g. "78 ft" right before "Avg Heart Rate" label)
  const rawHRLine = valueEither(RE.heartRate);
  if (rawHRLine) {
    // If two-column line (e.g. "163 bpm  8:25 /mi"), HR is on the LEFT → take first token
    const rawHR = extractSideValue(rawHRLine, 'first') ?? rawHRLine;
    const isNoData = /^[-–—♡♥\s]+$/.test(rawHR.trim());
    const isElevation = /\bft\b|\bfeet\b/i.test(rawHR);
    if (!isNoData && !isElevation) {
      const hm = rawHR.match(/(\d{2,3})/);
      if (hm) {
        const bpm = parseInt(hm[1]);
        if (bpm >= 30 && bpm <= 250) averageHeartrate = bpm;
      }
    }
  }
  if (averageHeartrate == null) {
    // "XXX bpm" anywhere in the text is unambiguous
    const bpmMatch = rawText.match(/(\d{2,3})\s*bpm/i);
    if (bpmMatch) {
      const bpm = parseInt(bpmMatch[1]);
      if (bpm >= 30 && bpm <= 250) averageHeartrate = bpm;
    }
    // Per-line scan: label and number must appear on the SAME joined line
    // (prevents bridging across newlines and grabbing cadence/elevation values)
    if (averageHeartrate == null) {
      for (const line of lines) {
        const m = line.match(/(?:avg\.?\s*h(?:eart\s*)?r(?:ate)?|heart\s*rate)\s*:?\s*(\d{2,3})(?:\s*bpm)?/i);
        if (m) {
          const bpm = parseInt(m[1]);
          if (bpm >= 30 && bpm <= 250) { averageHeartrate = bpm; break; }
        }
      }
    }
  }

  // ── Timestamp / completedAt ───────────────────────────────────────────────
  let completedAt = null;
  const parseDateFromParts = ({ month, day, year, hour = 0, minute = 0, meridiem = null }) => {
    let y = parseInt(year, 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    let h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const ampm = String(meridiem || '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    const d = new Date(y, parseInt(month, 10) - 1, parseInt(day, 10), h, m, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // Relative app labels like "Today - 8:13 PM" need a calendar date. Prefer an
  // absolute screenshot/header date in the OCR text, then fall back to scan day.
  const absoluteDateOnly = rawText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  const relativeTime = rawText.match(/\b(Today|Yesterday)\b\s*(?:-|at)?\s*(\d{1,2}):(\d{2})\s*([APap][Mm])\b/);
  if (relativeTime) {
    const base = absoluteDateOnly
      ? parseDateFromParts({ month: absoluteDateOnly[1], day: absoluteDateOnly[2], year: absoluteDateOnly[3] })
      : new Date();
    if (base) {
      if (/yesterday/i.test(relativeTime[1])) base.setDate(base.getDate() - 1);
      let h = parseInt(relativeTime[2], 10);
      const ampm = String(relativeTime[4] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      base.setHours(h, parseInt(relativeTime[3], 10), 0, 0);
      completedAt = base.toISOString();
    }
  }

  const datePatterns = [
    /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/,
    /([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}[\s,]+\d{1,2}:\d{2}\s*[APap][Mm])/,
    /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[APap][Mm]?)/,
    /(\d{1,2}\/\d{1,2}\/\d{2}\s*,?\s+\d{1,2}:\d{2}\s*[APap][Mm])/,
  ];
  if (!completedAt) {
    for (const pat of datePatterns) {
      const m = rawText.match(pat);
      if (m) {
        try {
          let parsed = new Date(m[1]);
          const numeric = m[1].match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*,?\s+(\d{1,2}):(\d{2})\s*([APap][Mm])$/);
          if (numeric) {
            parsed = parseDateFromParts({
              month: numeric[1],
              day: numeric[2],
              year: numeric[3],
              hour: numeric[4],
              minute: numeric[5],
              meridiem: numeric[6]
            });
          }
          if (parsed && !isNaN(parsed.getTime())) { completedAt = parsed.toISOString(); break; }
        } catch { /* skip */ }
      }
    }
  }

  // ── Elevation gain ────────────────────────────────────────────────────────
  let elevationGainMeters = null;
  {
    // Match patterns like "170 ft", "52 m", "1,234 ft" after elevation labels
    const elevLine = valueEither(RE.elevation);
    if (elevLine) {
      const mFt = elevLine.match(/([\d,]+)\s*ft/i);
      const mM  = elevLine.match(/([\d,]+)\s*m\b/i);
      if (mFt)      elevationGainMeters = Math.round(parseFloat(mFt[1].replace(/,/g,'')) * 0.3048);
      else if (mM)  elevationGainMeters = Math.round(parseFloat(mM[1].replace(/,/g,'')));
    }
    // Broader scan: "170 ft Elevation Gain" or "Elevation Gain 170 ft"
    if (elevationGainMeters == null) {
      const m = rawText.match(/(?:elevation\s*gain|elev\.?\s*gain|total\s*ascent|ascent)[^\n]{0,40}?([\d,]+)\s*(ft|m)\b/i)
               || rawText.match(/([\d,]+)\s*(ft|m)\b[^\n]{0,40}?(?:elevation\s*gain|elev\.?\s*gain|total\s*ascent)/i);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g,''));
        elevationGainMeters = /ft/i.test(m[2]) ? Math.round(val * 0.3048) : Math.round(val);
      }
    }
    // Sanity check: elevation gain over 9000m is almost certainly OCR noise
    if (elevationGainMeters != null && elevationGainMeters > 9000) elevationGainMeters = null;
  }

  // ── Terrain detection ─────────────────────────────────────────────────────
  let terrain = null;
  if (/treadmill|tread\s*mill/i.test(rawText))              terrain = 'Treadmill';
  else if (/\btrack\b/i.test(rawText))                       terrain = 'Track';
  else if (/trail|dirt|offroad|off-road/i.test(rawText))     terrain = 'Trail';
  else if (/beach/i.test(rawText))                           terrain = 'Beach';

  // ── Activity type hint ────────────────────────────────────────────────────
  // Scan the first ~120 chars (likely the workout title in most apps)
  const titleChunk = textLow.slice(0, 120);
  let activityTypeHint = null;
  const checkActivity = (src) => {
    if (/ruck(?:ing)?/.test(src))                  return 'ruck';
    if (/walk(?:ing)?|hike|hiking/.test(src))      return 'walk';
    if (/run(?:ning)?|jog(?:ging)?/.test(src))     return 'run';
    if (/bike|cycl(?:ing|e)|ride/.test(src))       return 'cycling';
    if (/swim(?:ming)?/.test(src))                 return 'swim';
    if (/step|stairs/.test(src))                   return 'steps';
    return null;
  };
  activityTypeHint = checkActivity(titleChunk) || checkActivity(textLow);

  return {
    distanceMiles,
    durationMinutes,
    durationSeconds,
    caloriesBurned,
    averageHeartrate,
    paceSecondsPerMile,
    elevationGainMeters,
    completedAt,
    terrain,
    activityTypeHint,
    _app: APP   // useful for debugging
  };
};

// ── App detection ────────────────────────────────────────────────────────────

/**
 * Detect which fitness app the screenshot is from based on OCR text cues.
 * Returns a lowercase app identifier string or 'generic'.
 */
function detectApp(rawText, lines) {
  const t = rawText.toLowerCase();

  // Strava — "moving time", "elevation gain", "avg pace", "strava", city/state line
  if (/moving time/i.test(rawText))       return 'strava';
  if (/avg pace.*\/mi|avg pace.*\/km/i.test(rawText)) return 'strava';
  if (/\bstrava\b/i.test(rawText))        return 'strava';

  // Garmin Connect — characteristic labels and tab bar
  if (/\bgarmin\b|connect iq/i.test(rawText)) return 'garmin';
  if (/total ascent|total calories/i.test(rawText)) return 'garmin';
  if (/\btotal time\b/i.test(rawText) && !/moving time/i.test(rawText)) return 'garmin';
  // Garmin activity detail tabs
  if (/\boverview\b.*\bstats\b.*\blaps\b/i.test(rawText)) return 'garmin';
  if (/elapsed time.*\d+:\d{2}:\d{2}/i.test(rawText)) return 'garmin';

  // Apple Watch / Fitness app
  if (/apple watch|fitness.*rings|activity rings|apple fitness/i.test(rawText)) return 'apple';
  if (/active calories|move goal|exercise goal/i.test(rawText))                  return 'apple';

  // Nike Run Club — large bold distance then "Miles" label, apostrophe pace format
  if (/nike run club|nike\+|\bnrc\b/i.test(rawText)) return 'nike';
  if (/\d+['''`]\d{2}["""']?\s*\n.*avg\.?\s*pace/i.test(rawText)) return 'nike'; // 12'13" above Avg. Pace
  if (/\bthursday\b.*run|\bmorning\b.*run|\bevening\b.*run/i.test(rawText) && /\bmiles\b/i.test(rawText) && !/moving time/i.test(rawText)) return 'nike';

  // Coros — only if NOT already identified as Strava (Strava shows "from COROS" for Coros-synced activities)
  if (/\bcoros\b/i.test(rawText) && !/moving time/i.test(rawText)) return 'coros';

  // Peloton
  if (/peloton/i.test(rawText)) return 'peloton';

  // Wahoo / Zwift
  if (/\bwahoo\b|\bzwift\b/i.test(rawText)) return 'generic';

  return 'generic';
}

// ── Main scan function ───────────────────────────────────────────────────────

/**
 * Call Google Vision DOCUMENT_TEXT_DETECTION on an image buffer.
 * Returns { extracted, rawText, confidence, app } or throws on error.
 */
export const scanWorkoutScreenshot = async ({ fileBuffer, mimeType = 'image/jpeg' }) => {
  const client = await getVisionClient();
  const [result] = await client.documentTextDetection({
    image: { content: fileBuffer.toString('base64') },
    imageContext: { languageHints: ['en'] }
  });

  const annotation = result.fullTextAnnotation;
  const rawText = annotation?.text || '';
  const extracted = parseVisionText(rawText);

  // Confidence score: how many key fields were found
  let fieldsFound = 0;
  if (extracted.distanceMiles      != null) fieldsFound++;
  if (extracted.durationMinutes    != null || extracted.durationSeconds != null) fieldsFound++;
  if (extracted.caloriesBurned     != null) fieldsFound++;
  if (extracted.completedAt        != null) fieldsFound++;
  if (extracted.paceSecondsPerMile != null) fieldsFound++;
  const confidence = Math.round((fieldsFound / 5) * 100);

  return { extracted, rawText, confidence, app: extracted._app || 'generic' };
};

// ── Job record (audit trail) ─────────────────────────────────────────────────

export const enqueueWorkoutVision = async ({
  workoutId,
  learningClassId,
  userId,
  screenshotFilePath = null,
  workoutNotes = null,
  responseJson = null
}) => {
  const requestPayload = {
    screenshotFilePath: screenshotFilePath || null,
    workoutNotes: workoutNotes || null
  };
  const status = responseJson ? 'completed' : 'queued';

  await pool.execute(
    `INSERT INTO challenge_workout_vision_jobs
     (workout_id, learning_class_id, user_id, status, provider, request_json, response_json, error_message)
     VALUES (?, ?, ?, ?, 'google_vision', ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       status        = VALUES(status),
       response_json = VALUES(response_json),
       error_message = NULL`,
    [
      Number(workoutId),
      Number(learningClassId),
      Number(userId),
      status,
      JSON.stringify(requestPayload),
      responseJson ? JSON.stringify(responseJson) : null,
    ]
  );
  return { queued: true };
};
