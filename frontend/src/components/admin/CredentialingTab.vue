<template>
  <div class="credentialing-tab">
    <h2>Insurance Credentialing</h2>
    <p class="hint" style="margin-top: -6px;">
      Per-insurance credentialing status for this provider. Data is stored for fully licensed providers only.
    </p>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency to view credentialing data.</p>
    </div>

    <div v-else>
      <div class="form-group" style="max-width: 320px; margin-bottom: 16px;">
        <label>Agency</label>
        <select v-model.number="agencyId" :disabled="loading">
          <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading">Loading credentialing…</div>
      <div v-else-if="loadError" class="error">{{ loadError }}</div>
      <div v-else-if="credentialing.length === 0" class="empty-state">
        <p>No insurance credentialing records for this provider in the selected agency.</p>
      </div>
      <div v-else class="credentialing-cards">
        <div
          v-for="c in credentialing"
          :key="c.id"
          class="credentialing-card"
        >
          <div class="card-header">
            <h3>{{ c.insurance_name }}</h3>
          </div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Effective date</label>
                <div class="value">{{ c.effective_date || '—' }}</div>
              </div>
              <div class="form-group">
                <label>Submitted date</label>
                <div class="value">{{ c.submitted_date || '—' }}</div>
              </div>
              <div class="form-group">
                <label>Resubmitted date</label>
                <div class="value">{{ c.resubmitted_date || '—' }}</div>
              </div>
              <div class="form-group">
                <label>PIN / Reference</label>
                <div class="value">{{ c.pin_or_reference || '—' }}</div>
              </div>
            </div>
            <div v-if="c.notes" class="form-group">
              <label>Notes</label>
              <div class="value">{{ c.notes }}</div>
            </div>
            <div v-if="c.has_user_credentials" class="form-group">
              <label>User-level credentials</label>
              <div class="credential-row">
                <span v-if="!revealedCreds[c.id]" class="masked">••••••••</span>
                <span v-else class="revealed">{{ revealedCreds[c.id] || '(empty)' }}</span>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm reveal-btn"
                  @click="toggleReveal(c.id)"
                  :title="revealedCreds[c.id] ? 'Hide' : 'Reveal (requires credential privilege)'"
                >
                  {{ revealedCreds[c.id] ? 'Hide' : 'Reveal' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  userId: { type: Number, required: true }
});

const agencyStore = useAgencyStore();
const agencies = computed(() => agencyStore.userAgencies || agencyStore.agencies || []);
const agencyId = ref(null);

const credentialing = ref([]);
const loading = ref(false);
const loadError = ref('');

const fetchCredentialing = async () => {
  if (!props.userId || !agencyId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/credentialing/users/${props.userId}`);
    credentialing.value = res.data?.credentialing || [];
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Failed to load credentialing';
    credentialing.value = [];
  } finally {
    loading.value = false;
  }
};

const revealedCreds = ref({});

const toggleReveal = async (uicId) => {
  if (revealedCreds.value[uicId]) {
    revealedCreds.value = { ...revealedCreds.value, [uicId]: undefined };
    return;
  }
  try {
    const res = await api.post(`/agencies/${agencyId.value}/credentialing/reveal`, {
      type: 'user_level',
      id: uicId,
      field: 'username'
    });
    revealedCreds.value = { ...revealedCreds.value, [uicId]: res.data?.value ?? '' };
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to reveal credential');
  }
};

watch([() => props.userId, agencyId], () => fetchCredentialing(), { immediate: true });

watch(agencies, (list) => {
  if (list?.length && !agencyId.value) {
    agencyId.value = agencyStore.currentAgency?.id || list[0]?.id || null;
  }
}, { immediate: true });

onMounted(async () => {
  if (!agencies.value?.length) {
    await agencyStore.fetchUserAgencies?.();
  }
  if (agencies.value?.length && !agencyId.value) {
    agencyId.value = agencyStore.currentAgency?.id || agencies.value[0]?.id || null;
  }
});
</script>

<style scoped>
.credentialing-tab {
  padding: 0;
  font-family: var(--agency-font-family, var(--font-body));
}
.credentialing-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.credentialing-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.card-header {
  background: var(--bg-alt);
  padding: 12px 16px;
}
.card-header h3 {
  margin: 0;
  font-size: 1rem;
  font-family: var(--agency-font-family, var(--font-header));
}
.card-body {
  padding: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.credential-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.masked {
  font-family: var(--agency-font-family, var(--font-body));
  letter-spacing: 2px;
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
