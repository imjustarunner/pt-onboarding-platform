<template>
  <section class="notification-settings">
    <header class="settings-heading">
      <div>
        <h2>{{ focusedType ? focusedEntry?.label || 'Notification settings' : 'Notification Settings' }}</h2>
        <p>Essentials start on. Role-appropriate extras stay off until you choose them.</p>
      </div>
      <button v-if="!focusedType" class="secondary-btn" type="button" :disabled="savingPreset || saving" @click="applyRecommended">
        {{ savingPreset ? 'Applying…' : 'Use essential defaults' }}
      </button>
    </header>

    <div v-if="loading" class="settings-state">Loading notification settings…</div>
    <div v-else-if="error && !catalog.types.length" class="settings-error">{{ error }}</div>

    <template v-else>
      <div v-if="error" class="settings-error">{{ error }}</div>

      <section class="delivery-card" aria-label="Global notification channels">
        <div class="delivery-intro">
          <strong>Send notifications via</strong>
          <small>{{ globalEditable ? 'These master switches apply to every type below.' : 'Use the delivery controls above to change master switches.' }}</small>
        </div>
        <button class="master-channel fixed" type="button" disabled>
          <span class="check-box checked">✓</span><span><strong>In-app</strong><small>Always available</small></span>
        </button>
        <button class="master-channel" type="button" :disabled="savingGlobal || !globalEditable" @click="toggleGlobal('email')">
          <span :class="['check-box', { checked: catalog.global.email }]">{{ catalog.global.email ? '✓' : '' }}</span>
          <span><strong>Email</strong><small>Instant delivery</small></span>
        </button>
        <button class="master-channel" type="button" :disabled="savingGlobal || !globalEditable" @click="toggleGlobal('sms')">
          <span :class="['check-box', { checked: catalog.global.sms }]">{{ catalog.global.sms ? '✓' : '' }}</span>
          <span><strong>Text (SMS)</strong><small>{{ catalog.global.sms ? 'Enabled' : 'Off' }}</small></span>
        </button>
        <button class="master-channel" type="button" :disabled="savingGlobal || !globalEditable" @click="toggleGlobal('sound')">
          <span :class="['check-box', { checked: catalog.global.sound }]">{{ catalog.global.sound ? '✓' : '' }}</span>
          <span><strong>Sound</strong><small>{{ catalog.global.sound ? 'Enabled' : 'Off' }}</small></span>
        </button>
        <div class="quiet-hours">
          <button type="button" :disabled="!globalEditable" @click="quietHoursOpen = !quietHoursOpen">
            <span>☾</span><span><strong>Quiet hours</strong><small>{{ quietHoursLabel }}</small></span><b>{{ quietHoursOpen ? '⌃' : '⌄' }}</b>
          </button>
          <div v-if="quietHoursOpen" class="quiet-editor">
            <label><input v-model="quietDraft.enabled" type="checkbox" /> Enable</label>
            <label>From <input v-model="quietDraft.start" type="time" :disabled="!quietDraft.enabled" /></label>
            <label>To <input v-model="quietDraft.end" type="time" :disabled="!quietDraft.enabled" /></label>
            <button type="button" :disabled="savingGlobal" @click="saveQuietHours">Save</button>
          </div>
        </div>
      </section>

      <div v-if="!focusedType" class="catalog-toolbar">
        <input v-model.trim="search" type="search" placeholder="Search notification types…" aria-label="Search notification types" />
        <button :class="['relevance-filter', { active: showAllTypes }]" type="button" @click="showAllTypes = !showAllTypes">
          {{ showAllTypes ? 'Showing all types' : `Available for ${profileLabel}` }}
          <small v-if="!showAllTypes && hiddenTypeCount">{{ hiddenTypeCount }} administrative or unrelated types hidden</small>
        </button>
      </div>

      <p v-if="catalog.agencyPolicies?.length" class="agency-policy-summary">
        Source-tenant policy still applies to locked settings.
        <span v-for="policy in catalog.agencyPolicies" :key="policy.agencyId">
          {{ policy.agencyName }}: {{ policy.enforceDefaults ? 'enforced defaults' : (policy.userEditable ? 'personal choices allowed' : 'managed settings') }}
        </span>
      </p>

      <div class="matrix-header" aria-hidden="true">
        <span>Notification category</span>
        <span>In-app</span>
        <span>Email</span>
        <span>SMS</span>
        <span>More</span>
      </div>

      <div class="category-list">
        <section v-for="group in groupedCategories" :key="group.key" class="category-card">
          <div class="category-summary">
            <button class="category-name" type="button" :aria-expanded="categoryExpanded(group.key)" @click="toggleCategory(group.key)">
              <span class="chevron">{{ categoryExpanded(group.key) ? '⌄' : '›' }}</span>
              <span class="category-icon" :style="{ backgroundColor: `${group.color}18`, color: group.color }">{{ group.icon }}</span>
              <span>
                <strong>{{ group.label }}</strong>
                <small>{{ group.description }}</small>
                <em>{{ group.essentialCount }} essential · {{ group.entries.length - group.essentialCount }} optional</em>
              </span>
            </button>
            <button
              v-for="channel in primaryChannels"
              :key="channel.key"
              :class="['category-check', categoryChannelState(group, channel.key)]"
              type="button"
              :aria-label="`Toggle ${channel.label} for ${group.label}`"
              @click="toggleCategoryChannel(group, channel.key)"
            >{{ categoryCheckMark(group, channel.key) }}</button>
            <button class="expand-column" type="button" :aria-label="`Expand ${group.label}`" @click="toggleCategory(group.key)">•••</button>
          </div>

          <div v-if="categoryExpanded(group.key)" class="type-rows">
            <article v-for="entry in group.entries" :key="entry.type" class="type-row-wrap" :data-type="entry.type">
              <div class="type-row">
                <div class="type-name">
                  <strong>{{ entry.label }}</strong>
                  <span v-if="entry.required" class="required-badge">Required</span>
                  <span v-else-if="entry.locked" class="managed-badge" :title="entry.lockReason">Managed</span>
                  <small v-if="!entry.recommendedForRole">Not available for your role</small>
                  <small v-else-if="entry.essentialForRole" class="essential-note">Essential · on by default</small>
                  <small v-else>Optional · off by default</small>
                </div>
                <button
                  v-for="channel in primaryChannels"
                  :key="channel.key"
                  :class="['type-check', { checked: entry.effective[channel.key], unavailable: !entry.capabilities[channel.key] }]"
                  type="button"
                  :disabled="channelDisabled(entry, channel.key)"
                  :title="channelTitle(entry, channel.key)"
                  :aria-label="`${channel.label} for ${entry.label}`"
                  @click="toggleChannel(entry, channel.key)"
                >{{ entry.capabilities[channel.key] ? (entry.effective[channel.key] ? '✓' : '') : '—' }}</button>
                <button class="advanced-toggle" type="button" :aria-expanded="advancedExpanded(entry.type)" @click="toggleAdvanced(entry.type)">
                  {{ advancedExpanded(entry.type) ? '⌃' : '•••' }}
                </button>
              </div>

              <div v-if="advancedExpanded(entry.type)" class="advanced-row">
                <div class="advanced-channels">
                  <label v-for="channel in advancedChannels" :key="channel.key" :class="{ unavailable: !entry.capabilities[channel.key] }">
                    <button
                      :class="['type-check', { checked: entry.effective[channel.key] }]"
                      type="button"
                      :disabled="channelDisabled(entry, channel.key)"
                      :title="channelTitle(entry, channel.key)"
                      @click="toggleChannel(entry, channel.key)"
                    >{{ entry.capabilities[channel.key] ? (entry.effective[channel.key] ? '✓' : '') : '—' }}</button>
                    <span>{{ channel.label }}</span>
                  </label>
                </div>
                <div v-if="entry.effective.toast && entry.capabilities.toast" class="duration-settings">
                  <label>Toast
                    <select :value="entry.effective.toastDurationMode" @change="setDurationMode(entry, $event.target.value)">
                      <option value="timed">Auto-dismiss</option>
                      <option value="dismissable">Until dismissed</option>
                    </select>
                  </label>
                  <label v-if="entry.effective.toastDurationMode === 'timed'">Seconds
                    <input type="number" min="3" max="120" :value="entry.effective.toastDurationSeconds || 8" @change="setDuration(entry, $event.target.value)" />
                  </label>
                </div>
                <p v-if="entry.lockReason" class="policy-note">{{ entry.lockReason }}</p>
                <button class="reset-link" type="button" :disabled="saving || hasPendingChanges" @click="resetType(entry)">Reset this type</button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <div v-if="groupedCategories.length === 0" class="settings-state">No notification types match your search.</div>

      <footer class="settings-footer">
        <span>♢ Preferences are account-wide. Client and program notifications remain limited by your assignments and access.</span>
        <div>
          <button class="secondary-btn" type="button" :disabled="saving || !hasPendingChanges" @click="discardChanges">Discard</button>
          <button class="save-btn" type="button" :disabled="saving || !hasPendingChanges" @click="saveChanges">
            {{ saving ? 'Saving…' : hasPendingChanges ? `Save ${pendingCount} change${pendingCount === 1 ? '' : 's'}` : 'Saved' }}
          </button>
        </div>
      </footer>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  focusedType: { type: String, default: null },
  agencyId: { type: [Number, String], default: null },
  globalEditable: { type: Boolean, default: true }
});
const emit = defineEmits(['changed']);
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const catalog = ref({ categories: [], types: [], global: {}, agencyPolicies: [], roleProfile: 'employee' });
const search = ref('');
const showAllTypes = ref(false);
const expandedCategories = ref([]);
const expandedAdvanced = ref([]);
const pending = ref({});
const saving = ref(false);
const savingPreset = ref(false);
const savingGlobal = ref(false);
const quietHoursOpen = ref(false);
const quietDraft = ref({ enabled: false, start: '22:00', end: '07:00' });

