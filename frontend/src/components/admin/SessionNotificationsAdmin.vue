<template>
  <div class="sna">
    <div class="sna-head">
      <h4>Session notifications</h4>
      <p class="hint">
        Enable channels one at a time. Platform minimums always apply; clients can opt out of optional
        reminders and “session changes and important updates,” but not required floors.
      </p>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="muted">Loading…</div>

    <template v-else-if="settings">
      <section class="sna-section">
        <h5>Channels</h5>
        <div class="sna-chips">
          <label v-for="ch in channelKeys" :key="ch" class="sna-chip" :class="{ locked: isChannelLocked(ch) }">
            <input
              type="checkbox"
              :checked="!!settings.channelsEnabled?.[ch]"
              :disabled="isChannelLocked(ch) || platformDisabled(ch)"
              @change="toggleChannel(ch, $event.target.checked)"
            />
            <span>{{ channelLabel(ch) }}</span>
            <small v-if="platformDisabled(ch)" class="muted">platform off</small>
            <small v-else-if="isChannelLocked(ch)" class="muted">required</small>
          </label>
        </div>
        <p class="hint">Phone = automated voice (scaffold until dialer is production-ready). SMS requires client opt-in.</p>
      </section>

      <section class="sna-section">
        <h5>Booking confirmation</h5>
        <label class="check">
          <input v-model="settings.bookingConfirmation.enabled" type="checkbox" />
          Send confirmation after booking (Yes/No)
        </label>
        <label class="check">
          <input v-model="settings.bookingConfirmation.requireResponse" type="checkbox" :disabled="!settings.bookingConfirmation.enabled" />
          Require Yes/No response
        </label>
      </section>

      <section class="sna-section">
        <h5>Standard reminder (required floor for this tenant)</h5>
        <label class="check">
          <input v-model="settings.standardReminder.enabled" type="checkbox" />
          Enable standard reminder
        </label>
        <label class="check">
          <input v-model="settings.standardReminder.askConfirmation" type="checkbox" />
          Include confirmation prompt (Y / N / R)
        </label>
        <p class="hint">
          Clients reply <strong>Y</strong> to confirm, <strong>N</strong> to cancel (runs cancel policy),
          <strong>R</strong> to request reschedule — updates the appointment in booking automatically.
        </p>
        <div class="sna-row-fields">
          <label>
            Amount
            <input v-model.number="settings.standardReminder.offsetValue" class="input" type="number" min="0" />
          </label>
          <label>
            Unit
            <select v-model="settings.standardReminder.offsetUnit" class="input">
              <option value="days">Days before</option>
              <option value="hours">Hours before</option>
              <option value="minutes">Minutes before</option>
            </select>
          </label>
        </div>
      </section>

      <section class="sna-section">
        <h5>Additional reminders</h5>
        <ul class="sna-list">
          <li v-for="(rule, idx) in settings.additionalReminders" :key="rule.id || idx" class="sna-item">
            <label class="check">
              <input v-model="rule.enabled" type="checkbox" />
              <strong>{{ rule.label || 'Reminder' }}</strong>
            </label>
            <span class="muted">
              {{ rule.offsetValue }} {{ rule.offsetUnit }} · {{ rule.channel }}
              <template v-if="rule.askConfirmation"> · asks confirm</template>
            </span>
          </li>
        </ul>
        <button type="button" class="btn btn-secondary btn-sm" @click="addAdditional">+ Add reminder rule</button>
      </section>

      <section class="sna-section">
        <h5>Provider-pushed session updates</h5>
        <label class="check">
          <input v-model="settings.changeNotify.enabled" type="checkbox" />
          Allow Push Session Update (never auto-send on every edit)
        </label>
        <label>
          Notification buffer (minutes)
          <select v-model.number="settings.changeNotify.bufferMinutes" class="input">
            <option :value="15">15</option>
            <option :value="30">30</option>
            <option :value="60">60</option>
          </select>
        </label>
        <label class="check">
          <input v-model="settings.changeNotify.respectUserOptOut" type="checkbox" />
          Respect “Send me session changes and important updates”
        </label>
      </section>

      <div class="sna-actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save notification settings' }}
        </button>
      </div>

      <p v-if="platformNote" class="hint audit">{{ platformNote }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const settings = ref(null);

const channelKeys = ['in_app', 'email', 'sms', 'phone'];

const channelLabel = (ch) => ({
  in_app: 'In-app',
  email: 'Email',
  sms: 'SMS / text',
  phone: 'Phone call'
}[ch] || ch);

const platformDisabled = (ch) => {
  const p = settings.value?.platform?.channels?.[ch];
  return String(p || '').toLowerCase() === 'disabled';
};

const isChannelLocked = (ch) => {
  if (platformDisabled(ch)) return true;
  return settings.value?.platform?.allowTenantDisable?.[ch] === false;
};

const platformNote = computed(() => {
  const mins = settings.value?.platform?.minRules || [];
  if (!mins.length) return '';
  return `Platform minimums: ${mins.map((r) => r.label || `${r.offsetValue} ${r.offsetUnit} ${r.channel}`).join('; ')}.`;
});

const load = async () => {
  const aid = Number(props.agencyId || 0);
  if (!aid) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/tenant-booking/agencies/${aid}/session-notifications`);
    const s = r.data?.settings || {};
    settings.value = {
      channelsEnabled: s.channelsEnabled || { in_app: true, email: true, sms: false, phone: false },
      bookingConfirmation: {
        enabled: false,
        requireResponse: true,
        channels: ['email'],
        ...(s.bookingConfirmation || {})
      },
      standardReminder: {
        enabled: true,
        offsetValue: 24,
        offsetUnit: 'hours',
        channels: ['email'],
        required: true,
        askConfirmation: true,
        ...(s.standardReminder || {})
      },
      additionalReminders: Array.isArray(s.additionalReminders) ? s.additionalReminders : [],
      changeNotify: {
        enabled: true,
        bufferMinutes: 15,
        channels: ['email'],
        respectUserOptOut: true,
        ...(s.changeNotify || {})
      },
      messageTemplates: s.messageTemplates || {},
      platform: s.platform || null
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
};

const toggleChannel = (ch, on) => {
  if (!settings.value) return;
  settings.value.channelsEnabled = { ...settings.value.channelsEnabled, [ch]: !!on };
};

const addAdditional = () => {
  if (!settings.value) return;
  settings.value.additionalReminders.push({
    id: `custom_${Date.now()}`,
    label: 'Custom reminder',
    offsetValue: 2,
    offsetUnit: 'hours',
    channel: 'email',
    recipient: 'client',
    askConfirmation: false,
    enabled: true
  });
};

const save = async () => {
  const aid = Number(props.agencyId || 0);
  saving.value = true;
  error.value = '';
  try {
    const r = await api.put(`/tenant-booking/agencies/${aid}/session-notifications`, settings.value);
    const s = r.data?.settings;
    if (s) {
      settings.value = {
        ...settings.value,
        channelsEnabled: s.channelsEnabled,
        bookingConfirmation: { ...settings.value.bookingConfirmation, ...s.bookingConfirmation },
        standardReminder: { ...settings.value.standardReminder, ...s.standardReminder },
        additionalReminders: s.additionalReminders || [],
        changeNotify: { ...settings.value.changeNotify, ...s.changeNotify },
        platform: s.platform
      };
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

watch(() => props.agencyId, () => { void load(); });
onMounted(() => { void load(); });
</script>

<style scoped>
.sna { display: flex; flex-direction: column; gap: 12px; }
.sna-section { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fff; }
.sna-section h5 { margin: 0 0 8px; }
.sna-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.sna-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; }
.sna-chip.locked { opacity: 0.85; }
.sna-row-fields { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.sna-row-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; font-weight: 600; }
.sna-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sna-item { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 8px; }
.check { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; margin: 6px 0; }
.hint { color: #64748b; font-size: 0.85rem; margin: 0; }
.hint.audit { margin-top: 4px; }
.muted { color: #64748b; font-size: 0.8rem; }
.error { color: #b91c1c; }
.input { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; }
.sna-actions { display: flex; justify-content: flex-end; }
</style>
