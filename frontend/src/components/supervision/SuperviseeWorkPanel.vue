<template>
  <section v-if="mode !== 'counts'" class="supervisee-work-panel" :aria-label="title" :aria-busy="loading">
    <header class="workspace-heading"><div><h3>{{ title }}</h3><p v-if="data?.description">{{ data.description }}</p></div><button type="button" class="workspace-button" :disabled="loading" @click="load(true)">{{ loading ? 'Refreshing…' : 'Refresh' }}</button></header>
    <p v-if="error" role="alert" class="workspace-error">{{ error }}</p>
    <p v-if="loading && !data" role="status">Loading {{ title.toLowerCase() }}…</p>
    <template v-if="data">
      <template v-if="mode === 'performance'">
        <div class="performance-grid">
          <article v-for="metric in metrics" :key="metric.key" class="performance-card">
            <span class="metric-label">{{ metric.label }}</span><strong class="metric-value">{{ duration(metric.value?.averageHours) }}</strong>
            <span class="metric-band" :class="{ ranked: metric.value?.band }">{{ metric.value?.band || 'More data needed for a rank' }}</span>
            <span class="metric-detail">{{ metric.value?.samples || 0 }} measured {{ metric.key === 'reply' ? 'replies' : 'notes' }} · {{ data.windowDays }} days</span>
            <span class="metric-detail">Organization average: {{ duration(metric.value?.organizationAverageHours) }}</span>
            <span class="metric-detail">{{ metric.value?.cohortSize || 0 }} eligible providers · lower time ranks higher</span>
            <span v-if="metric.key === 'notes'" class="metric-detail">{{ metric.value?.actualEndSamples || 0 }} recorded session ends · {{ metric.value?.scheduledEndSamples || 0 }} scheduled end estimates</span>
          </article>
        </div>
        <details class="metric-coverage"><summary>How these times and organization ranks are measured</summary><p>{{ data.replyCoverage }}</p><p>{{ data.noteCoverage }}</p><p>These are workflow measures. They do not assess clinical quality or explain why a response or note took longer.</p></details>
      </template>
      <template v-else-if="mode === 'assignments'">
        <div class="table-wrap" v-if="data.schools?.length"><table><caption>School and program assignments</caption><thead><tr><th>Location</th><th>Day / hours</th><th>Total slots</th><th>Available slots</th><th>School caseload</th></tr></thead><tbody><tr v-for="item in data.schools" :key="item.id"><td><strong>{{ item.name }}</strong></td><td>{{ item.day }}<small>{{ item.startTime || 'Time not recorded' }}<template v-if="item.endTime"> – {{ item.endTime }}</template></small></td><td>{{ item.slotsTotal }}</td><td>{{ item.slotsAvailable }}</td><td>{{ item.clients }}</td></tr></tbody></table></div>
        <div class="table-wrap" v-if="data.offices?.length"><table><caption>Office assignments and reserved hours</caption><thead><tr><th>Office / room</th><th>Day / hours</th><th>Recurrence</th><th>Reserved capacity</th><th>Linked clients</th><th>Effective dates</th></tr></thead><tbody><tr v-for="item in data.offices" :key="`${item.kind}-${item.id}`"><td><strong>{{ item.name }}</strong><small>{{ item.room }}</small><small v-if="item.organizationConfirmed === false">Shared-office reservation; booking organization not recorded</small></td><td><template v-if="item.kind === 'standing'">{{ item.day }}<small>{{ item.startTime }} – {{ item.endTime }}</small></template><template v-else>{{ date(item.startAt, item.timezone) }}<small>{{ item.endAt ? date(item.endAt, item.timezone) : 'Ongoing' }}</small></template><small>{{ item.timezone }}</small></td><td>{{ human(item.type) }}<small v-if="item.bookingFrequencies?.length">Booked {{ item.bookingFrequencies.map(human).join(', ') }}</small></td><td><template v-if="item.kind === 'standing'">{{ item.slotsTotal }} hour / recurrence<small>{{ item.slotsAvailable == null ? 'Remaining capacity not established' : `${item.slotsAvailable} available` }}</small></template><template v-else>Room assignment record</template></td><td>{{ item.clients == null ? 'Not established' : item.clients }}<small v-if="item.bookingPlanCount != null">{{ item.bookingPlanCount }} active booking plans</small></td><td><template v-if="item.kind === 'standing'">{{ item.effectiveFromDate || 'Start not recorded' }}<small>{{ item.untilDate ? `Until ${item.untilDate}` : 'Ongoing' }}</small></template><template v-else>{{ date(item.startAt, item.timezone) }}</template></td></tr></tbody></table><p v-if="data.offices.some(item => item.kind === 'standing')" class="workspace-caption">Recurring capacity counts reserved one-hour blocks. Linked-client counts come from current organization-linked booking plans, not the full office caseload. Unlinked plans leave client counts unavailable; remaining capacity appears only when no active booking plan uses an available block.</p></div>
        <p v-if="!data.total" class="workspace-empty">No active assignments are recorded for this organization.</p>
      </template>
      <template v-else-if="mode === 'communications'">
        <h4>Messages with this provider</h4><ul v-if="data.items?.length" class="message-list"><li v-for="message in data.items" :key="message.id"><div class="message-meta"><strong>{{ message.senderName }}</strong><time>{{ date(message.createdAt) }}</time></div><p>{{ message.body }}</p><RouterLink :to="chatLink(message.threadId)">Open conversation</RouterLink></li></ul><p v-else class="workspace-empty">No messages in shared conversations.</p>
        <h4>App notices available to you</h4><ul v-if="data.notifications?.length" class="notification-list"><li v-for="item in data.notifications" :key="item.id"><strong>{{ item.title || human(item.type) }}</strong><span>{{ date(item.createdAt) }} · {{ item.isResolved ? 'Resolved' : 'Open' }}</span></li></ul><p v-else class="workspace-empty">No app notices available under your notification permissions. The provider’s personal notification inbox remains private.</p>
        <p class="workspace-caption">Showing up to 100 recent messages and 100 notifications.</p>
      </template>
      <template v-else>
        <p class="workspace-count"><strong>{{ data.total }}</strong> open {{ mode === 'tasks' ? 'tasks' : 'work items' }}</p>
        <div class="table-wrap" v-if="data.items?.length"><table><thead><tr><th>{{ mode === 'tasks' ? 'Task' : 'Work item' }}</th><th>Status</th><th>{{ mode === 'tasks' ? 'Due' : 'Service date' }}</th><th v-if="mode === 'work'">Client reference</th></tr></thead><tbody><tr v-for="item in data.items" :key="item.id"><td><strong>{{ item.title || human(item.noteKind) || `Work item #${item.id}` }}</strong><small>{{ mode === 'tasks' ? human(item.type) : `Queue #${item.id}` }}</small></td><td><span class="status-pill">{{ human(item.status) }}</span></td><td>{{ mode === 'tasks' ? date(item.dueAt) : dateOnly(item.serviceDate) }}</td><td v-if="mode === 'work'">{{ item.clientId ? `Client #${item.clientId}` : 'No client linked' }}</td></tr></tbody></table></div>
        <p v-else class="workspace-empty">No open {{ mode === 'tasks' ? 'tasks' : 'work items' }} in this organization.</p>
        <p v-if="data.total > data.items?.length" class="workspace-caption">Showing the first {{ data.items.length }} of {{ data.total }} items.</p>
      </template>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, providerId: { type: Number, required: true }, mode: { type: String, default: 'tasks' } });