const primaryChannels = [
  { key: 'inApp', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' }
];
const advancedChannels = [
  { key: 'toast', label: 'Toast' },
  { key: 'sound', label: 'Sound' },
  { key: 'digest', label: 'Daily digest' },
  { key: 'push', label: 'Browser push' }
];

const focusedEntry = computed(() => catalog.value.types.find((entry) => entry.type === props.focusedType));
const profileLabel = computed(() => ({
  administrative: 'administrators', support: 'support', manager: 'managers', operations: 'operations',
  provider: 'providers', school: 'school staff', guardian: 'guardians', employee: 'employees'
}[catalog.value.roleProfile] || 'your role'));
const hiddenTypeCount = computed(() => (catalog.value.types || []).filter((entry) => !entry.recommendedForRole).length);
const hasPendingChanges = computed(() => Object.keys(pending.value).length > 0);
const pendingCount = computed(() => Object.values(pending.value).reduce((count, changes) => count + Object.keys(changes).length, 0));
const quietHoursLabel = computed(() => catalog.value.global.quietHoursEnabled
  ? `${timeLabel(catalog.value.global.quietHoursStart)} – ${timeLabel(catalog.value.global.quietHoursEnd)}`
  : 'Off');

const visibleTypes = computed(() => {
  let list = catalog.value.types || [];
  if (props.focusedType) return list.filter((entry) => entry.type === props.focusedType);
  if (search.value) {
    const query = search.value.toLowerCase();
    return list.filter((entry) => `${entry.label} ${entry.categoryLabel} ${entry.type}`.toLowerCase().includes(query));
  }
  if (!showAllTypes.value) list = list.filter((entry) => entry.recommendedForRole);
  return list;
});

const groupedCategories = computed(() => (catalog.value.categories || []).map((category) => {
  const entries = visibleTypes.value.filter((entry) => entry.category === category.key);
  return {
    ...category,
    entries,
    essentialCount: entries.filter((entry) => entry.essentialForRole).length
  };
}).filter((category) => category.entries.length));

function timeLabel(value) {
  const raw = String(value || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(raw)) return '—';
  const [hour, minute] = raw.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

const masterDisabled = (channel) => {
  if (channel === 'email') return catalog.value.global.email === false;
  if (channel === 'sms') return catalog.value.global.sms === false;
  if (channel === 'push') return catalog.value.global.push === false;
  if (channel === 'sound') return catalog.value.global.sound === false;
  return false;
};

const channelLocked = (entry, channel) => {
  if (entry.digestOnly) return true;
  if (!entry.recommendedForRole) return true;
  if (channel === 'inApp' && entry.locked) return true;
  return entry.locked && String(entry.lockReason || '').toLowerCase().includes('managed');
};

const channelDisabled = (entry, channel) => (
  saving.value || !entry.capabilities[channel] || channelLocked(entry, channel) || masterDisabled(channel)
);

const channelTitle = (entry, channel) => {
  if (!entry.capabilities[channel]) return 'Not available for this notification type';
  if (masterDisabled(channel)) return 'The global master switch is off';
  if (channelLocked(entry, channel)) return entry.lockReason || 'Managed setting';
  return `${entry.effective[channel] ? 'Disable' : 'Enable'} ${channel}`;
};

const categoryExpanded = (key) => search.value.length > 0 || expandedCategories.value.includes(key);
const toggleCategory = (key) => {
  expandedCategories.value = expandedCategories.value.includes(key)
    ? expandedCategories.value.filter((item) => item !== key)
    : [...expandedCategories.value, key];
};
const advancedExpanded = (type) => expandedAdvanced.value.includes(type);
const toggleAdvanced = (type) => {
  expandedAdvanced.value = expandedAdvanced.value.includes(type)
    ? expandedAdvanced.value.filter((item) => item !== type)
    : [...expandedAdvanced.value, type];
};

const editableEntries = (group, channel) => group.entries.filter((entry) => !channelDisabled(entry, channel));
const categoryChannelState = (group, channel) => {
  const entries = editableEntries(group, channel);
  if (!entries.length) return 'disabled';
  const enabled = entries.filter((entry) => entry.effective[channel]).length;
  if (enabled === entries.length) return 'checked';
  return enabled > 0 ? 'mixed' : '';
};
const categoryCheckMark = (group, channel) => {
  const state = categoryChannelState(group, channel);
  return state === 'checked' ? '✓' : state === 'mixed' ? '–' : state === 'disabled' ? '—' : '';
};

const queueChange = (entry, key, value) => {
  entry.effective[key] = value;
  pending.value = {
    ...pending.value,
    [entry.type]: { ...(pending.value[entry.type] || {}), [key]: value }
  };
};
const toggleChannel = (entry, channel) => {
  if (!channelDisabled(entry, channel)) queueChange(entry, channel, !entry.effective[channel]);
};
const toggleCategoryChannel = (group, channel) => {
  const entries = editableEntries(group, channel);
  const enable = !entries.length ? false : !entries.every((entry) => entry.effective[channel]);
  for (const entry of entries) queueChange(entry, channel, enable);
};
const setDurationMode = (entry, value) => {
  queueChange(entry, 'toastDurationMode', value);
  if (value === 'dismissable') entry.effective.toastDurationSeconds = null;
};
const setDuration = (entry, value) => {
  const seconds = Math.max(3, Math.min(120, Number(value) || 8));
  queueChange(entry, 'toastDurationMode', 'timed');
  queueChange(entry, 'toastDurationSeconds', seconds);
};

const syncQuietDraft = () => {
  quietDraft.value = {
    enabled: catalog.value.global.quietHoursEnabled === true,
    start: String(catalog.value.global.quietHoursStart || '22:00').slice(0, 5),
    end: String(catalog.value.global.quietHoursEnd || '07:00').slice(0, 5)
  };
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/notifications/catalog', { params: props.agencyId ? { agencyId: props.agencyId } : undefined });
    catalog.value = data || { categories: [], types: [], global: {}, agencyPolicies: [] };
    pending.value = {};
    syncQuietDraft();
    const initialCategory = props.focusedType
      ? catalog.value.types.find((entry) => entry.type === props.focusedType)?.category
      : groupedCategories.value[0]?.key;
    if (initialCategory) expandedCategories.value = [initialCategory];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load notification settings.';
  } finally {
    loading.value = false;
  }
};

const saveChanges = async () => {
  const updates = Object.entries(pending.value);
  if (!updates.length) return;
  saving.value = true;
  error.value = '';
  try {
    const results = await Promise.all(updates.map(([type, payload]) => (
      api.patch(`/notifications/preferences/types/${encodeURIComponent(type)}`, payload)
    )));
    for (const response of results) {
      const entry = response.data;
      const index = catalog.value.types.findIndex((item) => item.type === entry.type);
      if (index >= 0) catalog.value.types[index] = entry;
    }
    pending.value = {};
    emit('changed', null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Some notification settings could not be saved. Reloading current settings.';
    await load();
  } finally {
    saving.value = false;
  }
};

const discardChanges = () => load();
const resetType = async (entry) => {
  if (hasPendingChanges.value) return;
  saving.value = true;
  try {
    await api.patch(`/notifications/preferences/types/${encodeURIComponent(entry.type)}`, { reset: true });
    await load();
    emit('changed', null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not reset this notification type.';
  } finally {
    saving.value = false;
  }
};

const applyRecommended = async () => {
  savingPreset.value = true;
  error.value = '';
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

const saveGlobalPayload = async (payload) => {
  const userId = Number(authStore.user?.id || 0);
  if (!userId) return;
  savingGlobal.value = true;
  error.value = '';
  try {
    await api.put(`/users/${userId}/preferences`, payload);
    await load();
    emit('changed', null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not update global notification settings.';
  } finally {
    savingGlobal.value = false;
  }
};
const toggleGlobal = (key) => {
  const field = { email: 'email_enabled', sms: 'sms_enabled', sound: 'notification_sound_enabled' }[key];
  if (field) saveGlobalPayload({ [field]: !catalog.value.global[key] });
};
const saveQuietHours = () => saveGlobalPayload({
  quiet_hours_enabled: quietDraft.value.enabled,
  quiet_hours_start_time: quietDraft.value.enabled ? quietDraft.value.start : null,
  quiet_hours_end_time: quietDraft.value.enabled ? quietDraft.value.end : null
});

watch(() => props.agencyId, load);
watch(() => props.focusedType, () => { if (!loading.value) load(); });
onMounted(load);
defineExpose({ refresh: load });
</script>

<style scoped>
.notification-settings { color:var(--text-primary); min-width:0; }
.settings-heading { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; margin-bottom:18px; }
.settings-heading h2 { margin:0; font-size:25px; }.settings-heading p { margin:5px 0 0; color:var(--text-secondary); font-size:13px; }
.secondary-btn,.save-btn { border:1px solid var(--border); border-radius:9px; background:white; padding:9px 13px; font-weight:700; cursor:pointer; }.save-btn { background:#173b78; border-color:#173b78; color:white; min-width:120px; }.secondary-btn:disabled,.save-btn:disabled { opacity:.5; cursor:not-allowed; }
.delivery-card { display:grid; grid-template-columns:minmax(190px,1.4fr) repeat(4,minmax(120px,1fr)); border:1px solid var(--border); border-radius:12px; background:white; margin-bottom:14px; overflow:visible; }
.delivery-intro,.master-channel { min-height:72px; padding:12px 14px; border:0; border-right:1px solid var(--border); background:none; text-align:left; display:flex; align-items:center; gap:10px; }.delivery-intro { flex-direction:column; align-items:flex-start; justify-content:center; }.delivery-intro small,.master-channel small { display:block; color:var(--text-secondary); font-weight:400; margin-top:2px; }.master-channel { cursor:pointer; }.master-channel.fixed { cursor:default; }
.check-box,.type-check,.category-check { width:21px; height:21px; box-sizing:border-box; border:1px solid #b9c3d4; border-radius:4px; display:grid; place-items:center; background:white; color:white; font-size:13px; font-weight:900; }.check-box.checked,.type-check.checked,.category-check.checked { background:#2563eb; border-color:#2563eb; }.category-check.mixed { background:#64748b; border-color:#64748b; }.category-check.disabled { color:#94a3b8; background:#f8fafc; }
.quiet-hours { grid-column:1/-1; border-top:1px solid var(--border); position:relative; }.quiet-hours>button { width:100%; border:0; background:#fbfcff; padding:10px 14px; display:flex; gap:10px; align-items:center; text-align:left; cursor:pointer; }.quiet-hours>button>span:nth-child(2) { flex:1; }.quiet-hours small { display:block; color:var(--text-secondary); }.quiet-editor { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:12px 14px; border-top:1px solid var(--border); }.quiet-editor label { display:flex; align-items:center; gap:6px; font-size:12px; }.quiet-editor input[type=time] { border:1px solid var(--border); border-radius:7px; padding:6px; }.quiet-editor button { margin-left:auto; border:0; border-radius:7px; background:var(--primary); color:white; padding:7px 12px; }
.catalog-toolbar { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:12px; }.catalog-toolbar input { border:1px solid var(--border); border-radius:9px; padding:10px 12px; min-width:0; }.relevance-filter { border:1px solid var(--border); border-radius:9px; background:#f8fafc; padding:7px 11px; text-align:left; cursor:pointer; }.relevance-filter.active { border-color:#2563eb; }.relevance-filter small { display:block; color:var(--text-secondary); margin-top:2px; }
.agency-policy-summary { margin:0 0 12px; color:var(--text-secondary); font-size:11px; }.agency-policy-summary span { display:inline-block; margin-left:8px; color:var(--text-primary); }
.matrix-header,.category-summary,.type-row { display:grid; grid-template-columns:minmax(280px,1fr) repeat(3,62px) 52px; align-items:center; }.matrix-header { padding:0 16px 7px; color:var(--text-secondary); font-size:11px; text-align:center; }.matrix-header span:first-child { text-align:left; }
.category-list { display:flex; flex-direction:column; gap:6px; }.category-card { border:1px solid var(--border); border-radius:11px; background:white; overflow:hidden; }.category-summary { min-height:68px; padding:7px 12px; }.category-name { border:0; background:none; display:grid; grid-template-columns:22px 42px minmax(0,1fr); align-items:center; gap:10px; text-align:left; cursor:pointer; min-width:0; }.category-name>span:last-child { min-width:0; }.category-name strong,.category-name small { display:block; }.category-name small { color:var(--text-secondary); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.category-name em { display:none; color:var(--text-secondary); font-style:normal; font-size:10px; margin-top:2px; }.category-icon { width:40px; height:40px; border-radius:11px; display:grid; place-items:center; font-size:18px; }.chevron { font-size:20px; color:var(--text-secondary); }.category-check,.type-check { justify-self:center; cursor:pointer; }.category-check:disabled,.type-check:disabled { opacity:.45; cursor:not-allowed; }.expand-column,.advanced-toggle { justify-self:center; border:1px solid var(--border); border-radius:7px; background:white; width:34px; height:30px; cursor:pointer; }
.type-rows { border-top:1px solid var(--border); background:#fcfdff; }.type-row-wrap+ .type-row-wrap { border-top:1px solid #e8edf4; }.type-row { min-height:47px; padding:0 12px 0 86px; }.type-name { min-width:0; display:flex; align-items:center; flex-wrap:wrap; gap:6px; }.type-name strong { font-size:12px; }.type-name small { width:100%; color:#a16207; font-size:10px; }.required-badge,.managed-badge { border-radius:999px; padding:2px 6px; font-size:9px; font-weight:800; }.required-badge { background:#fef2f2; color:#b91c1c; }.managed-badge { background:#fffbeb; color:#92400e; }
.advanced-row { margin:0 12px 10px 86px; padding:10px 12px; border:1px solid #dbe3ef; border-radius:9px; background:white; display:flex; flex-wrap:wrap; gap:12px 20px; align-items:center; }.advanced-channels { display:flex; flex-wrap:wrap; gap:12px; }.advanced-channels label { display:flex; align-items:center; gap:6px; font-size:11px; }.advanced-channels label.unavailable { opacity:.55; }.duration-settings { display:flex; gap:10px; }.duration-settings label { display:flex; align-items:center; gap:5px; font-size:11px; }.duration-settings select,.duration-settings input { border:1px solid var(--border); border-radius:7px; padding:5px; }.duration-settings input { width:62px; }.policy-note { margin:0; color:#92400e; font-size:10px; }.reset-link { margin-left:auto; border:0; background:none; color:var(--primary); font-size:11px; cursor:pointer; }
.settings-footer { position:sticky; bottom:-20px; z-index:4; margin-top:14px; padding:12px 14px; border:1px solid var(--border); border-radius:11px; background:rgba(255,255,255,.96); backdrop-filter:blur(8px); display:flex; justify-content:space-between; align-items:center; gap:14px; box-shadow:0 -8px 24px rgba(15,23,42,.07); }.settings-footer>span { color:var(--text-secondary); font-size:11px; }.settings-footer>div { display:flex; gap:8px; flex-shrink:0; }
.settings-state { color:var(--text-secondary); padding:28px 0; text-align:center; }.settings-error { color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; padding:10px; border-radius:8px; margin-bottom:10px; }
@media (max-width:900px) { .delivery-card { grid-template-columns:repeat(2,1fr); }.delivery-intro { grid-column:1/-1; border-bottom:1px solid var(--border); }.master-channel { border-bottom:1px solid var(--border); }.matrix-header,.category-summary,.type-row { grid-template-columns:minmax(210px,1fr) repeat(3,54px) 42px; }.type-row { padding-left:58px; }.advanced-row { margin-left:58px; }.category-name { grid-template-columns:18px 34px minmax(0,1fr); }.category-icon { width:34px; height:34px; } }
@media (max-width:650px) { .settings-heading,.settings-footer { flex-direction:column; align-items:stretch; }.catalog-toolbar { grid-template-columns:1fr; }.matrix-header { grid-template-columns:minmax(170px,1fr) repeat(3,42px) 36px; padding-left:12px; padding-right:12px; }.category-summary { grid-template-columns:minmax(170px,1fr) repeat(3,42px) 36px; }.category-name { grid-template-columns:16px 30px minmax(0,1fr); gap:6px; }.category-icon { width:30px; height:30px; }.category-name small { display:none; }.category-name em { display:block; }.type-row { grid-template-columns:minmax(150px,1fr) repeat(3,42px) 36px; padding-left:18px; }.advanced-row { margin-left:18px; }.delivery-card { grid-template-columns:1fr; }.delivery-intro { grid-column:auto; }.master-channel { border-right:0; }.settings-footer { bottom:-20px; } }
</style>
