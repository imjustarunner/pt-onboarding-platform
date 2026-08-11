<template>
  <div class="roi-expiry-editor" :class="{ readonly }">
    <div class="roi-expiry-head">
      <div>
        <div class="roi-expiry-title">ROI expiration</div>
        <div class="roi-expiry-sub muted">
          Sets the client profile ROI date used for school staff portal access.
        </div>
      </div>
      <span v-if="savedExpiresAt" class="roi-expiry-saved-pill" :class="{ expired: isExpired }">
        {{ isExpired ? 'Expired' : 'Active' }} · {{ formatRoiDateLabel(savedExpiresAt) }}
      </span>
    </div>

    <template v-if="readonly">
      <div class="roi-expiry-readonly">
        <span class="label">Expires</span>
        <span>{{ savedExpiresAt ? formatRoiDateLabel(savedExpiresAt) : 'Not set' }}</span>
      </div>
    </template>

    <template v-else>
      <div class="roi-expiry-grid">
        <label class="roi-expiry-field">
          <span class="roi-expiry-label">ROI effective date</span>
          <input v-model="effectiveDate" type="date" class="roi-expiry-input" :disabled="saving" />
        </label>

        <fieldset class="roi-expiry-field roi-expiry-terms">
          <legend class="roi-expiry-label">Term</legend>
          <label class="roi-term-option">
            <input v-model="termMode" type="radio" value="36" :disabled="saving" />
            <span>36 months <span class="muted tiny">(paper packet default)</span></span>
          </label>
          <label class="roi-term-option">
            <input v-model="termMode" type="radio" value="12" :disabled="saving" />
            <span>12 months</span>
          </label>
          <label class="roi-term-option">
            <input v-model="termMode" type="radio" value="custom" :disabled="saving" />
            <span>Custom expiration date</span>
          </label>
        </fieldset>

        <label v-if="termMode === 'custom'" class="roi-expiry-field">
          <span class="roi-expiry-label">Expiration date</span>
          <input v-model="customExpiresAt" type="date" class="roi-expiry-input" :disabled="saving" />
        </label>

        <div v-else class="roi-expiry-preview">
          Expires <strong>{{ formatRoiDateLabel(computedExpiresAt) }}</strong>
        </div>
      </div>

      <div class="roi-expiry-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="saving || !canSave"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save ROI expiration' }}
        </button>
        <span v-if="saveMsg" class="roi-expiry-msg">{{ saveMsg }}</span>
        <span v-else-if="saveError" class="error small">{{ saveError }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import {
  PAPER_PACKET_DEFAULT_ROI_TERM_MONTHS,
  computeRoiExpiresAtYmd,
  formatRoiDateLabel,
  normalizeYmd,
  todayYmd
} from '../../utils/roiExpiryTerm.js';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  roiExpiresAt: { type: String, default: null },
  readonly: { type: Boolean, default: false }
});
const emit = defineEmits(['saved']);

const saving = ref(false);
const saveMsg = ref('');
const saveError = ref('');
const savedExpiresAt = ref(null);
const effectiveDate = ref(todayYmd());
const termMode = ref(String(PAPER_PACKET_DEFAULT_ROI_TERM_MONTHS));
const customExpiresAt = ref('');

const computedExpiresAt = computed(() => {
  if (termMode.value === 'custom') return normalizeYmd(customExpiresAt.value);
  const months = Number(termMode.value || 0);
  return computeRoiExpiresAtYmd(effectiveDate.value, months);
});

const canSave = computed(() => {
  const next = computedExpiresAt.value;
  if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return false;
  return next !== normalizeYmd(savedExpiresAt.value);
});

const isExpired = computed(() => {
  const ymd = normalizeYmd(savedExpiresAt.value);
  if (!ymd) return false;
  return ymd < todayYmd();
});

function syncFromProps() {
  savedExpiresAt.value = normalizeYmd(props.roiExpiresAt) || null;
  saveMsg.value = '';
  saveError.value = '';
  if (savedExpiresAt.value) {
    termMode.value = 'custom';
    customExpiresAt.value = savedExpiresAt.value;
    effectiveDate.value = todayYmd();
    return;
  }
  effectiveDate.value = todayYmd();
  termMode.value = String(PAPER_PACKET_DEFAULT_ROI_TERM_MONTHS);
  customExpiresAt.value = computeRoiExpiresAtYmd(effectiveDate.value, PAPER_PACKET_DEFAULT_ROI_TERM_MONTHS);
}

async function save() {
  const clientId = Number(props.clientId || 0);
  const roiExpiresAt = computedExpiresAt.value;
  if (!clientId || !roiExpiresAt) return;

  saving.value = true;
  saveMsg.value = '';
  saveError.value = '';
  try {
    const { data } = await api.put(`/clients/${clientId}/onboarding/roi-expiration`, {
      roi_expires_at: roiExpiresAt,
      roi_effective_date: normalizeYmd(effectiveDate.value) || null,
      roi_term_months: termMode.value === 'custom' ? null : Number(termMode.value)
    }, { skipGlobalLoading: true });
    savedExpiresAt.value = normalizeYmd(data?.client?.roi_expires_at || roiExpiresAt) || roiExpiresAt;
    saveMsg.value = 'ROI expiration saved';
    emit('saved', data);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save ROI expiration';
  } finally {
    saving.value = false;
  }
}

watch(() => [props.clientId, props.roiExpiresAt], syncFromProps, { immediate: true });

watch(termMode, (mode) => {
  if (mode === 'custom') {
    if (!customExpiresAt.value) {
      customExpiresAt.value = computeRoiExpiresAtYmd(effectiveDate.value, PAPER_PACKET_DEFAULT_ROI_TERM_MONTHS);
    }
    return;
  }
  customExpiresAt.value = computeRoiExpiresAtYmd(effectiveDate.value, Number(mode));
});

watch(effectiveDate, (next) => {
  if (termMode.value === 'custom') return;
  customExpiresAt.value = computeRoiExpiresAtYmd(next, Number(termMode.value));
});
</script>

<style scoped>
.roi-expiry-editor {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  padding: 12px;
  margin-bottom: 12px;
}
.roi-expiry-editor.readonly {
  background: #f8fafc;
}
.roi-expiry-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
}
.roi-expiry-title {
  font-weight: 800;
  font-size: 0.9rem;
  color: #0f172a;
}
.roi-expiry-sub {
  font-size: 0.78rem;
  margin-top: 2px;
  line-height: 1.35;
}
.roi-expiry-saved-pill {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  white-space: nowrap;
}
.roi-expiry-saved-pill.expired {
  background: #fee2e2;
  color: #b91c1c;
}
.roi-expiry-grid {
  display: grid;
  gap: 12px;
}
.roi-expiry-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.roi-expiry-terms {
  border: none;
  margin: 0;
  padding: 0;
}
.roi-expiry-label,
.roi-expiry-terms legend {
  font-size: 0.78rem;
  font-weight: 800;
  color: #475569;
}
.roi-expiry-input {
  max-width: 220px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 0.86rem;
}
.roi-term-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  margin-top: 6px;
  cursor: pointer;
}
.roi-expiry-preview {
  font-size: 0.84rem;
  color: #334155;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}
.roi-expiry-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.roi-expiry-msg {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0369a1;
}
.roi-expiry-readonly {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.88rem;
  padding: 8px 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.roi-expiry-readonly .label {
  font-weight: 700;
  color: #64748b;
}
.error { color: #b91c1c; }
.muted { color: #64748b; }
.tiny { font-size: 0.72rem; }
.small { font-size: 0.82rem; }
</style>
