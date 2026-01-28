<template>
  <div class="guardian-dashboard">
    <div class="header">
      <div class="title">
        <div class="name">My Dashboard</div>
        <div class="subtitle">
          Access your enrolled program(s), modules, documents, and your child’s information.
        </div>
      </div>

      <div class="header-actions">
        <GuardianProgramSelector :programs="programs" />
        <button class="btn btn-secondary btn-sm" type="button" @click="refreshAll" :disabled="loading">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading your dashboard…</div>

    <div v-else class="layout">
      <div class="top-cards">
        <div class="top-card">
          <div class="top-card-title">At a glance</div>
          <div class="top-card-desc">
            Upcoming sessions and announcements will show here. (Coming soon)
          </div>
        </div>
      </div>

      <div v-if="programs.length === 0 && children.length === 0" class="empty-state">
        <p>No children or programs are linked to this guardian account yet.</p>
        <p class="hint">Ask your organization to add you as a guardian on the child’s record.</p>
      </div>

      <div v-else class="main">
        <div class="rail">
          <div class="rail-section">
            <div class="rail-heading">Programs</div>
            <button
              v-for="p in programs"
              :key="p.id"
              type="button"
              class="rail-card"
              :class="{ active: isActiveProgram(p) }"
              @click="selectProgram(p)"
            >
              <div class="rail-card-title">{{ p.name || 'Program' }}</div>
              <div class="rail-card-sub">
                <span class="pill">{{ formatOrgType(p.organization_type) }}</span>
                <span v-if="(p.children || []).length > 0" class="pill pill-muted">
                  Child: {{ (p.children || []).map((c) => c.initials).filter(Boolean).join(', ') }}
                </span>
              </div>
            </button>
          </div>

          <div class="rail-section">
            <div class="rail-heading">Children</div>
            <button
              v-for="c in children"
              :key="c.client_id"
              type="button"
              class="rail-card"
              :class="{ active: activePanel === 'child' && Number(selectedChildId) === Number(c.client_id) }"
              @click="openChild(c)"
            >
              <div class="rail-card-title">Child</div>
              <div class="rail-card-sub">
                <span class="pill">{{ c.initials }}</span>
                <span class="pill pill-muted">{{ c.organization_name }}</span>
              </div>
            </button>
          </div>

          <div class="rail-section">
            <div class="rail-heading">My Dashboard</div>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'modules' }" @click="activePanel = 'modules'">
              <div class="rail-card-title">Modules</div>
              <div class="rail-card-sub">Program materials</div>
            </button>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'documents' }" @click="activePanel = 'documents'">
              <div class="rail-card-title">Documents</div>
              <div class="rail-card-sub">Forms and signatures</div>
            </button>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'billing' }" @click="activePanel = 'billing'">
              <div class="rail-card-title">Billing</div>
              <div class="rail-card-sub">Coming soon</div>
            </button>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'messages' }" @click="activePanel = 'messages'">
              <div class="rail-card-title">Messages</div>
              <div class="rail-card-sub">Coming soon</div>
            </button>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'notifications' }" @click="activePanel = 'notifications'">
              <div class="rail-card-title">Notifications</div>
              <div class="rail-card-sub">Coming soon</div>
            </button>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'account' }" @click="activePanel = 'account'">
              <div class="rail-card-title">Your Account</div>
              <div class="rail-card-sub">Profile and security</div>
            </button>
            <button type="button" class="rail-card" :class="{ active: activePanel === 'policy' }" @click="activePanel = 'policy'">
              <div class="rail-card-title">Policy & Procedures</div>
              <div class="rail-card-sub">Coming soon</div>
            </button>
          </div>

          <div class="rail-section">
            <div class="rail-heading">Coming soon</div>
            <button type="button" class="rail-card rail-card-coming-soon" @click="openComingSoon('contact')">
              <div class="rail-card-title">Contact</div>
              <div class="rail-card-sub">Providers and support team</div>
            </button>
            <button type="button" class="rail-card rail-card-coming-soon" @click="openComingSoon('booking')">
              <div class="rail-card-title">Booking</div>
              <div class="rail-card-sub">Request / manage sessions</div>
            </button>
            <button type="button" class="rail-card rail-card-coming-soon" @click="openComingSoon('add_child')">
              <div class="rail-card-title">Add child</div>
              <div class="rail-card-sub">Link another child to your account</div>
            </button>
            <button type="button" class="rail-card rail-card-coming-soon" @click="openComingSoon('additional_programs')">
              <div class="rail-card-title">Additional programs</div>
              <div class="rail-card-sub">Enroll in another program</div>
            </button>
          </div>
        </div>

        <div class="detail">
          <div class="panel">
            <template v-if="activePanel === 'modules'">
              <div class="panel-head">
                <div class="panel-title">Modules</div>
                <div class="panel-subtitle">Modules are scoped to your selected program.</div>
              </div>
              <TrainingFocusTab />
            </template>

            <template v-else-if="activePanel === 'documents'">
              <div class="panel-head">
                <div class="panel-title">Documents</div>
                <div class="panel-subtitle">Documents are scoped to your selected program.</div>
              </div>
              <DocumentsTab />
            </template>

            <template v-else-if="activePanel === 'child'">
              <div class="panel-head">
                <div class="panel-title">Child</div>
                <div class="panel-subtitle">Details for the selected child.</div>
              </div>
              <div v-if="selectedChild" class="child-details">
                <div class="row">
                  <div class="label">Initials</div>
                  <div class="value">{{ selectedChild.initials }}</div>
                </div>
                <div class="row">
                  <div class="label">Program</div>
                  <div class="value">{{ selectedChild.organization_name }}</div>
                </div>
                <div class="row">
                  <div class="label">Relationship</div>
                  <div class="value">{{ selectedChild.relationship_title || 'Guardian' }}</div>
                </div>
                <div class="row">
                  <div class="label">Status</div>
                  <div class="value">{{ formatClientStatus(selectedChild.status) }}</div>
                </div>
                <div class="row">
                  <div class="label">Docs</div>
                  <div class="value">{{ formatDocStatus(selectedChild.document_status) }}</div>
                </div>
              </div>
              <div v-else class="hint">Select a child from the left rail.</div>
            </template>

            <template v-else-if="activePanel === 'account'">
              <div class="panel-head">
                <div class="panel-title">Your Account</div>
                <div class="panel-subtitle">Basic account details.</div>
              </div>
              <div class="child-details">
                <div class="row">
                  <div class="label">Name</div>
                  <div class="value">{{ userName }}</div>
                </div>
                <div class="row">
                  <div class="label">Email</div>
                  <div class="value">{{ userEmail }}</div>
                </div>
                <div class="row">
                  <div class="label">Password</div>
                  <div class="value">
                    <router-link class="link" :to="changePasswordTo">Change password</router-link>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="panel-head">
                <div class="panel-title">{{ panelTitle }}</div>
                <div class="panel-subtitle">Coming soon.</div>
              </div>
              <div class="hint">This section is planned but not available yet.</div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="comingSoonKey" class="modal-overlay" @click.self="closeComingSoon">
      <div class="modal">
        <div class="modal-header">
          <h3 style="margin:0;">Coming soon</h3>
          <button class="btn-close" type="button" @click="closeComingSoon">×</button>
        </div>
        <div class="modal-body">
          {{ comingSoonMessage }}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" @click="closeComingSoon">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import TrainingFocusTab from '../../components/dashboard/TrainingFocusTab.vue';
