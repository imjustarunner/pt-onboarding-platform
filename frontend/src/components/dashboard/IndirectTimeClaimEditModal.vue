<template>
  <Teleport to="body">
    <div v-if="open" class="itc-overlay" role="dialog" aria-modal="true" aria-labelledby="itc-title">
      <div class="itc-modal">
        <header class="itc-head">
          <h2 id="itc-title">Edit indirect time</h2>
          <button type="button" class="itc-close" aria-label="Close" @click="$emit('close')">×</button>
        </header>

        <p class="itc-lead">
          Update this submission, then resubmit for payroll review.
          A reason for the change is required.
        </p>

        <div v-if="error" class="itc-error" role="alert">{{ error }}</div>

        <label class="itc-field">
          <span>Claim date</span>
          <input v-model="form.claimDate" type="date" />
        </label>

        <div class="itc-row2">
          <label class="itc-field">
            <span>Start</span>
            <input v-model="form.startTime" type="time" />
          </label>
          <label class="itc-field">
            <span>End</span>
            <input v-model="form.endTime" type="time" />
          </label>
        </div>

        <div class="itc-total">
          Session total: <strong>{{ formatHm(totalMinutes) }}</strong>
        </div>

        <h3 class="itc-subhead">Allocations</h3>
        <div class="itc-allocs">
          <div v-for="(row, idx) in form.allocations" :key="idx" class="itc-alloc">
            <div class="itc-alloc-top">
              <span class="itc-alloc-label">{{ row.serviceTypeLabel }}</span>
              <input
                v-model="row.hhmm"
                type="text"
                class="itc-hhmm"
                inputmode="numeric"
                placeholder="00:00"
                :aria-label="`Minutes for ${row.serviceTypeLabel}`"
                @blur="normalizeRow(row)"
              />
            </div>
            <label class="itc-alloc-note">
              <span>Activity note <em>(suggested)</em></span>
              <textarea
                v-model="row.note"
                rows="2"
                maxlength="1000"
                :placeholder="`What did you do for ${row.serviceTypeLabel}?`"
              />
            </label>
          </div>
        </div>
        <p class="itc-alloc-sum" :class="{ bad: allocatedMinutes !== totalMinutes }">
          Allocated: {{ formatHm(allocatedMinutes) }}
          <span v-if="totalMinutes > 0"> / {{ formatHm(totalMinutes) }}</span>
        </p>

        <label class="itc-field">
          <span>Reason for this edit <em>(required)</em></span>
          <textarea
            v-model="form.editReason"
            rows="3"
            maxlength="500"
            placeholder="e.g. Corrected clock-out time — I left at 3:45, not 4:00"
          />
        </label>

        <label class="itc-attest">
          <input v-model="form.attestation" type="checkbox" />
          <span>I certify this time is accurate, complete, and in compliance with workplace policies.</span>
        </label>

        <footer class="itc-foot">
          <button type="button" class="itc-btn ghost" :disabled="saving" @click="$emit('close')">Cancel</button>
          <button type="button" class="itc-btn primary" :disabled="saving || !canSave" @click="save">
            {{ saving ? 'Resubmitting…' : 'Resubmit for review' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  claim: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'saved']);

const form = reactive({
  claimDate: '',
  startTime: '',
  endTime: '',
  allocations: [],
  editReason: '',
  attestation: false
});
const error = ref('');
const saving = ref(false);

