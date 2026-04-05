<template>
  <div class="container company-events-page">
    <div class="page-head">
      <h1>Club Events</h1>
      <p class="muted">Create RSVPs for virtual or in-person events, run club meetups, and potlucks.</p>
    </div>

    <div v-if="!agencyId" class="error">No club selected. Choose a club first.</div>
    <div v-else-if="sscMemberEventsHint" class="card member-events-hint">
      <h2 style="margin: 0 0 8px;">Club events</h2>
      <p class="muted" style="margin: 0 0 12px;">
        RSVPs and announcements from your club show up in
        <router-link :to="messagesLink">Messages</router-link>
        (including notes to your manager) and on your club dashboard.
      </p>
      <div class="member-events-actions">
        <router-link class="btn btn-primary" :to="messagesLink">Open Messages</router-link>
        <router-link class="btn btn-secondary" :to="myClubDashboardLink">My club dashboard</router-link>
      </div>
    </div>
    <div v-else-if="sscManagerOnlyDenied" class="error">
      Only club managers and assistant managers can manage club events in this tenant.
    </div>
    <CompanyEventsManager v-else :agency-id="agencyId" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import CompanyEventsManager from '../../components/admin/CompanyEventsManager.vue';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const myClubDashboardLink = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/my_club_dashboard` : '/my_club_dashboard';
});

const messagesLink = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/messages` : '/messages';
});

const hasActiveClubAffiliation = computed(() => {
  const list = agencyStore.userAgencies || [];
  return list.some((a) => {
    const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
    if (t !== 'affiliation') return false;
    return a.is_active === undefined || Number(a.is_active) === 1;
  });
});

/** Affiliated members (e.g. provider) on SSC — friendly pointer; full manager UI stays manager-only. */
const sscMemberEventsHint = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (slug !== 'ssc' && slug !== 'sstc') return false;
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  if (!['provider', 'intern', 'staff'].includes(role)) return false;
  return hasActiveClubAffiliation.value;
});

const sscManagerOnlyDenied = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (slug !== 'ssc' && slug !== 'sstc') return false;
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  if (['provider', 'intern', 'staff'].includes(role) && hasActiveClubAffiliation.value) return false;
  return !['admin', 'super_admin', 'provider_plus', 'club_manager'].includes(role);
});
</script>

<style scoped>
.company-events-page {
  display: grid;
  gap: 12px;
}
.member-events-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.page-head h1 {
  margin: 0;
}
</style>

