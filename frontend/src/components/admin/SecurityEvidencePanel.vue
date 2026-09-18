<template>
  <section class="security-investigation" aria-label="Security investigation">
    <PrivacyReviewerAssignments />
    <h2>Investigate account activity</h2>
    <p>Trace an account, network address, or session. These records identify the account used, not the person behind it.</p>
    <form class="investigation-filters" @submit.prevent="search">
      <label>User email or ID<input v-model.trim="filters.user" placeholder="rachel@example.com or 507" /></label>
      <label>IP address<input v-model.trim="filters.ip" placeholder="Exact IPv4 or IPv6 address" /></label>
      <label>From (your local time)<input v-model="filters.start" type="datetime-local" required /></label>
      <label>Until (your local time)<input v-model="filters.end" type="datetime-local" required /></label>
      <label>Activity<select v-model="filters.kind"><option value="">All requests</option><option value="downloads">Files and download links</option><option value="changes">Change requests</option><option value="denied">Access denied</option><option value="incomplete">Missing completion evidence</option></select></label>
      <label>Session reference<input v-model.trim="filters.session" placeholder="Select a session below or paste its reference" /></label>
      <div class="actions"><button class="btn btn-primary" :disabled="loading">{{ loading ? 'Searching…' : 'Search' }}</button><button type="button" class="btn btn-secondary" :disabled="loading || exporting || filtersChanged" @click="exportCsv">{{ exporting ? 'Exporting…' : 'Export evidence' }}</button></div>
    </form>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="filtersChanged && !loading" class="notice">Search to apply the edited filters before paging or exporting.</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <p v-if="exportHash" class="hash">Export SHA-256: <code>{{ exportHash }}</code></p>
    <div v-if="signals" class="notice">
      <strong>Review leads · last 24 hours · all accounts</strong>
      <p>{{ signals.incompleteRequests }} requests have no completion evidence after two minutes. {{ signals.highVolume.length }} bursts reached 25 file responses or download links in a 15-minute window. These are investigation leads, not proof of a breach.</p>
      <ul v-if="signals.highVolume.length"><li v-for="signal in signals.highVolume" :key="`${signal.user_id}-${signal.window_id}-${signal.client_ip}`"><button @click="filterUser({ user_id: signal.user_id })">{{ signal.actor_email || `User ${signal.user_id}` }}</button> · {{ signal.request_count }} file/link requests · {{ signal.client_ip }} · {{ time(signal.first_event) }}</li></ul>
    </div>
    <div class="notice coverage">
      <strong>Evidence coverage</strong>
      <p v-if="coverage.first_event">New request evidence begins {{ time(coverage.first_event) }}. Older records are in Activity reporting.</p>
      <p v-else>No request evidence is available yet. An empty result does not establish that no activity occurred.</p>
      <p v-if="proxyMode === 'unverified'">Client IP verification is not configured. Proxy addresses must not be treated as device addresses.</p>
      <p>“Response sent” means the server sent file data, not that someone saved or read it. “Link issued” means a temporary file link was returned; retrieval needs storage evidence. Missing completion evidence means the outcome is unknown.</p>
    </div>
    <div class="summary" aria-live="polite">{{ items.length }} {{ items.length === 1 ? 'request' : 'requests' }} on this page · {{ downloadCount }} file/link requests · {{ deniedCount }} denied · {{ incompleteCount }} without a completion record</div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Time ({{ timezone }})</th><th>Account</th><th>Activity and outcome</th><th>Resource / endpoint</th><th>Network</th><th>Investigate</th></tr></thead>
        <tbody>
          <tr v-for="row in items" :key="row.id">
            <td><time :datetime="iso(row.occurred_at)">{{ time(row.occurred_at) }}</time></td>
            <td>{{ row.actor_email || 'Not authenticated / not recorded' }}<small v-if="row.user_id">User {{ row.user_id }} · {{ row.actor_role }}</small></td>
            <td><strong>{{ actionLabel(row.action) }}</strong><small :class="{ warning: row.phase !== 'completed' || row.outcome === 'denied' }">{{ outcomeLabel(row) }}<span v-if="row.status_code"> · HTTP {{ row.status_code }}</span></small><small v-if="row.response_bytes != null">{{ Number(row.response_bytes).toLocaleString() }} response bytes</small><small v-if="transferDescription(details(row.details).transfer)">{{ transferDescription(details(row.details).transfer) }}</small></td>
            <td><code>{{ row.method }} {{ row.route }}</code></td>
            <td>{{ row.client_ip || 'Not recorded' }}<small :class="{ warning: row.ip_source === 'unverified_proxy' }">{{ ipLabel(row.ip_source) }}</small></td>
            <td class="row-actions"><button @click="inspect(row)">Details</button><button v-if="row.user_id" @click="filterUser(row)">This user</button><button v-if="row.session_ref" @click="filterSession(row)">This session</button><button v-if="row.client_ip" @click="filterIp(row)">This IP</button></td>
          </tr>
          <tr v-if="!items.length && !loading"><td colspan="6">No matching evidence. Check the time range and coverage notice before drawing a conclusion.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="actions"><button :disabled="loading || filtersChanged || !history.length" @click="previous">Previous</button><button :disabled="loading || filtersChanged || !nextCursor" @click="next">Next 100</button></div>
    <section v-if="selected" class="details" aria-label="Request evidence details">
      <div class="actions"><h3>Request evidence</h3><button @click="selected = null">Close details</button></div>
      <p>{{ selected.actor_email || 'Account not recorded' }} · {{ selected.method }} {{ selected.route }}</p>
      <dl><dt>Request ID</dt><dd><code>{{ selected.request_id }}</code></dd><dt>Session reference</dt><dd><code>{{ selected.session_ref || 'Not recorded' }}</code></dd><dt>Browser/device claim</dt><dd>{{ selected.user_agent || 'Not recorded' }} (self-reported by client)</dd><dt>Connection peer</dt><dd>{{ selected.peer_ip || 'Not recorded' }}</dd><dt>Forwarded addresses</dt><dd>{{ addresses(selected.forwarded_ips) }} (header observations; not independently verified)</dd><dt>Application version</dt><dd>{{ selected.build_id }}</dd></dl>
      <p v-if="detailsLoading">Loading request stages…</p>
      <ol><li v-for="event in stages" :key="event.id">{{ time(event.occurred_at) }} — {{ stageLabel(event.phase) }}: {{ actionLabel(event.action) }} / {{ evidenceLabel(event.outcome) }}<small v-if="Object.keys(details(event.details)).length">Recorded details: {{ JSON.stringify(details(event.details)) }}</small></li></ol>
      <button v-if="selected.user_id" class="btn btn-danger" @click="revokeTarget = { id: selected.user_id, email: selected.actor_email }; confirmation = ''">End all app sessions for this user</button>
    </section>
    <form v-if="revokeTarget" class="notice revoke" @submit.prevent="revoke">
      <h3>End sessions for {{ revokeTarget.email || `user ${revokeTarget.id}` }}</h3>
      <p>This ends existing PlotTwistHQ sign-ins, including sessions not yet listed. It does not suspend the account, end Google sessions, or invalidate file links already issued. The user can sign in again.</p>
      <label>Type user ID {{ revokeTarget.id }} to confirm<input v-model.trim="confirmation" inputmode="numeric" /></label>
      <div class="actions"><button class="btn btn-danger" :disabled="revoking || confirmation !== String(revokeTarget.id)">{{ revoking ? 'Ending sessions…' : 'Confirm and end sessions' }}</button><button type="button" @click="revokeTarget = null">Cancel</button></div>
    </form>
  </section>
