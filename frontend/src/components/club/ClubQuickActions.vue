<template>
  <div class="club-quick-actions" :class="{ 'club-quick-actions--compact': props.compact }">
    <div class="actions-grid">

      <!-- ── Add Members (combined Add by Email + Invite Link) ─────── -->
      <div class="action-card action-card--split">
        <div class="action-icon-wrap">
          <img v-if="addMemberIconUrl" :src="addMemberIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">👥</span>
        </div>
        <div class="action-content">
          <div class="action-content-top">
            <h3>Add Members</h3>
            <router-link
              v-if="props.activeMemberCount !== null"
              :to="membersTo"
              class="member-count-badge member-count-badge--active"
              title="View active members"
            >{{ props.activeMemberCount }} Active</router-link>
            <router-link
              v-if="props.dormantMemberCount !== null"
              :to="dormantMembersTo"
              class="member-count-badge member-count-badge--dormant"
              title="View dormant members (no login in 30+ days)"
            >{{ props.dormantMemberCount }} Dormant</router-link>
          </div>
          <p>Add someone directly by email, or share your invite link for anyone to apply.</p>
        </div>
        <div class="action-split-btns">
          <button type="button" class="split-btn split-btn--primary" @click="$emit('add-member')">
            + Add by Email
          </button>
          <button type="button" class="split-btn split-btn--ghost" @click.stop="copyInviteLink">
            {{ copiedInvite ? '✓ Copied!' : '🔗 Copy Invite Link' }}
          </button>
        </div>
      </div>

      <!-- ── Season Management ──────────────────────────────────────── -->
      <div class="action-card action-card--split">
        <div class="action-icon-wrap">
          <img v-if="addSeasonIconUrl" :src="addSeasonIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">🏁</span>
        </div>
        <div class="action-content">
          <h3>Season Management</h3>
          <p>Create your first season, edit existing ones, and manage season rules from one place.</p>
        </div>

        <div class="season-preview" v-if="activeSeason">
          <div class="season-preview-row">
            <span class="season-preview-name">{{ activeSeason.class_name || activeSeason.className }}</span>
            <span class="season-status-pill" :class="activeSeason.status === 'active' ? 'pill--active' : 'pill--draft'">
              {{ activeSeason.status === 'active' ? 'Active' : activeSeason.status }}
            </span>
          </div>
          <div v-if="activeSeason.starts_at" class="season-preview-dates hint">
            {{ formatSeasonDate(activeSeason.starts_at) }} – {{ formatSeasonDate(activeSeason.ends_at) }}
          </div>
        </div>
        <div class="season-preview season-preview--empty" v-else-if="!seasonsLoading">
          <span class="hint">No active season yet.</span>
        </div>

        <div class="action-split-btns">
          <router-link
            v-if="activeSeason"
            :to="`/${isSummitPlatformRouteSlug(orgSlug) ? orgSlug : NATIVE_APP_ORG_SLUG}/season/${activeSeason.id}`"
            class="split-btn split-btn--primary"
          >Open Season</router-link>
          <router-link
            :to="seasonManagementTo"
            class="split-btn split-btn--ghost"
          >{{ activeSeason ? 'Manage Season' : 'Create Season' }}</router-link>
        </div>
      </div>

      <!-- ── Public Club Page ───────────────────────────────────────── -->
      <div class="action-card action-card--split" ref="publicCardRef">
        <div class="action-icon-wrap">
          <span class="action-icon-placeholder">🌐</span>
        </div>
        <div class="action-content">
          <h3>Public Club Page</h3>
          <p>Your club's public landing page with stats, records, and a join button.</p>
        </div>
        <div class="action-split-btns">
          <button type="button" class="split-btn split-btn--primary" @click.stop="goToSite">
            Go to Site
          </button>
          <button type="button" class="split-btn split-btn--ghost" @click.stop="copyPublicLink">
            {{ copiedPublic ? '✓ Copied!' : 'Copy Link' }}
          </button>
        </div>
      </div>

      <!-- ── Club Settings ───────────────────────────────────────────── -->
      <router-link :to="settingsTo" class="action-card action-card-link">
        <div class="action-icon-wrap">
          <img v-if="settingsIconUrl" :src="settingsIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">⚙️</span>
        </div>
        <div class="action-content">
          <h3>Club Settings</h3>
          <p>Configure your club name, branding, and challenge management.</p>
        </div>
      </router-link>

      <!-- ── Notifications ─────────────────────────────────────────── -->
      <div
        class="action-card action-card--notif"
        :class="{ 'action-card--notif-active': clubNotifCount > 0 }"
        @click="clubNotifCount > 0 ? openNotifModal() : goToNotifications()"
      >
        <div class="action-icon-wrap">
          <div class="notif-icon-bubble" :class="{ 'notif-icon-bubble--active': clubNotifCount > 0 }">
            <img
              v-if="clubIconUrl"
              :src="clubIconUrl"
              alt=""
              class="notif-club-img"
            />
            <span v-else class="notif-icon-emoji">🔔</span>
          </div>
          <div v-if="clubNotifCount > 0" class="notif-bubble-badge">{{ clubNotifCount }}</div>
        </div>
        <div class="action-content">
          <h3>Notifications</h3>
          <p v-if="clubNotifCount === 0" class="notif-empty-hint">All caught up — no new notifications.</p>
          <p v-else>
            <strong class="notif-count-text">{{ clubNotifCount }}</strong>
            {{ clubNotifCount === 1 ? 'notification' : 'notifications' }} need your attention.
          </p>
        </div>
        <svg class="action-chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd"/>
        </svg>
      </div>

    </div>

    <!-- ── Inline Member Applications ─────────────────────────────── -->
    <div class="member-apps-pane" v-if="props.agency?.id">
      <div class="member-apps-header">
        <div class="member-apps-header-left">
          <h3 class="member-apps-title">Member Applications</h3>
          <span v-if="pendingApps.length" class="member-apps-badge">{{ pendingApps.length }} pending</span>
        </div>
        <div class="member-apps-header-right">
          <select v-model="appsStatusFilter" class="member-apps-select" @change="loadInlineApps">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
            <option value="all">All</option>
          </select>
          <router-link :to="membersTo" class="btn-manage-members">Member Management →</router-link>
        </div>
      </div>

      <div v-if="appsLoading" class="member-apps-hint">Loading…</div>
      <div v-else-if="appsError" class="member-apps-error">{{ appsError }}</div>
      <div v-else-if="!allApps.length" class="member-apps-empty">
        No {{ appsStatusFilter === 'all' ? '' : appsStatusFilter }} applications.
      </div>
      <div v-else class="member-apps-list">
        <div v-for="app in allApps" :key="app.id" class="member-app-row">
          <div class="member-app-avatar">
            {{ initials(app) }}
          </div>
          <div class="member-app-info">
            <span class="member-app-name">{{ app.first_name }} {{ app.last_name }}</span>
            <span class="member-app-email">{{ app.email }}</span>
          </div>
          <div class="member-app-meta">
            <span class="member-app-date">{{ formatAppDate(app.created_at) }}</span>
            <span v-if="app.status === 'pending'" class="member-app-status member-app-status--pending">Pending</span>
            <span v-else-if="app.status === 'approved'" class="member-app-status member-app-status--approved">Approved</span>
            <span v-else-if="app.status === 'denied'" class="member-app-status member-app-status--denied">Denied</span>
          </div>
          <div v-if="app.status === 'pending'" class="member-app-actions">
            <button class="btn-app-approve" :disabled="reviewingApp === app.id" @click="reviewApp(app.id, 'approved')">
              {{ reviewingApp === app.id ? '…' : 'Approve' }}
            </button>
            <button class="btn-app-deny" :disabled="reviewingApp === app.id" @click="reviewApp(app.id, 'denied')">
              Deny
            </button>
            <span v-if="reviewAppErrors[app.id]" class="member-app-error">{{ reviewAppErrors[app.id] }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Notification category modal (reuse existing component) -->
  <NotificationCategoryModal
    v-if="showNotifModal"
    :agency-id="props.agency?.id"
    :agency-name="props.agency?.name || 'Club'"
    @close="showNotifModal = false"
  />
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useBrandingStore } from '../../store/branding';
import { useNotificationStore } from '../../store/notifications';
import { NATIVE_APP_ORG_SLUG, isSummitPlatformRouteSlug } from '../../utils/summitPlatformSlugs.js';
import { isNativePlatform } from '../../utils/biometricAuth.js';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import NotificationCategoryModal from '../admin/NotificationCategoryModal.vue';
import api from '../../services/api';

