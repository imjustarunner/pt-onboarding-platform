<template>
  <section class="type-settings-panel">
    <div class="settings-toolbar">
      <div>
        <h2>{{ focusedType ? focusedEntry?.label || 'Notification settings' : 'Notification type settings' }}</h2>
        <p>Choose how each kind of notification reaches you. Global channel switches still apply.</p>
      </div>
      <button v-if="!focusedType" class="secondary-btn" type="button" :disabled="savingPreset" @click="applyRecommended">
        {{ savingPreset ? 'Applying…' : 'Use recommended defaults' }}
      </button>
    </div>

    <div v-if="loading" class="settings-state">Loading notification settings…</div>
    <div v-else-if="error" class="settings-error">{{ error }}</div>
    <template v-else>
      <div v-if="!focusedType" class="settings-filters">
        <input v-model.trim="search" type="search" placeholder="Search notification types…" aria-label="Search notification types" />
        <select v-model="category" aria-label="Filter settings by category">
          <option value="all">All categories</option>
          <option v-for="item in catalog.categories" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </div>

      <div class="global-note">
        <span>Email {{ catalog.global.email ? 'on' : 'off' }}</span>
        <span>SMS {{ catalog.global.sms ? 'on' : 'off' }}</span>
        <span>Push {{ catalog.global.push ? 'on' : 'off' }}</span>
        <span>Digest {{ catalog.global.digestEmail ? `email at ${catalog.global.digestTime}` : `in-app at ${catalog.global.digestTime}` }}</span>
      </div>
      <p v-if="catalog.agencyPolicies?.length" class="agency-policy-summary">
        Agency policy is applied using the notification's source agency.
        <span v-for="policy in catalog.agencyPolicies" :key="policy.agencyId">
          {{ policy.agencyName }}: {{ policy.enforceDefaults ? 'enforced defaults' : (policy.userEditable ? 'account choices allowed' : 'managed settings') }}
        </span>
      </p>

      <div class="type-list">
        <article v-for="entry in visibleTypes" :key="entry.type" class="type-card" :data-type="entry.type">
          <div class="type-card-header">
            <span class="type-icon" :style="{ backgroundColor: `${entry.color}18`, color: entry.color }">{{ entry.icon }}</span>
            <div class="type-name">
              <strong>{{ entry.label }}</strong>
              <span>{{ entry.categoryLabel }}</span>
            </div>
            <span v-if="entry.locked" class="locked-badge" :title="entry.lockReason">{{ entry.required ? 'Required' : 'Managed' }}</span>
            <button class="text-btn" type="button" :disabled="savingType === entry.type" @click="resetType(entry)">Reset</button>
          </div>

          <p v-if="entry.lockReason" class="policy-note">{{ entry.lockReason }}</p>
          <div class="channel-grid">
            <label v-for="channel in channels" :key="channel.key" :class="['channel-toggle', { unavailable: !entry.capabilities[channel.key] }]">
              <input
                type="checkbox"
                :checked="entry.effective[channel.key]"
                :disabled="savingType === entry.type || !entry.capabilities[channel.key] || channelLocked(entry, channel.key) || masterDisabled(channel.key)"
                @change="setChannel(entry, channel.key, $event.target.checked)"
              />
              <span>{{ channel.label }}</span>
              <small v-if="!entry.capabilities[channel.key]">Not available</small>
              <small v-else-if="masterDisabled(channel.key)">Global switch is off</small>
            </label>
          </div>

          <div v-if="entry.effective.toast && entry.capabilities.toast" class="duration-row">
            <label>
              Toast duration
              <select :value="entry.effective.toastDurationMode" @change="setDurationMode(entry, $event.target.value)">
                <option value="timed">Auto-dismiss</option>
                <option value="dismissable">Until dismissed</option>
              </select>
            </label>
            <label v-if="entry.effective.toastDurationMode === 'timed'">
              Seconds
              <input
                type="number"
                min="3"
                max="120"
                :value="entry.effective.toastDurationSeconds || 8"
                @change="setDuration(entry, $event.target.value)"
              />
            </label>
          </div>
        </article>
      </div>
      <div v-if="visibleTypes.length === 0" class="settings-state">No notification types match your search.</div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  focusedType: { type: String, default: null },
  agencyId: { type: [Number, String], default: null }
});
const emit = defineEmits(['changed']);

const loading = ref(true);
const error = ref('');
const catalog = ref({ categories: [], types: [], global: {}, agencyPolicies: [] });
const search = ref('');
const category = ref('all');
const savingType = ref(null);
const savingPreset = ref(false);
const channels = [
  { key: 'inApp', label: 'In-app' },
  { key: 'toast', label: 'Toast' },
  { key: 'sound', label: 'Sound' },
  { key: 'digest', label: 'Daily digest' },
  { key: 'push', label: 'Browser push' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' }
];

const focusedEntry = computed(() => catalog.value.types.find((entry) => entry.type === props.focusedType));
const visibleTypes = computed(() => {
  let list = catalog.value.types || [];
  if (props.focusedType) return list.filter((entry) => entry.type === props.focusedType);
  if (category.value !== 'all') list = list.filter((entry) => entry.category === category.value);
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter((entry) => `${entry.label} ${entry.categoryLabel} ${entry.type}`.toLowerCase().includes(q));
  }
  return list;
});

