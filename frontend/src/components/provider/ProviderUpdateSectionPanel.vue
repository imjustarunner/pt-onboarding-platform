<template>
  <section class="pu-section">
    <header class="pu-section-head">
      <h1>{{ section.meta?.title || section.key }}</h1>
      <p>{{ section.meta?.description }}</p>
    </header>
    <p v-if="localError" class="err" role="alert">{{localError}}</p>
    <fieldset class="preview-fields" :disabled="recipient?.previewOnly">

    <!-- Handbook -->
    <WorkplaceHandbookReader
      v-if="section.key === 'handbook'"
      :access-mode="mode"
      :token="token"
      :agency-id="agencyId"
      :recipient-id="recipient?.id"
      :preview-mode="!!recipient?.previewOnly"
      @acknowledged="markComplete({ handbookAcknowledged: true })"
    />

    <!-- Admin Update — same in-app published page as /admin-update/:token -->
    <ProviderUpdateAdminUpdateEmbed
      v-else-if="section.key === 'admin_update'"
      :mode="mode"
      :token="token"
      :agency-id="agencyId"
      :update-id="recipient?.attachedAdminUpdateId"
      :busy="saving"
      :preview-mode="!!recipient?.previewOnly"
      @complete="markComplete"
    />

    <!-- Quick View passcode: uses the existing authenticated setup. -->
    <div v-else-if="section.key === 'pin'" class="pu-panel">
      <p>The emailed update link opens this updater. Your six-digit Quick View passcode is separate and unlocks Quick View.</p>
      <p v-if="section.data?.quickView?.isLocked">Quick View is locked. Reset your six-digit passcode in your account before confirming this step.</p>
      <p v-else-if="section.data?.quickView?.hasPasscode">Your six-digit Quick View passcode is already set. Keep it if you can use it; you do not need a new code for this update.</p>
      <p v-else>Create your six-digit Quick View code below, or use My Preferences → Privacy &amp; Quick View.</p>
      <a v-if="!recipient?.previewOnly" :href="orgPath('/dashboard?tab=my&my=preferences#prefs-privacy')" target="_blank" rel="noopener" class="pu-btn">Open secure Quick View setup →</a>
      <p>Setup verifies your identity. Reset uses your signed-in account. Your existing passcode is never shown here or saved in the update answers.</p>
      <div v-if="!section.data?.quickView?.hasPasscode && !newPasscode" class="pu-panel">
        <label class="field">Your account password<input v-model="setupPassword" type="password" autocomplete="current-password" class="input" /></label>
        <button type="button" class="pu-btn" :disabled="saving || !setupPassword || recipient?.previewOnly" @click="setupQuickView">Create my six-digit Quick View code here</button>
        <p>SSO-only accounts use the secure account setup link. Existing codes are never displayed or overwritten here.</p>
      </div>
      <p v-if="newPasscode" role="status">Your new code: <strong>{{newPasscode}}</strong>. Store it safely; it is shown only now. Refresh status below to continue.</p>
      <button v-if="!recipient?.previewOnly" type="button" class="pu-btn" @click="$emit('saved')">Refresh Quick View status after setup</button>
      <button type="button" class="pu-btn primary" :disabled="saving || !section.data?.quickView?.hasPasscode || section.data?.quickView?.isLocked" @click="markComplete({quickViewConfirmed:true})">I can access Quick View with my six-digit passcode</button>
      <p v-if="localError" role="alert">{{ localError }}</p>
    </div>

    <!-- Typical availability -->
    <div v-else-if="section.key === 'work_hours'" class="pu-panel">
      <TypicalAvailabilityInput v-model="typicalAvailability" :disabled="saving || recipient?.previewOnly" />
      <button class="pu-btn primary" :disabled="saving" @click="markComplete({typicalAvailability:typicalAvailability.split(',').map(s=>s.trim()).filter(Boolean)})">Save &amp; confirm typical availability</button>
    </div>

    <!-- Office schedule -->
    <ProviderUpdateOfficeSchedule
      v-else-if="section.key === 'office_schedule'"
      :agency-id="agencyId"
      :mode="mode"
      :token="token"
      :data="section.data"
      @complete="markComplete"
    />

    <!-- Profile blurb -->
    <div v-else-if="section.key === 'profile_blurb'" class="pu-panel">
      <p class="mode-tag">{{ blurb ? 'Confirm or update your profile blurb' : 'Set your profile blurb' }}</p>
      <p v-if="!blurb" class="hint">Example: “Hi, I’m [name]. I support [people you work with] with [your focus areas]. My approach is [describe how you work]. Together, we [what clients can expect].” Replace brackets with accurate details.</p>
      <button v-if="!blurb" type="button" class="pu-btn" @click="blurb=`Hi, I’m ${recipient?.firstName || '[name]'}. I support [people you work with] with [your focus areas]. My approach is [describe how you work]. Together, we [what clients can expect].`">Use editable example</button>
      <textarea v-model="blurb" rows="5" class="input" placeholder="Short introduction for schools and families…" />
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveBlurb">
          {{ saving ? 'Saving…' : blurb ? 'Save & confirm' : 'Save blurb' }}
        </button>
      </div>
    </div>

    <!-- Specialties -->
    <div v-else-if="section.key === 'specialties'" class="pu-panel">
      <fieldset v-for="group in section.data?.specialtyGroups || []" :key="group.key" class="focus-group"><legend>{{ group.label }}</legend>
        <label v-for="option in group.options" :key="option" class="check"><input type="checkbox" v-model="specialties[group.key]" :value="option" />{{ option }}</label>
      </fieldset>
      <p v-if="!section.data?.specialtyGroups?.length">No focus-area choices are configured yet.</p>
      <button class="pu-btn primary" :disabled="saving || !section.data?.specialtyGroups?.length" @click="saveSpecialties">Save &amp; confirm focus areas</button>
    </div>

    <div v-else-if="section.key === 'supervision_hours'" class="pu-panel">
      <p v-if="reviewLoading">Loading supervision hours…</p>
      <template v-else-if="reviewContext.supervised">
        <table class="hours-table"><thead><tr><th>Source</th><th>Individual</th><th>Group</th><th>Total</th></tr></thead><tbody>
          <tr v-for="row in supervisionRows" :key="row.key"><th>{{ row.label }}</th><td>{{ row.value.individual }}</td><td>{{ row.value.group }}</td><td>{{ row.value.total }}</td></tr>
        </tbody></table>
        <p>Current recorded balance minus calculated total: <strong>{{ section.data?.breakdown?.difference ?? 'Unavailable' }} hours</strong>.</p>
        <p>Reported hours and finalized app credits are separate sources. Request a correction if a prior report includes hours already counted in the app.</p>
        <label class="field"><span>Review</span><select v-model="supervisionReview.decision" class="input"><option value="confirmed">These hours are correct</option><option value="correction_requested">Request a correction</option></select></label>
        <template v-if="supervisionReview.decision === 'correction_requested'">
          <label class="field"><span>Requested total hours</span><input v-model.number="supervisionReview.requestedHours" type="number" min="0" step="0.01" class="input" /></label>
          <label class="field"><span>Why should the hours change?</span><textarea v-model="supervisionReview.reason" class="input" /></label>
          <label class="field"><span>Supporting record (optional)</span><input type="file" accept="application/pdf,image/*" @change="uploadReviewFile($event, 'supervision')" /></label>
          <p>Submitted corrections are reviewed before the supervision ledger changes.</p>
        </template>
      </template>
      <p v-else-if="!reviewLoading">No supervisor is currently assigned for this agency.</p>
      <p v-if="supervisionReview.documentId">Supporting record saved to your file.</p>
      <p v-if="localError" class="err">{{ localError }}</p>
      <button :disabled="saving || reviewLoading || !!localError" class="pu-btn primary" @click="markComplete({ ...supervisionReview })">{{ supervisionReview.decision === 'correction_requested' ? 'Submit correction for review' : 'Confirm supervision review' }}</button>
    </div>

    <!-- License -->
    <div v-else-if="section.key === 'license'" class="pu-panel">
      <p class="mode-tag">See and update license details</p>
      <label class="field"><span>License type / number</span><input v-model="license.number" class="input" /></label>
      <label class="field"><span>Issue date</span><input v-model="license.issued" type="date" class="input" /></label>
      <label class="field"><span>License document</span><input type="file" accept="application/pdf,image/*" @change="uploadReviewFile($event, 'license')" /></label>
      <p v-if="license.hasUpload"><button type="button" class="pu-btn" @click="openAsset('license')">Open your uploaded license</button></p>
      <p v-if="localError" class="err">{{ localError }}</p>
      <label class="field"><span>Expiration date</span><input v-model="license.expires" type="date" class="input" /></label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveLicense">
          {{ saving ? 'Saving…' : 'Save & confirm license' }}
        </button>
      </div>
    </div>

    <!-- Contact -->
    <div v-else-if="section.key === 'contact_info'" class="pu-panel">
      <label v-for="field in contactFields" :key="field.key" class="field"><span>{{field.label}}</span><input v-model="contact[field.key]" class="input" :autocomplete="field.autocomplete" /></label>
      <button class="pu-btn primary" :disabled="saving" @click="markComplete({contact:{...contact}})">Save &amp; confirm contact</button>
    </div>

    <!-- Credential display -->
    <div v-else-if="section.key === 'credential_display'" class="pu-panel">
      <label class="field"><span>Display credential / title</span><input v-model="credential" class="input" /></label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ credential })">
          Confirm credential display
        </button>
      </div>
    </div>

    <!-- School availability -->
    <div v-else-if="section.key === 'school_availability'" class="pu-panel">
      <ul v-if="section.data?.schools?.length" class="school-list"><li v-for="school in section.data.schools" :key="school.id"><strong>{{school.name}}</strong><span>{{school.day_of_week}} · {{formatTime(school.start_time)}}–{{formatTime(school.end_time)}}</span></li></ul>
      <p v-else>No active school assignments are saved for you in this agency.</p>
      <label class="field">Requested changes (optional)<textarea v-model="schoolChanges" class="input" rows="3" /></label>
      <button class="pu-btn primary" :disabled="saving" @click="markComplete({reviewed:true,requestedChanges:schoolChanges})">{{schoolChanges.trim()?'Submit school changes for review':'Confirm school assignments'}}</button>
    </div>

    <!-- Preferred days -->
    <div v-else-if="section.key === 'preferred_days'" class="pu-panel">
      <div class="days">
        <label v-for="d in weekdays" :key="d" class="day">
          <input v-model="preferredDays" type="checkbox" :value="d" />
          {{ d }}
        </label>
      </div>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ preferredDays })">
          Confirm preferred days
        </button>
      </div>
    </div>

    <!-- Directory photo -->
    <div v-else-if="section.key === 'directory_photo'" class="pu-panel">
      <img v-if="photoUrl" :src="photoUrl" alt="Your current directory photo" class="directory-photo" />
      <p v-else>{{section.data?.hasPhoto?'Loading your current photo…':'No directory photo is saved yet.'}}</p>
      <p>Use a clear, well-lit, professional-looking photo with your face centered and visible. A simple indoor or natural outdoor background is welcome. Avoid other people, heavy filters, sunglasses, and distracting backgrounds.</p>
      <a class="pu-btn" :href="orgPath('/account-info')" target="_blank" rel="noopener">Open Account Info →</a>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ photoConfirmed: true })">
          Confirm directory photo
        </button>
      </div>
    </div>

    <!-- Notification prefs -->
    <div v-else-if="section.key === 'notification_prefs'">
      <StaffCommunicationChoices :initial="section.data?.communicationChoices" :agency-id="agencyId" external-save :readonly="!!recipient?.previewOnly" :busy="saving" @save="markComplete" />
      <p v-if="localError" role="alert">{{ localError }}</p>
    </div>

    <!-- Amendments -->
    <div v-else-if="section.key === 'amendments'" class="pu-panel">
      <p v-if="amendmentPlan?.title || amendmentPlan?.effectiveDate" class="plan">
        <strong>{{ amendmentPlan?.title || 'Contract amendment' }}</strong>
        <span v-if="amendmentPlan?.effectiveDate" class="muted"> · effective {{ amendmentPlan.effectiveDate }}</span>
      </p>
      <p v-if="resolvedJobDescription?.jobTitle" class="muted">
        Your role: <strong>{{ resolvedJobDescription.jobTitle }}</strong>
        <span v-if="resolvedJobDescription.jobDescClauseKey" class="muted">
          · clause {{ resolvedJobDescription.jobDescClauseKey }}
        </span>
      </p>
      <p class="muted">
        Review and sign your assigned amendment in My Documents. Job description acknowledgments include your
        position’s duty clause and require your agreement to those responsibilities.
      </p>
      <ul v-if="amendmentTasks.length" class="amendment-task-list">
        <li v-for="task in amendmentTasks" :key="task.id">
          <span>{{ task.title }}</span>
          <span class="badge" :class="task.status === 'completed' ? 'ok' : 'pending'">
            {{ task.status === 'completed' ? 'Signed' : 'Pending signature' }}
          </span>
        </li>
      </ul>
      <p v-else class="muted">No amendment document is assigned yet — check back after People Ops sends the update.</p>
      <a class="pu-btn" :href="linkHref" target="_blank" rel="noopener">Open My Documents →</a>
      <label class="field">
        <span>Notes (optional)</span>
        <textarea v-model="linkNote" rows="2" class="input" />
      </label>
      <div class="pu-actions">
        <button
          type="button"
          class="pu-btn primary"
          :disabled="saving || !allAmendmentsSigned"
          @click="markComplete({ note: linkNote, amendmentPlan })"
        >
          {{ allAmendmentsSigned ? 'Confirm signed amendment agreement' : 'Assigned amendment signature required' }}
        </button>
      </div>
    </div>

    <!-- Client Fall action items -->
    <div v-else-if="section.key === 'client_fall_update'" class="pu-panel">
      <p class="muted">
        Clients who still need Fall confirmation or related school actions. Complete these here so you don’t miss the
        Fall Update boat.
      </p>
      <p v-if="fallLoading" class="muted">Loading action-item clients…</p>
      <ul v-else-if="fallClients.length" class="fall-list">
        <li v-for="c in fallClients" :key="c.id">
          <div>
            <strong>{{ c.preferredName || c.firstName }} {{ c.lastName }}</strong>
            <span class="muted"> · {{ c.schoolName || 'School' }}</span>
            <div class="badge">{{ c.lifecycleAction?.label || 'Action needed' }}</div>
          </div>
          <a
            v-if="c.schoolOrganizationId"
            class="pu-btn sm"
            :href="orgPath(`/school-portal/${c.schoolOrganizationId}`)"
            target="_blank"
            rel="noopener"
          >
            Open portal →
          </a>
        </li>
      </ul>
      <p v-else-if="!localError" class="muted">No open Fall action-item clients right now — you can mark this complete.</p>
      <div class="pu-actions">
        <button
          type="button"
          class="pu-btn"
          :disabled="fallLoading"
          @click="loadFallClients"
        >
          Refresh list
        </button>
        <button
          type="button"
          class="pu-btn primary"
          :disabled="saving || fallLoading || !!localError"
          @click="markComplete({ fallClientCount: fallClients.length })"
        >
          Mark Fall actions reviewed
        </button>
      </div>
    </div>

    <!-- Link-out stubs -->
    <div v-else-if="isLink" class="pu-panel">
      <p class="muted">{{ section.meta?.previewHint || 'Open the linked tool, then mark this section complete.' }}</p>
      <a class="pu-btn" :href="linkHref" target="_blank" rel="noopener">Open →</a>
      <label class="field">
        <span>Notes (optional)</span>
        <textarea v-model="linkNote" rows="2" class="input" />
      </label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ note: linkNote })">
          Mark complete
        </button>
      </div>
    </div>

    <!-- Fallback -->
    <div v-else class="pu-panel">
      <p class="muted">Complete this section, then mark it done.</p>
      <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({})">Mark complete</button>
    </div>
    </fieldset>
  </section>