function formatHm(mins) {
  const m = Math.max(0, Math.floor(Number(mins) || 0));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function parseHhmm(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesBetween(startRaw, endRaw) {
  const a = String(startRaw || '').match(/^(\d{1,2}):(\d{2})$/);
  const b = String(endRaw || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!a || !b) return 0;
  let start = Number(a[1]) * 60 + Number(a[2]);
  let end = Number(b[1]) * 60 + Number(b[2]);
  if (end <= start) end += 24 * 60;
  return end - start;
}

function normalizeRow(row) {
  const mins = parseHhmm(row.hhmm);
  row.hhmm = mins == null ? '00:00' : formatHm(mins);
}

const totalMinutes = computed(() => {
  const fromTimes = minutesBetween(form.startTime, form.endTime);
  if (fromTimes >= 1) return fromTimes;
  return Math.max(0, Number(props.claim?.payload?.totalMinutes || 0));
});

const allocatedMinutes = computed(() =>
  form.allocations.reduce((sum, r) => sum + (parseHhmm(r.hhmm) || 0), 0)
);

const canSave = computed(() => {
  if (!form.attestation) return false;
  if (String(form.editReason || '').trim().length < 5) return false;
  if (!(totalMinutes.value >= 1)) return false;
  if (!form.allocations.length) return false;
  if (allocatedMinutes.value !== totalMinutes.value) return false;
  return form.allocations.every((r) => (parseHhmm(r.hhmm) || 0) >= 1);
});

function hydrateFromClaim(c) {
  const p = c?.payload || {};
  form.claimDate = String(c?.claim_date || '').slice(0, 10);
  form.startTime = p.startTime || '';
  form.endTime = p.endTime || '';
  form.editReason = '';
  form.attestation = false;
  const allocs = Array.isArray(p.allocations) ? p.allocations : [];
  form.allocations = allocs.map((a) => ({
    serviceTypeId: a.serviceTypeId || null,
    serviceTypeKey: a.serviceTypeKey || null,
    serviceTypeLabel: a.serviceTypeLabel || a.label || 'Service',
    startTime: a.startTime || null,
    endTime: a.endTime || null,
    percent: a.percent ?? null,
    sortOrder: a.sortOrder ?? null,
    note: a.note != null ? String(a.note) : '',
    hhmm: formatHm(Number(a.minutes || 0))
  }));
  error.value = '';
}

watch(
  () => [props.open, props.claim?.id],
  ([isOpen]) => {
    if (isOpen && props.claim) hydrateFromClaim(props.claim);
  }
);

async function save() {
  if (!canSave.value || !props.agencyId || !props.claim?.id) return;
  const emptyNotes = form.allocations.filter((r) => !String(r.note || '').trim());
  if (emptyNotes.length) {
    const ok = window.confirm(
      `You have ${emptyNotes.length} activit${emptyNotes.length === 1 ? 'y' : 'ies'} without a note.\n\n` +
      'We suggest a short note for each activity. Resubmit without notes anyway?'
    );
    if (!ok) return;
  }
  saving.value = true;
  error.value = '';
  try {
    const allocations = form.allocations.map((r, i) => {
      const note = String(r.note || '').trim();
      return {
        serviceTypeId: r.serviceTypeId,
        serviceTypeKey: r.serviceTypeKey,
        serviceTypeLabel: r.serviceTypeLabel,
        minutes: parseHhmm(r.hhmm) || 0,
        startTime: r.startTime,
        endTime: r.endTime,
        percent: r.percent,
        sortOrder: r.sortOrder ?? i + 1,
        ...(note ? { note: note.slice(0, 1000) } : {})
      };
    });
    const resp = await api.patch(`/payroll/me/time-claims/${props.claim.id}`, {
      agencyId: Number(props.agencyId),
      claimDate: form.claimDate,
      editReason: String(form.editReason || '').trim(),
      attestation: true,
      payload: {
        entryMethod: props.claim?.payload?.entryMethod || 'clock',
        allocationMode: props.claim?.payload?.allocationMode || 'duration',
        startTime: form.startTime,
        endTime: form.endTime,
        totalMinutes: totalMinutes.value,
        allocations,
        sessionId: props.claim?.payload?.sessionId || null,
        attestation: true
      }
    });
    emit('saved', resp.data?.claim || null);
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save changes';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.itc-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.itc-modal {
  width: min(560px, 100%);
  max-height: min(90vh, 800px);
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  padding: 20px 22px 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.itc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.itc-head h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #14532d;
}
.itc-close {
  border: none;
  background: transparent;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
}
.itc-lead {
  margin: 0 0 14px;
  font-size: 0.9rem;
  color: #4b5563;
  line-height: 1.45;
}
.itc-error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.88rem;
  font-weight: 600;
}
.itc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #374151;
}
.itc-field em { font-style: normal; color: #b91c1c; }
.itc-field input,
.itc-field textarea {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.95rem;
  font-weight: 500;
  color: #111827;
}
.itc-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.itc-total {
  margin: 0 0 14px;
  font-size: 0.9rem;
  color: #374151;
}
.itc-subhead {
  margin: 0 0 8px;
  font-size: 0.95rem;
  color: #14532d;
}
.itc-allocs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.itc-alloc {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}
.itc-alloc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.itc-alloc-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #4b5563;
}
.itc-alloc-note em {
  font-style: normal;
  font-weight: 500;
  color: #9ca3af;
}
.itc-alloc-note textarea {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  color: #111827;
  resize: vertical;
  min-height: 48px;
}
.itc-alloc-label { font-size: 0.88rem; font-weight: 600; color: #111827; }
.itc-hhmm {
  width: 88px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 8px;
  font-variant-numeric: tabular-nums;
}
.itc-alloc-sum {
  margin: 0 0 14px;
  font-size: 0.85rem;
  color: #6b7280;
  font-weight: 600;
}
.itc-alloc-sum.bad { color: #dc2626; }
.itc-attest {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 0.85rem;
  color: #374151;
  margin-bottom: 16px;
}
.itc-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.itc-btn {
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  border: 1px solid #d1d5db;
  background: #fff;
}
.itc-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.itc-btn.ghost { color: #374151; }
.itc-btn.primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}
</style>
