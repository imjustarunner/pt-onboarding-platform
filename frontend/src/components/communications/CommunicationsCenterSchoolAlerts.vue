<template>
  <section class="cc-mode cc-school">
    <div class="cc-mode-intro split">
      <div>
        <h2>School alerts</h2>
        <p>Notifications from school portals — who did what, on which client or program, across your schools.</p>
      </div>
      <div class="cc-intro-actions">
        <button type="button" class="cc-btn outline" @click="$emit('go-home')">← Center Home</button>
        <button type="button" class="cc-btn outline" :disabled="loading" @click="loadRows">Refresh</button>
      </div>
    </div>

    <div class="cc-kpi-row">
      <article class="cc-kpi accent">
        <span class="cc-kpi-label">Total alerts</span>
        <strong class="cc-kpi-value">{{ rows.length }}</strong>
        <span class="cc-kpi-hint">Loaded feed</span>
      </article>
      <article class="cc-kpi pop" :class="unreadCount > 0 ? 'warn' : ''">
        <span class="cc-kpi-label">Unread</span>
        <strong class="cc-kpi-value">{{ unreadCount }}</strong>
        <span class="cc-kpi-hint">Need attention</span>
      </article>
    </div>

    <section class="cc-panel">
      <header class="cc-panel-h">
        <div>
          <h3>School notifications</h3>
          <p class="cc-panel-sub">Click a row to open the school portal. Client IDs shown — no PHI in the message body.</p>
        </div>
      </header>

      <div v-if="error" class="cc-banner-err">{{ error }}</div>
      <div v-else-if="loading" class="cc-empty pad">Loading school alerts…</div>
      <ul v-else-if="rows.length" class="cc-tickets cc-school-list">
        <li
          v-for="item in rows"
          :key="itemKey(item)"
          class="cc-msg-row cc-school-row"
          :class="{ unread: item.is_unread }"
          @click="openItem(item)"
        >
          <span class="prio" :class="kindPrioClass(item)">{{ kindLabel(item) }}</span>
          <div class="cc-school-body">
            <strong class="cc-school-title">{{ rowTitle(item) }}</strong>
            <div class="cc-school-chips">
              <span v-if="item.school_name" class="cc-chip school">{{ item.school_name }}</span>
              <span v-if="clientLabel(item)" class="cc-chip client">Client {{ clientLabel(item) }}</span>
              <span v-if="subjectLabel(item)" class="cc-chip subject">{{ subjectLabel(item) }}</span>
            </div>
            <p class="cc-school-detail">{{ detailLine(item) }}</p>
            <small class="cc-school-time">{{ formatTime(item.created_at) }}</small>
          </div>
          <span v-if="item.is_unread" class="cc-unread">new</span>
        </li>
      </ul>
      <p v-else class="cc-empty pad">No school notifications yet.</p>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import {
  formatSchoolNotificationClientLabel,
  formatSchoolNotificationDetailLine,
  formatSchoolNotificationKindLabel,
  formatSchoolNotificationSubject
} from '../../utils/schoolPortalNotificationFormat.js';

defineProps({
  prefix: { type: String, default: '' }
});

defineEmits(['go-home']);

const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const rows = ref([]);
const loading = ref(false);
const error = ref('');

const unreadCount = computed(() =>
  (rows.value || []).filter((r) => r?.is_unread).length
);

function formatTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function itemKey(item) {
  return `school-${item.school_id}-${item.kind}-${item.id}`;
}

function kindLabel(item) {
  return formatSchoolNotificationKindLabel(item);
}

function clientLabel(item) {
  return formatSchoolNotificationClientLabel(item);
}

function subjectLabel(item) {
  const kind = String(item?.kind || '').toLowerCase();
  if (!['provider_slots', 'provider_day'].includes(kind)) return '';
  return formatSchoolNotificationSubject(item);
}

function detailLine(item) {
  return formatSchoolNotificationDetailLine(item);
}

function rowTitle(item) {
  return String(item?.title || kindLabel(item) || 'Notification').trim();
}

function kindPrioClass(item) {
  const kind = String(item?.kind || '').toLowerCase();
  if (item.is_unread) return 'prio-medium';
  if (['ticket', 'message', 'comment'].includes(kind)) return 'prio-medium';
  if (['checklist', 'status', 'assignment'].includes(kind)) return 'prio-low';
  return 'prio-low';
}

function normalizeProgress(raw) {
  if (raw && typeof raw === 'object' && raw.by_org) return raw;
  const legacy = raw && typeof raw === 'object' ? raw : {};
  return { by_org: legacy, by_org_kind: {}, by_org_client_kind: {} };
}

