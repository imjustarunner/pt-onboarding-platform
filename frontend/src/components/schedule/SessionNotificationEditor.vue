<template>
  <div class="session-notification-editor" data-testid="session-notification-editor">
    <p>Choose the timing and channels for each reminder. Client preferences and recorded consent apply to every channel. Scheduled reminders use a 24-hour spacing rule, with an exception during the final five hours.</p>
    <p v-if="loading" role="status">Loading available notification channels…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="loadChannels">Retry</button></p>
    <fieldset v-for="(rule, index) in rules" :key="rule.id || index" class="reminder-rule" :disabled="disabled">
      <legend>Reminder {{ index + 1 }}</legend>
      <div class="reminder-rule-fields">
        <div class="reminder-channel-group" role="group" :aria-label="`Reminder ${index + 1} channels`">
          <span>Send by</span>
          <label v-for="channel in channels.filter(item => availableChannels.includes(item.id))" :key="channel.id" class="reminder-channel">
            <input type="checkbox" :checked="selectedChannels(rule).includes(channel.id)" :aria-label="`Reminder ${index + 1} ${channel.label}`" @change="toggleChannel(index, channel.id, $event.target.checked)" />{{ channel.label }}
          </label>
        </div>
        <label>When
          <select :value="rule.offsetMinutes" :aria-label="`Reminder ${index + 1} timing`" @change="selectTiming(index, $event.target.value)">
            <option v-if="!timings.some(item => item.minutes === rule.offsetMinutes)" :value="rule.offsetMinutes">{{ rule.offsetMinutes }} minutes before</option>
            <option v-for="timing in timings" :key="timing.minutes" :value="timing.minutes">{{ timing.label }} before</option>
            <option value="custom">Custom timing…</option>
          </select>
        </label>
        <label v-if="customTimings.has(rule.id || index) || !timings.some(item => item.minutes === rule.offsetMinutes)">Custom lead time (minutes)
          <input type="number" min="5" max="10080" step="1" :value="rule.offsetMinutes" :aria-label="`Reminder ${index + 1} custom minutes`" @change="update(index, { offsetMinutes: Number($event.target.value) })" />
        </label>
        <button type="button" class="btn btn-secondary btn-sm" :aria-label="`Remove reminder ${index + 1}`" @click="remove(index)">Remove</button>
      </div>
      <label class="reminder-message">Message (optional)
        <textarea :value="rule.message" rows="2" maxlength="1000" :aria-label="`Reminder ${index + 1} message`" placeholder="Leave blank to use the standard reminder message." @input="update(index, { message: $event.target.value })" />
      </label>
      <label class="reminder-confirmation"><input type="checkbox" :checked="rule.askConfirmation !== false" @change="update(index, { askConfirmation: $event.target.checked })" /> Request an RSVP if not already confirmed</label>
      <details class="reminder-preview"><summary>Preview reminder {{ index + 1 }}</summary><p>{{ preview(rule) }}</p></details>
    </fieldset>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || loading || !!error || !availableChannels.length || rules.length >= 12" @click="add">+ Add reminder</button>
    <p v-if="!loading && !error && !availableChannels.length" role="status">No additional notification channels are enabled for this agency.</p>
    <p v-if="rules.some(rule => selectedChannels(rule).includes('sms'))" class="reminder-consent">Text messages require an enabled text channel and the recipient’s recorded consent.</p>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ rules: { type: Array, default: () => [] }, agencyId: { type: Number, default: 0 }, disabled: Boolean, dateYmd: String, startTime: String, timezoneLabel: String, channelSettings: {type:Object,default:null} });
