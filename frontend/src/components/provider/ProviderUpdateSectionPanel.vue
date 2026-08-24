<template>
  <section class="pu-section">
    <header class="pu-section-head">
      <h1>{{ section.meta?.title || section.key }}</h1>
      <p>{{ section.meta?.description }}</p>
    </header>

    <!-- Handbook -->
    <WorkplaceHandbookReader
      v-if="section.key === 'handbook'"
      :access-mode="mode"
      :token="token"
      :agency-id="agencyId"
      :recipient-id="recipient?.id"
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
      @complete="markComplete"
    />

    <!-- PIN -->
    <div v-else-if="section.key === 'pin'" class="pu-panel">
      <p v-if="!pinSet" class="mode-tag">Set your four-digit kiosk PIN</p>
      <p v-else class="mode-tag">PIN is on file — confirm or update</p>
      <label class="field">
        <span>{{ pinSet && !updatingPin ? 'Enter PIN to confirm' : 'New 4-digit PIN' }}</span>
        <input v-model="pinValue" type="password" inputmode="numeric" maxlength="6" class="input" />
      </label>
      <div class="pu-actions">
        <button v-if="pinSet && !updatingPin" type="button" class="pu-btn" :disabled="saving" @click="confirmPin">
          Confirm existing PIN setup
        </button>
        <button v-if="pinSet && !updatingPin" type="button" class="pu-btn ghost" @click="updatingPin = true">
          Update PIN
        </button>
        <button v-if="!pinSet || updatingPin" type="button" class="pu-btn primary" :disabled="saving" @click="savePin">
          {{ saving ? 'Saving…' : 'Save PIN' }}
        </button>
      </div>
      <p v-if="localError" class="err">{{ localError }}</p>
    </div>

    <!-- Work hours -->
    <div v-else-if="section.key === 'work_hours'" class="pu-panel">
      <p class="mode-tag">{{ hasWorkHours ? 'Confirm or update your work hours' : 'Set your work hours' }}</p>
      <WorkHoursEditor open-by-default />
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ workHoursConfirmed: true })">
          {{ hasWorkHours ? 'Confirm work hours' : 'Mark work hours set' }}
        </button>
      </div>
    </div>

    <!-- Office schedule -->
    <ProviderUpdateOfficeSchedule
      v-else-if="section.key === 'office_schedule'"
      :agency-id="agencyId"
      :mode="mode"
      :token="token"
      @complete="markComplete"
    />

    <!-- Profile blurb -->
    <div v-else-if="section.key === 'profile_blurb'" class="pu-panel">
      <p class="mode-tag">{{ blurb ? 'Confirm or update your profile blurb' : 'Set your profile blurb' }}</p>
      <textarea v-model="blurb" rows="5" class="input" placeholder="Short introduction for schools and families…" />
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveBlurb">
          {{ saving ? 'Saving…' : blurb ? 'Save & confirm' : 'Save blurb' }}
        </button>
      </div>
    </div>

    <!-- Specialties -->
    <div v-else-if="section.key === 'specialties'" class="pu-panel">
      <p class="mode-tag">Confirm or edit specialties / focus areas</p>
      <textarea
        v-model="specialtiesText"
        rows="4"
        class="input"
        placeholder="e.g. Anxiety, ADHD, trauma-informed care"
      />
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveSpecialties">
          {{ saving ? 'Saving…' : 'Save & confirm' }}
        </button>
      </div>
    </div>

    <!-- License -->
    <div v-else-if="section.key === 'license'" class="pu-panel">
      <p class="mode-tag">See and update license details</p>
      <label class="field"><span>License type / number</span><input v-model="license.number" class="input" /></label>
      <label class="field"><span>Expiration date</span><input v-model="license.expires" type="date" class="input" /></label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveLicense">
          {{ saving ? 'Saving…' : 'Save & confirm license' }}
        </button>
      </div>
    </div>

    <!-- Contact -->
    <div v-else-if="section.key === 'contact_info'" class="pu-panel">
      <label class="field"><span>Phone</span><input v-model="contact.phone" class="input" /></label>
      <label class="field"><span>Address</span><input v-model="contact.address" class="input" /></label>
      <label class="field"><span>Emergency contact</span><input v-model="contact.emergency" class="input" /></label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ contact })">
          Save & confirm contact
        </button>
      </div>
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
      <p class="muted">Review your school assignment days in My Schedule. Request adjustments there if needed.</p>
      <a class="pu-btn" :href="orgPath('/my-schedule')" target="_blank" rel="noopener">Open My Schedule →</a>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ reviewed: true })">
          Mark school days reviewed
        </button>
      </div>
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
      <p class="muted">Confirm your directory photo on your profile. Update it from Account Info if needed.</p>
      <a class="pu-btn" :href="orgPath('/account-info')" target="_blank" rel="noopener">Open Account Info →</a>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ photoConfirmed: true })">
          Confirm directory photo
        </button>
      </div>
    </div>

    <!-- Notification prefs -->
    <div v-else-if="section.key === 'notification_prefs'" class="pu-panel">
      <label class="check"><input v-model="notify.email" type="checkbox" /> Email notifications</label>
      <label class="check"><input v-model="notify.sms" type="checkbox" /> SMS notifications</label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ notify })">
          Confirm notification preferences
        </button>
      </div>
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
          :disabled="saving || (amendmentTasks.length && !allAmendmentsSigned)"
          @click="markComplete({ note: linkNote, amendmentPlan })"
        >
          {{ allAmendmentsSigned || !amendmentTasks.length ? 'Mark amendments reviewed' : 'Sign documents first' }}
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
      <p v-else class="muted">No open Fall action-item clients right now — you can mark this complete.</p>
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
          :disabled="saving"
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
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import WorkHoursEditor from '../schedule/WorkHoursEditor.vue';
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
const pinSet = ref(false);
const pinValue = ref('');
const updatingPin = ref(false);
const hasWorkHours = ref(true);
const blurb = ref('');
const specialtiesText = ref('');
const license = reactive({ number: '', expires: '' });
const contact = reactive({ phone: '', address: '', emergency: '' });
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
  if (!tasks.length) return true;
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
    set_confirm_update: data.pinSet || data.blurb || data.license ? 'update' : 'confirm',
    ack: 'ack'
  };
  return saveSectionPayload({
    completed: true,
    mode: modeMap[rawMode] || 'ack',
    status: 'completed',
    data: { ...(props.section.data || {}), ...data }
  });
}

