<template>
  <div class="my-schedule-page" data-testid="my-schedule-page">
    <div class="my-schedule-page__inner">
      <div v-if="!authStore.user?.id" class="muted">Sign in to view your schedule.</div>
      <ScheduleHubPanel
        v-else
        :active-view="'self'"
        active-title="My schedule"
        :views="scheduleHubViews"
        :skill-builders-active="false"
        :meta-only-header="true"
        @select-view="onSelectHubView"
      >
        <template #header-actions>
          <router-link
            v-if="canApproveOfficeRequests"
            class="btn btn-secondary btn-sm"
            :to="officeApprovalsTo"
            title="Approve office requests and review reported Therapy Notes coverage conflicts"
            data-testid="my-schedule-header-approve-office-requests"
          >
            Approve office requests
          </router-link>
          <router-link
            v-if="canOpenProviderManagement"
            class="btn btn-secondary btn-sm"
            :to="providerManagementTo"
            title="Provider Management — school slots, office & virtual availability"
          >
            Provider Management
          </router-link>
          <router-link
            class="btn btn-secondary btn-sm"
            :to="staffSchedulesTo"
            title="Compare coworker calendars"
            data-testid="my-schedule-staff-schedules-link"
          >
            Staff schedules
          </router-link>
          <router-link class="btn btn-secondary btn-sm" :to="tasksTo" title="Open Tasks hub">
            Tasks
          </router-link>
          <router-link class="btn btn-secondary btn-sm" :to="dashboardTo" title="Return to your personal dashboard">
            My Dashboard
          </router-link>
        </template>

        <ScheduleAvailabilityGrid
          :user-id="Number(authStore.user.id)"
          :mode="'self'"
          :compact-page-chrome="true"
          :hub-views="scheduleHubViews"
          :active-hub-view="'self'"
          schedule-title="My Schedule"
          :week-start-ymd="weekStartYmd || null"
          :show-skill-builders-programs-button="true"
          :show-company-events-calendar-button="true"
          @update:weekStartYmd="onWeekStartUpdate"
          @select-hub-view="onSelectHubView"
        />
      </ScheduleHubPanel>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import ScheduleAvailabilityGrid from '../components/schedule/ScheduleAvailabilityGrid.vue';
import ScheduleHubPanel from '../components/dashboard/ScheduleHubPanel.vue';
import { SCHEDULE_VIEWS } from '../config/scheduleDisplayViews.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const orgSlug = computed(() => (
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const providerManagementTo = computed(() => ({
  path: orgTo('/admin/provider-availability'),
  query: agencyStore.currentAgency?.id ? { agencyId: String(agencyStore.currentAgency.id) } : {}
}));
const staffSchedulesTo = computed(() => orgTo('/schedule/staff'));
const dashboardTo = computed(() => orgTo('/dashboard'));
const tasksTo = computed(() => orgTo('/tasks'));
const officeApprovalsTo = computed(() => orgTo('/admin/office-approvals'));

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canApproveOfficeRequests = computed(() =>
  ['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'superadmin', 'support', 'staff'].includes(roleNorm.value)
);
const canOpenProviderManagement = computed(() =>
  ['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'superadmin', 'support', 'staff'].includes(roleNorm.value)
);
const canPickEmployeeSchedule = computed(() =>
  ['super_admin', 'superadmin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value)
);
const isSupervisorUser = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  if (u.has_supervisor_privileges === true || u.has_supervisor_privileges === 1) return true;
  return String(u.role || '').toLowerCase() === 'supervisor';
});

const scheduleHubViews = computed(() => {
  const flags = {
    supervisee: isSupervisorUser.value,
    employees: canPickEmployeeSchedule.value,
    skillBuilders: false,
    scheduleList: canPickEmployeeSchedule.value
  };
  return SCHEDULE_VIEWS.filter((view) => {
    if (!view.visibleKey) return true;
    return Boolean(flags[view.visibleKey]);
  });
});

const onSelectHubView = (viewId) => {
  if (!viewId || viewId === 'self' || viewId === 'skill_builders') return;
  router.push({
    path: orgTo('/dashboard'),
    query: { tab: 'my_schedule', scheduleView: String(viewId) }
  }).catch(() => {});
};

const weekStartYmd = ref('');
const onWeekStartUpdate = (ymd) => {
  const next = String(ymd || '').slice(0, 10);
  if (next) weekStartYmd.value = next;
};
</script>

<style scoped>
.my-schedule-page {
  width: 100%;
  min-height: calc(100vh - 72px);
  background: var(--bg, #f6f7f9);
  padding: 12px 0 28px;
  box-sizing: border-box;
}
[data-theme="dark"] .my-schedule-page {
  background: #070b14;
}
.my-schedule-page__inner {
  width: min(1680px, calc(100% - 24px));
  margin: 0 auto;
}
</style>
