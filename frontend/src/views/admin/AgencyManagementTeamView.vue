<template>
  <div class="management-team-page">
    <div class="page-header">
      <h1>Your Management Team</h1>
      <p class="page-description">
        Your platform support team. See who's available at a glance.
      </p>
      <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading">
        Refresh
      </button>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="team.length === 0" class="empty-state">
      <p>No management team has been assigned for your agency yet.</p>
      <p class="hint">Contact your platform administrator to set this up.</p>
    </div>

    <div v-else class="team-board">
      <div
        v-for="group in teamByRole"
        :key="group.roleType || '_unassigned'"
        class="role-section"
      >
        <h3 class="role-section-title">{{ group.label }}</h3>
        <div class="role-members" :style="groupCircleStyle(group.members.length)">
          <div
            v-for="(person, idx) in group.members"
            :key="person.id"
            class="team-member"
            :style="memberPosition(idx, group.members.length)"
          >
            <div class="avatar-wrap" :title="statusTooltip(person)">
              <div class="avatar" :class="{ 'has-photo': person.profile_photo_url }">
                <img
                  v-if="person.profile_photo_url"
                  :src="avatarUrl(person.profile_photo_url)"
                  :alt="person.display_name"
                  class="avatar-img"
                />
                <span v-else class="avatar-initial">{{ avatarInitial(person) }}</span>
              </div>
              <span class="status-dot" :class="statusDotClass(person.presence_status)" />
            </div>
            <div class="member-info">
              <span class="member-name">{{ person.display_name }}</span>
              <span v-if="person.display_role" class="member-role">{{ person.display_role }}</span>
              <span v-else class="member-role">{{ formatRole(person.role) }}</span>
              <span v-if="person.is_covering" class="covering-badge">Covering</span>
              <span v-if="person.presence_status" class="member-status" :class="statusTextClass(person.presence_status)">
                {{ statusLabel(person.presence_status) }}
              </span>
              <div class="member-actions">
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="openMessage(person)"
                >
                  Message
                </button>
                <a v-if="person.email" :href="`mailto:${person.email}`" class="member-email">Email</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const router = useRouter();

const ROLE_TYPE_LABELS = {
  credentialing: 'Credentialing',
  billing: 'Billing',
  support: 'Support',
  account_manager: 'Account Manager'
};

const statusOptions = [
  { value: 'in_available', label: 'Available' },
  { value: 'in_heads_down', label: 'Heads Down' },
  { value: 'in_available_for_phone', label: 'Available for Phone' },
  { value: 'out_quick', label: 'Out – Quick' },
  { value: 'out_am', label: 'Out – AM' },
  { value: 'out_pm', label: 'Out – PM' },
  { value: 'out_full_day', label: 'Out – Full Day' },
  { value: 'traveling_offsite', label: 'Traveling / Offsite' }
];

const agencyStore = useAgencyStore();
const loading = ref(true);
const error = ref('');
const team = ref([]);

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);

const teamByRole = computed(() => {
  const list = team.value;
  const byRole = new Map();
  for (const p of list) {
    const rt = p.role_type || '_unassigned';
    if (!byRole.has(rt)) byRole.set(rt, []);
    byRole.get(rt).push(p);
  }
  const order = ['credentialing', 'billing', 'support', 'account_manager', '_unassigned'];
  return order
    .filter((rt) => byRole.has(rt))
    .map((rt) => ({
      roleType: rt === '_unassigned' ? null : rt,
      label: rt === '_unassigned' ? 'Team' : (ROLE_TYPE_LABELS[rt] || rt),
      members: byRole.get(rt)
    }));
});

function groupCircleStyle(n) {
  const radius = n <= 3 ? 100 : n <= 6 ? 130 : 160;
  const size = (radius + 80) * 2;
  return { '--circle-radius': `${radius}px`, '--circle-size': `${size}px` };
}

const avatarUrl = (rel) => toUploadsUrl(rel);

