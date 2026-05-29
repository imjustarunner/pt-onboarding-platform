<template>
  <div class="ek-late" :class="{ 'ek-late--disabled': disabled }">
    <div v-if="statusLabel" class="ek-late-status" :class="`ek-late-status--${statusTone}`">
      {{ statusLabel }}
    </div>

    <template v-if="((!isResolved && !isPendingWait) || editingPending)">
      <div class="ek-late-block">
        <div class="ek-late-label">Staff contact</div>
        <div class="ek-push-row">
          <button
            v-for="s in staffList"
            :key="`staff-${s.id}`"
            type="button"
            class="ek-push"
            :class="{ 'is-active': Number(selectedStaffId) === Number(s.id) }"
            :disabled="disabled || saving || (isContacted && !editingPending)"
            @click="selectedStaffId = s.id"
          >
            {{ s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim() }}
          </button>
        </div>
      </div>

      <div class="ek-late-block">
        <div class="ek-late-label">Family contact</div>
        <div v-if="contactOptions.length" class="ek-contact-cards">
          <button
            v-for="c in contactOptions"
            :key="c.key"
            type="button"
            class="ek-contact-card"
            :class="{ 'is-active': selectedContactKey === c.key }"
            :disabled="disabled || saving || (isContacted && !editingPending)"
            @click="selectContact(c)"
          >
            <strong>{{ c.name }}</strong>
            <span class="muted small">{{ c.relationship }}</span>
            <span v-if="c.phone" class="muted small">{{ c.phone }}</span>
            <span v-else-if="c.email" class="muted small">{{ c.email }}</span>
          </button>
        </div>
        <p v-else class="muted small">No guardian or emergency contact on file.</p>
      </div>

      <div v-if="!isContacted || editingPending" class="ek-late-block">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="disabled || saving || !canMarkContacted"
          @click="markContacted"
        >
          {{ saving ? 'Saving…' : 'Contacted' }}
        </button>
      </div>

      <template v-if="isContacted">
        <div class="ek-late-block">
          <div class="ek-late-label">How did you reach them?</div>
          <div class="ek-push-row">
            <button
              v-for="m in methodOptions"
              :key="m.value"
              type="button"
              class="ek-push"
              :class="{ 'is-active': contactMethod === m.value }"
              :disabled="disabled || saving"
              @click="selectMethod(m.value)"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <div v-if="contactMethod === 'phone' && !phoneOutcome" class="ek-late-block">
          <div class="ek-late-label">Phone call</div>
          <div class="ek-push-row">
            <button
              type="button"
              class="ek-push"
              :class="{ 'is-active': phoneOutcome === 'successful' }"
              :disabled="disabled || saving"
              @click="savePatch({ phoneOutcome: 'successful' })"
            >
              Successful
            </button>
            <button
              type="button"
              class="ek-push"
              :class="{ 'is-active': phoneOutcome === 'unsuccessful' }"
              :disabled="disabled || saving"
              @click="savePatch({ phoneOutcome: 'unsuccessful' })"
            >
              Not successful
            </button>
          </div>
        </div>

        <div v-if="showReplyStep" class="ek-late-block">
          <div class="ek-late-label">Reply</div>
          <div class="ek-push-row">
            <button
              type="button"
              class="ek-push"
              :class="{ 'is-active': replyStatus === 'reply' }"
              :disabled="disabled || saving"
              @click="savePatch({ replyStatus: 'reply' })"
            >
              Reply
            </button>
            <button
              type="button"
              class="ek-push"
              :class="{ 'is-active': replyStatus === 'no_reply' }"
              :disabled="disabled || saving"
              @click="savePatch({ replyStatus: 'no_reply' })"
            >
              No reply
            </button>
          </div>
        </div>

        <div v-if="showOutcomeStep" class="ek-late-block">
          <div class="ek-late-label">Today</div>
          <div class="ek-push-row">
            <button
              type="button"
              class="ek-push ek-push--good"
              :class="{ 'is-active': attendanceOutcome === 'attending' }"
              :disabled="disabled || saving"
              @click="savePatch({ attendanceOutcome: 'attending' })"
            >
              Attending
            </button>
            <button
              type="button"
              class="ek-push ek-push--bad"
              :class="{ 'is-active': attendanceOutcome === 'not_attending' }"
              :disabled="disabled || saving"
              @click="startNotAttending"
            >
              Not attending
            </button>
            <button
              type="button"
              class="ek-push ek-push--wait"
              :class="{ 'is-active': attendanceOutcome === 'pending' }"
              :disabled="disabled || saving"
              @click="savePatch({ attendanceOutcome: 'pending', replyStatus: replyStatus || 'auto_reply' })"
            >
              Pending · auto-reply
            </button>
          </div>
        </div>

        <div v-if="showAbsenceReason" class="ek-late-block">
          <label class="ek-late-label">Absence reason</label>
          <textarea
            v-model="absenceReasonDraft"
            class="input ek-absence-input"
            rows="2"
            maxlength="500"
            placeholder="Why are they not attending today?"
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="disabled || saving || absenceReasonDraft.trim().length < 2"
            @click="confirmNotAttending"
          >
            {{ saving ? 'Saving…' : 'Mark not attending & absent' }}
          </button>
        </div>
      </template>
    </template>

    <div v-else-if="isPendingWait && !editingPending" class="ek-late-block ek-late-pending">
      <dl v-if="logDetailRows.length" class="ek-late-detail">
        <div v-for="(r, i) in logDetailRows" :key="`pd-${i}`" class="ek-late-detail-row">
          <dt>{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </div>
      </dl>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || saving" @click="reopenPending">
        Update reply / attendance
      </button>
    </div>

    <div v-else-if="isResolved" class="ek-late-block ek-late-summary">
      <dl v-if="logDetailRows.length" class="ek-late-detail">
        <div v-for="(r, i) in logDetailRows" :key="`rd-${i}`" class="ek-late-detail-row">
          <dt>{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </div>
      </dl>
      <p v-else class="muted small">
        <span v-if="log?.attendanceOutcome === 'attending'">Marked attending — check in when they arrive.</span>
        <span v-else-if="log?.attendanceOutcome === 'not_attending'">Marked not attending{{ log?.absenceReason ? `: ${log.absenceReason}` : '' }}.</span>
      </p>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || saving" @click="reopenPending">
        Edit / update outreach
      </button>
    </div>

    <p v-if="error" class="ek-late-err">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  client: { type: Object, required: true },
  staff: { type: Array, default: () => [] },
  log: { type: Object, default: null },
  disabled: { type: Boolean, default: false },
  saveUrl: { type: String, required: true },
  authHeaders: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['updated']);

const saving = ref(false);
const error = ref('');
const editingPending = ref(false);
const selectedStaffId = ref(null);
const selectedContactKey = ref('');
const selectedContact = ref(null);
const contactMethod = ref('');
const phoneOutcome = ref('');
const replyStatus = ref('');
const attendanceOutcome = ref('');
const absenceReasonDraft = ref('');
const awaitingAbsenceReason = ref(false);

const methodOptions = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' }
];

