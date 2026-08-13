<template>
  <section class="pao" :class="{ 'pao--open': panelOpen }">
    <button
      type="button"
      class="pao-toggle"
      :aria-expanded="panelOpen"
      @click="togglePanel"
    >
      <span class="pao-toggle-main">
        <span class="pao-chevron" aria-hidden="true">{{ panelOpen ? '▾' : '▸' }}</span>
        <span class="pao-title">Provider outreach</span>
        <span v-if="summaryLine" class="pao-summary muted">{{ summaryLine }}</span>
      </span>
      <span v-if="!panelOpen" class="pao-toggle-hint muted">PDFs & 24-hour links</span>
    </button>

    <div v-show="panelOpen" class="pao-body">
      <p class="pao-intro muted">
        Download a named PDF or copy a secure link for each provider. Links expire in 24 hours and open
        only their action-needed clients — no Google sign-in.
      </p>
      <div class="pao-toolbar">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="copiedHint" class="ok">{{ copiedHint }}</p>
      <p v-else-if="loading && !providers.length" class="muted">Loading providers…</p>
      <p v-else-if="!providers.length" class="muted">No providers currently have action-needed clients in this scope.</p>
      <div v-else class="pao-table-wrap">
        <table class="pao-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Clients</th>
              <th>Est. time</th>
              <th>Link expires</th>
              <th>Opened</th>
              <th>Time in</th>
              <th>Completed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in providers" :key="p.providerUserId || 'unassigned'">
              <tr>
                <td>
                  <button
                    v-if="p.providerUserId"
                    type="button"
                    class="linkish"
                    @click="toggleProvider(p)"
                  >
                    {{ p.displayName }}
                  </button>
                  <span v-else>{{ p.displayName }}</span>
                </td>
                <td>{{ p.clientCount }}</td>
                <td>{{ p.estimatedLabel }}</td>
                <td>
                  <span v-if="p.latestLink" :class="{ warn: p.linkExpired }">
                    {{ formatWhen(p.latestLink.expiresAt) }}
                    <span v-if="p.linkExpired" class="warn"> · expired</span>
                  </span>
                  <span v-else class="muted">Not generated</span>
                </td>
                <td>
                  <span v-if="p.latestLink?.firstOpenedAt">Yes · {{ formatWhen(p.latestLink.firstOpenedAt) }}</span>
                  <span v-else class="muted">No</span>
                </td>
                <td>{{ p.latestLink?.activeLabel || '—' }}</td>
                <td>
                  <template v-if="p.latestLink">
                    {{ p.latestLink.completedCount }} of {{ p.latestLink.clientCount }}
                  </template>
                  <span v-else class="muted">—</span>
                </td>
                <td class="pao-actions">
                  <template v-if="p.providerUserId">
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="busyId === p.providerUserId"
                      @click="downloadPdf(p)"
                    >
                      {{ busyId === p.providerUserId ? 'Building…' : 'PDF' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="busyId === p.providerUserId"
                      @click="copyLink(p)"
                    >
                      Link
                    </button>
                  </template>
                </td>
              </tr>
              <tr v-if="expandedId === p.providerUserId && detail" class="pao-detail">
                <td colspan="8">
                  <div class="pao-detail-grid">
                    <div>
                      <h3>This send</h3>
                      <p class="muted tiny">
                        Snapshot from the last PDF/link. Live remaining: {{ p.clientCount }}.
                      </p>
                      <ul>
                        <li v-for="c in detail.clients" :key="c.client_id">
                          <strong>{{ c.full_name || c.initials || c.identifier_code || `Client ${c.client_id}` }}</strong>
                          — {{ c.action_label || c.action_key || 'Action' }}
                          <span v-if="c.completed_at" class="ok">
                            · {{ c.outcome || 'completed' }} {{ formatWhen(c.completed_at) }}
                          </span>
                          <span v-else class="warn"> · still open</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h3>Activity</h3>
                      <ul>
                        <li v-for="ev in detail.events" :key="ev.id">
                          {{ ev.event_type }}
                          <template v-if="ev.outcome"> · {{ ev.outcome }}</template>
                          <span class="muted"> · {{ formatWhen(ev.created_at) }}</span>
                        </li>
                        <li v-if="!detail.events?.length" class="muted">No clicks yet.</li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  scope: { type: String, default: 'school' }
});

const panelOpen = ref(false);
const loadedOnce = ref(false);
const loading = ref(false);
const error = ref('');
const providers = ref([]);
const busyId = ref(0);
const expandedId = ref(0);
const detail = ref(null);
const copiedHint = ref('');

