<template>
  <div class="tbs">
    <header class="tbs-head">
      <h2 class="tbs-title">Booking &amp; service types</h2>
      <p class="hint">
        Select the verticals this {{ contextNoun }} sells. That opens matching public finders, packages,
        cancellation policies, and session notifications. Booking itself is always available.
      </p>
      <p v-if="agencyId" class="tbs-org muted">
        Editing <strong>{{ agencyLabel }}</strong>
        · public book URL <code>/{{ orgSlug }}/book-session</code>
      </p>
    </header>

    <div v-if="!agencyId" class="tbs-empty">
      Select a tenant from Tenant home, then open this card again.
    </div>

    <TenantServicesAdmin v-else :agency-id="agencyId" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import TenantServicesAdmin from './TenantServicesAdmin.vue';

const agencyStore = useAgencyStore();

const contextNoun = computed(() => 'organization');

const agencyId = computed(() => {
  const current = agencyStore.currentAgency;
  const id = Number(current?.id || 0);
  return id > 0 ? id : null;
});

const agencyLabel = computed(() => {
  const a = agencyStore.currentAgency;
  return a?.name || a?.agency_name || `Organization #${agencyId.value}`;
});

const orgSlug = computed(() => {
  const a = agencyStore.currentAgency;
  return String(a?.slug || a?.portal_url || a?.portalUrl || 'org-slug').trim() || 'org-slug';
});
</script>

<style scoped>
.tbs {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 960px;
  padding: 4px 0 24px;
}
.tbs-head { margin-bottom: 4px; }
.tbs-title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 700;
}
.hint {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-size: 14px;
  max-width: 52rem;
  line-height: 1.5;
}
.tbs-org { margin: 10px 0 0; font-size: 13px; }
.tbs-org code {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--bg-alt, #f3f4f6);
}
.tbs-empty {
  padding: 14px 16px;
  border-radius: 12px;
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
  font-size: 14px;
}
.muted { color: var(--text-secondary, #64748b); }
</style>