const emit = defineEmits(['update:rules']);
const loading = ref(false), error = ref(''), settings = ref(null);
let generation = 0, nextId = 0;
const channels = [{ id: 'email', label: 'Email' }, { id: 'in_app', label: 'In-app' }, { id: 'sms', label: 'Text message' }];
const customTimings = ref(new Set());
const timings = [{ minutes: 5, label: '5 minutes' }, { minutes: 15, label: '15 minutes' }, { minutes: 30, label: '30 minutes' }, { minutes: 60, label: '1 hour' }, { minutes: 120, label: '2 hours' }, { minutes: 240, label: '4 hours' }, { minutes: 300, label: '5 hours' }, { minutes: 720, label: '12 hours' }, { minutes: 1440, label: '1 day' }, { minutes: 2880, label: '2 days' }, { minutes: 4320, label: '3 days' }, { minutes: 10080, label: '1 week' }];
const availableChannels = computed(() => channels.filter(channel => {
  const current = props.channelSettings || settings.value;
  const platform = current?.platform || {};
  return ['available', 'consent_required'].includes(platform.channels?.[channel.id])
    && !([false, 0].includes(current?.channelsEnabled?.[channel.id]) && platform.allowTenantDisable?.[channel.id] !== false);
}).map(channel => channel.id));
async function loadChannels() {
  const request = ++generation; settings.value = null; error.value = ''; loading.value = true;
  try {
    const { data } = await api.get(`/tenant-booking/agencies/${props.agencyId}/session-notifications`, { skipGlobalLoading: true });
    if (request === generation) settings.value = data.settings;
  } catch { if (request === generation) error.value = 'Could not load available notification channels.'; }
  finally { if (request === generation) loading.value = false; }
}
watch(() => props.agencyId, loadChannels, { immediate: true });
function add() { emit('update:rules', [...props.rules, { id: `session-${++nextId}-${Date.now()}`, channels: [availableChannels.value[0]], offsetMinutes: 60, message: '', askConfirmation: true }]); }
function selectedChannels(rule) { return rule.channels || [rule.channel || 'email']; }
function toggleChannel(index, channel, checked) {
  const selected = selectedChannels(props.rules[index]);
  update(index, { channels: checked ? [...new Set([...selected, channel])] : selected.filter(item => item !== channel) });
}
function selectTiming(index, value) {
  if(value === 'custom') { customTimings.value = new Set([...customTimings.value, props.rules[index].id || index]); return; }
  update(index, { offsetMinutes: Number(value) });
}
function update(index, patch) { emit('update:rules', props.rules.map((row, i) => i === index ? { ...row, ...patch } : row)); }
function remove(index) { emit('update:rules', props.rules.filter((_, i) => i !== index)); }
function preview(rule) {
  if (rule.message?.trim()) return rule.message.trim();
  const wall = new Date(`${props.dateYmd}T${props.startTime || '00:00'}:00Z`);
  const when = Number.isNaN(+wall) ? 'the scheduled time' : `${new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }).format(wall)} ${props.timezoneLabel || ''}`.trim();
  return `Reminder: Appointment on ${when}.${rule.askConfirmation !== false ? ' Reply Y to confirm, N to cancel, R to request a reschedule.' : ''}`;
}
</script>
<style scoped>
.session-notification-editor { margin-top: 12px; color: #475569; }
.reminder-rule { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; margin: 12px 0; min-width: 0; }
.reminder-rule legend { padding: 0 5px; font-weight: 650; color: #1e293b; }
.reminder-rule-fields { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; }
.reminder-rule-fields > label { flex: 1; min-width: 160px; }
.reminder-channel-group{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1}.reminder-channel-group>span{width:100%;font-size:13px}.reminder-channel{display:inline-flex;gap:5px;align-items:center;white-space:nowrap}.reminder-channel input{width:16px!important;height:16px!important;margin:0!important;flex:none!important}.reminder-rule-fields input[type=number]{width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px}
label select, .reminder-message textarea { display: block; width: 100%; margin-top: 5px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px; font: inherit; background: white; color: #0f172a; box-sizing: border-box; }
.reminder-message { display: block; margin-top: 12px; }
.reminder-confirmation { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.reminder-preview { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
.reminder-preview summary { cursor: pointer; font-weight: 600; }
.reminder-consent { font-size: 13px; }
</style>