import DocumentsTab from '../../components/dashboard/DocumentsTab.vue';
import GuardianProgramSelector from '../../components/GuardianProgramSelector.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const error = ref('');
const overview = ref({ children: [], programs: [] });

const activePanel = ref('modules');
const selectedChildId = ref(null);
const comingSoonKey = ref('');

const formatDocStatus = (s) => {
  const m = { NONE: 'None', UPLOADED: 'Uploaded', APPROVED: 'Approved', REJECTED: 'Rejected' };
  return m[s] || s || '-';
};

const formatClientStatus = (s) => {
  const m = {
    PENDING_REVIEW: 'Pending review',
    ACTIVE: 'Active',
    ON_HOLD: 'On hold',
    DECLINED: 'Declined',
    ARCHIVED: 'Archived'
  };
  return m[s] || s || '-';
};

const formatOrgType = (t) => {
  const k = String(t || '').toLowerCase();
  if (!k) return 'Org';
  if (k === 'school') return 'School';
  if (k === 'program') return 'Program';
  if (k === 'learning') return 'Learning';
  return k;
};

const programs = computed(() => Array.isArray(overview.value?.programs) ? overview.value.programs : []);
const children = computed(() => Array.isArray(overview.value?.children) ? overview.value.children : []);

const selectedChild = computed(() => {
  const id = Number(selectedChildId.value);
  if (!id) return null;
  return (children.value || []).find((c) => Number(c?.client_id) === id) || null;
});

