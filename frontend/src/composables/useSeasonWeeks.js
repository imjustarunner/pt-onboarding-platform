import { computed, watch, ref } from 'vue';

/**
 * Builds a list of fixed season weeks derived from seasonStartsAt.
 * Each week runs 7 days (start date through start + 6 days).
 * Returns { seasonWeeks, selectedWeekIdx, weekStartDate, initWeek }
 *
 * @param {import('vue').Ref | import('vue').ComputedRef} seasonStartsAtRef - reactive ISO date/datetime string
 * @param {Object} opts
 * @param {boolean} opts.defaultToLatest - if true, default selection to most-recent week; if false, default to current week
 * @param {import('vue').Ref | import('vue').ComputedRef | null} opts.seasonEndsAtRef - when provided, generate
 *   weeks all the way to the season end date (includes future weeks). When null, cap at today.
 */
export function useSeasonWeeks(seasonStartsAtRef, { defaultToLatest = true, seasonEndsAtRef = null } = {}) {
  const selectedWeekIdx = ref(0);

  const fmtDate = (d) => {
    const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const seasonWeeks = computed(() => {
    const raw = typeof seasonStartsAtRef === 'function'
      ? seasonStartsAtRef()
      : (seasonStartsAtRef?.value ?? null);
    const anchor = raw ? new Date(raw) : new Date();
    // Walk back to Sunday (week start = Sunday)
    anchor.setDate(anchor.getDate() - anchor.getDay());
    anchor.setHours(0, 0, 0, 0);

    // Determine upper bound: season end date (for future-week planning) or today
    const rawEnd = seasonEndsAtRef
      ? (typeof seasonEndsAtRef === 'function' ? seasonEndsAtRef() : (seasonEndsAtRef?.value ?? null))
      : null;
    const upperBound = rawEnd ? new Date(rawEnd) : new Date();
    upperBound.setHours(23, 59, 59, 999);

    const weeks = [];
    let cur = new Date(anchor);
    let weekNum = 1;
    while (cur <= upperBound && weekNum <= 60) {
      const iso = cur.toISOString().slice(0, 10);
      const endDate = new Date(cur);
      endDate.setDate(endDate.getDate() + 7);
      const label = `Week ${weekNum} (${fmtDate(cur)} – ${fmtDate(endDate)})`;
      weeks.push({ date: iso, label, weekNum });
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
      weekNum++;
    }
    return weeks;
  });

  // Auto-select when weeks load
  watch(seasonWeeks, (weeks) => {
    if (!weeks.length) return;
    if (defaultToLatest) {
      selectedWeekIdx.value = weeks.length - 1;
    } else {
      // Find the week containing today
      const todayStr = new Date().toISOString().slice(0, 10);
      const idx = weeks.findLastIndex((w) => w.date <= todayStr);
      selectedWeekIdx.value = idx >= 0 ? idx : weeks.length - 1;
    }
  }, { immediate: true });

  const weekStartDate = computed(() => seasonWeeks.value[selectedWeekIdx.value]?.date || null);

  return { seasonWeeks, selectedWeekIdx, weekStartDate };
}
