import { computed, watch, ref } from 'vue';

/**
 * Builds a list of fixed season weeks derived from the season start date.
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

  const toStartOfDay = (raw) => {
    const dt = raw ? new Date(raw) : new Date();
    dt.setHours(0, 0, 0, 0);
    return dt;
  };

  const fmtDate = (d) => {
    const dt = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d;
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const seasonWeeks = computed(() => {
    const raw = typeof seasonStartsAtRef === 'function'
      ? seasonStartsAtRef()
      : (seasonStartsAtRef?.value ?? null);
    const anchor = toStartOfDay(raw);

    const rawEnd = seasonEndsAtRef
      ? (typeof seasonEndsAtRef === 'function' ? seasonEndsAtRef() : (seasonEndsAtRef?.value ?? null))
      : null;
    const upperBound = toStartOfDay(rawEnd || new Date());

    const weeks = [];
    let cur = new Date(anchor);
    let weekNum = 1;
    while (cur <= upperBound && weekNum <= 60) {
      const iso = cur.toISOString().slice(0, 10);
      const endDate = new Date(cur);
      endDate.setDate(endDate.getDate() + 6);
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
      const today = toStartOfDay(new Date()).getTime();
      const idx = weeks.findIndex((w) => {
        const start = toStartOfDay(w.date);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return today >= start.getTime() && today <= end.getTime();
      });
      if (idx >= 0) {
        selectedWeekIdx.value = idx;
      } else if (today < toStartOfDay(weeks[0].date).getTime()) {
        selectedWeekIdx.value = 0;
      } else {
        selectedWeekIdx.value = weeks.length - 1;
      }
    }
  }, { immediate: true });

  const weekStartDate = computed(() => seasonWeeks.value[selectedWeekIdx.value]?.date || null);

  return { seasonWeeks, selectedWeekIdx, weekStartDate };
}
