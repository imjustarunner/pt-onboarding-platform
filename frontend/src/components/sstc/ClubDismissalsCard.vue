<template>
  <section v-if="dismissals.length" class="card dismissals-card">
    <header class="dismissals-head">
      <div>
        <h3>Hidden club invites</h3>
        <p class="muted">
          You've told us not to show invites or season announcements from these clubs.
          Re-enable to start receiving them again.
        </p>
      </div>
    </header>
    <ul class="dismissals-list">
      <li v-for="d in dismissals" :key="d.agencyId" class="dismissals-row">
        <div>
          <strong>{{ d.agencyName }}</strong>
          <small class="muted">Hidden {{ formatDate(d.dismissedAt) }}</small>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busyId === d.agencyId"
          @click="reEngage(d)"
        >{{ busyId === d.agencyId ? 'Re-enabling…' : 'Re-enable invites' }}</button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const dismissals = ref([]);
const busyId = ref(null);

function formatDate(s) {
  try {
    return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return s; }
}

async function load() {
  try {
    const res = await api.get('/summit-stats/me/club-invite-dismissals');
    dismissals.value = Array.isArray(res.data?.dismissals) ? res.data.dismissals : [];
  } catch (_) { dismissals.value = []; }
}

async function reEngage(d) {
  busyId.value = d.agencyId;
  try {
    await api.delete(`/summit-stats/me/clubs/${d.agencyId}/dismiss-invites`);
    dismissals.value = dismissals.value.filter((x) => x.agencyId !== d.agencyId);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to re-enable invites');
  } finally {
    busyId.value = null;
  }
}

onMounted(() => { load(); });
</script>

<style scoped>
.dismissals-card { padding: 16px; }
.dismissals-head { margin-bottom: 10px; }
.dismissals-head h3 { margin: 0 0 4px; font-size: 16px; }
.dismissals-head p { margin: 0; font-size: 13px; }
.dismissals-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.dismissals-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.dismissals-row strong { display: block; font-size: 14px; color: #0f172a; }
.dismissals-row small { font-size: 11px; }
</style>
