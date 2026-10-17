<template>
  <div class="enrollment-brand" translate="no">
    <div class="enrollment-brand-agency">
      <img v-if="logoUrl" :src="logoUrl" :alt="agencyName" />
      <strong>{{ agencyName }}</strong>
    </div>
    <span class="enrollment-brand-platform"><small>{{ language === 'es' ? 'Inscripción con' : 'Enrollment with' }}</small><span><img src="/auricwell/mark.svg" alt="" />AuricWell</span></span>
  </div>
</template>
<script setup>
defineProps({ agencyName: { type: String, default: '' }, logoUrl: { type: String, default: '' }, language: { type: String, default: 'en' } });
</script>
<style scoped>
.enrollment-brand{display:flex;align-items:center;justify-content:space-between;gap:20px;width:100%;color:var(--df-text,#203e34);text-align:left}
.enrollment-brand-agency{display:flex;align-items:center;gap:12px;min-width:0;flex-wrap:wrap;font-size:18px}
.enrollment-brand-agency img{max-width:210px;max-height:48px;object-fit:contain}
.enrollment-brand-platform{display:grid;gap:3px;flex-shrink:0;border-left:1px solid #d7e1dc;padding-left:18px}
.enrollment-brand-platform small{font-size:11px;color:#5f726b}
.enrollment-brand-platform>span{display:flex;align-items:center;gap:6px;font-size:17px;font-weight:650;color:#21496c}
.enrollment-brand-platform img{width:24px;height:24px}
@media(max-width:550px){.enrollment-brand{gap:12px}.enrollment-brand-agency{font-size:15px;gap:6px}.enrollment-brand-agency img{max-width:145px;max-height:36px}.enrollment-brand-platform{padding-left:12px}}
</style>
