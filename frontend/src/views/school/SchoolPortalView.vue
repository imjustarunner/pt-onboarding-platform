<template>
  <div class="school-portal">
    <div class="portal-header">
      <h1>{{ organizationName }} Portal</h1>
      <p class="portal-subtitle">Schedule + roster (no PHI)</p>
    </div>

    <div class="portal-content">
      <div class="top-row">
        <div class="top-left">
          <SchoolDayBar
            v-if="showSchedule"
            v-model="store.selectedWeekday"
            :days="store.days"
          />
          <div v-else class="muted-small">{{ viewMode === 'roster' ? 'Roster view' : 'Skills Groups view' }}</div>
        </div>
        <div class="top-actions">
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            @click="viewMode = viewMode === 'skills' ? 'schedule' : 'skills'"
            v-if="canToggleSkills"
          >
            {{ viewMode === 'skills' ? 'Back to schedule' : 'Skills Groups' }}
          </button>
          <button
            v-if="canToggleRoster"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="viewMode = viewMode === 'schedule' ? 'roster' : 'schedule'"
          >
            {{ viewMode === 'schedule' ? 'Roster only' : 'Show schedule' }}
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="showHelpDesk = true">Contact Admin</button>
        </div>
      </div>

      <DayPanel
        v-if="organizationId && showSchedule"
        :weekday="store.selectedWeekday"
        :providers="store.dayProviders"
        :eligible-providers="store.eligibleProvidersForSelectedDay"
        :loading-providers="store.dayProvidersLoading"
        :providers-error="store.dayProvidersError"
        :panel-for="panelFor"
        @add-day="handleAddDay"
        @add-provider="handleAddProvider"
        @open-client="openClient"
        @save-slots="handleSaveSlots"
        @move-slot="handleMoveSlot"
        @open-provider="goToProviderSchoolProfile"
      />
      <SkillsGroupsPanel
        v-else-if="organizationId && viewMode === 'skills'"
        :organization-id="organizationId"
      />
      <div v-else class="empty-state">Organization not loaded.</div>

      <div class="roster" v-if="showRoster">
        <div class="roster-header">
          <h2 style="margin: 0;">School roster</h2>
          <div class="muted">Assigned + unassigned (restricted fields)</div>
        </div>
        <ClientListGrid :organization-slug="organizationSlug" :organization-id="organizationId" />
      </div>
    </div>

    <ClientModal
      v-if="selectedClient && organizationId"
      :client="selectedClient"
      :school-organization-id="organizationId"
      @close="selectedClient = null"
    />

    <SchoolHelpDeskModal
      v-if="showHelpDesk && organizationId"
      :schoolOrganizationId="organizationId"
      @close="showHelpDesk = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import ClientListGrid from '../../components/school/ClientListGrid.vue';
import SchoolHelpDeskModal from '../../components/school/SchoolHelpDeskModal.vue';
import SchoolDayBar from '../../components/school/redesign/SchoolDayBar.vue';
import DayPanel from '../../components/school/redesign/DayPanel.vue';
import ClientModal from '../../components/school/redesign/ClientModal.vue';
import SkillsGroupsPanel from '../../components/school/redesign/SkillsGroupsPanel.vue';
import { useSchoolPortalRedesignStore } from '../../store/schoolPortalRedesign';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const store = useSchoolPortalRedesignStore();
const authStore = useAuthStore();

const showHelpDesk = ref(false);
const selectedClient = ref(null);
const viewMode = ref('schedule');

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isProvider = computed(() => roleNorm.value === 'provider');

// Provider privacy: providers should not see other providers’ schedules/caseload or the roster by default.
const showSchedule = computed(() => !isProvider.value && viewMode.value === 'schedule');
const showRoster = computed(() => !isProvider.value && (viewMode.value === 'schedule' || viewMode.value === 'roster'));
const canToggleSkills = computed(() => !isProvider.value);
const canToggleRoster = computed(() => !isProvider.value && viewMode.value !== 'skills');

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

const panelFor = (providerUserId) => {
  const key = `${store.selectedWeekday}:${providerUserId}`;
  return store.providerPanels?.[key] || store.ensurePanel(store.selectedWeekday, providerUserId);
};

const loadForDay = async (weekday) => {
  if (!organizationId.value) return;
  if (!showSchedule.value) return;
  await store.fetchDays();
  await store.fetchEligibleProviders();
  await store.fetchDayProviders(weekday);
  const list = Array.isArray(store.dayProviders) ? store.dayProviders : [];
  await Promise.all(list.map((p) => store.loadProviderPanel(weekday, p.provider_user_id)));
};

const handleAddDay = async () => {
  await store.addDay(store.selectedWeekday);
  await loadForDay(store.selectedWeekday);
};

const handleAddProvider = async ({ providerUserId }) => {
  await store.addProviderToDay(store.selectedWeekday, providerUserId);
  await loadForDay(store.selectedWeekday);
};

const handleSaveSlots = async ({ providerUserId, slots }) => {
  await store.saveSoftSlots(store.selectedWeekday, providerUserId, slots);
};

const handleMoveSlot = async ({ providerUserId, slotId, direction }) => {
  await store.moveSoftSlot(store.selectedWeekday, providerUserId, slotId, direction);
};

const openClient = (client) => {
  selectedClient.value = client;
};

const goToProviderSchoolProfile = (providerUserId) => {
  const slug = organizationSlug.value;
  if (!slug || !providerUserId) return;
  router.push(`/${slug}/providers/${providerUserId}`);
};

onMounted(async () => {
  // Load organization context if not already loaded
  if (organizationSlug.value && !organizationStore.currentOrganization) {
    await organizationStore.fetchBySlug(organizationSlug.value);
  }
  if (organizationId.value) {
    store.reset();
    store.setSchoolId(organizationId.value);
    // Provider default: show skills groups only.
    if (isProvider.value) viewMode.value = 'skills';
    await loadForDay(store.selectedWeekday);
  }
});

watch(organizationId, async (id) => {
  if (!id) return;
  store.reset();
  store.setSchoolId(id);
  if (isProvider.value) viewMode.value = 'skills';
  await loadForDay(store.selectedWeekday);
});

watch(() => store.selectedWeekday, async (weekday) => {
  if (!organizationId.value) return;
  await loadForDay(weekday);
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

.top-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.top-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.muted-small {
  color: var(--text-secondary);
  font-size: 13px;
}

.top-actions {
  display: flex;
  justify-content: flex-end;
}

.roster {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}
.roster-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
