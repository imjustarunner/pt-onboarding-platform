<template>
  <div v-if="open" class="ubp-backdrop" @click.self="emitClose">
    <aside class="ubp-panel" role="dialog" aria-labelledby="ubp-title">
      <header class="ubp-head">
        <div>
          <h2 id="ubp-title">Book session</h2>
          <p class="ubp-sub">{{ slotLabel }}</p>
        </div>
        <button type="button" class="ubp-close" aria-label="Close" @click="emitClose">×</button>
      </header>

      <div class="ubp-body">
        <div v-if="error" class="ubp-error">{{ error }}</div>
        <div v-if="loading" class="muted">Loading booking options…</div>

        <template v-else>
          <label class="lbl">Service</label>
          <select v-model.number="tenantServiceId" class="input" @change="onServiceChange">
            <option :value="0">Select a service…</option>
            <option v-for="s in services" :key="s.id" :value="s.id">
              {{ serviceOptionLabel(s) }}
            </option>
          </select>

          <label class="lbl" style="margin-top: 10px;">Provider</label>
          <select v-model.number="providerUserId" class="input" @change="onProviderChange">
            <option :value="0">{{ providers.length ? 'Select provider…' : 'Current user / any' }}</option>
            <option v-for="p in providers" :key="p.userId" :value="p.userId">
              {{ providerLabel(p) }}
            </option>
          </select>

          <label class="lbl" style="margin-top: 10px;">Client id (optional)</label>
          <input v-model.number="clientId" class="input" type="number" min="0" placeholder="Client id" @change="onClientChange" />

          <div class="ubp-mode" style="margin-top: 10px;">
            Mode: <strong>{{ participantMode }}</strong>
            <span class="muted"> (becomes multi when more than one client participant is added later)</span>
          </div>

          <template v-if="Number(clientId || 0) > 0">
            <label class="lbl" style="margin-top: 10px;">Package entitlement</label>
            <select v-model.number="packageEntitlementId" class="input">
              <option :value="0">Self-pay / no package</option>
              <option v-for="e in entitlements" :key="e.id" :value="e.id">
                {{ e.packageName || `Package #${e.packageId}` }} — {{ e.sessionsRemaining }} left
                <template v-if="e.sessionsReserved">({{ e.sessionsReserved }} reserved)</template>
              </option>
            </select>
            <p v-if="!entitlements.length" class="muted" style="margin: 4px 0 0;">No active packages for this client.</p>
          </template>

          <label class="lbl" style="margin-top: 10px;">Notes</label>
          <textarea v-model="notes" class="input" rows="3" placeholder="Optional notes…" />

          <div class="ubp-reminders muted" style="margin-top: 10px;">
            Session notifications follow platform minimums + tenant channel rules (confirmation, standard &amp; additional reminders).
            SMS/phone only with opt-in. Providers push time/location changes intentionally via Push Session Update (buffered).
          </div>
        </template>
      </div>

      <footer class="ubp-foot">
        <button type="button" class="btn btn-secondary" @click="emitClose">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="submitting || !canSubmit" @click="submit">
          {{ submitting ? 'Booking…' : 'Book appointment' }}
        </button>
      </footer>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], required: true },
  providerUserIdDefault: { type: [Number, String], default: 0 },
  startAt: { type: String, default: '' },
  endAt: { type: String, default: '' },
  dayLabel: { type: String, default: '' }
});

const emit = defineEmits(['close', 'booked']);

const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const services = ref([]);
const providers = ref([]);
const entitlements = ref([]);
const tenantServiceId = ref(0);
const providerUserId = ref(0);
const clientId = ref(0);
const packageEntitlementId = ref(0);
const notes = ref('');

const slotLabel = computed(() => {
  const day = String(props.dayLabel || '').trim();
  const start = String(props.startAt || '').trim();
  const end = String(props.endAt || '').trim();
  if (day && start) return `${day} · ${start}${end ? ` – ${end}` : ''}`;
  return start || 'Selected slot';
});

const participantMode = computed(() => (Number(clientId.value || 0) > 0 ? 'individual' : 'individual'));
const canSubmit = computed(() => Number(props.agencyId || 0) > 0 && Number(tenantServiceId.value || 0) > 0 && !!props.startAt && !!props.endAt);

const providerLabel = (p) => {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return name || p.email || `User #${p.userId}`;
};

const serviceOptionLabel = (s) => {
  const code = String(s?.serviceCode || '').trim();
  const name = String(s?.name || 'Service').trim();
  const mins = Number(s?.defaultDurationMinutes || 0) || 0;
  return `${code ? `${code} · ` : ''}${name}${mins ? ` (${mins}m)` : ''}`;
};

const emitClose = () => emit('close');

const loadOptions = async () => {
  const aid = Number(props.agencyId || 0);
  if (!aid || !props.open) return;
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (tenantServiceId.value) params.serviceId = tenantServiceId.value;
    if (providerUserId.value) params.providerId = providerUserId.value;
    if (clientId.value) params.clientId = clientId.value;
    const r = await api.get(`/tenant-booking/agencies/${aid}/booking-options`, { params });
    services.value = r.data?.services || [];
    providers.value = r.data?.providers || [];
    entitlements.value = r.data?.packagePreview?.entitlements || [];
    if (packageEntitlementId.value && !entitlements.value.some((e) => Number(e.id) === Number(packageEntitlementId.value))) {
      packageEntitlementId.value = 0;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load options';
  } finally {
    loading.value = false;
  }
};

const onServiceChange = () => { void loadOptions(); };
const onProviderChange = () => { void loadOptions(); };
const onClientChange = () => {
  packageEntitlementId.value = 0;
  void loadOptions();
};

const submit = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const participants = Number(clientId.value || 0) > 0
      ? [{ role: 'client', clientId: Number(clientId.value), isBillingResponsible: true }]
      : [];
    const r = await api.post('/appointments', {
      agencyId: Number(props.agencyId),
      tenantServiceId: Number(tenantServiceId.value),
      providerUserId: Number(providerUserId.value || props.providerUserIdDefault || 0) || undefined,
      startAt: props.startAt,
      endAt: props.endAt,
      notes: notes.value || null,
      participants,
      packageEntitlementId: Number(packageEntitlementId.value || 0) || undefined,
      source: 'staff_grid',
      createProviderScheduleEvent: true
    });
    emit('booked', r.data?.appointment || null);
    emitClose();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Booking failed';
  } finally {
    submitting.value = false;
  }
};

watch(
  () => [props.open, props.agencyId],
  ([isOpen]) => {
    if (!isOpen) return;
    tenantServiceId.value = 0;
    providerUserId.value = Number(props.providerUserIdDefault || 0) || 0;
    clientId.value = 0;
    packageEntitlementId.value = 0;
    entitlements.value = [];
    notes.value = '';
    void loadOptions();
  }
);
</script>

<style scoped>
.ubp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 10050;
  display: flex;
  justify-content: flex-end;
}
.ubp-panel {
  width: min(420px, 100%);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 28px rgba(15, 23, 42, 0.18);
}
.ubp-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
}
.ubp-head h2 { margin: 0; font-size: 1.2rem; }
.ubp-sub { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
.ubp-close {
  border: none;
  background: transparent;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.ubp-body { padding: 16px 18px; overflow: auto; flex: 1; }
.ubp-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #e5e7eb;
  background: #f8fafc;
}
.lbl { display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 4px; }
.input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.ubp-error {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 0.85rem;
}
.muted { color: #64748b; font-size: 0.82rem; }
</style>
