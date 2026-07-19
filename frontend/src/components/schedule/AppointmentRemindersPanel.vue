<template>
  <div class="arp" data-testid="appointment-reminders-panel">
    <div class="arp-layout">
      <div class="arp-main">
        <header class="arp-head">
          <h3 class="arp-title">Notifications</h3>
          <div class="arp-filters">
            <button
              v-for="f in filters"
              :key="f.id"
              type="button"
              class="arp-filter"
              :class="{ on: filter === f.id }"
              @click="filter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
        </header>

        <div v-if="loading" class="muted">Loading reminder plan…</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <template v-else>
          <div v-if="!appointmentId" class="arp-empty muted">
            Save this appointment to attach reminder permissions and notification history.
          </div>
          <ul v-else-if="visibleItems.length" class="arp-list">
            <li v-for="(item, idx) in visibleItems" :key="item.key || idx" class="arp-item">
              <span class="arp-channel-ico" :class="channelTone(item)">{{ channelGlyph(item) }}</span>
              <div class="arp-item-body">
                <div class="arp-item-title">{{ item.title }}</div>
                <div v-if="item.subtitle" class="arp-item-sub">{{ item.subtitle }}</div>
                <div class="arp-item-meta muted">{{ item.meta }}</div>
              </div>
              <div class="arp-item-right">
                <span v-if="item.status" class="arp-status" :class="statusClass(item.status)">{{ item.status }}</span>
                <span v-if="item.when" class="arp-when muted">{{ item.when }}</span>
              </div>
            </li>
          </ul>
          <div v-else class="arp-empty muted">
            {{ lastSentLabel ? `Last sent: ${lastSentLabel}` : 'No reminders scheduled yet.' }}
          </div>

          <div class="arp-actions">
            <button
              v-if="appointmentId"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="busy || !canPushExtra"
              @click="emit('push-extra')"
            >
              Push additional reminder
            </button>
            <slot />
          </div>
        </template>
      </div>

      <aside class="arp-side">
        <section class="arp-side-card">
          <div class="arp-side-title">Notification preferences</div>
          <div v-if="attendees.length" class="arp-pref-list">
            <div v-for="a in attendees" :key="a.id || a.clientId || a.userId" class="arp-pref-row">
              <div>
                <strong>{{ a.name || a.displayName || `Participant #${a.id || a.clientId || a.userId}` }}</strong>
                <span class="muted">{{ permissionSummary(a) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="muted arp-side-hint">
            Attendee channel permissions appear here after the appointment is saved.
          </p>
        </section>

        <section class="arp-side-card">
          <div class="arp-side-title">Templates</div>
          <ul class="arp-templates">
            <li>Session reminders</li>
            <li>Appointment updates</li>
            <li>Messages &amp; alerts</li>
            <li>Billing &amp; payments</li>
          </ul>
          <p class="muted arp-side-hint">Manage tenant templates in Session Notifications admin.</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  appointmentId: { type: [Number, String], default: 0 },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  lastSentLabel: { type: String, default: '' },
  planItems: { type: Array, default: () => [] },
  attendees: { type: Array, default: () => [] },
  canPushExtra: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  formatWhen: { type: Function, default: null }
});

const emit = defineEmits(['push-extra']);

const filter = ref('all');
const filters = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'sent', label: 'Sent' }
];

