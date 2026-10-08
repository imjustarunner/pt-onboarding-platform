<template>
  <section class="clinical-workspace" :class="{ 'auricwell-surface': clinical, 'clinical-workspace--compact': compact }" :data-workspace="enabled ? (clinical ? 'auricwell' : 'tenant') : undefined">
    <header v-if="enabled && !nested" class="clinical-workspace__header">
      <div class="clinical-workspace__identity">
        <img v-if="logo && !tenantLogoFailed" :src="logo" :alt="`${tenantLabel} logo`" class="clinical-workspace__tenant-logo" @error="tenantLogoFailed = true" />
        <div><strong class="clinical-workspace__tenant">{{ tenantLabel }}</strong><span class="clinical-workspace__context">{{ contextLabel }}</span></div>
      </div>
      <div v-if="clinical" class="clinical-workspace__product">
        <img v-if="!productLogoFailed" :src="AURICWELL_MARK_URL" alt="" @error="productLogoFailed = true" />
        <div><strong>AuricWell</strong><span>Clinical workspace</span></div>
      </div>
      <nav class="clinical-workspace__actions" aria-label="Workspace view">
        <div v-if="switchable" class="clinical-workspace__switch" role="group" aria-label="Client workspace view">
          <button type="button" :aria-pressed="!clinical" @click="$emit('update:mode','overview')">{{ overviewLabel }}</button>
          <button type="button" :aria-pressed="clinical" @click="$emit('update:mode','clinical')">{{ clinicalLabel }}</button>
        </div>
        <button v-if="showBack" type="button" class="clinical-workspace__back" :disabled="backDisabled" :title="backDisabled ? backDisabledReason : undefined" @click="goBack">← {{ returnLabel || `Back to ${tenantLabel}` }}</button>
      </nav>
    </header>
    <slot />
  </section>
</template>
<script setup>
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand';
import { computed, getCurrentInstance, inject, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { clinicalWorkspaceContext, registerClinicalWorkspace } from '../../composables/useClinicalWorkspace';
import { clinicalReturnPath } from '../../utils/clinicalWorkspace';
import '../../styles/clinicalWorkspace.css';
const props = defineProps({
  enabled: { type: Boolean, default: true }, mode: { type: String, default: 'clinical' },
  switchable: Boolean, immersive: Boolean, compact: Boolean,
  overviewLabel: { type: String, default: 'Tenant view' }, clinicalLabel: { type: String, default: 'AuricWell EHR' },
  tenantId: { type: [Number, String], default: null }, tenantName: { type: String, default: '' }, tenantLogo: { type: String, default: '' },
  contextLabel: { type: String, default: 'Client record' }, returnLabel: { type: String, default: '' },
  showBack: { type: Boolean, default: true }, backDisabled: Boolean,
  backDisabledReason: { type: String, default: 'Use the session’s End or Leave button before returning.' }
});
const emit = defineEmits(['back', 'update:mode']);
const instance = getCurrentInstance(), route = useRoute(), router = useRouter(), agencyStore = useAgencyStore();
const parent = inject(clinicalWorkspaceContext, null);
const nested = computed(() => parent !== null);
const clinical = computed(() => props.enabled && props.mode === 'clinical' && (!nested.value || parent.value));
provide(clinicalWorkspaceContext, clinical);
registerClinicalWorkspace(computed(() => props.immersive && clinical.value));
const tenant = computed(() => {
  const choices = [agencyStore.currentAgency, ...(agencyStore.agencies || []), ...(agencyStore.userAgencies || [])].filter(Boolean);
  return props.tenantId ? choices.find(a => Number(a.id) === Number(props.tenantId)) : agencyStore.currentAgency;
});
const tenantLabel = computed(() => props.tenantName || tenant.value?.name || 'your workspace');
const logo = computed(() => props.tenantLogo || tenant.value?.logo_url || tenant.value?.logoUrl || '');
const tenantLogoFailed = ref(false), productLogoFailed = ref(false);
watch(logo, () => { tenantLogoFailed.value = false; });
// Capture origin before query updates, tab changes, and draft URL replacement.
const origin = typeof window !== 'undefined' ? window.history.state?.back : null;
function goBack() {
  if (props.backDisabled) return;
  if (instance.vnode.props?.onBack) { emit('back'); return; }
  router.push(clinicalReturnPath({previous:origin,current:route.fullPath,slug:route.params.organizationSlug}));
}
</script>
