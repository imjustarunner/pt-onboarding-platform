import SupervisionSession from '../models/SupervisionSession.model.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { dialInAttendance } from './meetingDialInAttendance.service.js';
import { unionAttendanceIntervals } from './meetingDialInPolicy.js';
const mysqlUtc = ms => new Date(ms).toISOString().slice(0,19).replace('T',' ');

export async function recomputeAttendanceRollupForUser({
  sessionId,
  userId,
  closeOpenAt = null,
  forceFinalize = false,
  sessionStartAt = null
} = {}) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) return null;

  const events = await SupervisionSession.listAttendanceEventsForSessionUser({ sessionId: sid, userId: uid });
  const openedStack = [];
  let firstJoinedAt = null;
  let lastLeftAt = null;
  let totalSeconds = 0;
  let segmentCount = 0;
  const intervals = [];
  const nowMs = Date.now();
  const closeCapMs = closeOpenAt ? parseUtcDate(closeOpenAt)?.getTime() : null;
  // Payable / supervision time only accrues at or after the scheduled session start.
  const sessionStartMs = parseUtcDate(sessionStartAt)?.getTime();

  function creditSegment(rawOpenMs, rawEndMs) {
    if (!Number.isFinite(rawOpenMs) || !Number.isFinite(rawEndMs)) return;
    let openMs = rawOpenMs;
    if (Number.isFinite(sessionStartMs)) openMs = Math.max(openMs, sessionStartMs);
    if (rawEndMs <= openMs) return;
    intervals.push([openMs, rawEndMs]);
    totalSeconds += Math.round((rawEndMs - openMs) / 1000);
    segmentCount += 1;
    if (!lastLeftAt || rawEndMs > lastLeftAt.getTime()) lastLeftAt = new Date(rawEndMs);
  }

  for (const ev of events || []) {
    const evType = String(ev?.event_type || '').trim().toLowerCase();
    const atMs = parseUtcDate(ev?.event_at)?.getTime();
    if (!Number.isFinite(atMs)) continue;
    if (evType === 'joined' || evType === 'opened') {
      // Duplicate open/joined (e.g. mounted "opened" + connected "joined") used to leave
      // unmatched opens that ballooned hours until finalize. Auto-close prior open first.
      if (openedStack.length) {
        const prevOpenMs = openedStack.pop();
        creditSegment(prevOpenMs, atMs);
      }
      openedStack.push(atMs);
      if (!firstJoinedAt || atMs < firstJoinedAt.getTime()) firstJoinedAt = new Date(atMs);
      continue;
    }
    if ((evType === 'left' || evType === 'closed') && openedStack.length) {
      const openedAtMs = openedStack.pop();
      creditSegment(openedAtMs, atMs);
    }
  }

  // Close leftover opens at session end (finalize) or cap provisional time at session end / now.
  for (const openedAtMs of openedStack) {
    const endMs = Number.isFinite(closeCapMs)
      ? Math.min(nowMs, closeCapMs)
      : nowMs;
    creditSegment(openedAtMs, endMs);
  }
  if (forceFinalize) openedStack.length = 0;

  const phoneSegments = (await dialInAttendance('supervision', sid)).filter(row => Number(row.user_id) === uid);
  for (const phone of phoneSegments) {
    const begin = parseUtcDate(phone.started_at)?.getTime(), end = parseUtcDate(phone.ended_at)?.getTime();
    if (Number.isFinite(begin) && Number.isFinite(end)) {
      creditSegment(begin, Math.min(end, Number.isFinite(closeCapMs) ? closeCapMs : nowMs));
      if (!firstJoinedAt || begin < firstJoinedAt.getTime()) firstJoinedAt = new Date(begin);
    }
  }
  // A browser and telephone can overlap for one person; credit their union.
  // Preserve the existing browser-only rounding and segment count.
  if (phoneSegments.length) {
    const union = unionAttendanceIntervals(intervals);
    totalSeconds = union.seconds; segmentCount = union.intervals.length;
  }

  // Hard sanity cap: never credit more than 8h for a single session attendance row.
  const MAX_SESSION_SECONDS = 8 * 3600;
  if (totalSeconds > MAX_SESSION_SECONDS) totalSeconds = MAX_SESSION_SECONDS;

  await SupervisionSession.upsertAttendanceRollup({
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? mysqlUtc(firstJoinedAt.getTime()) : null,
    lastLeftAt: lastLeftAt ? mysqlUtc(lastLeftAt.getTime()) : null,
    totalSeconds,
    segmentCount,
    isFinalized: forceFinalize || (openedStack.length === 0 && !phoneSegments.some(row => Number(row.is_active)))
  });
  return {
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? mysqlUtc(firstJoinedAt.getTime()) : null,
    lastLeftAt: lastLeftAt ? mysqlUtc(lastLeftAt.getTime()) : null,
    totalSeconds,
    segmentCount,
    isFinalized: forceFinalize || (openedStack.length === 0 && !phoneSegments.some(row => Number(row.is_active)))
  };
}
