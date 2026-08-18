<template>
  <div class="mop-page">
    <header class="mop-header">
      <div>
        <h1>Master Counseling Paper</h1>
        <p class="muted mop-sub">
          Two independent printable counseling packets. Edits to the adult client packet stay there;
          edits to the parent/guardian packet stay there. School packets are unchanged.
        </p>
      </div>
      <div class="mop-actions">
        <router-link class="btn btn-secondary btn-sm" :to="digitalTo">Master Counseling Digital</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to Clients &amp; Guardians</router-link>
      </div>
    </header>

    <div v-if="!agencyId" class="error">No agency context. Open Workforce Ops from an agency portal.</div>
    <template v-else>
      <div class="mop-tabs" role="tablist" aria-label="Office packet type">
        <button
          type="button"
          role="tab"
          class="mop-tab"
          :class="{ active: variant === 'self' }"
          :aria-selected="variant === 'self'"
          @click="variant = 'self'"
        >
          Client Intake Packet
        </button>
        <button
          type="button"
          role="tab"
          class="mop-tab"
          :class="{ active: variant === 'parent' }"
          :aria-selected="variant === 'parent'"
          @click="variant = 'parent'"
        >
          Parent/Guardian Intake Packet
        </button>
      </div>
      <OfficePacketTemplateEditor
        :key="variant"
        :agency-id="agencyId"
        :variant="variant"
        :title="variant === 'parent' ? 'Parent/Guardian Intake Packet' : 'Client Intake Packet'"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import OfficePacketTemplateEditor from '../../components/office/OfficePacketTemplateEditor.vue';

const route = useRoute();
const agencyStore = useAgencyStore();
const orgSlug = computed(() =>
  typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''
);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const variant = ref('self');
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/schedule` : '/schedule'));
const digitalTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/master-office-form` : '/admin/master-office-form'
);
</script>

<style scoped>
.mop-page { padding: 24px 40px 48px; max-width: 1600px; margin: 0 auto; }
.mop-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.mop-header h1 { margin: 0; }
.mop-sub { max-width: 48rem; margin: 6px 0 0; line-height: 1.45; }
.mop-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mop-tabs { display: inline-flex; gap: 4px; margin: 0 0 14px; padding: 4px; border-radius: 999px; background: #f3f4f6; }
.mop-tab { border: 0; background: transparent; padding: 8px 16px; border-radius: 999px; font-size: 14px; font-weight: 700; color: #4b5563; cursor: pointer; }
.mop-tab.active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.muted { color: #6b7280; }
.error { color: #b91c1c; }
</style>
