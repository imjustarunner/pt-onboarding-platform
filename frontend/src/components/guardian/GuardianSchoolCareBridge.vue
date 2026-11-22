<template>
  <section class="school-bridge" aria-label="SchoolCareBridge school connection">
    <header>
      <img src="/assets/schoolcarebridge/wordmark.svg" alt="SchoolCareBridge" />
      <div><p class="eyebrow">{{ ft("Your school connection") }}</p><h2>{{ ft(school?.name || 'SchoolCareBridge') }}</h2>
        <span v-if="school" class="school-status" :class="{ former: school.status === 'former' }">{{ ft(school.status === 'former' ? 'Former school' : 'Current school') }}</span>
      </div>
    </header>
    <label v-if="schools.length > 1" class="school-picker">{{ ft("School history") }}
      <select :value="school?.organization_id" @change="$emit('update:schoolId', Number($event.target.value))">
        <option v-for="item in schools" :key="item.organization_id" :value="item.organization_id">{{ item.name }} — {{ ft(item.status === 'former' ? 'Former school' : 'Current school') }}</option>
      </select>
    </label>
    <p v-if="school?.status === 'former'">{{ ft("This school is part of") }} {{ ft(clientName || 'your client') }}{{ ft("’s history. Moving on from a school does not close your family’s AuricWell account.") }}</p>
    <p v-else>{{ ft("SchoolCareBridge connects") }} {{ ft(clientName || 'your client') }}{{ ft("’s school program with their care in AuricWell.") }}</p>
    <div class="school-details">
      <section aria-label="School service day and provider">
        <h3>{{ ft("Service day & provider") }}</h3>
        <ul v-if="school?.providers?.length">
          <li v-for="(provider, index) in school.providers" :key="index">
            <strong>{{ provider.name }}</strong>
            <span>{{ ft(provider.service_day || 'Day not yet assigned') }}<template v-if="provider.soft_time"> · {{ provider.soft_time }}</template> · {{ ft(provider.status === 'former' ? 'Previous assignment' : 'Current assignment') }}</span>
            <a v-if="provider.profile_url" :href="provider.profile_url" target="_blank" rel="noopener noreferrer">{{ ft("Public profile") }}</a>
          </li>
        </ul>
        <p v-else>{{ ft("No provider assignment is shared here yet.") }}</p>
      </section>
      <section v-if="school?.roi" aria-label="School release of information">
        <h3>{{ ft("School information release") }}</h3><strong>{{ ft(roiLabel) }}</strong>
        <p v-if="school?.roi?.signed_at">{{ ft("Signed") }} {{ formatSignedAt(school.roi.signed_at) }}</p>
        <p v-if="school?.roi?.expires_at">{{ ft("Expires") }} {{ formatDate(school.roi.expires_at) }}</p>
        <button v-if="school?.roi?.document_id" :disabled="downloading" @click="openRoi">{{ ft(downloading ? 'Opening…' : 'Open my signed release') }}</button>
        <p v-else-if="school?.roi?.status === 'completed'">{{ ft("Your available signed copies are in Tasks & documents.") }}</p>
        <p v-else-if="['issued','in_progress'].includes(school?.roi?.status)">{{ ft("This release is assigned in Tasks & documents.") }}</p>
        <button v-if="school?.status !== 'former' && ['issued','in_progress'].includes(school?.roi?.status)" type="button" @click="$emit('navigate', 'documents')">{{ ft("Open the assigned release") }}</button>
        <p v-if="downloadError" role="alert">{{ downloadError }}</p>
      </section>
      <section v-if="school?.staff_visible !== false" aria-label="School staff and sharing permissions">
        <h3>{{ ft("School staff and sharing permissions") }}</h3>
        <ul v-if="school?.staff?.length"><li v-for="(staff,index) in school.staff" :key="index"><strong>{{ staff.name }}</strong><span v-if="staff.role_title">{{ staff.role_title }}</span><span>{{ ft(staffLabel(staff)) }}</span></li></ul>
        <p v-else>{{ ft("No school staff are listed for this school.") }}</p>
      </section>
    </div>
    <p>{{ ft("Other signed documents and waivers stay in their own sections in AuricWell. Your family’s records and care-team conversations remain available according to your sharing permissions after a school change.") }}</p>
    <button class="return-care" @click="$emit('navigate', 'overview')">{{ ft("Open AuricWell care dashboard →") }}</button>
  </section>
