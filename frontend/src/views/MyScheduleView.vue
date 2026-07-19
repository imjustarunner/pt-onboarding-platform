<template>
  <div class="my-schedule-page" data-tour="my-schedule-page">
    <div class="my-schedule-page__inner">
      <header class="my-schedule-page__header">
        <div>
          <h1 class="my-schedule-page__title">My Schedule</h1>
          <p class="my-schedule-page__subtitle">
            Your calendar — peers overlay, staff compare, and office bookings (All / one building / Off).
          </p>
          <WorkHoursEditor
            v-if="authStore.user?.id"
            class="my-schedule-page__work-hours"
            :user-id="Number(authStore.user.id)"
          />
        </div>
        <div class="my-schedule-page__actions">
          <router-link
            class="btn btn-secondary btn-sm"
            :to="scheduleHubTo"
            title="Schedule hub — pick My Schedule, staff compare, buildings, or approvals"
          >
            Schedule hub
          </router-link>
          <router-link
            class="btn btn-primary btn-sm"
            :to="staffSchedulesTo"
            title="Compare coworker calendars (busy blocks for providers; full detail for admins)"
            data-tour="my-schedule-staff-schedules-link"
          >
            Staff schedules
          </router-link>
          <router-link class="btn btn-secondary btn-sm" :to="dashboardTo" title="Return to your personal dashboard">
            My Dashboard
          </router-link>
        </div>
      </header>

      <div v-if="!authStore.user?.id" class="muted">Sign in to view your schedule.</div>
      <ScheduleAvailabilityGrid
        v-else
        :user-id="Number(authStore.user.id)"
        :mode="'self'"
        :compact-page-chrome="true"
        :week-start-ymd="weekStartYmd || null"
        :show-skill-builders-programs-button="true"
        :show-company-events-calendar-button="true"
        @update:weekStartYmd="onWeekStartUpdate"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import ScheduleAvailabilityGrid from '../components/schedule/ScheduleAvailabilityGrid.vue';
import WorkHoursEditor from '../components/schedule/WorkHoursEditor.vue';

const route = useRoute();
const authStore = useAuthStore();

const orgSlug = computed(() => (
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const scheduleHubTo = computed(() => orgTo('/schedule'));
const staffSchedulesTo = computed(() => orgTo('/schedule/staff'));
const dashboardTo = computed(() => orgTo('/dashboard'));

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
}
[data-theme="dark"] .my-schedule-page {
  background: #070b14;
}
[data-theme="dark"] .my-schedule-page__title {
  color: #f8fafc;
}
[data-theme="dark"] .my-schedule-page__subtitle {
  color: #cbd5e1;
}
.my-schedule-page__inner {
  width: min(1680px, calc(100% - 24px));
  margin: 0 auto;
  padding: 16px 0 28px;
}
.my-schedule-page__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.my-schedule-page__title {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text, #1a1d23);
}
.my-schedule-page__subtitle {
  margin: 4px 0 0;
  color: var(--text-secondary, #5c6570);
  font-size: 0.92rem;
  max-width: 52rem;
}
.my-schedule-page__work-hours {
  margin-top: 6px;
}
.my-schedule-page__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