const emit = defineEmits(['counts']);
const route = useRoute();
const cache = ref({}), loading = ref(false), error = ref('');
let generation = 0;
const data = computed(() => cache.value[props.mode]);
const titles = { tasks: 'Task list', work: 'My Work', communications: 'Communications', assignments: 'Assignments and capacity', performance: 'Response and documentation times' };
const title = computed(() => titles[props.mode] || 'Supervisee work');
const metrics = computed(() => [{ key: 'reply', label: 'Average client reply time', value: data.value?.reply }, { key: 'notes', label: 'Average note completion time', value: data.value?.notes }]);
const human = value => String(value || '').replaceAll('_', ' ').toLowerCase();
const instant = value => new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
function date(value, timezone) { if (!value) return 'Not recorded'; const d = instant(value); return Number.isFinite(d.getTime()) ? d.toLocaleString([], timezone ? { timeZone: timezone } : {}) : 'Not recorded'; }
function dateOnly(value) { return value ? String(value).slice(0, 10) : 'Not recorded'; }
function duration(value) { if (value == null || !Number.isFinite(Number(value))) return 'Not measured'; const hours = Number(value); if (hours < 1) return `${Math.round(hours * 60)} min`; if (hours < 48) return `${hours.toFixed(1)} hrs`; return `${(hours / 24).toFixed(1)} days`; }
function chatLink(id) { const slug = route.params.organizationSlug; return `${slug ? `/${encodeURIComponent(slug)}` : ''}/dashboard?tab=chats&threadId=${Number(id)}`; }
async function load(force = false) {
  const section = props.mode, agency = props.agencyId, provider = props.providerId;
  error.value = '';
  if (!force && cache.value[section]) return;
  const token = ++generation; loading.value = true; error.value = '';
  try {
    const { data: response } = await api.get(`/supervision/supervisee/${provider}/workspace`, { params: { agencyId: agency, section }, skipGlobalLoading: true });
    if (token !== generation || agency !== props.agencyId || provider !== props.providerId) return;
    cache.value = { ...cache.value, [section]: response };
    if (section === 'counts') emit('counts', response);
    if (section === 'tasks' || section === 'work') emit('counts', { [section]: response.total });
  } catch (e) { if (token === generation) error.value = e.response?.data?.error?.message || 'This supervision section could not be loaded. Refresh to retry.'; }
  finally { if (token === generation) loading.value = false; }
}
watch(() => [props.agencyId, props.providerId, props.mode], (current, previous) => {
  if (!previous || current[0] !== previous[0] || current[1] !== previous[1]) { generation++; cache.value = {}; }
  void load();
}, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
<style scoped>
.supervisee-work-panel{color:#172d45;background:#fff;border:1px solid #d6dfeb;border-radius:16px;padding:1.25rem;min-width:0}.workspace-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.workspace-heading h3{font-size:1.2rem;margin:0 0 .5rem;color:#172d45}.workspace-heading p,.workspace-caption,.metric-coverage p{color:#526276;font-size:.9rem;line-height:1.55}.workspace-button{background:#fff;color:#203e68;border:1px solid #bac9dc;border-radius:8px;padding:.6rem 1rem;cursor:pointer;min-height:42px}.workspace-button:disabled{opacity:.6;cursor:wait}.workspace-error{padding:.8rem;color:#9a2424;background:#fff1f1;border-radius:8px}.performance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:1rem 0}.performance-card{border:1px solid #cad8e9;border-top:4px solid #285ba6;border-radius:12px;padding:1.1rem;display:flex;align-items:flex-start;flex-direction:column;gap:.5rem;background:#f8faff}.metric-label{font-weight:650;color:#344b67}.metric-value{font-size:2.1rem;line-height:1.2;color:#132e53}.metric-band{border-radius:20px;background:#e9eef5;color:#455b75;padding:.3rem .6rem;font-size:.82rem;font-weight:650}.metric-band.ranked{background:#dbe9ff;color:#173c79}.metric-detail{font-size:.84rem;color:#526276}.metric-coverage summary{cursor:pointer;color:#254f89;font-weight:600;padding:.6rem 0}.table-wrap{overflow-x:auto;margin-top:1rem}table{width:100%;border-collapse:collapse;text-align:left;font-size:.9rem}caption{text-align:left;font-size:1rem;font-weight:700;color:#172d45;padding:.6rem 0}th{background:#f0f4fa;color:#344c6b}td,th{padding:.8rem;border-bottom:1px solid #dde5ef;vertical-align:top}small{display:block;color:#64748b;margin-top:.3rem}.status-pill{display:inline-block;padding:.25rem .55rem;background:#edf2f9;border-radius:6px;color:#344b67;white-space:nowrap}.workspace-empty{padding:1.3rem;background:#f5f7fb;border-radius:10px;color:#526276}.workspace-count{font-size:1rem;color:#344c6b}.message-list,.notification-list{list-style:none;padding:0;display:grid;gap:.65rem}.message-list li,.notification-list li{border:1px solid #dce4ef;border-radius:10px;padding:1rem}.message-meta{display:flex;gap:.6rem;justify-content:space-between;flex-wrap:wrap;font-size:.85rem}.message-meta time,.notification-list span{color:#64748b;font-size:.8rem}.message-list p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}.message-list a{color:#245ba2;font-size:.9rem}.notification-list span{display:block;margin-top:.4rem}h4{color:#172d45;margin:1.4rem 0 .6rem}@media(max-width:600px){.supervisee-work-panel{padding:1rem}.workspace-heading{flex-wrap:wrap}.performance-grid{grid-template-columns:1fr}.metric-value{font-size:1.8rem}td,th{padding:.65rem}.workspace-button{min-height:44px}}
</style>