async function loadPinStatus() {
  try {
    const res = await api.get('/user-preferences/me');
    pinSet.value = !!res.data?.kiosk_pin_set;
  } catch {
    pinSet.value = !!(props.section.data?.pinSet);
  }
}

async function savePin() {
  const pin = String(pinValue.value || '').replace(/\D/g, '');
  if (pin.length < 4 || pin.length > 6) {
    localError.value = 'PIN must be 4–6 digits';
    return;
  }
  saving.value = true;
  localError.value = '';
  try {
    await api.put('/user-preferences/me/kiosk-pin', { pin });
    pinSet.value = true;
    updatingPin.value = false;
    pinValue.value = '';
    await markComplete({ pinSet: true });
  } catch (e) {
    localError.value = e?.response?.data?.error?.message || 'Could not save PIN';
  } finally {
    saving.value = false;
  }
}

function confirmPin() {
  return markComplete({ pinConfirmed: true, pinSet: true });
}

async function saveBlurb() {
  saving.value = true;
  try {
    if (props.mode !== 'token') {
      await api.patch(`/users/${props.recipient?.providerUserId || 'me'}`, {
        provider_school_info_blurb: blurb.value
      }).catch(() => {});
    }
    await markComplete({ blurb: blurb.value });
  } finally {
    saving.value = false;
  }
}

async function saveSpecialties() {
  await markComplete({ specialties: specialtiesText.value });
}

async function saveLicense() {
  await markComplete({ license: { ...license } });
}

async function loadFallClients() {
  if (props.section.key !== 'client_fall_update') return;
  fallLoading.value = true;
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
    fallClients.value = [];
  } finally {
    fallLoading.value = false;
  }
}

onMounted(async () => {
  const data = props.section.data || {};
  blurb.value = data.blurb || '';
  specialtiesText.value = data.specialties || '';
  if (data.license) Object.assign(license, data.license);
  if (data.contact) Object.assign(contact, data.contact);
  credential.value = data.credential || '';
  preferredDays.value = data.preferredDays || [];
  if (data.notify) Object.assign(notify, data.notify);
  if (props.section.key === 'pin') await loadPinStatus();
  if (props.section.key === 'client_fall_update') await loadFallClients();
});
</script>

<style scoped>
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