const staffList = computed(() => (Array.isArray(props.staff) ? props.staff : []));

const METHOD_LABELS = { text: 'Text', email: 'Email', phone: 'Phone' };
const REPLY_LABELS = { reply: 'Replied', no_reply: 'No reply', auto_reply: 'Auto-reply (pending)' };
const OUTCOME_LABELS = { attending: 'Attending', not_attending: 'Not attending', pending: 'Pending · waiting' };

const loggedStaffName = computed(() => {
  const id = Number(props.log?.staffUserId || 0);
  if (!id) return '';
  const s = staffList.value.find((x) => Number(x.id) === id);
  if (!s) return '';
  return s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
});

function fmtLogTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const logDetailRows = computed(() => {
  const log = props.log;
  if (!log) return [];
  const rows = [];
  if (loggedStaffName.value) rows.push({ label: 'Staff who reached out', value: loggedStaffName.value });
  const t = log.contactTarget || {};
  if (t.name) {
    const extra = [t.relationship, t.phone || t.email].filter(Boolean).join(' · ');
    rows.push({ label: 'Family contact', value: extra ? `${t.name} (${extra})` : t.name });
  }
  if (log.contactMethod) {
    let v = METHOD_LABELS[log.contactMethod] || log.contactMethod;
    if (log.contactMethod === 'phone' && log.phoneOutcome) {
      v += log.phoneOutcome === 'successful' ? ' · answered' : ' · no answer';
    }
    rows.push({ label: 'How they reached out', value: v });
  }
  if (log.replyStatus) rows.push({ label: 'Reply', value: REPLY_LABELS[log.replyStatus] || log.replyStatus });
  if (log.attendanceOutcome) rows.push({ label: 'Outcome', value: OUTCOME_LABELS[log.attendanceOutcome] || log.attendanceOutcome });
  if (log.absenceReason) rows.push({ label: 'Absence reason', value: log.absenceReason });
  if (log.contactedAt) rows.push({ label: 'Contacted at', value: fmtLogTime(log.contactedAt) });
  if (log.resolvedAt) rows.push({ label: 'Resolved at', value: fmtLogTime(log.resolvedAt) });
  return rows;
});

