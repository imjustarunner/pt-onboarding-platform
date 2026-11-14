<template>
  <details class="notification-preview" @toggle="open = $event.target.open">
    <summary>{{ customReminders.length ? 'Preview session notifications' : 'Preview default notifications' }}</summary>
    <p v-if="loading" role="status">Loading notification defaults…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
    <template v-else-if="settings">
      <p>Organization defaults before client preferences and consent are applied. Only reminders still in the future will be sent.</p>
      <ul v-if="rules.length">
        <li v-for="(rule, index) in rules" :key="index">
          <strong>{{ rule.timing }} · {{ rule.channelLabel }} · {{ rule.recipient === 'provider' ? 'Provider' : 'Client' }}</strong>
          <p>{{ rule.message }}</p>
          <small v-if="rule.channel === 'sms' || rule.channel === 'phone'">Requires documented consent.</small>
        </li>
      </ul>
      <p v-else>No default notifications are enabled.</p>
      <p>Client opt-outs, reminder timing, and channel preferences apply when the session is booked. This preview does not send notifications.</p>
    </template>
    <p v-else>Select an agency to preview its defaults.</p>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { dedupeSessionReminders } from '../../navigation/sessionReminderRules.js';

const props = defineProps({
  agencyId: { type: Number, default: 0 },
  customReminders: { type: Array, default: () => [] },
  dateYmd: { type: String, default: '' },
  startTime: { type: String, default: '' },
  timezoneLabel: { type: String, default: '' }
});
const open = ref(false), loading = ref(false), error = ref(''), settings = ref(null);
let request = 0;
async function load() {
  const generation = ++request;
  settings.value = null;
  error.value = '';
  loading.value = false;
  if (!open.value || !props.agencyId) return;
  loading.value = true;
  try {
    const response = await api.get(`/tenant-booking/agencies/${props.agencyId}/session-notifications`);
    if (generation === request) settings.value = response.data.settings;
  } catch {
    if (generation === request) error.value = 'Could not load notification defaults.';
  } finally {
    if (generation === request) loading.value = false;
  }
}
watch([open, () => props.agencyId], load);

const rules = computed(() => {
  const tenant = settings.value;
  if (!tenant) return [];
  const platform = tenant.platform || {};
  const wall = new Date(`${props.dateYmd}T${props.startTime || '00:00'}:00Z`);
  const when = Number.isNaN(+wall) ? 'the scheduled time' : `${new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }).format(wall)} ${props.timezoneLabel}`.trim();
  const prompt = 'Reply Y to confirm, N to cancel, R to request a reschedule.';
  const entries = [];
  function add(rule, { immediate = false, confirmation = false, ruleKey = 'tenant_standard', kind = 'standard_reminder' } = {}) {
    const channels = rule.channels || [rule.channel || 'email'];
    for (const channel of channels) {
      const platformMode = String(platform.channels?.[channel] || 'disabled').toLowerCase();
      if (platformMode === 'disabled') continue;
      if ([false, 0].includes(tenant.channelsEnabled?.[channel]) && platform.allowTenantDisable?.[channel] !== false) continue;
      const unit = rule.offsetUnit || 'hours';
      const value = Number(rule.offsetValue ?? 24);
      const timing = immediate ? 'After booking' : `${value} ${unit} before`;
      const askConfirmation = confirmation ? rule.requireResponse !== false : rule.askConfirmation !== false;
      const message = rule.message || (confirmation
        ? `Please confirm your appointment "Appointment" on ${when}. ${prompt}`
        : `Reminder: Appointment on ${when}.${askConfirmation ? ` ${prompt}` : ''}`);
      const offsetMinutes = immediate ? 0 : value * (unit === 'days' ? 1440 : unit === 'minutes' ? 1 : 60);
      entries.push({ ...rule, kind, ruleKey, offsetMinutes, recipientRole: rule.recipient || 'client', sendImmediately: immediate,
        requiresConfirmation: askConfirmation, isRequired: rule.required === true,
        channel, timing, message, channelLabel: ({ in_app: 'In-app', email: 'Email', sms: 'Text', phone: 'Phone' })[channel] || channel });
    }
  }
  for (const rule of props.customReminders.length ? [] : platform.minRules || []) add(rule, { ruleKey: `platform:${rule.label || 'minimum'}` });
  if (tenant.bookingConfirmation?.enabled) add(tenant.bookingConfirmation, { immediate: true, confirmation: true, kind: 'confirmation', ruleKey: 'booking_confirmation' });
  if(props.customReminders.length || Array.isArray(tenant.reminderRules)) {
    for(const rule of props.customReminders.length ? props.customReminders : tenant.reminderRules) add({...rule,offsetValue:rule.offsetMinutes,offsetUnit:'minutes'},{ruleKey:`${props.customReminders.length?'appointment_custom':'organization'}:${rule.id}`});
  } else {
    if (tenant.standardReminder?.enabled !== false) add(tenant.standardReminder || {});
    for (const rule of tenant.additionalReminders || []) if (rule.enabled !== false) add(rule, { kind: 'additional_reminder', ruleKey: String(rule.id || rule.label || rule.channel) });
  }
  return dedupeSessionReminders(entries);
});
</script>

<style scoped>
.notification-preview { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 16px; color: #334155; }
summary { cursor: pointer; font-weight: 600; }
ul { padding-left: 20px; }
li + li { margin-top: 16px; }
p { margin: 8px 0; }
</style>