</template>

<script setup>
import PrivacyReviewerAssignments from './PrivacyReviewerAssignments.vue';
import { ref, reactive, computed, onMounted } from 'vue';
import api from '../../services/api';
import { evidenceLabel, transferDescription } from '../../utils/evidenceTransfer';
const localInput = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const filters = reactive({ user: '', ip: '', session: '', kind: '', start: localInput(new Date(Date.now() - 86400000)), end: localInput(new Date(Date.now() + 60000)) });
const items = ref([]), coverage = ref({}), proxyMode = ref('unverified'), error = ref(''), message = ref(''), loading = ref(false), exporting = ref(false), exportHash = ref('');
const cursor = ref(null), snapshot = ref(null), nextCursor = ref(null), history = ref([]), selected = ref(null), stages = ref([]), detailsLoading = ref(false), revokeTarget = ref(null), confirmation = ref(''), revoking = ref(false);
const signals = ref(null);
const appliedFilters = ref('');
const filtersChanged = computed(() => JSON.stringify(filters) !== appliedFilters.value);
let sequence = 0;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const iso = value => value ? (/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? String(value) : `${String(value).replace(' ', 'T')}Z`) : '';
const time = value => value ? new Date(iso(value)).toLocaleString(undefined, { timeZoneName: 'short' }) : 'Not recorded';
const details = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const addresses = value => { const v = details(value); return Array.isArray(v) && v.length ? v.join(' → ') : 'None'; };
const actionLabel = value => ({ request: 'Request', login: 'Sign-in', data_read: 'Data request', data_change: 'Change request', file_response: 'File response', file_link_prepared: 'File link prepared (delivery unconfirmed)', download_link_issued: 'Download link', sessions_revoked: 'Sessions revoked' }[value] || evidenceLabel(value));
const stageLabel = value => ({ received: 'Request received', authenticated: 'Account verified', session_issued: 'Sign-in issued', link_prepared: 'File link prepared', link_issued: 'File link issued', administrative_action: 'Admin action committed', completed: 'Response outcome' }[value] || value);
const ipLabel = value => ({ verified_google_lb: 'Verified load-balancer source', direct_peer: 'Direct connection', unverified_proxy: 'Unverified / may be a proxy' }[value] || value);
const outcomeLabel = row => row.phase !== 'completed' ? 'Completion not recorded' : ({ response_sent: 'Response sent', issued: 'Link issued', interrupted: 'Interrupted', denied: 'Access denied', failed: 'Failed', succeeded: 'Succeeded' }[row.outcome] || evidenceLabel(row.outcome));
const downloadCount = computed(() => items.value.filter(r => ['file_response','file_metadata','download_link_issued'].includes(r.action)).length);
const deniedCount = computed(() => items.value.filter(r => r.outcome === 'denied').length);
const incompleteCount = computed(() => items.value.filter(r => r.phase !== 'completed').length);
const params = () => ({ start: new Date(filters.start).toISOString(), end: new Date(filters.end).toISOString(), ...(/^\d+$/.test(filters.user) ? { userId: filters.user } : filters.user ? { email: filters.user } : {}), ip: filters.ip || undefined, session: filters.session || undefined, kind: filters.kind || undefined, before: cursor.value || undefined, snapshot: snapshot.value || undefined });
async function load() {
  const requestSequence = ++sequence; loading.value = true; error.value = '';
  const filterState = JSON.stringify(filters);
  try { const { data } = await api.get('/security-evidence', { params: params() }); if (requestSequence !== sequence) return; items.value = data.items; nextCursor.value = data.nextCursor; snapshot.value = data.snapshot; coverage.value = data.coverage || {}; proxyMode.value = data.proxyMode; appliedFilters.value = filterState; }
  catch (e) { if (requestSequence === sequence) { items.value = []; nextCursor.value = null; error.value = e.response?.data?.error?.message || 'Could not load evidence. This is not an empty audit result.'; } }
  finally { if (requestSequence === sequence) loading.value = false; }
}
function search() { cursor.value = null; snapshot.value = null; history.value = []; selected.value = null; revokeTarget.value = null; load(); }
function next() { history.value.push(cursor.value); cursor.value = nextCursor.value; load(); }
function previous() { cursor.value = history.value.pop(); load(); }
function filterUser(row) { filters.user = String(row.user_id); filters.session = ''; filters.ip = ''; search(); }
function filterSession(row) { filters.session = row.session_ref; filters.ip = ''; search(); }
function filterIp(row) { filters.ip = row.client_ip; filters.user = ''; filters.session = ''; search(); }
async function inspect(row) {
  selected.value = row; stages.value = []; detailsLoading.value = true;
  try { const { data } = await api.get(`/security-evidence/requests/${row.request_id}`); if (selected.value?.request_id === row.request_id) stages.value = data.items; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not load request stages.'; }
  finally { if (selected.value?.request_id === row.request_id) detailsLoading.value = false; }
}
async function exportCsv() {
  exporting.value = true; error.value = ''; exportHash.value = '';
  try {
    const response = await api.get('/security-evidence/export.csv', { params: { ...params(), before: undefined }, responseType: 'blob' });
    const bytes = await response.data.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (response.headers['x-evidence-sha256'] && response.headers['x-evidence-sha256'] !== digest) throw new Error('Export integrity check failed.');
    const url = URL.createObjectURL(response.data), a = document.createElement('a'); a.href = url; a.download = `security-evidence-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportHash.value = digest; message.value = 'Evidence exported. Keep the original CSV and this checksum with the incident record.';
  } catch (e) { let body = e.response?.data; if (body instanceof Blob) { try { body = JSON.parse(await body.text()); } catch { body = {}; } } error.value = body?.error?.message || e.message || 'Export failed.'; }
  finally { exporting.value = false; }
}
async function revoke() {
  revoking.value = true; error.value = '';
  try { const { data } = await api.post(`/security-evidence/users/${revokeTarget.value.id}/revoke`, { confirmUserId: confirmation.value }); message.value = data.message; revokeTarget.value = null; search(); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Session revocation failed.'; }
  finally { revoking.value = false; }
}
onMounted(async () => {
  load();
  try { const { data } = await api.get('/security-evidence/signals'); signals.value = data; }
  catch { message.value = 'Review leads could not be loaded. Use the timeline; the signal check is unavailable.'; }
});
</script>

<style scoped>
.security-investigation { padding: 1rem 0; }
.investigation-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1.25rem 0; }
label { display: flex; flex-direction: column; gap: .35rem; font-weight: 600; }
input, select { padding: .6rem; border: 1px solid var(--border-color, #bbb); border-radius: 6px; background: var(--bg-primary, white); color: inherit; min-width: 0; }
.actions { display: flex; gap: .7rem; align-items: center; flex-wrap: wrap; margin: .75rem 0; }
.notice, .details { padding: 1rem; border: 1px solid var(--border-color, #bbb); border-radius: 8px; margin: 1rem 0; }
.coverage { background: var(--bg-secondary, #f4f6f8); }
.error, .warning { color: var(--danger-color, #a52a1d); }
.revoke { border-color: #a52a1d; }
.table-scroll { overflow: auto; }
table { width: 100%; min-width: 1050px; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: .8rem; vertical-align: top; border-bottom: 1px solid var(--border-color, #ddd); }
small { display: block; margin-top: .3rem; }
.row-actions button { display: block; margin-bottom: .4rem; white-space: nowrap; }
button:not(.btn) { padding: .4rem .65rem; border: 1px solid var(--border-color, #bbb); border-radius: 5px; background: var(--bg-primary, white); color: inherit; cursor: pointer; font: inherit; }
button:disabled { opacity: .55; cursor: default; }
code, dd { overflow-wrap: anywhere; }
dt { font-weight: 600; margin-top: .7rem; }
dd { margin-left: 0; }
.hash { overflow-wrap: anywhere; font-size: .85rem; }
.summary { margin: 1rem 0; }
</style>
