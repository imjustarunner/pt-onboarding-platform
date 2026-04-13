/**
 * Google Vision OCR service for workout screenshot parsing.
 *
 * scanWorkoutScreenshot()  — calls Vision API synchronously, returns extracted fields
 * parseVisionText()        — regex parser that maps raw OCR text to workout fields
 * enqueueWorkoutVision()   — stores a job record (for audit/history); called after submit
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
  const text = rawText;

  // ── Label-aware extraction (Garmin, Apple Watch, etc.) ───────────────────
  // In many fitness screenshots the number sits ABOVE its label on screen.
  // Google Vision reads top-to-bottom so the number line precedes the label
  // line in the raw text.  Build a line array and, for each known label,
  // grab the value from the preceding non-empty line.
  const lines = text.split(/\n/).map(l => l.trim());

  const precedingValue = (labelRegex) => {
    for (let i = 1; i < lines.length; i++) {
      if (labelRegex.test(lines[i])) {
        // Walk back to find the nearest non-empty line
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j]) return lines[j];
        }
      }
    }
    return null;
  };

  // Garmin/Apple Watch label keywords
  const labelDuration   = /^(?:total\s*time|elapsed\s*time|duration|time)$/i;
  const labelPace       = /^(?:avg\.?\s*pace|average\s*pace|pace)$/i;
  const labelHeartRate  = /^(?:avg\.?\s*h(?:eart\s*)?r(?:ate)?|average\s*heart\s*rate|heart\s*rate|avg\s*hr)$/i;
  const labelCalories   = /^(?:total\s*cal(?:ories?)?|calories?|kcal)$/i;
  const labelDistance   = /^(?:distance)$/i;

  const rawDurationLine  = precedingValue(labelDuration);
  const rawPaceLine      = precedingValue(labelPace);
  const rawHeartRateLine = precedingValue(labelHeartRate);
  const rawCaloriesLine  = precedingValue(labelCalories);
  const rawDistanceLine  = precedingValue(labelDistance);

  // Helper: parse a time string (h:mm:ss or mm:ss) into { minutes, seconds }
  const parseTimeStr = (str) => {
    if (!str) return null;
    const t3 = str.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    const t2 = str.match(/(\d{1,3}):(\d{2})(?!\d)/);
    if (t3) return { minutes: parseInt(t3[1]) * 60 + parseInt(t3[2]), seconds: parseInt(t3[3]) };
    if (t2) return { minutes: parseInt(t2[1]), seconds: parseInt(t2[2]) };
    return null;
  };

  // ── Distance ──────────────────────────────────────────────────────────────
  // Matches: "5.23 mi", "5.23mi", "8.4 km", "8.4km", "3.1 miles"
  let distanceMiles = null;
  // Try label-based first (value is on the line preceding "Distance" label)
  if (rawDistanceLine) {
    const dm = rawDistanceLine.match(/(\d+\.?\d*)/);
    if (dm) distanceMiles = parseFloat(dm[1]);
  }
  if (distanceMiles == null) {
    const distMi = text.match(/(\d+\.?\d*)\s*mi(?:les?)?/i);
    const distKm  = text.match(/(\d+\.?\d*)\s*km/i);
    if (distMi) {
      distanceMiles = parseFloat(distMi[1]);
    } else if (distKm) {
      distanceMiles = parseFloat(distKm[1]) * 0.621371;
    }
    // Also check for a bare number followed by "mi" on the next line
    if (distanceMiles == null) {
      for (let i = 0; i + 1 < lines.length; i++) {
        if (/^mi(?:les?)?$/i.test(lines[i + 1])) {
          const m = lines[i].match(/(\d+\.?\d*)$/);
          if (m) { distanceMiles = parseFloat(m[1]); break; }
        }
      }
    }
  }
  if (distanceMiles != null) distanceMiles = Math.round(distanceMiles * 100) / 100;

  // ── Duration ─────────────────────────────────────────────────────────────
  // Matches: "1:23:45", "45:23", "45m 23s", "1h 23m"
  let durationMinutes = null;
  let durationSeconds = null;

  // Try label-based first (most reliable for Garmin layout)
  const labelDur = rawDurationLine ? parseTimeStr(rawDurationLine) : null;
  if (labelDur) {
    durationMinutes = labelDur.minutes;
    durationSeconds = labelDur.seconds;
  } else {
    const durHM = text.match(/(\d+)\s*h\s*(\d+)\s*m/i);       // 1h 23m
    const durMS = text.match(/(\d+)\s*m(?:in)?\s*(\d+)\s*s/i);// 45m 23s
    const dur3  = text.match(/(\d{1,2}):(\d{2}):(\d{2})/);    // h:mm:ss
    // For mm:ss, collect ALL matches and pick the one most plausible for duration
    // (prefer values that look like run durations: 10-180 min range)
    const dur2Matches = [...text.matchAll(/(\d{1,3}):(\d{2})(?!\d)/g)];
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
      // Pick the best candidate: prefer one where minutes are in a plausible
      // run/ruck range (5–300 min) over a likely pace (3–20 min) when ambiguous.
      // If there's only one candidate, use it; if multiple, prefer the larger.
      let best = null;
      for (const m of dur2Matches) {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        if (secs >= 60) continue; // invalid seconds
        if (best === null || mins > parseInt(best[1])) best = m;
      }
      if (best) {
        durationMinutes = parseInt(best[1]);
        durationSeconds = parseInt(best[2]);
      }
    }
  }

  // ── Pace ──────────────────────────────────────────────────────────────────
  // Matches: "8'32"/mi", "8:32 /mi", "8:32 min/mi", "5:10 /km", or label-based
  let paceSecondsPerMile = null;
  if (rawPaceLine) {
    const pt = parseTimeStr(rawPaceLine);
    if (pt) {
      // Label said it was pace — check if it's per km or per mile from context
      const paceCtx = text.toLowerCase();
      if (/km|kilometer/.test(paceCtx) && !/\bmi\b/.test(paceCtx)) {
        paceSecondsPerMile = Math.round((pt.minutes * 60 + pt.seconds) * 1.60934);
      } else {
        paceSecondsPerMile = pt.minutes * 60 + pt.seconds;
      }
    }
  }
  if (paceSecondsPerMile == null) {
    const paceMi = text.match(/(\d+)[':'](\d{2})['""]?\s*(?:\/\s*mi|min\/mi|per mi)/i);
    const paceKm = text.match(/(\d+)[':'](\d{2})['""]?\s*(?:\/\s*km|min\/km|per km)/i);
    if (paceMi) {
      paceSecondsPerMile = parseInt(paceMi[1]) * 60 + parseInt(paceMi[2]);
    } else if (paceKm) {
      const paceSecKm = parseInt(paceKm[1]) * 60 + parseInt(paceKm[2]);
      paceSecondsPerMile = Math.round(paceSecKm * 1.60934);
    }
  }
  // Fallback: compute from distance + duration if both present
  if (paceSecondsPerMile == null && distanceMiles && durationMinutes != null) {
    paceSecondsPerMile = Math.round(((durationMinutes * 60 + (durationSeconds || 0))) / distanceMiles);
  }

  // ── Calories ──────────────────────────────────────────────────────────────
  // Matches: "423 cal", "423 kcal", "Calories: 423", or label-based
  let caloriesBurned = null;
  if (rawCaloriesLine) {
    const cm = rawCaloriesLine.match(/(\d{2,5})/);
    if (cm) caloriesBurned = parseInt(cm[1]);
  }
  if (caloriesBurned == null) {
    const calMatch = text.match(/(\d{3,4})\s*(?:k?cal|calories?)/i)
      || text.match(/calories?[:\s]+(\d{3,4})/i);
    if (calMatch) caloriesBurned = parseInt(calMatch[1]);
  }

  // ── Average Heart Rate ────────────────────────────────────────────────────
  // Matches: "142 bpm", "Avg HR: 142", "Heart Rate 142", or label-based
  let averageHeartrate = null;
  if (rawHeartRateLine) {
    const hm = rawHeartRateLine.match(/(\d{2,3})/);
    if (hm) {
      const bpm = parseInt(hm[1]);
      if (bpm >= 30 && bpm <= 250) averageHeartrate = bpm;
    }
  }
  if (averageHeartrate == null) {
    const hrMatch = text.match(/avg\.?\s*h(?:eart\s*)?r(?:ate)?[:\s]*(\d{2,3})\s*b?pm/i)
      || text.match(/heart\s*rate[:\s]+(\d{2,3})/i)
      || text.match(/(\d{2,3})\s*bpm/i);
    if (hrMatch) {
      const bpm = parseInt(hrMatch[1]);
      if (bpm >= 30 && bpm <= 250) averageHeartrate = bpm;
    }
  }

  // ── Timestamp / completedAt ───────────────────────────────────────────────
  // Matches ISO, "Apr 3, 2026 7:32 AM", "3/4/2026 07:32", common app formats
  let completedAt = null;
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/,                         // ISO-ish
    /([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}[\s,]+\d{1,2}:\d{2}\s*[APap][Mm])/,  // Apr 3, 2026 7:32 AM
    /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[APap][Mm]?)/,   // 4/3/2026 7:32 AM
    /(\d{1,2}:\d{2}\s*[APap][Mm])/                                  // time only
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      try {
        const parsed = new Date(m[1]);
        if (!isNaN(parsed.getTime())) {
          completedAt = parsed.toISOString();
          break;
        }
      } catch { /* skip */ }
    }
  }

  // ── Terrain detection ─────────────────────────────────────────────────────
  // Look for keyword clues in the text (Race removed — use the "This was a race" toggle instead)
  let terrain = null;
  const textLow = text.toLowerCase();
  if (/treadmill|tread mill/.test(textLow))            terrain = 'Treadmill';
  else if (/track/.test(textLow))                      terrain = 'Track';
  else if (/trail|dirt|offroad|off-road/.test(textLow)) terrain = 'Trail';

  // ── Activity type hint ────────────────────────────────────────────────────
  // Scan the first ~80 chars first (likely the workout title) so a name like
  // "Afternoon Run" or "Morning Ruck" takes priority over body keywords.
  const titleChunk = textLow.slice(0, 80);
  let activityTypeHint = null;
  if (/ruck(?:ing)?/.test(titleChunk))                  activityTypeHint = 'ruck';
  else if (/walk(?:ing)?|hike|hiking/.test(titleChunk)) activityTypeHint = 'walk';
  else if (/run(?:ning)?|jog(?:ging)?/.test(titleChunk)) activityTypeHint = 'run';
  else if (/bike|cycling|ride/.test(titleChunk))        activityTypeHint = 'cycling';
  // fallback: full-text scan
  else if (/ruck(?:ing)?/.test(textLow))               activityTypeHint = 'ruck';
  else if (/walk(?:ing)?|hike|hiking/.test(textLow))   activityTypeHint = 'walk';
  else if (/run(?:ning)?|jog(?:ging)?/.test(textLow))  activityTypeHint = 'run';
  else if (/bike|cycling|ride/.test(textLow))          activityTypeHint = 'cycling';
  else if (/step|stairs/.test(textLow))                activityTypeHint = 'steps';

  return {
    distanceMiles:      distanceMiles,
    durationMinutes:    durationMinutes,
    durationSeconds:    durationSeconds,
    caloriesBurned:     caloriesBurned,
    averageHeartrate:   averageHeartrate,
    paceSecondsPerMile: paceSecondsPerMile,
    completedAt:        completedAt,
    terrain:            terrain,
    activityTypeHint:   activityTypeHint
  };
};

