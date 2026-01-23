<template>
  <div class="school-portal">
    <div class="portal-header">
      <h1>{{ organizationName }} Portal</h1>
      <p class="portal-subtitle">View your students and referral status</p>
    </div>

    <div class="portal-content">
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'clients' }"
          @click="activeTab = 'clients'"
        >
          Clients
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'providers' }"
          @click="activeTab = 'providers'"
        >
          Providers
        </button>
      </div>

      <div v-if="activeTab === 'clients'">
        <ClientListGrid
          :organization-slug="organizationSlug"
          :organization-id="organizationId"
        />
      </div>

      <div v-else class="schedule-wrap">
        <div v-if="organizationId" class="schedule-cards">
          <div class="schedule-cards-header">
            <h2 style="margin:0;">Providers</h2>
            <div style="display:flex; gap: 8px; align-items:center;">
              <button class="btn btn-secondary btn-sm" @click="showHelpDesk = true">Contact Admin</button>
            </div>
          </div>

          <div v-if="scheduleLoading" class="loading">Loading schedule…</div>
          <div v-else-if="scheduleError" class="error">{{ scheduleError }}</div>
          <div v-else class="cards-grid">
            <div v-for="d in days" :key="d" class="day-card">
              <div class="day-header">
                <strong>{{ d }}</strong>
              </div>
              <div v-if="(providersByDay[d] || []).length === 0" class="empty">
                No providers scheduled.
              </div>
              <div v-else class="provider-cards">
                <button
                  v-for="p in providersByDay[d]"
                  :key="`${d}-${p.provider_user_id}`"
                  class="provider-card"
                  @click="openProviderModal(p.provider_user_id)"
                  type="button"
                >
                  <div class="provider-name">{{ p.last_name }}, {{ p.first_name }}</div>
                  <div class="provider-meta">
                    <span class="badge badge-secondary">{{ p.assignment?.slots_available }} / {{ p.assignment?.slots_total }} slots</span>
                    <span v-if="p.assignment?.start_time || p.assignment?.end_time" class="badge badge-secondary">
                      {{ p.assignment?.start_time || '—' }}–{{ p.assignment?.end_time || '—' }}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <SchoolHelpDeskModal
            v-if="showHelpDesk && organizationId"
            :schoolOrganizationId="organizationId"
            @close="showHelpDesk = false"
          />

          <SchoolProvidersModal
            v-if="showProvidersModal"
            :providers="providers"
            :preselect-provider-user-id="selectedProviderUserId"
            @close="closeProviderModal"
          />
        </div>
        <div v-else class="empty-state">Organization not loaded.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import ClientListGrid from '../../components/school/ClientListGrid.vue';
import SchoolHelpDeskModal from '../../components/school/SchoolHelpDeskModal.vue';
import SchoolProvidersModal from '../../components/school/SchoolProvidersModal.vue';
import api from '../../services/api';

const route = useRoute();
const organizationStore = useOrganizationStore();

const activeTab = ref('clients');
const showHelpDesk = ref(false);
const showProvidersModal = ref(false);
const selectedProviderUserId = ref(null);

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const scheduleLoading = ref(false);
const scheduleError = ref('');
const providersByDay = ref({
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: []
});
const providers = ref([]);

const fetchScheduleCards = async () => {
  if (!organizationId.value) return;
  try {
    scheduleLoading.value = true;
    scheduleError.value = '';
    const r = await api.get(`/school-portal/${organizationId.value}/providers/scheduling`);
    const list = r.data || [];
    providers.value = list;
    const byDay = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
    for (const p of list) {
      for (const d of days) {
        const a = (p.assignments || []).find((x) => x.day_of_week === d && x.is_active);
        if (!a) continue;
        byDay[d].push({ ...p, assignment: a });
      }
    }
    for (const d of days) {
      byDay[d].sort((a, b) => String(a.last_name || '').localeCompare(String(b.last_name || '')));
    }
    providersByDay.value = byDay;
  } catch (e) {
    scheduleError.value = e.response?.data?.error?.message || 'Failed to load schedule';
  } finally {
    scheduleLoading.value = false;
  }
};

const openProviderModal = (providerUserId) => {
  selectedProviderUserId.value = providerUserId ? parseInt(providerUserId, 10) : null;
  showProvidersModal.value = true;
};

const closeProviderModal = () => {
  showProvidersModal.value = false;
  selectedProviderUserId.value = null;
};

const organizationSlug = computed(() => route.params.organizationSlug);

const organizationName = computed(() => {
  return organizationStore.organizationContext?.name || 
         organizationStore.currentOrganization?.name || 
         'School';
});

const organizationId = computed(() => {
  return organizationStore.organizationContext?.id || 
         organizationStore.currentOrganization?.id || 
         null;
});

onMounted(async () => {
  // Load organization context if not already loaded
  if (organizationSlug.value && !organizationStore.currentOrganization) {
    await organizationStore.fetchBySlug(organizationSlug.value);
  }
  await fetchScheduleCards();
});
</script>

<style scoped>
.school-portal {
  min-height: 100vh;
  background: var(--bg-alt);
  padding: 32px;
}

.portal-header {
  margin-bottom: 32px;
  background: var(--primary);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 18px 20px;
}

.portal-header h1 {
  font-size: 32px;
  font-weight: 700;
  color: var(--header-text-color, #fff);
  margin: 0 0 8px 0;
}

.portal-subtitle {
  font-size: 16px;
  color: var(--header-text-muted, rgba(255,255,255,0.85));
  margin: 0;
}

.portal-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.schedule-cards-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 1000px) {
  .cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.day-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}
.day-header {
  margin-bottom: 10px;
}
.provider-cards {
  display: grid;
  gap: 8px;
}
.provider-card {
  text-align: left;
  border: 1px solid var(--border);
  background: white;
  border-radius: 12px;
  padding: 10px 12px;
}
.provider-name {
  font-weight: 700;
  margin-bottom: 6px;
}
.provider-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.full-scheduler {
  margin-top: 16px;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}
.tab {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.tab.active {
  border-color: var(--primary);
  background: rgba(0, 0, 0, 0.03);
}
.schedule-wrap {
  margin-top: 8px;
}
</style>