const props = defineProps({
  orgSlug:            { type: String, default: '' },
  agency:             { type: Object, default: null },
  compact:            { type: Boolean, default: false },
  activeMemberCount:  { type: Number, default: null },
  dormantMemberCount: { type: Number, default: null }
});

defineEmits(['add-member']);

const brandingStore = useBrandingStore();
const notificationStore = useNotificationStore();
const router = useRouter();
const route = useRoute();

// ── Notifications ─────────────────────────────────────────────────
const showNotifModal = ref(false);

const clubNotifCount = computed(() => {
  const id = props.agency?.id;
  if (!id) return 0;
  return Number(notificationStore.counts?.[id] || 0);
});

const clubIconUrl = computed(() => {
  const a = props.agency;
  if (!a) return null;
  if (a.icon_file_path) return toUploadsUrl(a.icon_file_path);
  if (a.logo_url) return a.logo_url.startsWith('http') ? a.logo_url : toUploadsUrl(a.logo_url);
  return null;
});

const openNotifModal = () => { showNotifModal.value = true; };

const goToNotifications = () => {
  const slug = route.params.organizationSlug;
  const base = slug ? `/${slug}/notifications` : '/notifications';
  router.push(base);
};
const publicSlug   = ref('');
const activeSeason = ref(null);
const seasonsLoading = ref(false);

