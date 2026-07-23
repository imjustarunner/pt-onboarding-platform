<template>
  <div class="container sched-hub">
    <div class="header" data-tour="schedule-hub-header">
      <div>
        <h2 style="margin: 0;" data-tour="schedule-hub-title">Schedule</h2>
        <p class="subtitle" data-tour="schedule-hub-subtitle">Choose what schedule view you want to open.</p>
      </div>
    </div>

    <div v-if="canOpenPrivilegedScheduleTools && pendingTotal > 0" class="pending-summary" role="status">
      <strong>{{ pendingTotal }} availability request{{ pendingTotal === 1 ? '' : 's' }} need review</strong>
      <span>{{ officePending }} office · {{ schoolPending }} school</span>
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
        :to="orgTo('/admin/office-approvals')"
        data-tour="schedule-hub-card-approvals"
      >
        <div class="card-title card-title-row">
          <span>Approve office requests</span>
          <span v-if="officePending > 0" class="count-badge">{{ officePending }}</span>
        </div>
        <div class="card-desc">Dedicated inbox for office requests and reported Therapy Notes coverage conflicts.</div>
        <div class="card-cta">Open</div>
      </router-link>

      <router-link
        v-if="canOpenPrivilegedScheduleTools"
        class="card"
        :to="schoolRequestsTo"
        data-tour="schedule-hub-card-school-requests"
      >
        <div class="card-title card-title-row">
          <span>Approve school requests</span>
          <span v-if="schoolPending > 0" class="count-badge">{{ schoolPending }}</span>
        </div>
        <div class="card-desc">Review pending provider school-day availability requests and approve or deny each request.</div>
        <div class="card-cta">{{ schoolPending > 0 ? `Review ${schoolPending}` : 'Open' }}</div>
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
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import api from '../services/api';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase());
const isProviderBusyOnly = computed(() => actorRole.value === 'provider');
const canOpenPrivilegedScheduleTools = computed(() => !isProviderBusyOnly.value);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const officePending = ref(0);
const schoolPending = ref(0);
const pendingTotal = computed(() => officePending.value + schoolPending.value);
const schoolRequestsTo = computed(() => ({
  path: orgTo('/admin/availability-intake'),
  query: { tab: 'school', ...(agencyId.value ? { agencyId: String(agencyId.value) } : {}) }
}));

const loadPendingCounts = async () => {
  if (!canOpenPrivilegedScheduleTools.value) return;
  try {
    const { data } = await api.get('/availability/admin/pending-counts', {
      params: agencyId.value ? { agencyId: agencyId.value } : undefined,
      skipGlobalLoading: true
    });
    officePending.value = Number(data?.officeRequestsPending || 0);
    schoolPending.value = Number(data?.schoolRequestsPending || 0);
  } catch {
    officePending.value = 0;
    schoolPending.value = 0;
  }
};

watch(agencyId, loadPendingCounts);
onMounted(loadPendingCounts);
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
.pending-summary {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:center;
  margin:0 0 14px;
  padding:11px 14px;
  border:1px solid #dc2626;
  border-radius:12px;
  background:#fef2f2;
  color:#991b1b;
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
.card-title-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.count-badge { min-width:25px; height:25px; padding:0 7px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background:#dc2626; color:#fff; font-size:12px; }
.card-desc { color: var(--text-secondary); font-size: 13px; min-height: 48px; }
.card-cta { margin-top: 12px; font-weight: 800; color: var(--primary, #2563eb); }
@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .pending-summary { align-items:flex-start; flex-direction:column; }
}
</style>
