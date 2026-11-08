<script setup>
import { computed } from 'vue';

const props = defineProps({ history: { type: Object, default: () => ({}) } });
const sessions = computed(() => (props.history.sessions || []).slice(-5));
const objectives = computed(() => props.history.objectives || []);
const trendLabels = {
  improving: 'Progressing', progressing: 'Progressing', stagnant: 'Stagnation', stagnation: 'Stagnation',
  regressing: 'Regression', regression: 'Regression', achieved: 'Achieved',
  insufficient: 'Not enough comparable scores', insufficient_data: 'Not enough comparable scores',
  unavailable: 'Unavailable', unknown: 'Direction not established'
};
function trend(value) { return typeof value === 'object' ? value?.status : value; }
function tone(value) {
  const status = trend(value);
  if (['improving', 'progressing', 'achieved'].includes(status)) return 'progress';
  if (['stagnant', 'stagnation'].includes(status)) return 'stagnant';
  if (['regressing', 'regression'].includes(status)) return 'regression';
  return 'unknown';
}
function label(value) { return trendLabels[trend(value)] || 'Not enough comparable scores'; }
function score(value) { return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : String(value); }
function date(value) {
  const raw = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : raw || 'Session';
}
function plot(objective) {
  const source = (objective.points || []).slice(-5);
  const values = source.map(point => score(point.score) === '—' ? null : Number(point.score));
  const finite = values.filter(value => value !== null);
  const low = Math.min(...finite, Number.isFinite(Number(objective.scaleMin)) && objective.scaleMin != null ? Number(objective.scaleMin) : Infinity);
  const high = Math.max(...finite, Number.isFinite(Number(objective.scaleMax)) && objective.scaleMax != null ? Number(objective.scaleMax) : -Infinity);
  const spread = high - low || 1;
  const points = source.map((point, index) => ({ ...point, score: values[index], x: source.length > 1 ? 24 + index * 252 / (source.length - 1) : 150, y: values[index] === null ? null : 104 - (values[index] - low) / spread * 76 }));
  const segments = [];
  let current = [];
  for (const point of points) {
    if (point.y === null) { if (current.length) segments.push(current); current = []; }
    else {
      const scaleKey = value => JSON.stringify([value.target ?? null, value.scaleMin ?? null, value.scaleMax ?? null]);
      if (current.length && scaleKey(current[current.length - 1]) !== scaleKey(point)) { segments.push(current); current = []; }
      current.push(point);
    }
  }
  if (current.length) segments.push(current);
  return { points, segments, hasValues: finite.length > 0 };
}
// The server limits the session window; retain both client and guardian responses within it.
const checkins = computed(() => props.history.checkins || []);
</script>

