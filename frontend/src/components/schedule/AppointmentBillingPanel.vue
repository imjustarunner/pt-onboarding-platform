<template>
  <div class="abp" data-testid="appointment-billing-panel">
    <div class="abp-overview">
      <div class="abp-stat">
        <div class="abp-stat-k">Billing status</div>
        <div class="abp-stat-v" :class="ready ? 'ok' : ''">{{ ready ? 'Ready to bill' : 'Needs details' }}</div>
        <div class="abp-stat-h">{{ readyHint }}</div>
      </div>
      <div class="abp-stat">
        <div class="abp-stat-k">Primary code</div>
        <div class="abp-stat-v">{{ primaryServiceCode || serviceCode || '—' }}</div>
        <div class="abp-stat-h">{{ serviceName || 'No primary code selected' }}</div>
      </div>
      <div class="abp-stat">
        <div class="abp-stat-k">Add-ons</div>
        <div class="abp-stat-v">{{ addonLabel }}</div>
        <div class="abp-stat-h">Only true add-on codes (e.g. 99051, 90875)</div>
      </div>
      <div class="abp-stat">
        <div class="abp-stat-k">Claim</div>
        <div class="abp-stat-v">{{ claimId ? `#${claimId}` : 'Not created' }}</div>
        <div class="abp-stat-h">{{ claimId ? 'Linked claim' : 'Open workspace to create' }}</div>
      </div>
    </div>

    <div class="abp-edit">
      <div class="abp-field">
        <label class="abp-label">Primary service code</label>
        <select
          class="abp-input"
          :value="primaryServiceCode"
          :disabled="disabled || !primaryCodeOptions.length"
          @change="emit('update:primaryServiceCode', String($event.target.value || ''))"
        >
          <option value="">Select primary code…</option>
          <option v-for="opt in primaryCodeOptions" :key="`abp-pri-${opt.code}`" :value="opt.code">
            {{ opt.label || opt.code }}
          </option>
        </select>
      </div>
      <div class="abp-field">
        <label class="abp-label">Add-on service codes</label>
        <div class="abp-addons">
          <label v-for="opt in addonCodeOptions" :key="`abp-addon-${opt.code}`" class="abp-check">
            <input
              type="checkbox"
              :checked="addonSet.has(opt.code)"
              :disabled="disabled"
              @change="toggleAddon(opt.code)"
            />
            <span>{{ opt.label || opt.code }}</span>
          </label>
          <p v-if="!addonCodeOptions.length" class="abp-muted">No add-on codes for this tenant.</p>
        </div>
      </div>
    </div>

    <div class="abp-details">
      <div class="abp-detail">
        <span class="abp-detail-k">Service date</span>
        <span class="abp-detail-v">{{ serviceDateLabel || '—' }}</span>
      </div>
      <div class="abp-detail">
        <span class="abp-detail-k">Start / end</span>
        <span class="abp-detail-v">{{ timeRangeLabel || '—' }}</span>
      </div>
      <div class="abp-detail">
        <span class="abp-detail-k">Place of service</span>
        <span class="abp-detail-v">{{ locationLabel || modalityLabel || '—' }}</span>
      </div>
      <div class="abp-detail">
        <span class="abp-detail-k">Rendering provider</span>
        <span class="abp-detail-v">{{ providerName || '—' }}</span>
      </div>
      <div class="abp-detail">
        <span class="abp-detail-k">Duration</span>
        <span class="abp-detail-v">{{ durationLabel || '—' }}</span>
      </div>
    </div>

    <aside class="abp-side">
      <div class="abp-side-title">Claim summary</div>
      <p class="abp-side-note">
        Primary and add-on codes can be set here, on the Schedule tab, or later on the clinical note.
      </p>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!claimId && !clinicalSessionId"
        @click="emit('open-claim')"
      >
        {{ claimId ? 'Open claim' : 'Open billing / claim' }}
      </button>
    </aside>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { isAddonServiceCode } from '../../config/practiceCategories.js';

const props = defineProps({
  serviceLabel: { type: String, default: '' },
  locationLabel: { type: String, default: '' },
  modalityLabel: { type: String, default: '' },
  providerName: { type: String, default: '' },
  serviceDateLabel: { type: String, default: '' },
  timeRangeLabel: { type: String, default: '' },
  durationLabel: { type: String, default: '' },
  claimId: { type: [Number, String], default: 0 },
  clinicalSessionId: { type: [Number, String], default: 0 },
  primaryServiceCode: { type: String, default: '' },
  addonServiceCodes: { type: Array, default: () => [] },
  serviceCodeOptions: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['open-claim', 'update:primaryServiceCode', 'update:addonServiceCodes']);

const serviceCode = computed(() => {
  const s = String(props.serviceLabel || '');
  const m = s.match(/^([A-Z0-9]+)\s*·/i);
  return m ? m[1] : '';
});
const serviceName = computed(() => {
  const s = String(props.serviceLabel || '');
  if (!s) return '';
  const parts = s.split('·').map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' · ') : s;
});
const primaryCodeOptions = computed(() =>
  (props.serviceCodeOptions || []).filter((row) => !isAddonServiceCode(row.code, row))
);
const addonCodeOptions = computed(() =>
  (props.serviceCodeOptions || []).filter((row) => isAddonServiceCode(row.code, row))
);
const addonSet = computed(
  () => new Set((props.addonServiceCodes || []).map((c) => String(c || '').toUpperCase()).filter(Boolean))
);
const addonLabel = computed(() => {
  const list = Array.from(addonSet.value);
  return list.length ? list.join(', ') : '—';
});
const ready = computed(() => !!(props.primaryServiceCode || serviceCode.value || props.serviceLabel)
  && !!(props.locationLabel || props.modalityLabel));
const readyHint = computed(() => (
  ready.value
    ? 'Core billing details are present for this session.'
    : 'Select a primary service code and location on Schedule or here.'
));

function toggleAddon(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return;
  const next = new Set(addonSet.value);
  if (next.has(c)) next.delete(c);
  else next.add(c);
  emit('update:addonServiceCodes', Array.from(next.values()));
}
</script>

<style scoped>
.abp {
  display: grid;
  grid-template-columns: 1fr minmax(200px, 240px);
  gap: 14px;
  align-items: start;
}
.abp-overview {
  grid-column: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.abp-edit {
  grid-column: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.abp-field { display: flex; flex-direction: column; gap: 6px; }
.abp-label {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.abp-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.abp-addons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 140px;
  overflow: auto;
}
.abp-check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
.abp-stat {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.abp-stat-k {
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.abp-stat-v { margin-top: 4px; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.abp-stat-v.ok { color: #047857; }
.abp-stat-h { margin-top: 2px; font-size: 0.75rem; color: #64748b; }
.abp-details {
  grid-column: 1;
  display: grid;
  gap: 8px;
}
.abp-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.88rem;
}
.abp-detail-k { color: #64748b; }
.abp-detail-v { font-weight: 600; color: #0f172a; text-align: right; }
.abp-side {
  grid-column: 2;
  grid-row: 1 / span 3;
  padding: 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #f8fafc;
}
.abp-side-title { font-weight: 800; margin-bottom: 8px; }
.abp-side-note { font-size: 0.82rem; opacity: 0.85; margin: 0 0 12px; }
.abp-muted { margin: 0; font-size: 0.8rem; color: #64748b; }
@media (max-width: 900px) {
  .abp { grid-template-columns: 1fr; }
  .abp-side { grid-column: 1; grid-row: auto; }
}
</style>