</template>

<script setup>
import StaffCommunicationChoices from '../communications/StaffCommunicationChoices.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import TypicalAvailabilityInput from '../publicServices/TypicalAvailabilityInput.vue';
import WorkplaceHandbookReader from '../handbook/WorkplaceHandbookReader.vue';
import ProviderUpdateOfficeSchedule from './ProviderUpdateOfficeSchedule.vue';
import ProviderUpdateAdminUpdateEmbed from './ProviderUpdateAdminUpdateEmbed.vue';

const props = defineProps({
  section: { type: Object, required: true },
  mode: { type: String, default: 'token' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  recipient: { type: Object, default: null }
});
const emit = defineEmits(['saved', 'close']);
const route = useRoute();

const saving = ref(false);
const localError = ref('');
const hasWorkHours = ref(true);
const blurb = ref('');
const specialties=reactive({});
const typicalAvailability=ref('');
const schoolChanges=ref('');
const photoUrl=ref('');
const setupPassword=ref(''),newPasscode=ref('');
const license = reactive({ number: '', issued: '', expires: '', hasUpload: false });
const reviewContext = ref({});
const reviewLoading = ref(false);
const supervisionReview = reactive({ decision: 'confirmed', requestedHours: null, reason: '', documentId: null, ...(props.section.key === 'supervision_hours' ? props.section.data : {}) });
const reviewBase = computed(() => props.mode === 'token' ? `/public/provider-update/${encodeURIComponent(props.token)}` : '/provider-update/me');
const contact = reactive({phone:'',street:'',line2:'',city:'',state:'',postalCode:'',emergency:''});
const contactFields=[{key:'phone',label:'Personal mobile phone',autocomplete:'tel'},{key:'street',label:'Street address',autocomplete:'address-line1'},{key:'line2',label:'Address line 2',autocomplete:'address-line2'},{key:'city',label:'City',autocomplete:'address-level2'},{key:'state',label:'State',autocomplete:'address-level1'},{key:'postalCode',label:'ZIP code',autocomplete:'postal-code'},{key:'emergency',label:'Emergency contact',autocomplete:'off'}];
const supervisionRows=computed(()=>Object.entries({baseline:'Reported starting hours',period:'Imported / period hours',app:'Finalized app credits',calculated:'Calculated total',current:'Current recorded balance'}).map(([key,label])=>({key,label,value:props.section.data?.breakdown?.[key]||{individual:'—',group:'—',total:'—'}})));
function formatTime(value){if(!value)return 'Not set';const [h,m='00']=String(value).split(':');return `${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`;}
async function openAsset(kind){try{const {data}=await api.get(`${reviewBase.value}/assets/${kind}`,{params:{agencyId:props.agencyId}});if(kind==='photo')photoUrl.value=data.url;else window.open(data.url,'_blank','noopener,noreferrer');}catch(e){localError.value=e.response?.data?.error?.message||'Could not open the saved document.';}}
async function setupQuickView(){if(props.recipient?.previewOnly)return;saving.value=true;localError.value='';try{const {data}=await api.post(`${reviewBase.value}/quick-view-setup`,{password:setupPassword.value,agencyId:props.agencyId});newPasscode.value=data.passcode;}catch(e){localError.value=e.response?.data?.error?.message||'Could not create the code.';}finally{setupPassword.value='';saving.value=false;}}

const credential = ref('');
const preferredDays = ref([]);
const notify = reactive({ email: true, sms: false });
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const linkNote = ref('');
const fallClients = ref([]);
const fallLoading = ref(false);

const amendmentPlan = computed(() => props.recipient?.amendmentPlan || props.section?.data?.amendmentPlan || null);
const amendmentTasks = computed(() => props.recipient?.amendmentTasks || []);
const resolvedJobDescription = computed(() => props.recipient?.resolvedJobDescription || null);
const allAmendmentsSigned = computed(() => {
  const tasks = amendmentTasks.value || [];
  if (!tasks.length) return false;
  return tasks.every((t) => String(t.status || '').toLowerCase() === 'completed');
});

const isLink = computed(() =>
  ['training_ack', 'pay_portal'].includes(props.section.key)
);

const linkHref = computed(() => {
  const slug = route.params.organizationSlug;
  const prefix = slug ? `/${slug}` : '';
  const map = {
    amendments: `${prefix}/dashboard?tab=my&my=documents`,
    client_fall_update: `${prefix}/provider/year-update/flow`,
    training_ack: `${prefix}/dashboard?tab=my`,
    pay_portal: `${prefix}/dashboard?tab=my&my=payroll`
  };
  return map[props.section.key] || '#';
});

function orgPath(path) {
  const slug = route.params.organizationSlug;
  return slug ? `/${slug}${path}` : path;
}

async function saveSectionPayload(payload) {
  if (props.recipient?.previewOnly) return;
  saving.value = true;
  localError.value = '';
  try {
    let res;
    if (props.mode === 'token') {
      res = await api.put(
        `/public/provider-update/${encodeURIComponent(props.token)}/sections/${props.section.key}`,
        payload
      );
    } else {
      res = await api.put(`/provider-update/me/sections/${props.section.key}`, {
        agencyId: Number(props.agencyId),
        ...payload
      });
    }
    emit('saved', res.data);
  } catch (e) {
    localError.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

function markComplete(data = {}) {
  const rawMode = props.section.meta?.mode || 'ack';
  const modeMap = {
    link: 'link',
    embedded: 'ack',
    set_confirm_update: data.blurb || data.license ? 'update' : 'confirm',
    ack: 'ack'
  };
  return saveSectionPayload({
    completed: true,
    mode: modeMap[rawMode] || 'ack',
    status: 'completed',
    data: { ...(props.section.data || {}), ...data }
  });
}

async function saveBlurb() {
  if (props.recipient?.previewOnly) return;
  saving.value = true;
  try {
    await markComplete({ blurb: blurb.value });
  } finally {
    saving.value = false;
  }
}

async function saveSpecialties() {
  await markComplete({specialties:{...specialties}});
}

async function uploadReviewFile(event, kind) {
  if (props.recipient?.previewOnly) return;
  const file = event.target.files?.[0];
  if (!file) return;
  saving.value = true; localError.value = '';
  try {
    const body = new FormData(); body.append('file', file); body.append('agencyId', String(props.agencyId));
    if (kind === 'license' && license.expires) body.append('expirationDate', license.expires);
    const { data } = await api.post(`${reviewBase.value}/documents/${kind}`, body);
    if (kind === 'license') license.hasUpload = true;
    else supervisionReview.documentId = data.documentId;
  } catch(e) { localError.value = e.response?.data?.error?.message || 'Could not upload this document.'; }
  finally { saving.value = false; }
}
onMounted(async () => {
  if (!['license', 'supervision_hours'].includes(props.section.key)) return;
  reviewLoading.value = true;
  try {
    const { data } = await api.get(`${reviewBase.value}/review-context`, { params: { agencyId: props.agencyId } });
    reviewContext.value = data;
    Object.assign(license, data.license, props.section.data?.license || {});
  } catch(e) { localError.value = e.response?.data?.error?.message || 'Could not load your current records.'; }
  finally { reviewLoading.value = false; }
});

async function saveLicense() {
  await markComplete({ license: { ...license } });
}

async function loadFallClients() {
  if (props.section.key !== 'client_fall_update') return;
  fallLoading.value = true;localError.value='';
  try {
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.get(`/public/provider-update/${encodeURIComponent(props.token)}/fall-actions`);
    } else {
      res = await api.get('/provider-update/me/fall-actions', {
        params: { agencyId: props.agencyId }
      });
    }
    fallClients.value = res.data?.clients || [];
  } catch {
    localError.value='Could not load assigned client actions. Retry before confirming this section.';
    fallClients.value = [];
  } finally {
    fallLoading.value = false;
  }
}

onMounted(async () => {
  const data = props.section.data || {};
  blurb.value = data.blurb || '';
  Object.assign(specialties,data.specialties||{});
  typicalAvailability.value=(data.typicalAvailability||[]).join(', ');
  schoolChanges.value=data.requestedChanges||'';
  if(props.section.key==='directory_photo'&&data.hasPhoto)await openAsset('photo');
  if (data.license) Object.assign(license, data.license);
  if (data.contact) Object.assign(contact, data.contact);
  credential.value = data.credential || '';
  preferredDays.value = data.preferredDays || [];
  if (data.notify) Object.assign(notify, data.notify);
  if (props.section.key === 'client_fall_update') await loadFallClients();
});
</script>

<style scoped>
.directory-photo{width:180px;height:180px;object-fit:cover;border-radius:16px}.focus-group{display:flex;flex-wrap:wrap;gap:12px}.hours-table{border-collapse:collapse;width:100%}.hours-table th,.hours-table td{text-align:left;padding:10px;border-bottom:1px solid #e5e7eb}.school-list li{display:grid;gap:6px;padding:12px}.preview-fields{border:0;margin:0;padding:0;min-width:0}
.pu-section-head h1 { margin: 0 0 0.25rem; }
.pu-section-head p { color: #6b7280; margin: 0 0 1rem; }
.pu-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem 1.1rem;
  display: grid;
  gap: 0.75rem;
}
.mode-tag {
  display: inline-block;
  background: #e8f0eb;
  color: #3d6b4f;
  padding: 0.25rem 0.6rem;
  border-radius: 99px;
  font-size: 0.8rem;
  font-weight: 600;
  width: fit-content;
}
.field { display: grid; gap: 0.3rem; font-size: 0.9rem; }
.input, textarea.input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  font: inherit;
}
.pu-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.fall-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
.amendment-task-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.amendment-task-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
}
.badge.pending { background: #fef3c7; color: #92400e; }
.badge.ok { background: #dcfce7; color: #166534; }
.fall-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.badge {
  display: inline-block;
  margin-top: 0.25rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.pu-btn.sm { padding: 0.25rem 0.55rem; font-size: 0.8rem; }
.plan { margin: 0; }
.pu-btn {
  border-radius: 8px;
  padding: 0.5rem 0.85rem;
  border: 1px solid #3d6b4f;
  background: #fff;
  color: #3d6b4f;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.pu-btn.primary { background: #3d6b4f; color: #fff; }
.pu-btn.ghost { border-color: #d1d5db; color: #6b7280; }
.muted { color: #6b7280; }
.err { color: #b91c1c; }
.days { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.day, .check { display: flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
</style>
