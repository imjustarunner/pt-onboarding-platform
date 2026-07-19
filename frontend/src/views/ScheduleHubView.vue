<template>
  <div class="container sched-hub">
    <div class="header" data-tour="schedule-hub-header">
      <div>
        <h2 style="margin: 0;" data-tour="schedule-hub-title">Schedule</h2>
        <p class="subtitle" data-tour="schedule-hub-subtitle">Choose what schedule view you want to open.</p>
      </div>
    </div>

    <div class="grid" data-tour="schedule-hub-grid">
      <router-link class="card" :to="orgTo('/my-schedule')" data-tour="schedule-hub-card-full">
        <div class="card-title">My Schedule</div>
        <div class="card-desc">Your personal week grid — book sessions, request rooms, and overlay coworker busy times.</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link
        v-if="canOpenPrivilegedScheduleTools"
        class="card"
        :to="orgTo('/schedule/event-staffing')"
      >
        <div class="card-title">Event shift requests</div>
        <div class="card-desc">Request to work upcoming program-event sessions (regular, waitlist, or on-call).</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link class="card" :to="orgTo('/schedule/staff')" data-tour="schedule-hub-card-staff">
        <div class="card-title">Staff schedules (compare)</div>
        <div class="card-desc">
          {{ isProviderBusyOnly
            ? 'See coworker busy blocks across your agencies (details hidden).'
            : 'Select multiple providers and compare schedules; reorder and view two+ at once.' }}
        </div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link
        v-if="canOpenPrivilegedScheduleTools"
        class="card"
        :to="orgTo('/buildings/schedule')"
        data-tour="schedule-hub-card-buildings-schedule"
      >
        <div class="card-title">Buildings master grid</div>
        <div class="card-desc">All rooms in a building — same data as My Schedule, building-centric view (find availability, company holds).</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link
        v-if="canOpenPrivilegedScheduleTools"
        class="card"
        :to="orgTo('/admin/availability-intake?tab=office')"
        data-tour="schedule-hub-card-approvals"
      >
        <div class="card-title">Approve office requests</div>
        <div class="card-desc">One inbox for CPA, Provider Plus, admin, and staff — office, booking, and school queues.</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link
        v-if="canOpenPrivilegedScheduleTools"
        class="card"
        :to="orgTo('/buildings')"
        data-tour="schedule-hub-card-buildings-admin"
      >
        <div class="card-title">Buildings settings</div>
        <div class="card-desc">Building selection, review workflows, and building settings.</div>
        <div class="card-cta">Open</div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';

const route = useRoute();
const authStore = useAuthStore();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase());
const isProviderBusyOnly = computed(() => actorRole.value === 'provider');
const canOpenPrivilegedScheduleTools = computed(() => !isProviderBusyOnly.value);
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.subtitle {
  color: var(--text-secondary);
  margin: 6px 0 0 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.card {
  display: block;
  text-decoration: none;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 14px;
  padding: 16px;
  color: inherit;
}
.card-title { font-weight: 900; margin-bottom: 6px; }
.card-desc { color: var(--text-secondary); font-size: 13px; min-height: 48px; }
.card-cta { margin-top: 12px; font-weight: 800; color: var(--primary, #2563eb); }
@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