function formatWhenLocal(value) {
  if (!value) return '';
  if (typeof props.formatWhen === 'function') return props.formatWhen(value) || String(value);
  const raw = String(value);
  try {
    const d = new Date(raw.includes('T') ? raw : raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return raw;
  }
}

const normalizedItems = computed(() => {
  const rows = Array.isArray(props.planItems) ? props.planItems : [];
  return rows.map((item, idx) => {
    const status = String(item.status || item.state || '').trim() || 'Scheduled';
    const kind = String(item.kind || item.label || item.type || 'Reminder').trim();
    const channel = String(item.channel || item.channels?.[0] || 'email').toLowerCase();
    const whenRaw = item.scheduledFor || item.fireAt || item.sendAt || item.at || '';
    const recipient = item.recipientName || item.toName || item.attendeeName || '';
    return {
      key: item.id || `${kind}-${idx}`,
      title: kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      subtitle: item.bodyPreview || item.message || item.description || '',
      status,
      channel,
      when: formatWhenLocal(whenRaw),
      meta: [channel.replace(/_/g, ' '), recipient ? `To: ${recipient}` : '', formatWhenLocal(whenRaw)]
        .filter(Boolean)
        .join(' · ')
    };
  });
});

const visibleItems = computed(() => {
  const rows = normalizedItems.value;
  if (filter.value === 'scheduled') {
    return rows.filter((r) => /schedul|pending|queued/i.test(r.status));
  }
  if (filter.value === 'sent') {
    return rows.filter((r) => /sent|delivered|read/i.test(r.status));
  }
  return rows;
});

function permissionSummary(a) {
  const channels = [];
  if (a.emailEnabled || a.inAppEnabled !== false) channels.push('Email / in-app');
  if (a.smsEnabled || a.smsOptIn) channels.push('SMS');
  if (a.phoneEnabled || a.phoneOptIn) channels.push('Phone');
  if (a.providerPushedUpdatesEnabled === false) return 'Updates disabled by client';
  return channels.length ? channels.join(', ') : 'Default channels';
}

function channelGlyph(item) {
  const c = String(item.channel || '');
  if (c.includes('sms') || c.includes('text')) return '💬';
  if (c.includes('phone') || c.includes('voice')) return '☎';
  if (c.includes('app') || c.includes('in_app')) return '🔔';
  return '✉';
}

function channelTone(item) {
  const c = String(item.channel || '');
  if (c.includes('sms')) return 'sms';
  if (c.includes('phone')) return 'phone';
  if (c.includes('app')) return 'app';
  return 'email';
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('sent') || s.includes('deliver')) return 'sent';
  if (s.includes('read')) return 'read';
  return 'scheduled';
}
</script>

<style scoped>
.arp { width: 100%; }
.arp-layout {
  display: grid;
  grid-template-columns: 1.5fr minmax(200px, 240px);
  gap: 12px;
  align-items: start;
}
.arp-main {
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.arp-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.arp-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #475569;
}
.arp-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.arp-filter {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  border-radius: 999px;
  padding: 4px 10px;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.arp-filter.on {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}
.arp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arp-item {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.arp-channel-ico {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ede9fe;
}
.arp-channel-ico.sms { background: #dcfce7; }
.arp-channel-ico.phone { background: #ffedd5; }
.arp-channel-ico.app { background: #e0f2fe; }
.arp-item-title {
  font-weight: 800;
  font-size: 0.88rem;
  color: #0f172a;
}
.arp-item-sub {
  margin-top: 2px;
  font-size: 0.8rem;
  color: #334155;
}
.arp-item-meta {
  margin-top: 4px;
  font-size: 0.72rem;
}
.arp-item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.arp-status {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  text-transform: capitalize;
}
.arp-status.sent { background: #dcfce7; color: #166534; }
.arp-status.read { background: #dbeafe; color: #1d4ed8; }
.arp-when { font-size: 0.7rem; white-space: nowrap; }
.arp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.arp-empty { font-size: 0.85rem; }
.arp-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.arp-side-card {
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}
.arp-side-title {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #475569;
  margin-bottom: 8px;
}
.arp-pref-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.arp-pref-row strong {
  display: block;
  font-size: 0.82rem;
  color: #0f172a;
}
.arp-pref-row .muted,
.arp-side-hint {
  display: block;
  font-size: 0.75rem;
  margin-top: 2px;
}
.arp-templates {
  margin: 0;
  padding-left: 16px;
  font-size: 0.8rem;
  color: #334155;
}
.muted { color: #64748b; }
.error { color: #b91c1c; font-size: 0.85rem; }
@media (max-width: 720px) {
  .arp-layout { grid-template-columns: 1fr; }
  .arp-item { grid-template-columns: 36px 1fr; }
  .arp-item-right {
    grid-column: 2;
    flex-direction: row;
    align-items: center;
  }
}
</style>