const summaryLine = computed(() => {
  if (!loadedOnce.value || loading.value) return '';
  const list = providers.value.filter((p) => p.providerUserId);
  if (!list.length) return 'No provider actions right now';
  const clients = list.reduce((n, p) => n + Number(p.clientCount || 0), 0);
  const mins = Math.max(1, Math.round((clients * 15) / 60));
  return `${list.length} provider${list.length === 1 ? '' : 's'} · ${clients} client${clients === 1 ? '' : 's'} · ~${mins} min`;
});

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function load() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/provider-action/summaries', {
      params: { agencyId, scope: props.scope },
      skipGlobalLoading: true
    });
    providers.value = Array.isArray(res.data?.providers) ? res.data.providers : [];
    loadedOnce.value = true;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider outreach';
    providers.value = [];
    loadedOnce.value = true;
  } finally {
    loading.value = false;
  }
}

function togglePanel() {
  panelOpen.value = !panelOpen.value;
  if (panelOpen.value && !loadedOnce.value) load();
}

async function downloadPdf(p) {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId || !p.providerUserId) return;
  busyId.value = p.providerUserId;
  error.value = '';
  copiedHint.value = '';
  try {
    const res = await api.get(`/provider-action/providers/${p.providerUserId}/pdf`, {
      params: { agencyId, scope: props.scope },
      responseType: 'blob',
      timeout: 120000,
      skipGlobalLoading: true
    });
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
    if (blob.type && blob.type.includes('json')) {
      const parsed = JSON.parse(await blob.text());
      throw new Error(parsed?.error?.message || 'Failed to build PDF');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(p.lastName || 'provider')}_${String(p.firstName || '')}_client-action.pdf`.replace(/\s+/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    await load();
  } catch (e) {
    const data = e?.response?.data;
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text());
        error.value = parsed?.error?.message || 'Failed to build PDF';
      } catch {
        error.value = 'Failed to build PDF';
      }
    } else {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to build PDF';
    }
  } finally {
    busyId.value = 0;
  }
}

async function copyLink(p) {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId || !p.providerUserId) return;
  busyId.value = p.providerUserId;
  error.value = '';
  copiedHint.value = '';
  try {
    let url = p.latestLink?.url;
    if (!url || p.linkExpired) {
      const res = await api.post(`/provider-action/providers/${p.providerUserId}/link`, {
        agencyId,
        scope: props.scope
      });
      url = res.data?.url;
    }
    if (!url) throw new Error('Could not create link');
    await navigator.clipboard.writeText(url);
    copiedHint.value = 'Link copied — expires in 24 hours.';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to copy link';
  } finally {
    busyId.value = 0;
  }
}

async function toggleProvider(p) {
  if (expandedId.value === p.providerUserId) {
    expandedId.value = 0;
    detail.value = null;
    return;
  }
  expandedId.value = p.providerUserId;
  try {
    const res = await api.get(`/provider-action/providers/${p.providerUserId}`, {
      params: { agencyId: props.agencyId, scope: props.scope },
      skipGlobalLoading: true
    });
    detail.value = res.data;
  } catch {
    detail.value = { clients: [], events: [] };
  }
}

watch(() => [props.agencyId, props.scope], () => {
  loadedOnce.value = false;
  providers.value = [];
  expandedId.value = 0;
  detail.value = null;
  if (panelOpen.value) load();
});
</script>

<style scoped>
.pao {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
}
.pao-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: #f8fafc;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
.pao-toggle:hover { background: #f1f5f9; }
.pao--open .pao-toggle {
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.pao-toggle-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.pao-chevron {
  color: #64748b;
  font-size: 11px;
  width: 12px;
  flex-shrink: 0;
}
.pao-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #145A3D;
}
.pao-summary {
  font-size: 13px;
}
.pao-toggle-hint {
  font-size: 12px;
  flex-shrink: 0;
}
.pao-body {
  padding: 12px 14px 14px;
}
.pao-intro {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
  max-width: 52rem;
}
.pao-toolbar {
  margin-bottom: 10px;
}
.pao-table-wrap { overflow: auto; }
.pao-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pao-table th, .pao-table td {
  text-align: left;
  padding: 7px 8px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}
.pao-actions { display: flex; gap: 6px; flex-wrap: wrap; white-space: nowrap; }
.linkish { background: none; border: none; color: #145A3D; font-weight: 700; cursor: pointer; padding: 0; }
.warn { color: #c2410c; }
.ok { color: #166534; }
.tiny { font-size: 12px; }
.pao-detail td { background: #f8fafc; }
.pao-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pao-detail-grid h3 { margin: 0 0 6px; font-size: 13px; }
.pao-detail-grid ul { margin: 0; padding-left: 16px; }
.error { color: #b91c1c; margin: 0 0 8px; }
@media (max-width: 800px) {
  .pao-detail-grid { grid-template-columns: 1fr; }
  .pao-toggle-hint { display: none; }
}
</style>