const userName = computed(() => {
  const u = authStore.user || {};
  const n = `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim();
  return n || '—';
});

const userEmail = computed(() => String(authStore.user?.email || '').trim() || '—');

const changePasswordTo = computed(() => {
  const slug = String(route.params.organizationSlug || '').trim();
  return slug ? `/${slug}/change-password` : '/change-password';
});

const panelTitle = computed(() => {
  if (activePanel.value === 'billing') return 'Billing';
  if (activePanel.value === 'messages') return 'Messages';
  if (activePanel.value === 'notifications') return 'Notifications';
  if (activePanel.value === 'policy') return 'Policy & Procedures';
  return 'My Dashboard';
});

const comingSoonMessage = computed(() => {
  const key = String(comingSoonKey.value || '');
  const map = {
    contact: 'A contact card will list assigned providers and support team contacts.',
    booking: 'A booking card will let you request and manage sessions.',
    add_child: 'Add Child will allow you to link additional children to this account.',
    additional_programs: 'Additional programs enrollment will be available here.'
  };
  return map[key] || 'This feature is coming soon.';
});

const resolveTargetSlug = (program) => {
  const slug = String(program?.slug || program?.portal_url || '').trim();
  return slug || null;
};

const isActiveProgram = (p) => Number(agencyStore.currentAgency?.id || 0) === Number(p?.id || 0);

const selectProgram = async (program) => {
  if (!program?.id) return;
  agencyStore.setCurrentAgency(program);

  const slug = resolveTargetSlug(program);
  if (!slug) return;

  if (route.params.organizationSlug) {
    const nextParams = { ...route.params, organizationSlug: slug };
    await router.push({ name: route.name, params: nextParams, query: route.query });
    return;
  }
  await router.push(`/${slug}/guardian`);
};

const initProgramContext = async () => {
  const list = programs.value || [];
  if (list.length === 0) return;

  const routeSlug = String(route.params.organizationSlug || '').trim().toLowerCase();
  const match = routeSlug ? list.find((p) => String(resolveTargetSlug(p) || '').toLowerCase() === routeSlug) : null;
  if (match) {
    agencyStore.setCurrentAgency(match);
    return;
  }

  const curId = Number(agencyStore.currentAgency?.id || 0);
  const hasCur = curId && list.some((p) => Number(p?.id) === curId);
  if (!hasCur) {
    agencyStore.setCurrentAgency(list[0]);
  }
};

const fetchOverview = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/guardian-portal/overview');
    overview.value = resp.data || { children: [], programs: [] };
    await initProgramContext();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load guardian dashboard';
    overview.value = { children: [], programs: [] };
  } finally {
    loading.value = false;
  }
};

const refreshAll = async () => {
  await fetchOverview();
};

const openChild = (c) => {
  selectedChildId.value = Number(c?.client_id) || null;
  activePanel.value = 'child';
};

const openComingSoon = (key) => {
  comingSoonKey.value = String(key || '');
};

const closeComingSoon = () => {
  comingSoonKey.value = '';
};

onMounted(async () => {
  await fetchOverview();
});
</script>

<style scoped>
.guardian-dashboard {
  padding: 20px;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.loading {
  color: var(--text-secondary);
}

.error {
  color: #b91c1c;
}

.layout {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-state {
  color: var(--text-secondary);
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.hint {
  font-size: 13px;
}

.top-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.top-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.top-card-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.top-card-desc {
  color: var(--text-secondary);
  font-size: 13px;
}

.main {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 14px;
  align-items: start;
}

.rail {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  box-shadow: var(--shadow-sm);
}

.rail-section + .rail-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.rail-heading {
  font-weight: 800;
  color: var(--text-primary);
  font-size: 12px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.rail-card {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 12px;
  padding: 10px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 8px;
}

.rail-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.rail-card.active {
  border-color: var(--primary);
  background: rgba(79, 70, 229, 0.06);
}

.rail-card-coming-soon {
  opacity: 0.92;
}

.rail-card-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.rail-card-sub {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  font-size: 12px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
  color: var(--text-secondary);
}

.pill-muted {
  background: var(--bg-alt);
}

.detail .panel {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.panel-head {
  margin-bottom: 12px;
}

.panel-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.panel-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.child-details {
  display: grid;
  gap: 10px;
}

.row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  align-items: baseline;
}

.label {
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.value {
  color: var(--text-primary);
  font-weight: 600;
}

.link {
  color: var(--primary);
  font-weight: 700;
  text-decoration: none;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 50;
}

.modal {
  width: 100%;
  max-width: 560px;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.btn-close {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 14px;
  color: var(--text-secondary);
}

.modal-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 980px) {
  .main {
    grid-template-columns: 1fr;
  }
}
</style>

