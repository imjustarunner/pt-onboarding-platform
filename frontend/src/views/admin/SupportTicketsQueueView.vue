<template>
  <div v-if="usePlatformShell" class="pthq-tickets">
    <header class="pthq-tickets-top">
      <div class="pthq-tickets-brand">
        <div class="pthq-tickets-mark" aria-hidden="true">PT</div>
        <div>
          <div class="pthq-tickets-brand-name">Plot Twist HQ</div>
          <div class="pthq-tickets-brand-sub">Support tickets</div>
        </div>
      </div>
      <div class="pthq-tickets-actions">
        <router-link to="/admin" class="pthq-tickets-link">← Command center</router-link>
        <router-link to="/admin?panel=messages" class="pthq-tickets-link">Messages</router-link>
      </div>
    </header>
    <div class="pthq-tickets-body">
      <TicketDeskView theme="platform" />
    </div>
  </div>
  <div v-else class="container tickets-page" data-tour="tickets-page">
    <TicketDeskView />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import TicketDeskView from '../../components/tickets/TicketDeskView.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const usePlatformShell = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role !== 'super_admin') return false;
  if (String(route.query?.classic || '') === '1') return false;
  // Org-scoped tickets, or a tenant selected in the brand switcher → tenant chrome.
  if (String(route.params?.organizationSlug || '').trim()) return false;
  if (agencyStore.currentAgency?.id) return false;
  // Unscoped /tickets with no tenant = Plot Twist HQ.
  return true;
});
</script>

<style scoped>
.tickets-page {
  padding-bottom: 24px;
}

.pthq-tickets {
  --bg: #070b14;
  --panel: #0f172a;
  --line: rgba(148, 163, 184, 0.18);
  --text: #e5e7eb;
  --muted: #94a3b8;
  min-height: 100vh;
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(139, 92, 246, 0.22), transparent 55%),
    radial-gradient(900px 400px at 90% 0%, rgba(56, 189, 248, 0.12), transparent 50%),
    var(--bg);
  color: var(--text);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  padding: 1rem 1.25rem 2rem;
}

.pthq-tickets-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--line);
}

.pthq-tickets-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.pthq-tickets-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.78rem;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  color: #fff;
}

.pthq-tickets-brand-name {
  font-weight: 700;
  font-size: 1rem;
}

.pthq-tickets-brand-sub {
  font-size: 0.8rem;
  color: var(--muted);
}

.pthq-tickets-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.pthq-tickets-link {
  color: #c4b5fd;
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.4rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(139, 92, 246, 0.35);
  background: rgba(139, 92, 246, 0.1);
}

.pthq-tickets-link:hover {
  background: rgba(139, 92, 246, 0.2);
  color: #ede9fe;
}

.pthq-tickets-body {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1rem 1.1rem 1.25rem;
}
</style>