// ── Icons ──────────────────────────────────────────────────────────
const addMemberIconUrl = computed(() => brandingStore.getClubQuickActionIconUrl('add_member', props.agency));
const addSeasonIconUrl = computed(() => brandingStore.getClubQuickActionIconUrl('add_season', props.agency));
const settingsIconUrl  = computed(() => brandingStore.getClubQuickActionIconUrl('settings', props.agency));

// ── Routes ────────────────────────────────────────────────────────
const settingsTo = computed(() => {
  const slug = props.orgSlug;
  return slug ? `/${slug}/club/settings` : '/admin/settings';
});

const membersTo = computed(() => {
  const slug = isSummitPlatformRouteSlug(props.orgSlug) ? props.orgSlug : NATIVE_APP_ORG_SLUG;
  return `/${slug}/admin/users`;
});
const dormantMembersTo = computed(() => `${membersTo.value}?filter=dormant`);

const seasonManagementTo = computed(() => {
  const slug = isSummitPlatformRouteSlug(props.orgSlug) ? props.orgSlug : NATIVE_APP_ORG_SLUG;
  const base = `/${slug}/club/seasons`;
  // When an active season exists, auto-open its manage modal via query param
  return activeSeason.value?.id ? `${base}?manageSeason=${activeSeason.value.id}` : base;
});

// Public page URL: /:orgSlug/clubs/:clubId
const publicPageUrl = computed(() => {
  const slug = props.orgSlug;
  const id = props.agency?.id;
  const ref = String(publicSlug.value || '').trim() || String(id || '').trim();
  if (!slug || !ref) return '#';
  return `${window.location.origin}/${slug}/clubs/${ref}`;
});

// Invite link: direct join/signup page /:orgSlug/join?club=:clubId
const invitePageUrl = computed(() => {
  const slug = props.orgSlug;
  const id = props.agency?.id;
  if (!slug || !id) return '#';
  return `${window.location.origin}/${slug}/join?club=${id}`;
});