// ── Main scan function ───────────────────────────────────────────────────────

/**
 * Call Google Vision DOCUMENT_TEXT_DETECTION on an image buffer.
 * Returns { extracted, rawText, confidence } or throws on error.
 * Uses Application Default Credentials (Cloud Run service account) — no env flag required.
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

  // Compute a simple confidence score based on how many key fields were found
  let fieldsFound = 0;
  if (extracted.distanceMiles   != null) fieldsFound++;
  if (extracted.durationMinutes != null || extracted.durationSeconds != null) fieldsFound++;
  if (extracted.caloriesBurned  != null) fieldsFound++;
  if (extracted.completedAt     != null) fieldsFound++;
  if (extracted.paceSecondsPerMile != null) fieldsFound++;
  const confidence = Math.round((fieldsFound / 5) * 100);

  return { extracted, rawText, confidence };
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
  const errorMessage = null;

  await pool.execute(
    `INSERT INTO challenge_workout_vision_jobs
     (workout_id, learning_class_id, user_id, status, provider, request_json, response_json, error_message)
     VALUES (?, ?, ?, ?, 'google_vision', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status       = VALUES(status),
       response_json = VALUES(response_json),
       error_message = VALUES(error_message)`,
    [
      Number(workoutId),
      Number(learningClassId),
      Number(userId),
      status,
      JSON.stringify(requestPayload),
      responseJson ? JSON.stringify(responseJson) : null,
      errorMessage
    ]
  );
  return { queued: true };
};
