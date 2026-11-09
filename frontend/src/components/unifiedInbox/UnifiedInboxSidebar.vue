<script setup>
import PersonalMessageDeliverySettings from '../messages/PersonalMessageDeliverySettings.vue';
import { computed, ref } from 'vue';
const showPersonalDelivery = ref(false);
import ConversaIcon from '../../components/conversa/ConversaIcon.vue';
import GroupEmailBadge from './GroupEmailBadge.vue';
import { isTicketedGroup } from '../../utils/groupEmailPresentation';

const props = defineProps({
  inboxes: { type: Array, default: () => [] },
  attention: { type: Object, default: () => ({}) },
  selectedInboxId: { type: [Number, String, null], default: null },
  channel: { type: String, default: 'all' },
  prefs: {
    type: Object,
    default: () => ({ personalEmailNotify: false, digestHours: 24, digestBusinessHours: 24 })
  }
});

const emit = defineEmits([
  'update:selectedInboxId',
  'update:channel',
  'compose',
  'open-tickets',
  'smartFilter',
  'update:prefs'
]);

const channels = [
  { id: 'all', label: 'All Conversations' },
  { id: 'email', label: 'Email' },
  { id: 'secure', label: 'Secure Messages' },
  { id: 'sms', label: 'SMS' },
  { id: 'call', label: 'Calls & Voicemail' },
  { id: 'mention', label: 'Mentions' },
  { id: 'internal', label: 'Team Discussions' }
];

const groupInboxes = computed(() => props.inboxes.filter(isTicketedGroup));
const otherInboxes = computed(() => props.inboxes.filter(box => !isTicketedGroup(box) && box.id !== 'group_email'));

function channelCount(id, attention) {
  const c = attention?.channels || {};
  if (id === 'all') return c.all || 0;
  if (id === 'call') return (c.call || 0) + (c.voicemail || 0);
  return c[id] || 0;
}

function inboxOptionLabel(box) {
  const name = box?.display_name || (box?.kind === 'personal' ? 'App inbox' : 'Inbox');
  return box?.from_email ? `${name} · ${box.from_email}` : name;
}

const selectedIsAppInbox = computed(() => {
  const id = props.selectedInboxId;
  if (id == null || id === 'null' || id === 'assigned') return false;
  const box = (props.inboxes || []).find((b) => String(b.id) === String(id));
  return box?.routing === 'app_group_alias' || box?.kind === 'personal' || box?.identity_key === 'my_inbox';
});

function onInboxChange(e) {
  const v = e.target.value;
  if (v === '' || v === 'null') emit('update:selectedInboxId', null);
  else if (v === 'assigned') emit('update:selectedInboxId', 'assigned');
  else if (v === 'my_inbox') emit('update:selectedInboxId', 'my_inbox');
  else if (v === 'group_email') emit('update:selectedInboxId', 'group_email');
  else emit('update:selectedInboxId', parseInt(v, 10));
}

</script>