const contactOptions = computed(() => {
  const options = [];
  const client = props.client || {};
  for (const g of client.guardians || []) {
    const userId = Number(g.userId || 0);
    const name = String(g.name || '').trim();
    if (!userId || !name) continue;
    options.push({
      key: `guardian:${userId}`,
      type: 'guardian',
      ref: String(userId),
      name,
      relationship: String(g.relationship || 'Guardian').trim() || 'Guardian',
      phone: String(g.phone || '').trim() || null,
      email: String(g.email || '').trim() || null
    });
  }
  (client.emergencyContacts || client.waiver?.emergencyContacts || []).forEach((e, idx) => {
    const name = String(e?.name || '').trim();
    if (!name) return;
    options.push({
      key: `emergency:${idx}:${name}`,
      type: 'emergency_contact',
      ref: String(idx),
      name,
      relationship: String(e.relationship || 'Emergency contact').trim() || 'Emergency contact',
      phone: String(e.phone || '').trim() || null,
      email: String(e.email || '').trim() || null
    });
  });
  return options;
});

function syncFromLog(log) {
  selectedStaffId.value = log?.staffUserId ? Number(log.staffUserId) : null;
  const target = log?.contactTarget || {};
  if (target.type && target.ref) {
    const match = contactOptions.value.find((c) =>
      c.type === target.type && String(c.ref) === String(target.ref)
    );
    if (match) {
      selectedContactKey.value = match.key;
      selectedContact.value = match;
    } else {
      selectedContactKey.value = `${target.type}:${target.ref}`;
      selectedContact.value = {
        key: selectedContactKey.value,
        type: target.type,
        ref: target.ref,
        name: target.name,
        relationship: target.relationship,
        phone: target.phone,
        email: target.email
      };
    }
  } else {
    selectedContactKey.value = '';
    selectedContact.value = null;
  }
  contactMethod.value = log?.contactMethod || '';
  phoneOutcome.value = log?.phoneOutcome || '';
  replyStatus.value = log?.replyStatus || '';
  attendanceOutcome.value = log?.attendanceOutcome || '';
  absenceReasonDraft.value = log?.absenceReason || '';
  awaitingAbsenceReason.value = false;
  editingPending.value = false;
}

watch(() => props.log, (log) => syncFromLog(log), { immediate: true });
watch(contactOptions, () => {
  if (props.log) syncFromLog(props.log);
});

const isContacted = computed(() => !!props.log?.contactedAt);
const isPendingWait = computed(() => props.log?.attendanceOutcome === 'pending' && !props.log?.resolvedAt);
const isResolved = computed(() => !!props.log?.resolvedAt);

const canMarkContacted = computed(() =>
  !!selectedStaffId.value && !!selectedContact.value?.name
);

const showReplyStep = computed(() => {
  if (!contactMethod.value) return false;
  if (contactMethod.value === 'phone' && !phoneOutcome.value) return false;
  return true;
});

const showOutcomeStep = computed(() => showReplyStep.value && !!replyStatus.value && !awaitingAbsenceReason.value);

const showAbsenceReason = computed(() => awaitingAbsenceReason.value || (
  attendanceOutcome.value === 'not_attending' && !isResolved.value
));

const statusTone = computed(() => {
  if (props.log?.attendanceOutcome === 'pending') return 'wait';
  if (props.log?.attendanceOutcome === 'not_attending') return 'bad';
  if (props.log?.attendanceOutcome === 'attending') return 'good';
  if (isContacted.value) return 'active';
  return 'neutral';
});

const statusLabel = computed(() => {
  const log = props.log;
  if (!log) return 'Late — log outreach';
  if (log.attendanceOutcome === 'pending' && !log.resolvedAt) return 'Pending · waiting for reply';
  if (log.attendanceOutcome === 'attending' && log.resolvedAt) return 'Attending today';
  if (log.attendanceOutcome === 'not_attending' && log.resolvedAt) return 'Not attending today';
  if (log.contactedAt) return 'Contact in progress';
  return 'Late — log outreach';
});

