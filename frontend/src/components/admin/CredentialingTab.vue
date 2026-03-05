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

      <div class="credentialing-card" style="margin-bottom: 14px;">
        <div class="card-header">
          <h3>Add insurance for this provider</h3>
        </div>
        <div class="card-body">
          <div v-if="insurances.length === 0" class="muted">
            No insurance definitions found for this agency.
          </div>
          <template v-else>
            <div class="form-grid">
              <div class="form-group">
                <label>Insurance</label>
                <select v-model.number="addForm.insuranceCredentialingDefinitionId" :disabled="adding">
                  <option :value="null">Select…</option>
                  <option v-for="ins in availableInsurances" :key="ins.id" :value="ins.id">{{ ins.name }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>Effective date</label>
                <input v-model="addForm.effectiveDate" type="date" :disabled="adding" />
              </div>
              <div class="form-group">
                <label>Submitted date</label>
                <input v-model="addForm.submittedDate" type="date" :disabled="adding" />
              </div>
              <div class="form-group">
                <label>Resubmitted date</label>
                <input v-model="addForm.resubmittedDate" type="date" :disabled="adding" />
              </div>
              <div class="form-group">
                <label>PIN / Reference</label>
                <input v-model.trim="addForm.pinOrReference" type="text" :disabled="adding" />
              </div>
              <div class="form-group">
                <label>User login username (optional)</label>
                <input v-model.trim="addForm.loginUsername" type="text" :disabled="adding" />
              </div>
              <div class="form-group">
                <label>User login password (optional)</label>
                <input v-model.trim="addForm.loginPassword" type="password" :disabled="adding" />
              </div>
            </div>
            <div class="form-group" style="margin-top: 10px;">
              <label>Notes</label>
              <textarea v-model.trim="addForm.notes" rows="2" :disabled="adding"></textarea>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary btn-sm" :disabled="adding || !addForm.insuranceCredentialingDefinitionId" @click="addCredentialing">
                {{ adding ? 'Adding…' : 'Add insurance credentialing' }}
              </button>
            </div>
            <div v-if="addError" class="error" style="margin-top: 8px;">{{ addError }}</div>
          </template>
        </div>
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
                <input v-model="c.edit.effectiveDate" type="date" :disabled="c.saving" />
              </div>
              <div class="form-group">
                <label>Submitted date</label>
                <input v-model="c.edit.submittedDate" type="date" :disabled="c.saving" />
              </div>
              <div class="form-group">
                <label>Resubmitted date</label>
                <input v-model="c.edit.resubmittedDate" type="date" :disabled="c.saving" />
              </div>
              <div class="form-group">
                <label>PIN / Reference</label>
                <input v-model.trim="c.edit.pinOrReference" type="text" :disabled="c.saving" />
              </div>
              <div class="form-group">
                <label>Update user login username (optional)</label>
                <input v-model.trim="c.edit.loginUsername" type="text" :disabled="c.saving" />
              </div>
              <div class="form-group">
                <label>Update user login password (optional)</label>
                <input v-model.trim="c.edit.loginPassword" type="password" :disabled="c.saving" />
              </div>
            </div>
            <div class="form-group" style="margin-top: 10px;">
              <label>Notes</label>
              <textarea v-model.trim="c.edit.notes" rows="2" :disabled="c.saving"></textarea>
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
            <div class="form-actions" style="margin-top: 10px;">
              <button class="btn btn-primary btn-sm" :disabled="c.saving" @click="saveCredentialing(c)">
                {{ c.saving ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn btn-danger btn-sm" :disabled="c.saving" @click="removeCredentialing(c)">
                Remove
              </button>
            </div>
            <div v-if="c.error" class="error" style="margin-top: 8px;">{{ c.error }}</div>
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
const insurances = ref([]);
const loading = ref(false);
const loadError = ref('');
const addError = ref('');
const adding = ref(false);

const newEmptyAddForm = () => ({
  insuranceCredentialingDefinitionId: null,
  effectiveDate: '',
  submittedDate: '',
  resubmittedDate: '',
  pinOrReference: '',
  notes: '',
  loginUsername: '',
  loginPassword: ''
});
const addForm = ref(newEmptyAddForm());

const mapCredentialingRow = (row) => ({
  ...row,
  edit: {
    effectiveDate: row.effective_date || '',
    submittedDate: row.submitted_date || '',
    resubmittedDate: row.resubmitted_date || '',
    pinOrReference: row.pin_or_reference || '',
    notes: row.notes || '',
    loginUsername: '',
    loginPassword: ''
  },
  saving: false,
  error: ''
});

const availableInsurances = computed(() => {
  const inUse = new Set((credentialing.value || []).map((c) => Number(c.insurance_credentialing_definition_id)));
  return (insurances.value || []).filter((ins) => !inUse.has(Number(ins.id)));
});

const fetchCredentialing = async () => {
  if (!props.userId || !agencyId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/credentialing/users/${props.userId}`);
    credentialing.value = (res.data?.credentialing || []).map(mapCredentialingRow);
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Failed to load credentialing';
    credentialing.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchInsurances = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/agencies/${agencyId.value}/credentialing/insurances`);
    insurances.value = res.data?.insurances || [];
  } catch {
    insurances.value = [];
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

const addCredentialing = async () => {
  if (!agencyId.value || !props.userId || !addForm.value.insuranceCredentialingDefinitionId) return;
  adding.value = true;
  addError.value = '';
  try {
    await api.post(`/agencies/${agencyId.value}/credentialing/user-insurance`, {
      userId: props.userId,
      insuranceCredentialingDefinitionId: addForm.value.insuranceCredentialingDefinitionId,
      effectiveDate: addForm.value.effectiveDate || null,
      submittedDate: addForm.value.submittedDate || null,
      resubmittedDate: addForm.value.resubmittedDate || null,
      pinOrReference: addForm.value.pinOrReference || null,
      notes: addForm.value.notes || null,
      loginUsername: addForm.value.loginUsername || null,
      loginPassword: addForm.value.loginPassword || null
    });
    addForm.value = newEmptyAddForm();
    await fetchCredentialing();
  } catch (e) {
    addError.value = e.response?.data?.error?.message || 'Failed to add insurance credentialing';
  } finally {
    adding.value = false;
  }
};

const saveCredentialing = async (item) => {
  if (!agencyId.value || !item?.id) return;
  item.saving = true;
  item.error = '';
  try {
    await api.patch(`/agencies/${agencyId.value}/credentialing/user-insurance/${item.id}`, {
      effectiveDate: item.edit.effectiveDate || null,
      submittedDate: item.edit.submittedDate || null,
      resubmittedDate: item.edit.resubmittedDate || null,
      pinOrReference: item.edit.pinOrReference || null,
      notes: item.edit.notes || null,
      loginUsername: item.edit.loginUsername || null,
      loginPassword: item.edit.loginPassword || null
    });
    await fetchCredentialing();
  } catch (e) {
    item.error = e.response?.data?.error?.message || 'Failed to save insurance credentialing';
  } finally {
    item.saving = false;
  }
};

const removeCredentialing = async (item) => {
  if (!agencyId.value || !item) return;
  if (!confirm(`Remove ${item.insurance_name} credentialing for this provider?`)) return;
  item.saving = true;
  item.error = '';
  try {
    await api.delete(`/agencies/${agencyId.value}/credentialing/user-insurance`, {
      data: {
        userId: item.user_id,
        insuranceCredentialingDefinitionId: item.insurance_credentialing_definition_id
      }
    });
    await fetchCredentialing();
  } catch (e) {
    item.error = e.response?.data?.error?.message || 'Failed to remove insurance credentialing';
  } finally {
    item.saving = false;
  }
};

watch([() => props.userId, agencyId], () => fetchCredentialing(), { immediate: true });
watch(agencyId, () => {
  addError.value = '';
  addForm.value = newEmptyAddForm();
  fetchInsurances();
});

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
  await fetchInsurances();
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
.form-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
