<template>
  <div class="prb">
    <div v-if="school?.logoUrl || school?.name" class="prb-dual">
      <div class="prb-col">
        <span class="prb-label">{{ tenantLabel }}</span>
        <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="prb-logo" @error="onTenantError" />
        <div v-else class="prb-fallback">{{ tenantInitials }}</div>
        <div class="prb-name">{{ tenantName }}</div>
      </div>
      <div class="prb-divider" aria-hidden="true" />
      <div class="prb-col">
        <span class="prb-label">School</span>
        <img v-if="schoolLogo" :src="schoolLogo" :alt="schoolName" class="prb-logo" @error="onSchoolError" />
        <div v-else class="prb-fallback">{{ schoolInitials }}</div>
        <div class="prb-name">{{ schoolName }}</div>
      </div>
    </div>
    <div v-else class="prb-single">
      <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="prb-logo prb-logo--lg" @error="onTenantError" />
      <div v-else-if="tenantName" class="prb-fallback prb-fallback--lg">{{ tenantInitials }}</div>
      <div v-if="tenantName" class="prb-name">{{ tenantName }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  tenant: { type: Object, default: null },
  school: { type: Object, default: null },
  fallbackLogoUrl: { type: String, default: '' },
  tenantLabel: { type: String, default: 'Service partner' }
});

const hideTenantLogo = ref(false);
const hideSchoolLogo = ref(false);

watch(() => [props.tenant?.logoUrl, props.fallbackLogoUrl, props.school?.logoUrl], () => {
  hideTenantLogo.value = false;
  hideSchoolLogo.value = false;
});

const tenantName = computed(() => String(props.tenant?.name || '').trim() || 'Portal');
const schoolName = computed(() => String(props.school?.name || '').trim() || 'School');
const tenantLogo = computed(() => {
  if (hideTenantLogo.value) return '';
  return String(props.tenant?.logoUrl || props.fallbackLogoUrl || '').trim();
});
const schoolLogo = computed(() => {
  if (hideSchoolLogo.value) return '';
  return String(props.school?.logoUrl || '').trim();
});

const initials = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((w) => w[0])
  .join('')
  .toUpperCase() || 'PT';

const tenantInitials = computed(() => initials(tenantName.value));
const schoolInitials = computed(() => initials(schoolName.value));

const onTenantError = () => { hideTenantLogo.value = true; };
const onSchoolError = () => { hideSchoolLogo.value = true; };
</script>

<style scoped>
.prb { margin-bottom: 18px; }
.prb-dual {
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}
.prb-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 8px;
}
.prb-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.prb-logo {
  max-height: 56px;
  max-width: 140px;
  width: auto;
  object-fit: contain;
}
.prb-logo--lg {
  max-height: 72px;
  max-width: 220px;
}
.prb-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 700;
}
.prb-fallback--lg { width: 72px; height: 72px; font-size: 1.2rem; }
.prb-name {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  color: #0f172a;
}
.prb-divider {
  width: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}
.prb-single {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