// ── Copy helpers ──────────────────────────────────────────────────
const copiedPublic  = ref(false);
const copiedInvite  = ref(false);

const copyToClipboard = async (text, flagRef) => {
  try {
    await navigator.clipboard.writeText(text);
    flagRef.value = true;
    setTimeout(() => { flagRef.value = false; }, 2500);
  } catch {
    // Fallback for browsers that block clipboard without user gesture
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    flagRef.value = true;
    setTimeout(() => { flagRef.value = false; }, 2500);
  }
};

const copyPublicLink = () => copyToClipboard(publicPageUrl.value, copiedPublic);
const copyInviteLink = () => copyToClipboard(invitePageUrl.value, copiedInvite);

const goToSite = () => {
  const slug = props.orgSlug;
  const id = props.agency?.id;
  const ref = String(publicSlug.value || '').trim() || String(id || '').trim();
  if (!slug || !ref) return;
  if (isNativePlatform()) {
    router.push(`/${slug}/clubs/${ref}`);
  } else {
    window.open(publicPageUrl.value, '_blank', 'noopener,noreferrer');
  }
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatSeasonDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
};

const loadPublicSlug = async () => {
  const clubId = Number(props.agency?.id || 0);
  if (!clubId) { publicSlug.value = ''; return; }
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId}/public-page-config`, { skipGlobalLoading: true });
    publicSlug.value = String(data?.config?.publicSlug || '').trim().toLowerCase();
  } catch { publicSlug.value = ''; }
};

const loadActiveSeason = async () => {
  const clubId = Number(props.agency?.id || 0);
  if (!clubId) { activeSeason.value = null; return; }
  seasonsLoading.value = true;
  try {
    const { data } = await api.get('/learning-program-classes', {
      params: { organizationId: clubId },
      skipGlobalLoading: true
    });
    const classes = Array.isArray(data?.classes) ? data.classes : [];
    // Prefer an active season; fall back to the most recent draft
    const active = classes.find((c) => c.status === 'active') ||
                   classes.find((c) => c.status === 'draft' || c.status === 'upcoming') ||
                   classes[0] || null;
    activeSeason.value = active;
  } catch { activeSeason.value = null; }
  finally { seasonsLoading.value = false; }
};

// ── Inline member applications ────────────────────────────────────
const appsStatusFilter = ref('pending');
const allApps = ref([]);
const pendingApps = computed(() => allApps.value.filter((a) => a.status === 'pending'));
const appsLoading = ref(false);
const appsError = ref('');
const reviewingApp = ref(null);
const reviewAppErrors = ref({});

const initials = (app) => {
  const f = String(app?.first_name || '').charAt(0).toUpperCase();
  const l = String(app?.last_name || '').charAt(0).toUpperCase();
  return f + l || '?';
};

const MONTHS_APP = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatAppDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${MONTHS_APP[dt.getMonth()]} ${dt.getDate()}`;
};