<template>
  <section class="narriva-history" aria-label="Treatment history">
    <p class="nh-intro">{{ sessions.length }} of up to 5 recent sessions. Trends use comparable recorded scores; missing scores are not treated as zero.</p>
    <p v-if="history.status === 'unavailable'" role="status" class="nh-unavailable">Treatment history is unavailable. Open the note or chart to review the available records.</p>
    <ol v-if="sessions.length" class="nh-sessions" aria-label="Sessions included"><li v-for="session in sessions" :key="session.id || session.sessionId || session.noteId">{{ date(session.date || session.dateOfService) }}</li></ol>
    <article v-for="objective in objectives" :key="objective.id" class="nh-objective">
      <div class="nh-objective-heading"><strong>Objective progress</strong><span class="nh-trend" :class="`nh-trend--${tone(objective.trend)}`"><span aria-hidden="true">{{ tone(objective.trend) === 'progress' ? '↗' : tone(objective.trend) === 'regression' ? '↘' : tone(objective.trend) === 'stagnant' ? '→' : '—' }}</span> {{ label(objective.trend) }}</span></div>
      <p v-if="objective.respondentLabel" class="nh-scale">{{ objective.respondentLabel }}</p>
      <svg v-if="plot(objective).hasValues" class="nh-graph" viewBox="0 0 300 146" role="img" :aria-label="`${objective.objective || objective.objectiveText || 'Objective'}: ${label(objective.trend)}. Recorded scores are listed below.`">
        <line x1="20" y1="112" x2="280" y2="112" class="nh-axis"/>
        <polyline v-for="(segment,index) in plot(objective).segments" :key="index" :points="segment.map(point => `${point.x},${point.y}`).join(' ')" fill="none" class="nh-line" :class="`nh-line--${tone(objective.trend)}`"/>
        <g v-for="(point,index) in plot(objective).points" :key="point.sessionId || index"><template v-if="point.y !== null"><circle :cx="point.x" :cy="point.y" r="4" class="nh-dot"/><text :x="point.x" :y="point.y - 10" text-anchor="middle">{{ score(point.score) }}</text></template><text :x="point.x" y="135" text-anchor="middle">{{ date(point.date || point.dateOfService) }}</text></g>
      </svg>
      <p v-else class="nh-missing">No objective scores recorded for these sessions.</p>
      <p><strong>Goal:</strong> {{ objective.goal || objective.goalText || 'Not recorded' }}</p>
      <p><strong>Objective:</strong> {{ objective.objective || objective.objectiveText || 'Not recorded' }}</p>
      <p v-if="objective.scaleTarget != null || objective.target != null" class="nh-scale">Target: {{ objective.scaleTarget ?? objective.target }}<template v-if="objective.direction"> · {{ objective.direction === 'lower' || objective.direction === 'decrease' ? 'Lower scores are the target' : objective.direction === 'higher' || objective.direction === 'increase' ? 'Higher scores are the target' : 'Review the recorded scale direction' }}</template></p>
      <details class="nh-score-details"><summary>Recorded scores</summary><table><thead><tr><th scope="col">Session</th><th scope="col">Score</th></tr></thead><tbody><tr v-for="(point,index) in (objective.points || []).slice(-5)" :key="point.sessionId || index"><td>{{ date(point.date || point.dateOfService) }}</td><td>{{ score(point.score) }}</td></tr></tbody></table></details>
      <p v-if="objective.trend?.reason || objective.reason" class="nh-missing">{{ objective.trend?.reason || objective.reason }}</p>
    </article>
    <p v-if="!objectives.length && history.status !== 'unavailable'" class="nh-missing">No comparable objective history is recorded for these sessions.</p>
    <section class="nh-changes" aria-label="Treatment plan changes"><h4>Plan updates and achievements</h4><p v-if="history.status === 'unavailable'" class="nh-missing">Plan updates could not be checked.</p><ul v-else-if="history.changes?.length"><li v-for="(change,index) in history.changes" :key="change.id || index"><strong>{{ change.label || change.type || 'Plan update' }}</strong><template v-if="change.date"> · {{ date(change.date) }}</template><p>{{ change.text || change.description }}</p></li></ul><p v-else class="nh-missing">No plan changes or achievements recorded in this session window.</p></section>
    <section class="nh-checkins" aria-label="Client check-in ratings"><h4>Client check-ins</h4><p class="nh-missing">Self-reported connection and progress, shown separately from clinician objective scores.</p><p v-if="history.status === 'unavailable'" class="nh-missing">Client check-in scores could not be checked.</p><div v-else-if="checkins.length" class="nh-table-wrap"><table><thead><tr><th scope="col">Session / respondent</th><th scope="col">Connection</th><th scope="col">Progress</th></tr></thead><tbody><tr v-for="(checkin,index) in checkins" :key="checkin.id || `${checkin.sessionId}:${checkin.respondentType}` || index"><td>{{ date(checkin.date || checkin.dateOfService) }}<small v-if="checkin.respondentType"> · {{ checkin.respondentType === 'guardian' || checkin.respondentType === 'caregiver' ? 'Guardian report' : checkin.respondentType === 'client' ? 'Client report' : 'Recorded respondent' }}</small></td><td>{{ score(checkin.connection ?? checkin.connectionScore) }}</td><td>{{ score(checkin.progress ?? checkin.progressScore) }}</td></tr></tbody></table></div><p v-else class="nh-missing">No client check-in scores recorded for these sessions.</p></section>
    <section v-if="history.advisories?.length" class="nh-advisories" aria-label="Clinical review prompts"><h4>For clinician review</h4><ul><li v-for="(advisory,index) in history.advisories" :key="advisory.id || index">{{ advisory.message || advisory.text || advisory }}</li></ul><p>Review these observations alongside the clinical context before changing the treatment plan, making a referral, or considering discharge.</p></section>
  </section>
</template>

<style scoped>
.narriva-history{color:#203b56;font-size:13px;line-height:1.5}.nh-intro,.nh-missing,.nh-scale{color:#596e85}.nh-unavailable{background:#fff5e4;border-radius:8px;padding:12px}.nh-sessions{display:flex;flex-wrap:wrap;list-style:none;padding:0;gap:7px}.nh-sessions li{background:#eef4fa;border-radius:6px;padding:5px 8px;font-size:12px}.nh-objective{border:1px solid #dce6f0;border-radius:12px;padding:14px;margin:14px 0}.nh-objective-heading{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap}.nh-objective p{margin:8px 0;overflow-wrap:anywhere}.nh-trend{border-radius:20px;padding:4px 8px;font-size:11px;font-weight:650}.nh-trend--progress{background:#e3f4e9;color:#1b633c}.nh-trend--stagnant{background:#fff1ca;color:#795600}.nh-trend--regression{background:#fce8e8;color:#9d2525}.nh-trend--unknown{background:#edf0f3;color:#536171}.nh-graph{display:block;width:100%;height:180px;max-height:180px;margin:12px auto}.nh-axis{stroke:#d1dce7;stroke-width:1}.nh-line{stroke:#6b8097;stroke-width:2.5}.nh-line--progress{stroke:#24834e}.nh-line--stagnant{stroke:#b58715}.nh-line--regression{stroke:#b83c3c}.nh-dot{fill:#214e79;stroke:white;stroke-width:1.5}.nh-graph text{font-size:10px;fill:#455c72}.nh-score-details summary{cursor:pointer;font-size:12px;color:#245780}.narriva-history table{border-collapse:collapse;width:100%;margin:9px 0;text-align:left;font-size:12px}.narriva-history th,.narriva-history td{padding:8px;border-bottom:1px solid #e2eaf1}.nh-changes,.nh-checkins,.nh-advisories{border-top:1px solid #dce6f0;padding-top:12px;margin-top:14px}.narriva-history h4{margin:0 0 8px;font-size:14px}.nh-table-wrap{overflow-x:auto}.nh-advisories{background:#fff9ec;border-radius:9px;padding:12px}.nh-advisories ul,.nh-changes ul{padding-left:18px}.nh-changes li p{margin:3px 0 10px}
</style>
