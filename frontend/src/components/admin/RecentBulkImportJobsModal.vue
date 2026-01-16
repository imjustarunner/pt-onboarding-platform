<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <div>
          <h2 style="margin:0;">Recent Preview Jobs</h2>
          <div class="sub">
            Agency: <strong>{{ agencyName || agencyId }}</strong>
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn btn-secondary" type="button" @click="load" :disabled="loading">Refresh</button>
          <button class="btn-close" type="button" @click="$emit('close')">×</button>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-if="loading" class="loading">Loading…</div>

        <div v-else-if="jobs.length === 0" class="empty">
          No preview jobs found yet. Run <strong>Preview</strong> in Bulk Import to create one.
        </div>

        <div v-else class="jobs">
          <div v-for="j in jobs" :key="j.id" class="job-card">
            <div class="job-top">
              <div class="job-title">
                <strong>Job #{{ j.id }}</strong>
                <span class="pill" :class="`pill-${String(j.status || '').toLowerCase()}`">{{ j.status }}</span>
              </div>
              <div class="job-meta">
                <span>{{ formatDateTime(j.created_at) }}</span>
              </div>
            </div>

            <div class="stats">
              <div><strong>Totals</strong>: C {{ j.total_clients_rows || 0 }}, P {{ j.total_providers_rows || 0 }}, R {{ j.total_roster_rows || 0 }}</div>
              <div><strong>Pending</strong>: {{ j.pending_clients || 0 }}</div>
              <div><strong>Applied</strong>: {{ j.applied_clients || 0 }}</div>
              <div><strong>Errors</strong>: {{ j.error_rows || 0 }}</div>
            </div>

            <div class="actions">
              <button
                class="btn btn-secondary"
                type="button"
                @click="rollback(j)"
                :disabled="rollingBackJobId === j.id"
                title="Undo applied rows for this job"
              >
                {{ rollingBackJobId === j.id ? 'Rolling back…' : 'Undo Job' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  agencyName: { type: String, required: false, default: '' }
});

const emit = defineEmits(['close', 'rolledBack']);

const loading = ref(false);
const error = ref('');
const jobs = ref([]);
const rollingBackJobId = ref(null);

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '-');

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get('/bulk-import/jobs/clients-one-time/previews', {
      params: { agencyId: props.agencyId, limit: 25 }
    });
    jobs.value = resp.data || [];
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to load jobs';
  } finally {
    loading.value = false;
  }
};

const rollback = async (job) => {
  if (!job?.id) return;
  const ok = confirm(`Undo Job #${job.id}? This will attempt to rollback applied client rows from this job.`);
  if (!ok) return;

  rollingBackJobId.value = job.id;
  error.value = '';
  try {
    const resp = await api.post(`/bulk-import/jobs/${job.id}/rollback`);
    emit('rolledBack', { jobId: job.id, result: resp.data });
    await load();
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to rollback job';
  } finally {
    rollingBackJobId.value = null;
  }
};

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 900px;
  max-width: 95vw;
  max-height: 90vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sub { margin-top: 6px; color: var(--text-secondary); font-size: 13px; }
.btn-close { background: none; border: none; font-size: 28px; cursor: pointer; color: var(--text-secondary); }
.modal-body { padding: 16px 18px; overflow: auto; }
.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid #fcc;
}
.loading, .empty { color: var(--text-secondary); }
.jobs { display: grid; gap: 12px; }
.job-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
}
.job-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.job-title { display: flex; gap: 10px; align-items: center; }
.pill {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-secondary);
  font-weight: 700;
}
.stats {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  color: var(--text-primary);
}
.actions { margin-top: 10px; display: flex; justify-content: flex-end; }
.btn { padding: 10px 14px; border-radius: 10px; font-weight: 700; cursor: pointer; }
.btn-secondary { background: white; border: 1px solid var(--border); color: var(--text-primary); }
</style>

