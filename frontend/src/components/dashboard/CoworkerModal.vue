<template>
  <Teleport to="body">
    <div class="coworker-modal-overlay" role="dialog" aria-modal="true" @click.self="close">
      <div class="coworker-modal">
        <div class="coworker-modal-header">
          <h2 class="coworker-modal-title">Your Team</h2>
          <button type="button" class="btn-close" aria-label="Close" @click="close">&times;</button>
        </div>
        <div class="coworker-modal-body">
          <template v-if="selectedPerson">
            <!-- Detail view -->
            <div class="coworker-detail">
              <div class="coworker-detail-avatar">
                <img
                  v-if="selectedPerson.profilePhotoUrl"
                  :src="selectedPerson.profilePhotoUrl"
                  :alt="selectedPerson.displayName"
                />
                <span v-else class="avatar-initial">{{ avatarInitial(selectedPerson) }}</span>
              </div>
              <h3 class="coworker-detail-name">{{ selectedPerson.displayName }}</h3>
              <p v-if="selectedPerson.role" class="coworker-detail-role">{{ selectedPerson.role }}</p>
              <div class="coworker-detail-contact">
                <p v-if="selectedPerson.email">
                  <a :href="`mailto:${selectedPerson.email}`">{{ selectedPerson.email }}</a>
                </p>
                <p v-if="selectedPerson.phoneNumber">
                  <a :href="`tel:${selectedPerson.phoneNumber}`">{{ selectedPerson.phoneNumber }}</a>
                </p>
                <p v-if="!selectedPerson.email && !selectedPerson.phoneNumber" class="muted">No contact info</p>
              </div>
              <div class="coworker-detail-actions">
                <button type="button" class="btn btn-primary btn-sm" @click="openGiveKudos">
                  Give Kudos
                </button>
                <button type="button" class="btn btn-secondary btn-sm" @click="openChat">
                  Message
                </button>
              </div>
            </div>
            <!-- Kudos form (inline) -->
            <div v-if="showKudosForm" class="kudos-form">
              <label for="kudos-reason">Why do they deserve kudos? (required)</label>
              <textarea
                id="kudos-reason"
                v-model="kudosReason"
                rows="3"
                placeholder="e.g. Helped me with a difficult case, always responsive..."
                minlength="10"
              />
              <div class="kudos-form-actions">
                <button type="button" class="btn btn-primary btn-sm" :disabled="sendingKudos || kudosReason.trim().length < 10" @click="submitKudos">
                  Send Kudos
                </button>
                <button type="button" class="btn btn-secondary btn-sm" @click="showKudosForm = false">
                  Cancel
                </button>
              </div>
              <p v-if="kudosError" class="kudos-error">{{ kudosError }}</p>
            </div>
          </template>
          <template v-else>
            <!-- My Kudos progress -->
            <div v-if="agencyId && (tierProgress || tierProgressLoading)" class="kudos-progress-section">
              <div v-if="tierProgressLoading" class="muted">Loading your kudos…</div>
              <template v-else-if="tierProgress">
                <div class="kudos-progress-points">
                  <strong>Your kudos:</strong> {{ tierProgress.points }} points
                </div>
                <div v-if="tierProgress.nextTier" class="kudos-progress-next">
                  You're {{ tierProgress.nextTier.pointsToNext }} points away from
                  <strong>{{ tierProgress.nextTier.tierName }}</strong>
                  <span v-if="tierProgress.nextTier.rewardDescription" class="hint">({{ tierProgress.nextTier.rewardDescription }})</span>
                </div>
                <div v-else-if="tierProgress.earnedTiers.length > 0" class="kudos-progress-max">
                  You've reached all configured tiers. Great work!
                </div>
                <ul v-if="tierProgress.earnedTiers.length > 0" class="kudos-earned-list">
                  <li v-for="t in tierProgress.earnedTiers" :key="t.id">
                    {{ t.tierName }} ({{ t.pointsThreshold }} pts)
                    <span v-if="t.rewardDescription" class="hint">— {{ t.rewardDescription }}</span>
                  </li>
                </ul>
              </template>
            </div>
            <div v-if="management.length > 0" class="coworker-section">
              <h3 class="coworker-section-title">Management</h3>
              <div class="coworker-grid">
                <button
                  v-for="p in management"
                  :key="p.id"
                  type="button"
                  class="coworker-card"
                  @click="selectPerson(p)"
                >
                  <div class="coworker-card-avatar">
                    <img v-if="p.profilePhotoUrl" :src="p.profilePhotoUrl" :alt="p.displayName" />
                    <span v-else class="avatar-initial">{{ avatarInitial(p) }}</span>
                  </div>
                  <span class="coworker-card-name">{{ p.displayName }}</span>
                </button>
              </div>
            </div>
            <div v-if="peers.length > 0" class="coworker-section">
              <h3 class="coworker-section-title">Coworkers</h3>
              <div class="coworker-grid">
                <button
                  v-for="p in peers"
                  :key="p.id"
                  type="button"
                  class="coworker-card"
                  @click="selectPerson(p)"
                >
                  <div class="coworker-card-avatar">
                    <img v-if="p.profilePhotoUrl" :src="p.profilePhotoUrl" :alt="p.displayName" />
                    <span v-else class="avatar-initial">{{ avatarInitial(p) }}</span>
                  </div>
                  <span class="coworker-card-name">{{ p.displayName }}</span>
                </button>
              </div>
            </div>
            <p v-if="coworkers.length === 0" class="muted">No team members found.</p>
          </template>
        </div>
        <div class="coworker-modal-footer">
          <button v-if="selectedPerson" type="button" class="btn btn-secondary btn-sm" @click="selectedPerson = null">
            Back to list
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="close">
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null },
  coworkers: { type: Array, default: () => [] },
  management: { type: Array, default: () => [] },
  peers: { type: Array, default: () => [] }
});