function selectContact(c) {
  selectedContactKey.value = c.key;
  selectedContact.value = c;
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

function openMethodLink(method) {
  const c = selectedContact.value;
  if (!c) return;
  if (method === 'text') {
    const phone = digitsOnly(c.phone);
    if (phone) window.location.href = `sms:${phone}`;
  } else if (method === 'email') {
    const email = String(c.email || '').trim();
    if (email) window.location.href = `mailto:${email}`;
  } else if (method === 'phone') {
    const phone = digitsOnly(c.phone);
    if (phone) window.location.href = `tel:${phone}`;
  }
}

async function savePatch(patch = {}) {
  if (!props.client?.id) return;
  saving.value = true;
  error.value = '';
  try {
    const body = {
      clientId: props.client.id,
      staffUserId: selectedStaffId.value,
      contactTarget: selectedContact.value
        ? {
          type: selectedContact.value.type,
          ref: selectedContact.value.ref,
          name: selectedContact.value.name,
          relationship: selectedContact.value.relationship,
          phone: selectedContact.value.phone,
          email: selectedContact.value.email
        }
        : undefined,
      ...patch
    };
    const res = await api.post(props.saveUrl, body, {
      headers: props.authHeaders,
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    emit('updated', res.data?.log || null, res.data?.absent || null);
    if (patch.attendanceOutcome === 'attending' || patch.attendanceOutcome === 'not_attending') {
      editingPending.value = false;
      awaitingAbsenceReason.value = false;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not save contact log';
  } finally {
    saving.value = false;
  }
}

async function markContacted() {
  await savePatch({ markContacted: true });
}

async function selectMethod(method) {
  openMethodLink(method);
  contactMethod.value = method;
  phoneOutcome.value = method === 'phone' ? '' : '';
  await savePatch({ contactMethod: method, phoneOutcome: method === 'phone' ? null : undefined });
}

function startNotAttending() {
  attendanceOutcome.value = 'not_attending';
  awaitingAbsenceReason.value = true;
}

async function confirmNotAttending() {
  await savePatch({
    attendanceOutcome: 'not_attending',
    absenceReason: absenceReasonDraft.value.trim()
  });
}

async function reopenPending() {
  saving.value = true;
  error.value = '';
  try {
    const res = await api.post(props.saveUrl, {
      clientId: props.client.id,
      reopenPending: true
    }, {
      headers: props.authHeaders,
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    editingPending.value = true;
    emit('updated', res.data?.log || null, null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not reopen contact log';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ek-late {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px dashed var(--border, #cbd5e1);
  background: #f8fafc;
}
.ek-late--disabled { opacity: 0.7; }
.ek-late-status {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.ek-late-status--neutral { color: #64748b; }
.ek-late-status--active { color: #0369a1; }
.ek-late-status--wait { color: #b45309; }
.ek-late-status--good { color: #047857; }
.ek-late-status--bad { color: #b91c1c; }
.ek-late-block + .ek-late-block { margin-top: 10px; }
.ek-late-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ek-push-row { display: flex; flex-wrap: wrap; gap: 6px; }
.ek-push {
  border: 1px solid var(--border, #cbd5e1);
  background: #fff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: #334155;
}
.ek-push.is-active {
  border-color: var(--primary, #0f766e);
  background: color-mix(in srgb, var(--primary, #0f766e) 12%, white);
  color: var(--primary, #0f766e);
}
.ek-push--good.is-active { border-color: #059669; background: #ecfdf5; color: #047857; }
.ek-push--bad.is-active { border-color: #dc2626; background: #fef2f2; color: #b91c1c; }
.ek-push--wait.is-active { border-color: #d97706; background: #fffbeb; color: #b45309; }
.ek-contact-cards { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.ek-contact-card {
  flex: 0 0 auto;
  min-width: 140px;
  max-width: 190px;
  border: 1px solid var(--border, #cbd5e1);
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ek-contact-card.is-active {
  border-color: var(--primary, #0f766e);
  box-shadow: 0 0 0 1px var(--primary, #0f766e);
}
.ek-absence-input { width: 100%; margin-bottom: 8px; resize: vertical; }
.ek-late-err { color: #b91c1c; font-size: 12px; margin: 8px 0 0; }
.ek-late-summary, .ek-late-pending { padding-top: 4px; }
.ek-late-detail { margin: 0 0 10px; display: flex; flex-direction: column; gap: 6px; }
.ek-late-detail-row { display: flex; flex-direction: column; gap: 1px; }
.ek-late-detail-row dt {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
}
.ek-late-detail-row dd { margin: 0; font-size: 13px; color: #334155; }
</style>