const avatarInitial = (p) => {
  const f = String(p.first_name || '').trim();
  const l = String(p.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || '?';
};

const statusLabel = (status) => {
  const opt = statusOptions.find((o) => o.value === status);
  return opt ? opt.label : 'No status';
};

const statusTooltip = (person) => {
  const status = statusLabel(person.presence_status);
  let tip = `${person.display_name} – ${status}`;
  if (person.presence_note) tip += `: ${person.presence_note}`;
  if (person.presence_expected_return_at) {
    const t = new Date(person.presence_expected_return_at);
    tip += ` (Back ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
  }
  return tip;
};

const statusDotClass = (status) => {
  if (!status) return 'dot-none';
  if (['in_available', 'in_heads_down', 'in_available_for_phone'].includes(status)) return 'dot-in';
  if (status === 'out_quick') return 'dot-out-quick';
  if (status === 'traveling_offsite') return 'dot-traveling';
  if (['out_am', 'out_pm', 'out_full_day'].includes(status)) return 'dot-out';
  return 'dot-none';
};

const statusTextClass = (status) => {
  if (['in_available', 'in_heads_down', 'in_available_for_phone'].includes(status)) return 'status-available';
  if (status === 'out_quick') return 'status-quick';
  if (status === 'traveling_offsite') return 'status-traveling';
  if (['out_am', 'out_pm', 'out_full_day'].includes(status)) return 'status-out';
  return '';
};

const formatRole = (role) => {
  const r = String(role || '').replace(/_/g, ' ');
  return r.charAt(0).toUpperCase() + r.slice(1);
};

function memberPosition(idx, n) {
  if (!n) return {};
  if (n === 1) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  const angle = (2 * Math.PI * idx) / n - Math.PI / 2;
  const radius = n <= 3 ? 100 : n <= 6 ? 130 : 160;
  const size = (radius + 80) * 2;
  const frac = (radius / size) * 100;
  const x = 50 + frac * Math.cos(angle);
  const y = 50 + frac * Math.sin(angle);
  return {
    top: `${y}%`,
    left: `${x}%`,
    transform: 'translate(-50%, -50%)'
  };
}

async function fetchTeam() {
  const agencyId = currentAgencyId.value;
  if (!agencyId) {
    error.value = 'No agency selected';
    team.value = [];
    loading.value = false;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get(`/agencies/${agencyId}/management-team/today`);
    team.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
    team.value = [];
  } finally {
    loading.value = false;
  }
}

function refresh() {
  fetchTeam();
}

function openMessage(person) {
  const agencyId = currentAgencyId.value;
  if (!agencyId || !person?.id) return;
  router.push({
    path: '/admin/management-team',
    query: {
      openChatWith: String(person.id),
      agencyId: String(agencyId),
      openChatWithName: person.display_name || ''
    }
  });
}

onMounted(fetchTeam);
</script>

<style scoped>
.management-team-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.page-description {
  flex: 1;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.loading,
.error,
.empty-state {
  padding: 48px 24px;
  text-align: center;
}

.error {
  color: var(--danger);
}

.empty-state .hint {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-top: 8px;
}

.team-board {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  padding: 24px;
}

.role-section {
  flex: 1;
  min-width: 280px;
  max-width: 420px;
}

.role-section-title {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.role-members {
  position: relative;
  width: var(--circle-size, 360px);
  height: var(--circle-size, 360px);
  margin: 0 auto;
}

.team-member {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 140px;
}

.avatar-wrap {
  position: relative;
  margin-bottom: 8px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 3px solid white;
  box-shadow: var(--shadow);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-secondary);
}

.status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid white;
}

.status-dot.dot-in {
  background: #22c55e;
}

.status-dot.dot-out-quick {
  background: #eab308;
}

.status-dot.dot-traveling {
  background: #3b82f6;
}

.status-dot.dot-out {
  background: #ef4444;
}

.status-dot.dot-none {
  background: var(--border);
}

.member-name {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 2px;
}

.member-role {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.covering-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary);
  border: 1px solid var(--primary);
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 2px;
}

.member-status {
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: 4px;
}

.member-status.status-available {
  color: #22c55e;
}

.member-status.status-quick {
  color: #eab308;
}

.member-status.status-traveling {
  color: #3b82f6;
}

.member-status.status-out {
  color: #ef4444;
}

.member-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-top: 6px;
}

.member-actions .btn {
  font-size: 0.8rem;
  padding: 4px 10px;
}

.member-email {
  font-size: 0.8rem;
  color: var(--primary);
  text-decoration: none;
}

.member-email:hover {
  text-decoration: underline;
}
</style>