const emit = defineEmits(['close']);

const route = useRoute();
const router = useRouter();

const selectedPerson = ref(null);
const tierProgress = ref(null);
const tierProgressLoading = ref(false);

const fetchTierProgress = async () => {
  if (!props.agencyId) return;
  tierProgressLoading.value = true;
  tierProgress.value = null;
  try {
    const res = await api.get('/kudos/tier-progress', { params: { agencyId: props.agencyId } });
    tierProgress.value = res.data;
  } catch {
    tierProgress.value = null;
  } finally {
    tierProgressLoading.value = false;
  }
};

watch(() => props.agencyId, fetchTierProgress, { immediate: true });
const showKudosForm = ref(false);
const kudosReason = ref('');
const kudosError = ref('');
const sendingKudos = ref(false);

const avatarInitial = (p) => {
  const f = String(p.firstName || '').trim();
  const l = String(p.lastName || '').trim();
  return `${f ? f[0] : ''}${l ? l[0] : ''}`.toUpperCase() || '?';
};

const selectPerson = (p) => {
  selectedPerson.value = p;
  showKudosForm.value = false;
  kudosReason.value = '';
  kudosError.value = '';
};

const close = () => emit('close');

const openChat = () => {
  if (!props.agencyId || !selectedPerson.value) return;
  router.push({
    path: route.path,
    query: {
      ...route.query,
      openChatWith: String(selectedPerson.value.id),
      agencyId: String(props.agencyId)
    }
  });
  close();
};

const openGiveKudos = () => {
  showKudosForm.value = true;
  kudosError.value = '';
};

const submitKudos = async () => {
  const reason = kudosReason.value.trim();
  if (reason.length < 10) {
    kudosError.value = 'Please write at least 10 characters explaining why they deserve kudos.';
    return;
  }
  if (!props.agencyId || !selectedPerson.value) return;

  sendingKudos.value = true;
  kudosError.value = '';
  try {
    await api.post('/kudos', {
      toUserId: selectedPerson.value.id,
      agencyId: props.agencyId,
      reason
    });
    showKudosForm.value = false;
    kudosReason.value = '';
    selectedPerson.value = null;
  } catch (e) {
    kudosError.value = e.response?.data?.error?.message || 'Failed to send kudos';
  } finally {
    sendingKudos.value = false;
  }
};
</script>

<style scoped>
.coworker-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 24px;
}

.coworker-modal {
  background: #fff;
  border-radius: 12px;
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.coworker-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.coworker-modal-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
  padding: 0 4px;
}

.btn-close:hover {
  color: #1f2937;
}

.coworker-modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.coworker-section-title {
  margin: 0 0 12px 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
}

.coworker-section + .coworker-section {
  margin-top: 20px;
}

.coworker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.coworker-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s;
}

.coworker-card:hover {
  background: #f3f4f6;
}

.coworker-card-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: #e5e7eb;
}

.coworker-card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  font-weight: 600;
  color: #4b5563;
}

.coworker-card-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.2;
}

.coworker-detail {
  text-align: center;
}

.coworker-detail-avatar {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  border-radius: 50%;
  overflow: hidden;
  background: #e5e7eb;
}

.coworker-detail-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.coworker-detail-name {
  margin: 0 0 4px 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.coworker-detail-role {
  margin: 0 0 12px 0;
  font-size: 0.875rem;
  color: #6b7280;
}

.coworker-detail-contact {
  margin-bottom: 20px;
}

.coworker-detail-contact p {
  margin: 4px 0;
  font-size: 0.875rem;
}

.coworker-detail-contact a {
  color: #2563eb;
}

.coworker-detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.kudos-form {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
  text-align: left;
}

.kudos-form label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.875rem;
  font-weight: 500;
}

.kudos-form textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  resize: vertical;
  margin-bottom: 12px;
}

.kudos-form-actions {
  display: flex;
  gap: 8px;
}

.kudos-error {
  margin-top: 8px;
  font-size: 0.8125rem;
  color: #dc2626;
}

.coworker-modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.kudos-progress-section {
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 0.875rem;
}

.kudos-progress-points {
  margin-bottom: 6px;
}

.kudos-progress-next,
.kudos-progress-max {
  margin-bottom: 8px;
  color: #4b5563;
}

.kudos-earned-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: #374151;
}

.kudos-earned-list li {
  margin-bottom: 4px;
}
</style>
