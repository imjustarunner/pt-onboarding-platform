<template>
  <aside class="sms-details">
    <div v-if="!clientId && !contactId" class="sms-details__empty">
      <p>Select a conversation to see client details.</p>
    </div>

    <template v-else>
      <div class="sms-details__profile">
        <div class="profile-avatar" :style="avatarStyle">{{ avatarLetter }}</div>
        <h3 class="profile-name">{{ displayName }}</h3>
        <p v-if="displayPhone" class="profile-phone">{{ formatPhone(displayPhone) }}</p>
        <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>

        <div class="quick-icon-row">
          <button type="button" class="icon-circle" title="Call" @click="$emit('call')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </button>
          <a v-if="profileUrl" :href="profileUrl" class="icon-circle" title="Profile" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </a>
          <button type="button" class="icon-circle" title="Schedule" @click="$emit('schedule')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <button type="button" class="icon-circle" title="Note" @click="$emit('note')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </button>
        </div>
      </div>

      <section class="sms-details__section">
        <h4>Conversation</h4>
        <dl class="kv">
          <div><dt>Channel</dt><dd>SMS</dd></div>
          <div>
            <dt>Status</dt>
            <dd><span class="pill" :class="carePillClass">{{ careStateLabel }}</span></dd>
          </div>
          <div>
            <dt>Assigned to</dt>
            <dd>{{ ownerLabel }}</dd>
          </div>
          <div v-if="careThread?.support_access && careThread.support_access !== 'none'">
            <dt>Support</dt>
            <dd>{{ careThread.support_access }}</dd>
          </div>
          <div v-if="messageCount != null">
            <dt>Messages</dt>
            <dd>{{ messageCount }}</dd>
          </div>
          <div v-if="lastMessageAt">
            <dt>Last message</dt>
            <dd>{{ formatWhen(lastMessageAt) }}</dd>
          </div>
        </dl>
        <router-link
          v-if="careThread?.support_ticket_id"
          class="ticket-link"
          :to="ticketLink"
        >
          Open ticket #{{ careThread.support_ticket_id }}
        </router-link>
      </section>

      <section v-if="clientId" class="sms-details__section">
        <h4>Client information</h4>
        <div v-if="loading" class="muted">Loading…</div>
        <dl v-else class="kv">
          <div v-if="client?.contact_email || client?.email">
            <dt>Email</dt>
            <dd>{{ client.contact_email || client.email }}</dd>
          </div>
          <div v-if="client?.date_of_birth || client?.dob">
            <dt>Date of birth</dt>
            <dd>{{ client.date_of_birth || client.dob }}</dd>
          </div>
          <div v-if="clientSince">
            <dt>Client since</dt>
            <dd>{{ clientSince }}</dd>
          </div>
          <div v-if="client?.provider_name">
            <dt>Provider</dt>
            <dd>{{ client.provider_name }}</dd>
          </div>
          <div v-if="client?.organization_name">
            <dt>Organization</dt>
            <dd>{{ client.organization_name }}</dd>
          </div>
          <div v-if="client?.client_status_label || client?.status">
            <dt>Status</dt>
            <dd>{{ client.client_status_label || client.status }}</dd>
          </div>
        </dl>
        <a v-if="profileUrl" :href="profileUrl" class="profile-btn" target="_blank" rel="noopener">
          View client profile
        </a>
      </section>

      <section class="sms-details__section">
        <h4>Quick actions</h4>
        <ul class="action-list">
          <li>
            <button type="button" @click="$emit('schedule')">Schedule appointment</button>
          </li>
          <li>
            <button type="button" @click="$emit('resource')">Send resource</button>
          </li>
          <li>
            <button type="button" @click="$emit('note')">Create note</button>
          </li>
          <li>
            <button type="button" @click="$emit('resolve')">Mark as resolved</button>
          </li>
          <li v-if="canManageCare">
            <button type="button" @click="$emit('claim')">Claim / under care</button>
          </li>
          <li v-if="canManageCare">
            <button type="button" @click="$emit('observe')">Observe</button>
          </li>
        </ul>
      </section>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  clientId: { type: [Number, String], default: null },
  contactId: { type: [Number, String], default: null },
  clientName: { type: String, default: '' },
  clientPhone: { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  careThread: { type: Object, default: null },
  lastMessageAt: { type: [String, Date], default: null },
  messageCount: { type: Number, default: null },
  agencyId: { type: [Number, String], default: null }
});

defineEmits(['call', 'schedule', 'note', 'resource', 'resolve', 'claim', 'observe']);

const route = useRoute();
const auth = useAuthStore();
const authUser = computed(() => auth.user?.value ?? auth.user ?? null);
const client = ref(null);
const loading = ref(false);

const canManageCare = computed(() => {
  const r = String(authUser.value?.role || '').toLowerCase();
  return ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff'].includes(r);
});

const displayName = computed(
  () => props.clientName || props.contactName || client.value?.full_name || client.value?.initials || 'Unknown'
);
const displayPhone = computed(
  () => props.clientPhone || props.contactPhone || client.value?.contact_phone || ''
);
const avatarLetter = computed(() => (displayName.value || '?')[0].toUpperCase());
const avatarStyle = computed(() => ({
  background: 'color-mix(in srgb, var(--primary, #2563eb) 22%, transparent)',
  color: 'var(--primary, #2563eb)'
}));