const masterDisabled = (channel) => {
  if (channel === 'email') return catalog.value.global.email === false;
  if (channel === 'sms') return catalog.value.global.sms === false;
  if (channel === 'push') return catalog.value.global.push === false;
  if (channel === 'sound') return catalog.value.global.sound === false;
  return false;
};

const channelLocked = (entry, channel) => {
  if (entry.digestOnly) return true;
  if (channel === 'inApp' && entry.locked) return true;
  return entry.locked && String(entry.lockReason || '').includes('managed by the agency');
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/notifications/catalog', { params: props.agencyId ? { agencyId: props.agencyId } : undefined });
    catalog.value = data || { categories: [], types: [], global: {} };
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load notification settings.';
  } finally {
    loading.value = false;
  }
};

const save = async (entry, payload) => {
  savingType.value = entry.type;
  error.value = '';
  try {
    const { data } = await api.patch(`/notifications/preferences/types/${encodeURIComponent(entry.type)}`, payload);
    const index = catalog.value.types.findIndex((item) => item.type === entry.type);
    if (index >= 0) catalog.value.types[index] = data;
    emit('changed', data);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not save this notification setting.';
  } finally {
    savingType.value = null;
  }
};

const setChannel = (entry, channel, value) => save(entry, { [channel]: value });
const setDurationMode = (entry, value) => save(entry, { toastDurationMode: value });
const setDuration = (entry, value) => save(entry, { toastDurationMode: 'timed', toastDurationSeconds: Number(value) });
const resetType = (entry) => save(entry, { reset: true });
const applyRecommended = async () => {
  savingPreset.value = true;
  try {
    await api.post('/notifications/preferences/apply-recommended');
    await load();
    emit('changed', null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not apply recommended settings.';
  } finally {
    savingPreset.value = false;
  }
};

watch(() => props.agencyId, load);
onMounted(load);
defineExpose({ refresh: load });
</script>

<style scoped>
.type-settings-panel { color: var(--text-primary); }
.settings-toolbar { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:16px; }
.settings-toolbar h2 { margin:0; font-size:20px; }
.settings-toolbar p { margin:5px 0 0; color:var(--text-secondary); font-size:13px; }
.settings-filters { display:grid; grid-template-columns:1fr 220px; gap:10px; margin-bottom:12px; }
.settings-filters input,.settings-filters select,.duration-row select,.duration-row input { border:1px solid var(--border); border-radius:9px; padding:9px 10px; background:white; }
.global-note { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.global-note span { background:var(--bg-alt); border:1px solid var(--border); border-radius:999px; padding:4px 9px; font-size:11px; }
.agency-policy-summary { margin:0 0 12px; color:var(--text-secondary); font-size:11px; }
.agency-policy-summary span { display:inline-block; margin-left:8px; color:var(--text-primary); }
.type-list { display:flex; flex-direction:column; gap:10px; }
.type-card { border:1px solid var(--border); border-radius:12px; padding:12px; background:white; }
.type-card-header { display:flex; align-items:center; gap:10px; }
.type-icon { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; }
.type-name { display:flex; flex-direction:column; flex:1; min-width:0; }
.type-name span { color:var(--text-secondary); font-size:11px; }
.locked-badge { color:#92400e; background:#fffbeb; border:1px solid #fde68a; border-radius:999px; padding:3px 8px; font-size:11px; font-weight:700; }
.channel-grid { display:grid; grid-template-columns:repeat(4,minmax(110px,1fr)); gap:7px; margin-top:12px; }
.channel-toggle { border:1px solid var(--border); border-radius:8px; padding:8px; display:flex; align-items:center; gap:6px; font-size:12px; flex-wrap:wrap; }
.channel-toggle small { width:100%; color:var(--text-secondary); font-size:10px; }
.channel-toggle.unavailable { opacity:.55; }
.duration-row { display:flex; gap:12px; margin-top:10px; align-items:end; }
.duration-row label { display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:700; }
.duration-row input { width:80px; }
.policy-note { color:#92400e; font-size:11px; margin:8px 0 0; }
.secondary-btn,.text-btn { border:1px solid var(--border); border-radius:9px; background:white; padding:8px 10px; cursor:pointer; }
.text-btn { border:0; color:var(--primary); padding:4px; }
.settings-state { color:var(--text-secondary); padding:20px 0; }
.settings-error { color:#b91c1c; background:#fef2f2; padding:10px; border-radius:8px; margin-bottom:10px; }
@media (max-width:720px) { .settings-filters { grid-template-columns:1fr; } .channel-grid { grid-template-columns:repeat(2,1fr); } .settings-toolbar { flex-direction:column; } }
</style>