<template>
  <aside class="uc-side">
    <button type="button" class="uc-new" @click="emit('compose')">
      <ConversaIcon type="chat" :size="17" /> New message
    </button>

    <nav class="uc-channels uc-mailboxes" aria-label="Inboxes">
      <button type="button" :class="{ on: selectedInboxId == null }" @click="emit('update:selectedInboxId', null)">
        <ConversaIcon type="all" :size="17" /> All inboxes
      </button>
      <button type="button" :class="{ on: selectedInboxId === 'assigned' }" @click="emit('update:selectedInboxId', 'assigned')">
        <ConversaIcon type="ticket" :size="17" /> Assigned to me
      </button>
    </nav>

    <section v-if="groupInboxes.length" class="uc-group-email" aria-label="Groups">
      <button type="button" class="uc-section uc-group-heading" :class="{ on: selectedInboxId === 'group_email' }" @click="emit('update:selectedInboxId', 'group_email')">Groups</button>
      <nav class="uc-channels" aria-label="Department group email">
        <button v-for="box in groupInboxes" :key="box.id" type="button" :class="{ on: String(selectedInboxId) === String(box.id) }" :title="box.from_email" @click="emit('update:selectedInboxId', box.id)">
          <GroupEmailBadge :mailbox="box" />
        </button>
      </nav>
      <p class="uc-inbox-help">Unclaimed messages stay unread until someone claims the ticket.</p>
      <button type="button" class="uc-tickets-link" @click="emit('open-tickets')"><ConversaIcon type="ticket" :size="16" /> Open tickets</button>
    </section>

    <label class="uc-inbox-label">Inbox</label>
    <select
      class="uc-inbox-select"
      aria-label="Sending and receiving inbox"
      :value="selectedInboxId == null ? 'null' : String(selectedInboxId)"
      @change="onInboxChange"
    >
      <option
        v-for="box in otherInboxes"
        :key="String(box.id) + (box.identity_key || '')"
        :value="box.id == null ? 'null' : String(box.id)"
      >
        {{ inboxOptionLabel(box) }}
      </option>
    </select>
    <p v-if="selectedIsAppInbox" class="uc-inbox-help">
      Send and receive using your organization’s shared address.
    </p>

    <div class="uc-prefs">
      <button type="button" @click="showPersonalDelivery = !showPersonalDelivery">Personal email reminders</button>
      <PersonalMessageDeliverySettings v-if="showPersonalDelivery" />
    </div>

    <div class="uc-smart">
      <button type="button" @click="emit('smartFilter', 'waiting')">
        Waiting on Others <em>{{ attention.waitingOnOthers || 0 }}</em>
      </button>
      <button type="button" @click="emit('smartFilter', 'follow_up')">
        Follow Ups Due <em>{{ attention.followUpsDue || 0 }}</em>
      </button>
      <button type="button" @click="emit('smartFilter', 'unknown')">
        Unknown Senders <em>{{ attention.unknownSenders || 0 }}</em>
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
        <ConversaIcon :type="ch.id" :size="17" />
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
.uc-mailboxes { margin-top: 12px; }
.uc-group-email { margin-top: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--conversa-border); }
.uc-group-heading { width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer; padding: 7px 6px; }
.uc-group-heading.on { background: var(--conversa-blue-soft); border-radius: 6px; }
.uc-tickets-link { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding: 5px; border: 0; background: transparent; color: var(--conversa-blue); font-weight: 650; cursor: pointer; }
.uc-side {
  background: var(--conversa-wash);
  border-right: 1px solid var(--conversa-border);
  padding: 14px 12px;
  overflow-y: auto;
}
.uc-new {
  width: 100%;
  background: var(--conversa-blue);
  color: var(--conversa-surface);
  border: none;
  border-radius: 10px;
  padding: 11px 12px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
}
.uc-new:hover { background: var(--conversa-blue); }
.uc-inbox-label {
  display: block;
  margin-top: 16px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--conversa-muted);
}
.uc-inbox-select {
  width: 100%;
  margin-top: 6px;
  border: 1px solid var(--conversa-border);
  border-radius: 8px;
  padding: 8px;
  font-size: 0.85rem;
  background: var(--conversa-surface);
}
.uc-inbox-help {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--conversa-muted);
}
.uc-prefs {
  margin-top: 12px;
  padding: 10px;
  background: var(--conversa-surface);
  border: 1px solid var(--conversa-border);
  border-radius: 10px;
}
.uc-prefs .uc-section { margin-top: 0; }
.uc-pref-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--conversa-ink);
  margin-top: 6px;
}
.uc-pref-row.digest {
  justify-content: space-between;
}
.uc-pref-row select {
  border: 1px solid var(--conversa-border);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
.uc-pref-hint {
  margin: 8px 0 0;
  font-size: 0.7rem;
  color: var(--conversa-muted);
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
  color: var(--conversa-ink);
  text-align: left;
}
.uc-smart button:hover { background: var(--conversa-border); }
.uc-smart em {
  font-style: normal;
  background: var(--conversa-blue);
  color: var(--conversa-surface);
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
  color: var(--conversa-muted);
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
  color: var(--conversa-ink);
  text-align: left;
}
.uc-channels.compact button {
  grid-template-columns: 1fr;
}
.uc-channels button.on,
.uc-channels button:hover {
  background: var(--conversa-blue-soft);
  color: var(--conversa-blue);
}
.uc-ch-icon { opacity: 0.85; }
.uc-channels em {
  font-style: normal;
  color: var(--conversa-muted);
  font-size: 0.75rem;
}
</style>
