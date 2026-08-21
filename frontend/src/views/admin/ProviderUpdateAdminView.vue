<template>
  <div class="pu-admin-page">
    <header class="pu-admin-page__head">
      <router-link class="muted back" :to="hubTo">← School Portals</router-link>
      <div class="tenant-swap glass">
        <label>
          <span>Tenant / agency</span>
          <select :value="agencyId || ''" class="input" @change="onTenantChange">
            <option disabled value="">Select agency…</option>
            <option v-for="a in agencyOptions" :key="a.id" :value="a.id">
              {{ a.name }}{{ a.slug ? ` (${a.slug})` : '' }}
            </option>
          </select>
        </label>
        <p class="hint">Swap tenants to compose/test Provider Updates for Demo, Hogwarts, ITSCO, etc.</p>
      </div>
    </header>
    <p v-if="!ready" class="muted">Loading agency context…</p>
    <ProviderUpdateAdminPanel
      v-else-if="agencyId"
      :key="agencyId"
      :agency-id="agencyId"
      :organization-slug="organizationSlug"
      :agency-name="agencyName"
    />
    <p v-else class="muted">Select an agency context to manage Provider Update.</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import ProviderUpdateAdminPanel from '../../components/admin/ProviderUpdateAdminPanel.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const ready = ref(false);

const organizationSlug = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug || '';
});

const agencyOptions = computed(() => {
  const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
  return (list || [])
    .filter((a) => a?.id)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
});

const agencyId = computed(() => {
  const fromQuery = Number(route.query.agencyId || 0);
  if (fromQuery > 0) return fromQuery;
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const fromCurrent = Number(current?.id || agencyStore.currentAgencyId || 0);
  if (fromCurrent > 0) return fromCurrent;
  const first = agencyOptions.value[0];
  return first?.id ? Number(first.id) : null;
});

const agencyName = computed(() => {
  const hit = agencyOptions.value.find((a) => Number(a.id) === Number(agencyId.value));
  return hit?.name || 'Agency';
});

function onTenantChange(e) {
  const id = Number(e.target.value || 0);
  if (!id) return;
  const hit = agencyOptions.value.find((a) => Number(a.id) === id);
  if (hit && agencyStore.setCurrentAgency) agencyStore.setCurrentAgency(hit);
  router.replace({ query: { ...route.query, agencyId: String(id) } });
}

onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies?.();
  } catch {
    /* keep going */
  } finally {
    ready.value = true;
  }
});

const hubTo = computed(() => {
  const slug = organizationSlug.value;
  return slug ? `/${slug}/admin/school-portals-hub` : '/admin/school-portals-hub';
});
</script>

<style scoped>
.pu-admin-page {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0.5rem clamp(12px, 1.5vw, 28px) 2.5rem;
  box-sizing: border-box;
}
.pu-admin-page__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}
.tenant-swap {
  min-width: min(420px, 100%);
  padding: 0.75rem 0.9rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(10px);
}
.tenant-swap label { display: grid; gap: 0.3rem; font-size: 0.85rem; font-weight: 600; }
.input {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font: inherit;
  background: rgba(255, 255, 255, 0.92);
}
.hint { margin: 0.35rem 0 0; color: #64748b; font-size: 0.8rem; font-weight: 400; }
.back { text-decoration: none; font-size: 0.9rem; }
.muted { color: #64748b; }
</style>
