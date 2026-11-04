<template>
  <section class="account-preview" :aria-label="`Portal preview for ${account.name}`">
    <div class="preview-notice"><strong>Read-only · Viewing as {{ account.name }}</strong><span>{{ account.relationship }} · {{ client.full_name || client.initials }} · Actions that change records are unavailable.</span><button type="button" @click="$emit('close')">Close preview</button></div>
    <FamilyPortalShell brand-name="AuricWell" brand-subtitle="Client & family portal" :logo-url="AURICWELL_MARK_URL" logo-is-symbol :agency-name="agency.name" primary-color="#2467a7" :user-name="account.name" :title="titles[panel]" :subtitle="client.full_name || client.initials" :navigation="navigation" :active="panel" support-key="documents" account-key="documents" @navigate="panel=$event">
      <template v-if="panel==='documents'"><PortalSafetyPlans :client-id="client.id" compact read-only /><GuardianIntakeDocuments :client-id="client.id" /><GuardianSharedFiles :client-id="client.id" /></template>
      <GuardianProgressRecords v-else-if="panel==='evaluations'" :client-id="client.id" :client-name="client.full_name || client.initials" kind="evaluations" />
      <FamilyLedgerPanel v-else-if="panel==='family_billing'" :agency-id="agency.id" :client-id="client.id" read-only />
    </FamilyPortalShell>
  </section>
</template>
<script setup>
import {ref,provide} from 'vue';
import api from '../services/api';
import {portalReadApi} from './portalReadApi';
import {AURICWELL_MARK_URL} from '../constants/auricwellBrand';
import PortalSafetyPlans from '../components/safetyPlans/PortalSafetyPlans.vue';
import FamilyPortalShell from '../components/portal/FamilyPortalShell.vue';
import GuardianIntakeDocuments from '../components/guardian/GuardianIntakeDocuments.vue';
import GuardianSharedFiles from '../components/guardian/GuardianSharedFiles.vue';
import GuardianProgressRecords from '../components/guardian/GuardianProgressRecords.vue';
import FamilyLedgerPanel from '../components/billing/FamilyLedgerPanel.vue';
const props=defineProps({account:Object,client:Object,agency:Object});defineEmits(['close']);
const readApi=portalReadApi(api,{clientId:props.client.id,agencyId:props.agency.id,userId:props.account.id});
provide('portalReadApi',readApi);provide('clinicalFormsHttp',readApi);
const panel=ref('documents');
const titles={documents:'Documents & forms',evaluations:'Assessments & evaluations',family_billing:'Billing & payments'};
const navigation=[{key:'documents',label:titles.documents,icon:'documents'},{key:'evaluations',label:titles.evaluations,icon:'plan'},{key:'family_billing',label:titles.family_billing,icon:'billing'}];
</script>
<style scoped>
.account-preview{border:2px solid #8aaac9;border-radius:14px;overflow:hidden;margin-top:24px}.preview-notice{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff6df;padding:16px;color:#514223}.preview-notice span{flex:1;font-size:13px}.account-preview :deep(.family-portal){min-height:550px}.account-preview :deep(.portal-sidebar){position:static;height:auto}.account-preview :deep(.portal-sticky-header){position:static}.account-preview :deep(.portal-support){display:none}
</style>