const careStateLabel = computed(() => {
  const s = String(props.careThread?.care_state || 'under_care');
  if (s === 'observing') return 'Observing';
  if (s === 'escalated') return 'Escalated';
  if (s === 'closed') return 'Closed';
  return 'Open';
});
const carePillClass = computed(() => {
  const s = String(props.careThread?.care_state || 'under_care');
  return `pill--${s === 'under_care' ? 'open' : s}`;
});
const statusLabel = computed(() => {
  if (props.contactId && !props.clientId) return 'Contact';
  return client.value?.client_status_label || 'Active';
});
const statusClass = computed(() =>
  String(statusLabel.value).toLowerCase().includes('active') ? 'status-badge--active' : ''
);

const ownerLabel = computed(() => {
  const t = props.careThread;
  if (!t?.owner_user_id) return 'Unassigned';
  if (Number(t.owner_user_id) === Number(authUser.value?.id)) return 'You';
  const name = [t.owner_first_name, t.owner_last_name].filter(Boolean).join(' ').trim();
  return name || `#${t.owner_user_id}`;
});

const clientSince = computed(() => {
  const d = client.value?.submission_date || client.value?.created_at || client.value?.referral_date;
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(d);
  }
});

const profileUrl = computed(() => {
  if (!props.clientId) return null;
  const slug = route.params.organizationSlug || authUser.value?.currentAgencySlug || '';
  return slug ? `/${slug}/admin/clients/${props.clientId}` : `/admin/clients/${props.clientId}`;
});

const ticketLink = computed(() => {
  const id = props.careThread?.support_ticket_id;
  const slug = route.params.organizationSlug;
  const path = slug ? `/${slug}/tickets` : '/tickets';
  return id ? { path, query: { ticketId: String(id) } } : { path };
});

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p || '';
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(iso);
  }
}

async function loadClient() {
  client.value = null;
  if (!props.clientId) return;
  loading.value = true;
  try {
    const res = await api.get(`/clients/${props.clientId}`, { skipGlobalLoading: true });
    client.value = res.data?.client || res.data || null;
  } catch {
    client.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.clientId, loadClient, { immediate: true });
</script>

<style scoped>
.sms-details {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--sms-surface, var(--bg-secondary, #f8fafc));
  border-left: 1px solid var(--sms-border, var(--border, #e2e8f0));
  color: var(--sms-text, var(--text-primary, #0f172a));
}

.sms-details__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: var(--sms-muted, var(--text-secondary, #64748b));
  font-size: 0.875rem;
}

.sms-details__profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 16px 18px;
  border-bottom: 1px solid var(--sms-border, var(--border, #e2e8f0));
}

.profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 800;
  margin-bottom: 12px;
}

.profile-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.profile-phone {
  margin: 4px 0 10px;
  font-size: 0.85rem;
  color: var(--sms-muted, var(--text-secondary, #64748b));
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--sms-surface-2, #e2e8f0);
  color: var(--sms-muted, #64748b);
}
.status-badge--active {
  background: color-mix(in srgb, var(--success, #16a34a) 18%, transparent);
  color: var(--success, #16a34a);
}

.quick-icon-row {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.icon-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--sms-border, var(--border, #e2e8f0));
  background: var(--sms-bg, #fff);
  color: var(--sms-muted, #64748b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.icon-circle svg { width: 18px; height: 18px; }
.icon-circle:hover {
  border-color: var(--primary, #2563eb);
  color: var(--primary, #2563eb);
  background: color-mix(in srgb, var(--primary, #2563eb) 10%, transparent);
}

.sms-details__section {
  padding: 16px;
  border-bottom: 1px solid var(--sms-border, var(--border, #e2e8f0));
}
.sms-details__section h4 {
  margin: 0 0 12px;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sms-muted, var(--text-secondary, #64748b));
}

.kv {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.kv > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.82rem;
}
.kv dt {
  color: var(--sms-muted, var(--text-secondary, #64748b));
  font-weight: 500;
}
.kv dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

.pill {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--success, #16a34a) 16%, transparent);
  color: var(--success, #16a34a);
}
.pill--escalated {
  background: color-mix(in srgb, var(--warning, #d97706) 18%, transparent);
  color: var(--warning, #d97706);
}
.pill--observing {
  background: color-mix(in srgb, var(--primary, #2563eb) 16%, transparent);
  color: var(--primary, #2563eb);
}
.pill--closed {
  background: var(--sms-surface-2, #e2e8f0);
  color: var(--sms-muted, #64748b);
}

.ticket-link {
  display: inline-block;
  margin-top: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary, #2563eb);
  text-decoration: none;
}

.profile-btn {
  display: block;
  margin-top: 14px;
  text-align: center;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--primary, #2563eb);
  color: var(--primary, #2563eb);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}
.profile-btn:hover {
  background: color-mix(in srgb, var(--primary, #2563eb) 10%, transparent);
}

.action-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.action-list button {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--sms-text, var(--text-primary, #0f172a));
  font-size: 0.85rem;
  font-weight: 600;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.action-list button:hover {
  background: color-mix(in srgb, var(--primary, #2563eb) 10%, transparent);
  color: var(--primary, #2563eb);
}

.muted { color: var(--sms-muted, #64748b); font-size: 0.85rem; }
</style>
