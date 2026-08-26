<script setup>
defineProps({
  inboxes: { type: Array, default: () => [] },
  attention: { type: Object, default: () => ({}) },
  selectedInboxId: { type: [Number, String, null], default: null },
  channel: { type: String, default: 'all' },
  prefs: {
    type: Object,
    default: () => ({ personalEmailNotify: false, digestHours: 48 })
  }
});

const emit = defineEmits([
  'update:selectedInboxId',
  'update:channel',
  'compose',
  'smartFilter',
  'update:prefs'
]);

const channels = [
  { id: 'all', label: 'All Conversations', icon: '◎' },
  { id: 'email', label: 'Email', icon: '✉' },
  { id: 'secure', label: 'Secure Messages', icon: '💬' },
  { id: 'sms', label: 'SMS', icon: '📱' },
  { id: 'call', label: 'Calls & Voicemail', icon: '📞' },
  { id: 'mention', label: 'Mentions', icon: '@' },
  { id: 'internal', label: 'Team Discussions', icon: '👥' }
];

function channelCount(id, attention) {
  const c = attention?.channels || {};
  if (id === 'all') return c.all || 0;
  if (id === 'call') return (c.call || 0) + (c.voicemail || 0);
  return c[id] || 0;
}

function onInboxChange(e) {
  const v = e.target.value;
  if (v === '' || v === 'null') emit('update:selectedInboxId', null);
  else if (v === 'assigned') emit('update:selectedInboxId', 'assigned');
  else emit('update:selectedInboxId', parseInt(v, 10));
}

function onNotifyToggle(e) {
  emit('update:prefs', { personalEmailNotify: e.target.checked });
}

function onDigestHours(e) {
  emit('update:prefs', { digestHours: Number(e.target.value) });
}
</script>

<template>
  <aside class="uc-side">
    <button type="button" class="uc-new" @click="emit('compose')">
      + New Message
    </button>

    <label class="uc-inbox-label">Inbox</label>
    <select
      class="uc-inbox-select"
      :value="selectedInboxId == null ? 'null' : String(selectedInboxId)"
      @change="onInboxChange"
    >
      <option
        v-for="box in inboxes"
        :key="String(box.id) + (box.identity_key || '')"
        :value="box.id == null ? 'null' : String(box.id)"
      >
        {{ box.display_name }}{{ box.from_email ? ` · ${box.from_email}` : '' }}
      </option>
    </select>

    <div class="uc-prefs">
      <p class="uc-section">Personal email alerts</p>
      <label class="uc-pref-row">
        <input type="checkbox" :checked="!!prefs.personalEmailNotify" @change="onNotifyToggle" />
        <span>Notify my personal email</span>
      </label>
      <label class="uc-pref-row digest">
        <span>Digest after</span>
        <select :value="prefs.digestHours || 48" :disabled="!prefs.personalEmailNotify" @change="onDigestHours">
          <option :value="24">24 hours</option>
          <option :value="48">48 hours</option>
        </select>
      </label>
      <p class="uc-pref-hint">No per-message mail — only a delayed digest for items still needing a reply. Replies stay in the app.</p>
    </div>

    <div class="uc-smart">
      <button type="button" @click="emit('smartFilter', 'needs_reply')">
        Needs Attention <em>{{ attention.needsAttention || 0 }}</em>
      </button>
      <button type="button" @click="emit('smartFilter', 'waiting')">
        Waiting on Others <em>{{ attention.waitingOnOthers || 0 }}</em>
      </button>
      <button type="button" @click="emit('smartFilter', 'follow_up')">
        Follow Ups Due <em>{{ attention.followUpsDue || 0 }}</em>
      </button>
    </div>

    <p class="uc-section">Channels</p>
    <nav class="uc-channels">
      <button
        v-for="ch in channels"
        :key="ch.id"
        type="button"
        :class="{ on: channel === ch.id }"
        @click="emit('update:channel', ch.id)"
      >
        <span class="uc-ch-icon" aria-hidden="true">{{ ch.icon }}</span>
        <span class="uc-ch-label">{{ ch.label }}</span>
        <em v-if="channelCount(ch.id, attention)">{{ channelCount(ch.id, attention) }}</em>
      </button>
    </nav>

    <p class="uc-section">Views</p>
    <nav class="uc-channels compact">
      <button type="button" @click="emit('smartFilter', 'assigned')">Assigned to Me</button>
      <button type="button" @click="emit('smartFilter', 'unread')">Unread</button>
      <button type="button" @click="emit('smartFilter', 'starred')">Starred</button>
      <button type="button" @click="emit('smartFilter', 'snoozed')">Snoozed</button>
      <button type="button" @click="emit('smartFilter', 'all')">All active</button>
    </nav>
  </aside>
</template>

<style scoped>
.uc-side {
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  padding: 14px 12px;
  overflow-y: auto;
}
.uc-new {
  width: 100%;
  background: #166534;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 11px 12px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
}
.uc-new:hover { background: #14532d; }
.uc-inbox-label {
  display: block;
  margin-top: 16px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}
.uc-inbox-select {
  width: 100%;
  margin-top: 6px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font-size: 0.85rem;
  background: #fff;
}
.uc-prefs {
  margin-top: 12px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.uc-prefs .uc-section { margin-top: 0; }
.uc-pref-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #334155;
  margin-top: 6px;
}
.uc-pref-row.digest {
  justify-content: space-between;
}
.uc-pref-row select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
.uc-pref-hint {
  margin: 8px 0 0;
  font-size: 0.7rem;
  color: #94a3b8;
  line-height: 1.35;
}
.uc-smart {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
}
.uc-smart button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: none;
  background: transparent;
  padding: 7px 8px;
  border-radius: 8px;
  font-size: 0.82rem;
  cursor: pointer;
  color: #334155;
  text-align: left;
}
.uc-smart button:hover { background: #e2e8f0; }
.uc-smart em {
  font-style: normal;
  background: #166534;
  color: #fff;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 0.72rem;
  font-weight: 700;
}
.uc-section {
  margin: 16px 0 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}
.uc-channels {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.uc-channels button {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 6px;
  align-items: center;
  border: none;
  background: transparent;
  padding: 7px 8px;
  border-radius: 8px;
  font-size: 0.82rem;
  cursor: pointer;
  color: #334155;
  text-align: left;
}
.uc-channels.compact button {
  grid-template-columns: 1fr;
}
.uc-channels button.on,
.uc-channels button:hover {
  background: #dcfce7;
  color: #14532d;
}
.uc-ch-icon { opacity: 0.85; }
.uc-channels em {
  font-style: normal;
  color: #64748b;
  font-size: 0.75rem;
}
</style>