async function loadRows() {
  loading.value = true;
  error.value = '';
  rows.value = [];
  try {
    await agencyStore.fetchUserAgencies();
    const agencyId = agencyStore.currentAgency?.id || agencyStore.userAgencies?.[0]?.id;
    if (!agencyId) {
      error.value = 'No agency found for this user.';
      return;
    }

    const prefResp = await api.get(`/users/${authStore.user?.id}/preferences`, { skipGlobalLoading: true });
    const progress = normalizeProgress(prefResp.data?.school_portal_notifications_progress || null);

    const overview = await api.get('/dashboard/school-overview', { params: { agencyId }, skipGlobalLoading: true });
    const schools = Array.isArray(overview.data?.schools) ? overview.data.schools : [];

    const feeds = await Promise.all(
      schools.map(async (s) => {
        const orgId = s.school_id;
        if (!orgId) return [];
        try {
          const resp = await api.get(`/school-portal/${orgId}/notifications/feed`, { skipGlobalLoading: true });
          const list = Array.isArray(resp.data) ? resp.data : [];
          return list.map((it) => ({
            ...it,
            school_id: orgId,
            school_name: s.school_name,
            school_slug: s.school_slug
          }));
        } catch {
          return [];
        }
      })
    );

    const toMs = (v) => {
      try {
        const t = v ? new Date(v).getTime() : 0;
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    };

    rows.value = feeds.flat().map((it) => {
      const orgKey = String(it.school_id || '');
      const kind = String(it.kind || '').toLowerCase();
      const clientId = it.client_id ? String(it.client_id) : '';
      const byClient = progress?.by_org_client_kind?.[orgKey] || {};
      const byKind = progress?.by_org_kind?.[orgKey] || {};
      const orgSeen = progress?.by_org?.[orgKey] || null;
      const lastSeen = clientId ? (byClient?.[clientId]?.[kind] || byKind?.[kind] || orgSeen) : (byKind?.[kind] || orgSeen);
      const isUnread = toMs(it.created_at) > toMs(lastSeen);
      return { ...it, is_unread: isUnread };
    }).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 300);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load school alerts';
  } finally {
    loading.value = false;
  }
}

async function openItem(item) {
  const slug = item.school_slug;
  if (!slug) return;
  const query = { sp: 'notifications' };
  if (item.client_id) query.clientId = String(item.client_id);
  if (item.kind === 'comment') query.notif = 'comments';
  if (item.kind === 'message') query.notif = 'messages';
  router.push({ path: `/${slug}/dashboard`, query }).catch(() => {});

  if (item.school_id) {
    try {
      await api.post(`/school-portal/${item.school_id}/notifications/read`, {
        kind: String(item.kind || '').toLowerCase() || undefined,
        clientId: item.client_id || undefined
      }, { skipGlobalLoading: true });
      rows.value = rows.value.map((row) => (
        itemKey(row) === itemKey(item) ? { ...row, is_unread: false } : row
      ));
    } catch {
      // non-blocking
    }
  }
}

onMounted(() => loadRows());
watch(() => agencyStore.currentAgency?.id, () => loadRows());
</script>

<style scoped>
.cc-school-list .cc-school-row {
  align-items: flex-start;
  gap: 12px;
}
.cc-school-body {
  flex: 1;
  min-width: 0;
}
.cc-school-title {
  display: block;
  font-size: 14px;
  line-height: 1.35;
  margin-bottom: 6px;
}
.cc-school-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.cc-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.cc-chip.school {
  background: color-mix(in srgb, var(--cc-primary, #1f6b4a) 10%, #fff);
  color: color-mix(in srgb, var(--cc-primary, #1f6b4a) 70%, #0f172a);
  border-color: color-mix(in srgb, var(--cc-primary, #1f6b4a) 22%, #e2e8f0);
}
.cc-chip.client {
  background: #eff6ff;
  color: #1e40af;
  border-color: #bfdbfe;
}
.cc-chip.subject {
  background: #fdf4ff;
  color: #7e22ce;
  border-color: #e9d5ff;
}
.cc-school-detail {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.4;
  color: #334155;
}
.cc-school-time {
  font-size: 12px;
  color: #64748b;
}
.cc-school-row.unread {
  background: color-mix(in srgb, var(--cc-primary, #1f6b4a) 5%, #fff);
  border-left: 3px solid color-mix(in srgb, var(--cc-primary, #1f6b4a) 55%, #fff);
}
</style>
