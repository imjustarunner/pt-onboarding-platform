<template>
  <section class="auricwell-management" aria-labelledby="auricwell-management-title">
    <header>
      <p class="aw-eyebrow">{{ agency?.name || 'Practice management' }}</p>
      <h2 id="auricwell-management-title">AuricWell</h2>
      <p>Manage the move to AuricWell and return to the shared tools for day-to-day practice operations.</p>
    </header>
    <p v-if="!canManage" role="status">Select an organization you administer to open its AuricWell operations.</p>
    <template v-else>
      <p class="aw-readiness">Open EHR Transition to choose a provider, review client imports, attach medical history, and bring over appointments. Each save shows its result; school appointment linking requires the transition setup.</p>
      <div class="aw-operation-grid">
        <a v-for="operation in operations" :key="operation.id" :href="operation.href" class="aw-operation" :data-operation="operation.id">
          <span class="aw-operation-status">{{ operation.status }}</span>
          <h3>{{ operation.label }}</h3>
          <p>{{ operation.description }}</p>
          <span class="aw-open">Open →</span>
        </a>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { auricwellAppBase } from '../../auricwell/paths';
import { buildAuricWellOperations, canManageAuricWell } from '../../navigation/auricwellManagement.js';

const props = defineProps({ scopedAgencyId: { type: [String, Number], default: null } });
const agencyStore = useAgencyStore(), authStore = useAuthStore(), brandingStore = useBrandingStore();
const agency = computed(() => {
  const current = agencyStore.currentAgency;
  return current && (!props.scopedAgencyId || Number(current.id) === Number(props.scopedAgencyId)) ? current : null;
});
const canManage = computed(() => canManageAuricWell(authStore.user, agency.value));
const operations = computed(() => buildAuricWellOperations({ user: authStore.user, agency: agency.value, platformBranding: brandingStore.platformBranding, appBase: auricwellAppBase() }));
</script>

<style scoped>
.auricwell-management{max-width:1120px;color:var(--text-primary,#183b34)}header>p{max-width:760px;line-height:1.6}.aw-eyebrow{font-size:.85rem;font-weight:700;color:var(--text-secondary,#52665e)}h2{margin:6px 0;font-size:1.8rem}.aw-readiness{padding:14px 18px;background:var(--bg-secondary,#f0f5f2);border-left:3px solid #698b76;line-height:1.5}.aw-operation-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:22px}.aw-operation{display:flex;flex-direction:column;padding:20px;border:1px solid var(--border-color,#d2dfd7);border-radius:12px;color:inherit;text-decoration:none;background:var(--bg-primary,#fff)}.aw-operation:hover{border-color:#698b76}.aw-operation:focus-visible{outline:3px solid #698b76;outline-offset:3px}.aw-operation h3{margin:10px 0;font-size:1.05rem}.aw-operation p{line-height:1.55;margin:0 0 16px;color:var(--text-secondary,#52665e)}.aw-operation-status{font-size:.78rem;color:var(--text-secondary,#52665e)}.aw-open{margin-top:auto;font-weight:600;font-size:.9rem}
</style>