const loadInlineApps = async () => {
  const clubId = Number(props.agency?.id || 0);
  if (!clubId) return;
  appsLoading.value = true;
  appsError.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId}/applications`, {
      params: { status: appsStatusFilter.value },
      skipGlobalLoading: true
    });
    allApps.value = Array.isArray(data) ? data : (data?.applications || []);
  } catch (e) {
    appsError.value = e?.response?.data?.error?.message || 'Failed to load applications';
  } finally {
    appsLoading.value = false;
  }
};

const reviewApp = async (appId, status) => {
  const clubId = Number(props.agency?.id || 0);
  if (!clubId || reviewingApp.value) return;
  reviewingApp.value = appId;
  delete reviewAppErrors.value[appId];
  try {
    await api.put(`/summit-stats/clubs/${clubId}/applications/${appId}`, { action: status === 'approved' ? 'approve' : 'deny' }, { skipGlobalLoading: true });
    await loadInlineApps();
  } catch (e) {
    const msg = e?.response?.data?.error?.message || 'Failed to update application';
    reviewAppErrors.value = { ...reviewAppErrors.value, [appId]: msg };
  } finally {
    reviewingApp.value = null;
  }
};

onMounted(() => {
  void loadPublicSlug();
  void loadActiveSeason();
  void loadInlineApps();
  // Ensure notification counts are fresh (non-blocking)
  void notificationStore.fetchCounts().catch(() => {});
});

watch(() => props.agency?.id, () => {
  void loadPublicSlug();
  void loadActiveSeason();
  void loadInlineApps();
});
</script>

<style scoped>
.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.club-quick-actions--compact .actions-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

/* ── Base card ───────────────────────────────────────────────── */
.action-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.club-quick-actions--compact .action-card {
  padding: 14px;
  border-radius: 10px;
  gap: 10px;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-card-link {
  text-decoration: none;
  color: inherit;
}

/* ── Split-button card variant ───────────────────────────────── */
.action-card--split {
  flex-wrap: wrap;
  cursor: default;
  align-items: flex-start;
}
.action-card--split:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-split-btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.club-quick-actions--compact .action-split-btns {
  margin-top: 6px;
  padding-top: 8px;
}

.split-btn {
  flex: 1;
  min-width: 100px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, color 0.15s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  line-height: 1.3;
}

.club-quick-actions--compact .split-btn {
  padding: 6px 10px;
  font-size: 12px;
}
.split-btn--primary {
  background: var(--primary, #2563eb);
  color: white;
}
.split-btn--primary:hover {
  background: var(--primary-dark, #1d4ed8);
}
.split-btn--ghost {
  background: var(--bg-alt, #f1f5f9);
  color: var(--text-primary, #0f172a);
  border: 1px solid var(--border);
}
.split-btn--ghost:hover {
  background: var(--bg-muted, #e2e8f0);
}

/* ── Shared icon / text styles ───────────────────────────────── */
.action-icon-wrap { flex-shrink: 0; }

.action-icon-placeholder {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: var(--bg-alt);
  border-radius: 10px;
}

.club-quick-actions--compact .action-icon-placeholder {
  width: 40px;
  height: 40px;
  font-size: 20px;
  border-radius: 8px;
}

.action-icon-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 10px;
}

.club-quick-actions--compact .action-icon-img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}

.action-content {
  flex: 1;
  min-width: 0;
}
.action-content-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.action-content-top h3 { margin: 0; }
.member-count-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  text-decoration: none;
  transition: opacity 0.15s;
}
.member-count-badge:hover { opacity: 0.8; }
.member-count-badge--active {
  background: #dcfce7;
  color: #166534;
}
.member-count-badge--dormant {
  background: #fef9c3;
  color: #78350f;
}

.action-content h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 800;
}

.club-quick-actions--compact .action-content h3 {
  margin-bottom: 4px;
  font-size: 0.92rem;
}

.action-content p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.club-quick-actions--compact .action-content p {
  font-size: 12px;
  line-height: 1.3;
}

/* ── Season preview strip ────────────────────────────────────── */
.season-preview {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
}
.season-preview--empty {
  color: var(--text-secondary, #64748b);
  font-style: italic;
}
.season-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.season-preview-name {
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  font-size: 13px;
}
.season-preview-dates {
  margin-top: 2px;
  font-size: 12px;
}
.season-status-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.pill--active {
  background: #dcfce7;
  color: #16a34a;
}
.pill--draft {
  background: #fef9c3;
  color: #a16207;
}

/* ── Notification card ───────────────────────────────────────── */
.action-card--notif {
  cursor: pointer;
  align-items: center;
  border-left: 4px solid var(--border, #e2e8f0);
  transition: all 0.2s;
  position: relative;
}
.action-card--notif-active {
  border-left-color: #dc3545;
  background: linear-gradient(135deg, #fff5f5 0%, #fff 100%);
}
.action-card--notif:hover {
  border-left-color: #dc3545;
}

/* Icon bubble with optional club photo */
.notif-icon-bubble {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  border: 2px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.notif-icon-bubble--active {
  border-color: #fca5a5;
}
.club-quick-actions--compact .notif-icon-bubble {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}
.notif-club-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 6px;
}
.notif-icon-emoji {
  font-size: 26px;
}
.club-quick-actions--compact .notif-icon-emoji {
  font-size: 18px;
}

/* Red count badge overlaid bottom-right of icon */
.notif-bubble-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #dc3545;
  color: white;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(220, 53, 69, 0.4);
  border: 2px solid white;
}

.notif-count-text {
  color: #dc3545;
  font-weight: 800;
}
.notif-empty-hint {
  color: var(--text-secondary, #64748b);
  font-style: italic;
}

/* Chevron arrow */
.action-chevron {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--text-secondary, #94a3b8);
  margin-left: auto;
}
.action-card--notif-active .action-chevron {
  color: #dc3545;
}

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width: 768px) {
  .actions-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .action-card {
    padding: 14px 12px;
    gap: 12px;
    border-radius: 10px;
  }

  .action-icon-placeholder,
  .action-icon-img {
    width: 40px;
    height: 40px;
    font-size: 20px;
    border-radius: 8px;
  }

  .action-content h3 {
    font-size: 0.95rem;
    margin-bottom: 4px;
  }

  .action-content p {
    font-size: 12px;
    line-height: 1.3;
  }

  .split-btn {
    font-size: 12px;
    padding: 6px 10px;
  }
}

/* ── Member applications pane ────────────────────────────────────── */
.member-apps-pane {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  margin-top: 20px;
  padding: 20px 24px 16px;
}
.club-quick-actions--compact .member-apps-pane {
  margin-top: 12px;
  padding: 14px 16px 12px;
}
.member-apps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.member-apps-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.member-apps-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;
}
.member-apps-badge {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  border-radius: 20px;
  padding: 1px 10px;
  font-size: 0.75rem;
  font-weight: 700;
}
.member-apps-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.member-apps-select {
  font-size: 0.82rem;
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: white;
  color: #334155;
}
.btn-manage-members {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary-color, #2563eb);
  text-decoration: none;
  padding: 4px 12px;
  border: 1px solid var(--primary-color, #2563eb);
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
.btn-manage-members:hover {
  background: var(--primary-color, #2563eb);
  color: white;
}
.member-apps-hint,
.member-apps-empty {
  color: #94a3b8;
  font-size: 0.85rem;
  text-align: center;
  padding: 12px 0;
}
.member-apps-error {
  color: #dc2626;
  font-size: 0.85rem;
  padding: 8px 0;
}
.member-apps-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.member-app-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}
.member-app-row:last-child { border-bottom: none; }
.member-app-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.78rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.member-app-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.member-app-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.member-app-email {
  font-size: 0.78rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.member-app-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}
.member-app-date {
  font-size: 0.75rem;
  color: #94a3b8;
}
.member-app-status {
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 12px;
  padding: 1px 8px;
}
.member-app-status--pending  { background: #fef9c3; color: #78350f; }
.member-app-status--approved { background: #dcfce7; color: #166534; }
.member-app-status--denied   { background: #fee2e2; color: #991b1b; }
.member-app-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.member-app-error {
  font-size: 0.72rem;
  color: #dc2626;
  width: 100%;
  margin-top: 2px;
}
.btn-app-approve,
.btn-app-deny {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-app-approve:disabled,
.btn-app-deny:disabled { opacity: 0.5; cursor: default; }
.btn-app-approve {
  background: #16a34a;
  color: white;
}
.btn-app-approve:hover:not(:disabled) { background: #15803d; }
.btn-app-deny {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}
.btn-app-deny:hover:not(:disabled) { background: #fee2e2; color: #991b1b; }
</style>