</template>
<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const {ft,locale:familyLocale}=useFamilyLocale();
import { computed, ref, watch, onUnmounted } from 'vue';
import api from '../../services/api';
const props = defineProps({schools:{type:Array,default:()=>[]},schoolId:[Number,String],clientId:[Number,String],clientName:{type:String,default:''},timeZone:{type:String,default:'America/Denver'}});
defineEmits(['navigate','update:schoolId']);
const school = computed(() => props.schools.find(s => Number(s.organization_id) === Number(props.schoolId)) || props.schools[0] || null);
const downloading = ref(false), downloadError = ref('');
let request = 0;
onUnmounted(() => { request++; });
watch(() => [props.clientId, props.schoolId], () => { request++; downloading.value = false; downloadError.value = ''; });
const roiLabel = computed(() => {
  const roi = school.value?.roi;
  if (roi?.expires_at && String(roi.expires_at).slice(0,10) < new Date().toISOString().slice(0,10)) return 'School release expired';
  return ({completed:'Signed school release on file',issued:'Awaiting signature',in_progress:'Signing in progress',revoked:'School release revoked',expired:'School release expired'})[roi?.status] || 'No signed school release is available here yet';
});
function formatSignedAt(value) {
  const raw=String(value||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return formatDate(raw);
  const date=new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)?raw:raw.replace(' ','T')+'Z');
  if(Number.isNaN(date.getTime()))return ft('Date unavailable');
  return new Intl.DateTimeFormat(familyLocale.value,{timeZone:props.timeZone||'America/Denver',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
}
function formatDate(value) { const date = new Date(String(value).slice(0,10) + 'T12:00:00'); return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(); }
function staffLabel(staff) {
  if (staff.status === 'former') return 'Historical school entry';
  return ({
    roi_docs:'Selected goals and objectives may be shared',
    roi:'Provider communication is allowed',
    limited:'School coordination only',
    expired:'School release expired',
    denied:'Permission to share was denied',
    none:'No current sharing permission',
    packet:'No current sharing permission'
  })[staff.access_state] || 'Sharing status unavailable';
}
async function openRoi() {
  const current = ++request; downloading.value = true; downloadError.value = '';
  try {
    const {data} = await api.get(`/guardian-portal/clients/${props.clientId}/intake-documents/${school.value.roi.document_id}/download-url`);
    if (current !== request) return;
    const url = new URL(data.url, window.location.origin);
    if (url.protocol !== 'https:') throw new Error('Invalid document URL');
    const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
  } catch { if (current === request) downloadError.value = 'This school release could not be opened. Please try again or contact your care team.'; }
  finally { if (current === request) downloading.value = false; }
}
</script>
<style scoped>
.school-bridge{background:#f4faf7;border:1px solid #cfe7db;border-radius:16px;padding:24px;color:#183d35}.school-bridge header{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.school-bridge header img{width:140px;max-width:100%;height:auto}.school-bridge h2{margin:4px 0 12px;overflow-wrap:anywhere}.eyebrow{font-size:13px;font-weight:600;margin:0}.school-status{display:inline-block;background:#d8eee3;padding:5px 10px;border-radius:20px;font-size:13px}.school-status.former{background:#e8edf3;color:#40556c}.school-picker{display:grid;gap:8px;margin:24px 0;font-weight:600}.school-picker select{max-width:100%;min-width:0;padding:10px;border:1px solid #bad2c9;border-radius:8px;background:white;color:inherit}.school-bridge p{line-height:1.6}.school-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px;margin:22px 0}.school-details section{text-align:left;background:#fff;border:1px solid #cfe0d9;border-radius:10px;padding:16px;color:inherit;}.school-details strong,.school-details span,.school-details a{display:block}.school-details span,.school-details a{margin-top:8px;line-height:1.5;font-size:14px}.school-details a{color:#176b50}.return-care{border:0;background:#176b50;color:#fff;padding:12px 16px;border-radius:8px;cursor:pointer}
.school-details h3{margin-top:0}.school-details ul{list-style:none;padding:0}.school-details li{margin:12px 0}.school-details button{padding:10px;background:white;border:1px solid #a5c5b8;border-radius:8px;color:inherit;cursor:pointer}
</style>
