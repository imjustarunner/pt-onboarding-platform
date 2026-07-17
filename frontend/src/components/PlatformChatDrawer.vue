<template>
  <div
    v-if="isAuthenticated"
    class="chat-drawer"
    :class="[
      { open: isOpen && !isDragging, dragging: isDragging },
      `dock-${dock.edge}`
    ]"
    :style="drawerStyle"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <div
      class="rail"
      :title="railTitle"
      @pointerdown="onRailPointerDown"
    >
      <div class="rail-badge rail-badge-top" :class="{ zero: totalUnread <= 0 }">
        {{ totalUnread }}
      </div>

      <div class="rail-icon">
        <img v-if="iconUrl" :src="iconUrl" alt="Messages" />
        <span v-else class="icon-fallback">Msgs</span>
      </div>

      <div class="rail-badge rail-badge-bottom" :class="{ disabled: needsAgency }">
        {{ loggedInNow }}
      </div>
    </div>

    <div v-if="isDragging" class="dock-hint" aria-live="polite">Snap to any edge</div>

    <div class="panel">
      <div class="panel-header">
        <div class="org-header">
          <div class="title">Messages</div>
          <div class="subtitle">{{ panelSubtitle }}</div>
        </div>
      </div>

      <nav class="nav-stubs" aria-label="Team communication">
        <button
          type="button"
          class="nav-stub"
          :class="{ active: mainTab === 'dms' }"
          @click="switchToDms"
        >
          Direct Messages
        </button>
        <template v-if="!isSchoolStaffViewer">
          <button
            type="button"
            class="nav-stub"
            :class="{ active: mainTab === 'channels' }"
            @click="switchToChannels"
          >
            Channels
            <span v-if="channelsUnreadTotal > 0" class="nav-stub-badge">{{ channelsUnreadTotal }}</span>
          </button>
          <button type="button" class="nav-stub" disabled title="Coming soon">Threads</button>
          <button type="button" class="nav-stub" disabled title="Coming soon">Mentions</button>
        </template>
      </nav>

      <div class="panel-body">
        <template v-if="needsAgency">
          <div class="empty">
            <p style="margin: 0;">Select an agency to view who’s online.</p>
          </div>

          <div v-if="pendingThreads.length > 0" class="section" style="margin-top: 12px;">
            <div class="section-title">Unread</div>
            <button
              v-for="t in pendingThreads"
              :key="`${t.agency_id}-${t.thread_id}`"
              class="person"
              @click="openThread(t)"
            >
              <span class="dot" :class="dotClassForUserId(t.other_participant?.id)"></span>
              <span class="name-block">
                <span class="name">{{ t.other_participant.first_name }} {{ t.other_participant.last_name }}</span>
                <span class="status-line">{{ subtitleForUserId(t.other_participant?.id) }}</span>
              </span>
              <span class="pill">{{ t.unread_count }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <template v-if="mainTab === 'channels' && !isSchoolStaffViewer">
            <div class="toolbar">
              <input v-model="channelQ" class="search" placeholder="Search channels…" />
              <button
                v-if="canCreateChannel"
                type="button"
                class="filter-chip"
                @click="showCreateChannel = !showCreateChannel"
              >
                {{ showCreateChannel ? 'Cancel' : '+ New channel' }}
              </button>
            </div>
            <div v-if="showCreateChannel && canCreateChannel" class="create-channel">
              <input v-model="newChannelName" class="search" placeholder="Channel name" maxlength="120" />
              <input v-model="newChannelDesc" class="search" placeholder="Description (optional)" maxlength="500" />
              <label class="create-channel-check">
                <input v-model="newChannelPrivate" type="checkbox" />
                Private (invite-only)
              </label>
              <button
                type="button"
                class="btn btn-xs btn-primary"
                :disabled="creatingChannel || !newChannelName.trim()"
                @click="createNewChannel"
              >
                {{ creatingChannel ? 'Creating…' : 'Create' }}
              </button>
              <div v-if="channelError" class="error">{{ channelError }}</div>
            </div>
            <div v-if="channelsLoading" class="loading">Loading channels…</div>
            <div v-else-if="channelError && !showCreateChannel" class="error">{{ channelError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Channels</div>
                <div v-if="filteredChannels.length === 0" class="muted">No channels yet.</div>
                <button
                  v-for="ch in filteredChannels"
                  :key="ch.thread_id"
                  type="button"
                  class="person channel-row"
                  :class="{ active: activeChannel?.thread_id === ch.thread_id }"
                  @click="openChannelThread(ch)"
                >
                  <span class="channel-hash" aria-hidden="true">#</span>
                  <span class="name-block">
                    <span class="name">
                      {{ ch.name }}
                      <span v-if="ch.kind === 'school'" class="agency-chip">School</span>
                      <span v-if="ch.visibility === 'private'" class="agency-chip">Private</span>
                    </span>
                    <span class="status-line">{{ channelPreview(ch) }}</span>
                  </span>
                  <span v-if="ch.unread_count" class="pill">{{ ch.unread_count }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else>
          <div class="toolbar">
            <input v-model="q" class="search" :placeholder="searchPlaceholder" />
            <div v-if="canToggleAudience" class="filter-chips audience-chips">
              <button
                type="button"
                class="filter-chip"
                :class="{ active: audienceMode === 'team' }"
                @click="setAudienceMode('team')"
              >
                Team
              </button>
              <button
                type="button"
                class="filter-chip"
                :class="{ active: audienceMode === 'directory' }"
                @click="setAudienceMode('directory')"
              >
                Other roles
              </button>
            </div>
            <div v-if="canToggleAudience && audienceMode === 'directory'" class="filter-chips">
              <button
                v-for="opt in DIRECTORY_ROLE_OPTIONS"
                :key="opt.id"
                type="button"
                class="filter-chip"
                :class="{ active: directoryRole === opt.id }"
                @click="setDirectoryRole(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div class="filter-chips">
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'all' }" @click="listFilter = 'all'">All</button>
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'online' }" @click="listFilter = 'online'">Online</button>
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'away' }" @click="listFilter = 'away'">Away</button>
            </div>
          </div>

          <div v-if="loading" class="loading">Loading…</div>
          <div v-else-if="error" class="error">{{ error }}</div>

          <div v-else class="lists">
            <div v-if="pendingThreads.length > 0" class="section">
              <div class="section-title">Unread</div>
              <button
                v-for="t in pendingThreads"
                :key="`${t.agency_id}-${t.thread_id}`"
                class="person"
                @click="openThread(t)"
              >
                <span class="dot" :class="dotClassForUserId(t.other_participant?.id)"></span>
                <span class="name-block">
                  <span class="name">
                    {{ t.other_participant.first_name }} {{ t.other_participant.last_name }}
                    <span v-if="!isClubContext && t.agencyLabel" class="agency-chip">{{ t.agencyLabel }}</span>
                  </span>
                  <span class="status-line">{{ subtitleForUserId(t.other_participant?.id) }}</span>
                </span>
                <span class="pill">{{ t.unread_count }}</span>
              </button>
            </div>

            <div class="section">
              <div class="section-title">{{ dmSectionTitle }}</div>
              <div v-if="dmList.length === 0" class="muted">
                {{ emptyDirectoryMessage }}
              </div>
              <button v-for="u in dmList" :key="u.id" class="person" @click="openChat(u)">
                <span class="dot" :class="presenceDotClass(u.status)"></span>
                <span class="name-block">
                  <span class="name">
                    {{ u.first_name }} {{ u.last_name }}
                    <span v-if="u.id === meId" class="you-chip">you</span>
                    <span v-if="personOrgLabel(u)" class="agency-chip">{{ personOrgLabel(u) }}</span>
                    <span v-else-if="adminsAllMode && u.agency_names" class="agency-chip">{{ u.agency_names }}</span>
                  </span>
                  <span class="status-line">{{ statusSubtitle(u) }}</span>
                </span>
                <span v-if="u.unreadCount" class="pill">{{ u.unreadCount }}</span>
              </button>
            </div>
          </div>
          </template>

          <div v-if="activeChatUser || activeChannel" class="chat-box">
            <div class="chat-box-header">
              <div class="chat-title">
                <template v-if="activeChannel"># {{ activeChannel.name }}</template>
                <template v-else>{{ activeChatUser.first_name }} {{ activeChatUser.last_name }}</template>
              </div>
              <div class="chat-box-actions">
                <button class="btn btn-xs btn-secondary" type="button" @click="toggleSelectMode" :disabled="sending || chatLoading">
                  {{ selectMode ? 'Cancel' : 'Select' }}
                </button>
                <button
                  v-if="selectMode"
                  class="btn btn-xs btn-danger"
                  type="button"
                  @click="deleteSelected"
                  :disabled="sending || selectedMessageIds.length === 0"
                  :title="selectedMessageIds.length ? `Delete ${selectedMessageIds.length} selected` : 'Select messages to delete'"
                >
                  Delete ({{ selectedMessageIds.length }})
                </button>
                <button class="btn btn-xs btn-danger" type="button" @click="deleteThread" :disabled="sending || chatLoading">
                  {{ activeChannel ? 'Hide channel' : 'Delete thread' }}
                </button>
                <button class="btn-close" @click="closeChat">×</button>
              </div>
            </div>

            <div class="chat-messages" ref="chatMessagesEl">
              <div v-if="chatLoading" class="muted">Loading messages…</div>
              <div v-else-if="chatError" class="error">{{ chatError }}</div>
              <div v-else-if="chatMessages.length === 0" class="muted" style="padding: 10px 2px;">
                No messages yet.
              </div>
              <div v-else class="msg-list">
                <div v-for="m in chatMessages" :key="m.id" class="msg-row" :class="{ mine: m.sender_user_id === meId }">
                  <label v-if="selectMode" class="msg-select">
                    <input type="checkbox" :checked="isSelected(m.id)" @change="toggleSelected(m.id)" />
                  </label>
                  <div class="msg" :class="{ mine: m.sender_user_id === meId }">
                  <div class="msg-meta">
                    <span class="msg-author">{{ m.sender_first_name }} {{ m.sender_last_name }}</span>
                    <span class="msg-time">
                      {{ formatTime(m.created_at) }}
                      <span v-if="m.sender_user_id === meId" class="msg-receipt">
                        {{ m.is_read_by_other ? '✓✓' : '✓' }}
                      </span>
                      <button
                        v-if="m.sender_user_id === meId && !m.is_read_by_other"
                        type="button"
                        class="msg-action"
                        @click="unsend(m)"
                        :disabled="sending"
                        title="Unsend (only before read)"
                      >
                        Unsend
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="deleteForMe(m)"
                        :disabled="sending"
                        title="Delete for me"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <div class="msg-body">{{ m.body }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="chat-composer">
              <textarea v-model="draft" rows="2" placeholder="Message…" />
              <button class="btn btn-primary" @click="send" :disabled="sending || !draft.trim()">Send</button>
            </div>
          </div>
        </template>
      </div>

      <div class="self-footer">
        <button type="button" class="self-status-btn" @click="statusMenuOpen = !statusMenuOpen">
          <span class="dot" :class="presenceDotClass(myHeartbeatStatus)"></span>
          <span class="self-meta">
            <span class="self-name">{{ myDisplayName }}</span>
            <span class="self-status-label">{{ myStatusDisplay }}</span>
          </span>
          <span class="self-chevron">▾</span>
        </button>
        <div v-if="statusMenuOpen" class="status-menu" @click.stop>
          <template v-if="isPrivileged">
            <div class="status-menu-label">Set status</div>
            <button
              v-for="r in AWAY_REASONS"
              :key="r.id"
              type="button"
              class="status-menu-item"
              @click="quickSetAway(r.id)"
            >
              {{ r.label }}
            </button>
            <button type="button" class="status-menu-item" @click="clearMyAway">I'm back · Active</button>
            <div class="status-menu-divider"></div>
            <button
              type="button"
              class="status-menu-item"
              :class="{ active: myAvailability === 'admins_only' }"
              @click="setMyAvailability('admins_only')"
            >
              Visible to admins only
            </button>
            <button
              type="button"
              class="status-menu-item"
              :class="{ active: myAvailability === 'everyone' }"
              @click="setMyAvailability('everyone')"
            >
              Visible to everyone
            </button>
            <button
              type="button"
              class="status-menu-item"
              :class="{ active: myAvailability === 'offline' }"
              @click="setMyAvailability('offline')"
            >
              Appear offline
            </button>
          </template>
          <template v-else>
            <button type="button" class="status-menu-item" @click="toggleMyAvailability">
              {{ myAvailability === 'offline' ? 'Go Online' : 'Go Offline' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { usePresenceSessionStore } from '../store/presenceSession';
import { toUploadsUrl } from '../utils/uploadsUrl';
import {
  AWAY_REASONS,
  DIRECTORY_ROLE_OPTIONS,
  canToggleDirectoryAudience,
  isPrivilegedPresenceRole,
  isSchoolStaffRole,
  personOrgLabel,
  presenceDotClass,
  presenceSortRank,
  statusSubtitle
} from '../utils/presenceStatus';
import { pauseIdleForSessionExtend, clearSessionExtendPause, resetActivityTimer } from '../utils/activityTracker';
import { dockToStyle, loadDock, saveDock, snapPointerToEdge } from '../utils/chatDrawerDock';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isAgencyOrgType = (org) => String(org?.organization_type || org?.organizationType || 'agency').toLowerCase() === 'agency';
const isAffiliationOrgType = (org) => {
  const t = String(org?.organization_type || org?.organizationType || '').toLowerCase();
  return t === 'affiliation' || t === 'clubwebapp';
};
const isSchoolOrgType = (org) =>
  String(org?.organization_type || org?.organizationType || '').toLowerCase() === 'school';

const agencyId = computed(() => {
  const current = agencyStore.currentAgency || null;
  const role = String(authStore.user?.role || '').toLowerCase();

  // School staff: prefer school org id (DM directory is school-scoped server-side).
  if (role === 'school_staff') {
    if (current && isSchoolOrgType(current) && current.id) return current.id;
    const schoolMembership = (agencyStore.userAgencies || []).find((a) => isSchoolOrgType(a));
    if (schoolMembership?.id) return schoolMembership.id;
    const affiliated =
      Number(current?.affiliated_agency_id || 0) ||
      Number(current?.affiliatedAgencyId || 0) ||
      null;
    if (affiliated) return affiliated;
  }

  if (!current) return null;
  if (isAgencyOrgType(current)) return current?.id || null;

  // Club (affiliation) context: scope to club members only.
  if (isAffiliationOrgType(current)) return current?.id || null;

  // School/program/learning context: prefer explicit affiliated agency id.
  const affiliated =
    Number(current?.affiliated_agency_id || 0) ||
    Number(current?.affiliatedAgencyId || 0) ||
    null;
  if (affiliated) return affiliated;

  // Fallback: first agency-type org the user belongs to.
  const userAgency = (agencyStore.userAgencies || []).find((a) => isAgencyOrgType(a));
  if (userAgency?.id) return userAgency.id;
  const knownAgency = (agencyStore.agencies || []).find((a) => isAgencyOrgType(a));
  return knownAgency?.id || null;
});
const presenceSession = usePresenceSessionStore();
const myRole = computed(() => authStore.user?.role || '');
const isPrivileged = computed(() => isPrivilegedPresenceRole(myRole.value));
const isAdminLike = computed(() => isPrivileged.value);
const adminsAllMode = computed(() => myRole.value === 'super_admin' && myAvailability.value === 'admins_only');
const needsAgency = computed(() => !agencyId.value && !adminsAllMode.value);
const listFilter = ref('all');
const audienceMode = ref('team'); // team | directory
const directoryRole = ref('school_staff');
const statusMenuOpen = ref(false);
const myHeartbeatStatus = ref('offline');
const myStatusLabel = ref(null);

const isSchoolStaffViewer = computed(() => isSchoolStaffRole(myRole.value));
const canToggleAudience = computed(() => canToggleDirectoryAudience(myRole.value) && !isClubContext.value);
const canCreateChannel = computed(() => {
  const r = myRole.value;
  return ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant'].includes(r);
});
const mainTab = ref('dms');
const channels = ref([]);
const channelsLoading = ref(false);
const channelError = ref('');
const channelQ = ref('');
const activeChannel = ref(null);
const showCreateChannel = ref(false);
const newChannelName = ref('');
const newChannelDesc = ref('');
const newChannelPrivate = ref(false);
const creatingChannel = ref(false);

const panelSubtitle = computed(() => {
  if (isClubContext.value) return 'Club direct messages';
  if (isSchoolStaffViewer.value) return 'Direct messages · your schools';
  if (mainTab.value === 'channels') return 'Team channels';
  if (audienceMode.value === 'directory') return 'Direct messages · other roles';
  return 'Direct messages · team employees';
});

const channelsUnreadTotal = computed(() =>
  (channels.value || []).reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0)
);

const filteredChannels = computed(() => {
  const query = channelQ.value.trim().toLowerCase();
  const list = channels.value || [];
  if (!query) return list;
  return list.filter(
    (c) =>
      String(c.name || '').toLowerCase().includes(query) ||
      String(c.slug || '').toLowerCase().includes(query) ||
      String(c.description || '').toLowerCase().includes(query)
  );
});
const dmSectionTitle = computed(() => {
  if (isSchoolStaffViewer.value) return 'School contacts';
  if (audienceMode.value === 'directory') {
    const opt = DIRECTORY_ROLE_OPTIONS.find((o) => o.id === directoryRole.value);
    return opt ? opt.label : 'Directory';
  }
  return 'Team';
});
const searchPlaceholder = computed(() => {
  if (isClubContext.value) return 'Search club members…';
  if (isSchoolStaffViewer.value) return 'Search your schools…';
  if (audienceMode.value === 'directory') return 'Search directory…';
  return 'Search team…';
});
const emptyDirectoryMessage = computed(() => {
  if (isClubContext.value) return 'No club members found.';
  if (isSchoolStaffViewer.value) return 'No contacts at your schools yet.';
  if (audienceMode.value === 'directory') return 'No users in this role directory.';
  return 'No team employees to show.';
});
const isClubContext = computed(() => {
  const current = agencyStore.currentAgency || null;
  return !!current && isAffiliationOrgType(current);
});

const people = ref([]);
const threads = ref([]);
let pollTimer = null;

const isOpen = ref(false);
const loading = ref(false);
const error = ref('');
const q = ref('');

const myAvailability = ref(null);

const activeChatUser = ref(null);
const activeThreadId = ref(null);
const activeThreadAgencyId = ref(null);
const chatMessages = ref([]);
const chatLoading = ref(false);
const chatError = ref('');
const draft = ref('');
const sending = ref(false);
const chatMessagesEl = ref(null);
const selectMode = ref(false);
const selectedMessageIds = ref([]);

const meId = computed(() => authStore.user?.id);

const totalUnread = computed(() => (threads.value || []).reduce((sum, t) => sum + (t.unread_count || 0), 0));

const iconUrl = computed(() => {
  const a = agencyStore.currentAgency;
  if (a?.chat_icon_path) return toUploadsUrl(a.chat_icon_path);

  const pb = brandingStore.platformBranding;
  if (pb?.chat_icon_path) return toUploadsUrl(pb.chat_icon_path);
  if (pb?.communications_icon_path) return toUploadsUrl(pb.communications_icon_path);

  // last-resort fallbacks
  if (a?.icon_file_path) return toUploadsUrl(a.icon_file_path);
  if (pb?.master_brand_icon_path) return toUploadsUrl(pb.master_brand_icon_path);
  return null;
});

const loggedInNow = computed(() => {
  if (needsAgency.value) return 0;
  return (people.value || []).filter((u) => u.status === 'online' || u.status === 'idle').length;
});

const dock = ref(loadDock());
const isDragging = ref(false);
const dragPoint = ref(null);
let holdTimer = null;
let dragMoved = false;
let activePointerId = null;
let suppressOpenUntil = 0;

const drawerStyle = computed(() => dockToStyle(dock.value, isDragging.value ? dragPoint.value : null));

const railTitle = computed(() => {
  if (needsAgency.value) return 'Select an agency to use messages — hold & drag to move';
  return 'Messages — hold & drag to snap to an edge';
});

let closeTimer = null;
const onEnter = () => {
  if (isDragging.value) return;
  if (Date.now() < suppressOpenUntil) return;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  isOpen.value = true;
};
const onLeave = () => {
  if (isDragging.value) return;
  if (closeTimer) clearTimeout(closeTimer);
  // Debounce close to avoid flicker/quiver while interacting.
  closeTimer = setTimeout(() => {
    isOpen.value = false;
    closeTimer = null;
  }, 180);
};

function clearHoldTimer() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function beginDrag(clientX, clientY) {
  clearHoldTimer();
  isDragging.value = true;
  dragMoved = true;
  isOpen.value = false;
  dragPoint.value = { x: clientX, y: clientY };
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
}

function onRailPointerDown(e) {
  if (e.button != null && e.button !== 0) return;
  // Don't start a dock drag from interactive children inside an open panel — rail only.
  activePointerId = e.pointerId;
  dragMoved = false;
  const startX = e.clientX;
  const startY = e.clientY;

  clearHoldTimer();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    beginDrag(startX, startY);
  }, 180);

  const onMove = (ev) => {
    if (activePointerId != null && ev.pointerId !== activePointerId) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!isDragging.value && Math.hypot(dx, dy) > 8) {
      beginDrag(ev.clientX, ev.clientY);
    }
    if (isDragging.value) {
      dragPoint.value = { x: ev.clientX, y: ev.clientY };
      ev.preventDefault();
    }
  };

  const onUp = (ev) => {
    if (activePointerId != null && ev.pointerId !== activePointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    clearHoldTimer();
    activePointerId = null;

    if (isDragging.value) {
      const next = snapPointerToEdge(ev.clientX, ev.clientY);
      dock.value = next;
      saveDock(next);
      isDragging.value = false;
      dragPoint.value = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // Avoid accidental reopen from the mouseenter that follows pointerup
      suppressOpenUntil = Date.now() + 350;
      ev.preventDefault();
    }
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

const shouldLoadAllThreads = computed(() => {
  if (isClubContext.value) return false; // Club: scope to club only
  if (myRole.value === 'super_admin') return true;
  const ua = agencyStore.userAgencies || [];
  return ua.length > 1;
});

const agenciesForLabel = computed(() => {
  const map = new Map();
  for (const a of (agencyStore.agencies || [])) map.set(a.id, a.name);
  for (const a of (agencyStore.userAgencies || [])) map.set(a.id, a.name);
  const current = agencyStore.currentAgency;
  if (current?.id && current?.name) map.set(current.id, current.name);
  return map;
});

const pendingThreads = computed(() => {
  const list = (threads.value || []).filter((t) => (t.unread_count || 0) > 0 && t.other_participant);
  const enriched = list.map((t) => ({
    ...t,
    agencyLabel: agenciesForLabel.value.get(t.agency_id) || (t.agency_id ? `Agency ${t.agency_id}` : '')
  }));
  return enriched.slice(0, 12);
});

const filteredPeople = computed(() => {
  const query = q.value.trim().toLowerCase();
  const list = people.value || [];
  if (!query) return list;
  return list.filter((u) => (`${u.first_name} ${u.last_name}`.toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query)));
});

const unreadByUserId = computed(() => {
  const map = new Map();
  for (const t of (threads.value || [])) {
    const other = t.other_participant;
    if (!other) continue;
    map.set(other.id, (map.get(other.id) || 0) + (t.unread_count || 0));
  }
  return map;
});

const peopleWithUnread = computed(() => {
  return (filteredPeople.value || []).map((u) => ({
    ...u,
    unreadCount: unreadByUserId.value.get(u.id) || 0
  }));
});

const presenceByUserId = computed(() => {
  const map = new Map();
  for (const u of people.value || []) {
    map.set(u.id, u);
  }
  return map;
});

const myDisplayName = computed(() => {
  const u = authStore.user;
  if (!u) return 'You';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'You';
});

const myStatusDisplay = computed(() => {
  if (presenceSession.myStatusLabel) return presenceSession.myStatusLabel;
  if (myStatusLabel.value) return myStatusLabel.value;
  if (myHeartbeatStatus.value === 'online') return 'Active';
  if (myHeartbeatStatus.value === 'idle') return 'Away';
  return 'Offline';
});

/** Slack-style single DM list: Online → Away → Offline (includes self). */
const dmList = computed(() => {
  let list = [...(peopleWithUnread.value || [])];
  if (listFilter.value === 'online') list = list.filter((u) => u.status === 'online');
  else if (listFilter.value === 'away') list = list.filter((u) => u.status === 'idle');
  list.sort((a, b) => {
    const rank = presenceSortRank(a.status) - presenceSortRank(b.status);
    if (rank !== 0) return rank;
    const an = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
    const bn = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
    return an.localeCompare(bn);
  });
  return list;
});

function dotClassForUserId(userId) {
  const u = presenceByUserId.value.get(userId);
  return presenceDotClass(u?.status);
}

function subtitleForUserId(userId) {
  const u = presenceByUserId.value.get(userId);
  return u ? statusSubtitle(u) : 'Offline';
}

const loadPresence = async () => {
  try {
    loading.value = true;
    error.value = '';
    if (adminsAllMode.value) {
      const resp = await api.get('/presence/admins', { skipGlobalLoading: true });
      people.value = resp.data || [];
    } else {
      if (!agencyId.value) {
        people.value = [];
        return;
      }
      const params = {};
      if (isSchoolStaffViewer.value) {
        params.audience = 'school';
      } else if (canToggleAudience.value && audienceMode.value === 'directory') {
        params.audience = 'directory';
        params.role = directoryRole.value || 'school_staff';
      } else {
        params.audience = 'team';
      }
      const resp = await api.get(`/presence/agency/${agencyId.value}`, {
        params,
        skipGlobalLoading: true
      });
      people.value = resp.data || [];
    }
  } catch {
    error.value = 'Failed to load presence';
    people.value = [];
  } finally {
    loading.value = false;
  }
};

const setAudienceMode = async (mode) => {
  audienceMode.value = mode === 'directory' ? 'directory' : 'team';
  await loadPresence();
};

const setDirectoryRole = async (roleId) => {
  directoryRole.value = roleId;
  audienceMode.value = 'directory';
  await loadPresence();
};

const loadThreads = async () => {
  try {
    const params = {};
    if (!shouldLoadAllThreads.value) {
      if (!agencyId.value) {
        threads.value = [];
        return;
      }
      params.agencyId = agencyId.value;
    }
    const resp = await api.get('/chat/threads', { params, skipGlobalLoading: true });
    threads.value = resp.data || [];
  } catch {
    // ignore
  }
};

const loadChannels = async () => {
  if (isSchoolStaffViewer.value || isClubContext.value) {
    channels.value = [];
    return;
  }
  if (!agencyId.value) {
    channels.value = [];
    return;
  }
  try {
    channelsLoading.value = true;
    channelError.value = '';
    const resp = await api.get('/chat/channels', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    channels.value = resp.data?.channels || [];
  } catch (e) {
    channelError.value = e.response?.data?.error?.message || 'Failed to load channels';
    channels.value = [];
  } finally {
    channelsLoading.value = false;
  }
};

const switchToDms = () => {
  mainTab.value = 'dms';
  if (activeChannel.value) closeChat();
};

const switchToChannels = async () => {
  mainTab.value = 'channels';
  if (activeChatUser.value) closeChat();
  await loadChannels();
};

function channelPreview(ch) {
  const body = String(ch?.last_message?.body || '').trim();
  if (body) return body.length > 60 ? `${body.slice(0, 60)}…` : body;
  if (ch?.description) return ch.description;
  if (ch?.kind === 'general') return 'Organization-wide';
  if (ch?.kind === 'school') return 'School team channel';
  return 'No messages yet';
}

const openChannelThread = async (ch) => {
  if (!ch?.thread_id) return;
  chatError.value = '';
  channelError.value = '';
  chatMessages.value = [];
  draft.value = '';
  activeChatUser.value = null;
  try {
    chatLoading.value = true;
    const resp = await api.post(`/chat/channels/${ch.thread_id}/open`, {}, { skipGlobalLoading: true });
    activeThreadId.value = resp.data?.threadId || ch.thread_id;
    activeThreadAgencyId.value = resp.data?.agencyId || ch.agency_id || agencyId.value;
    activeChannel.value = resp.data?.channel || ch;
    await loadMessages({ markRead: true, scrollToBottom: true });
    await loadChannels();
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open channel';
  } finally {
    chatLoading.value = false;
  }
};

const createNewChannel = async () => {
  const name = newChannelName.value.trim();
  if (!name || !agencyId.value) return;
  try {
    creatingChannel.value = true;
    channelError.value = '';
    const resp = await api.post(
      '/chat/channels',
      {
        agencyId: agencyId.value,
        name,
        description: newChannelDesc.value.trim() || null,
        visibility: newChannelPrivate.value ? 'private' : 'public'
      },
      { skipGlobalLoading: true }
    );
    showCreateChannel.value = false;
    newChannelName.value = '';
    newChannelDesc.value = '';
    newChannelPrivate.value = false;
    await loadChannels();
    if (resp.data?.channel) await openChannelThread(resp.data.channel);
  } catch (e) {
    channelError.value = e.response?.data?.error?.message || 'Failed to create channel';
  } finally {
    creatingChannel.value = false;
  }
};

const openChat = async (u, agencyIdOverride = null, organizationIdOverride = null) => {
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';
  activeChannel.value = null;
  mainTab.value = 'dms';

  try {
    chatLoading.value = true;
    const useAgencyId = agencyIdOverride || agencyId.value;
    if (!useAgencyId) {
      // In super-admin "admins-only" mode there may be no agency context.
      // Don't open the full chat box in that case (it creates a large empty panel).
      chatError.value = 'Select an agency to start a chat';
      activeChatUser.value = null;
      activeThreadId.value = null;
      activeThreadAgencyId.value = null;
      chatMessages.value = [];
      return;
    }

    activeChatUser.value = u;
    activeThreadAgencyId.value = useAgencyId;
    const body = { agencyId: useAgencyId, otherUserId: u.id };
    const oid =
      organizationIdOverride != null && organizationIdOverride !== ''
        ? parseInt(organizationIdOverride, 10)
        : null;
    if (oid) body.organizationId = oid;
    const resp = await api.post('/chat/threads/direct', body, { skipGlobalLoading: true });
    activeThreadId.value = resp.data.threadId;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open chat';
  } finally {
    chatLoading.value = false;
  }
};

const openThread = async (t) => {
  if (String(t?.thread_type || '') === 'channel') {
    mainTab.value = 'channels';
    await openChannelThread({
      thread_id: t.thread_id,
      agency_id: t.agency_id,
      name: t.channel_name || t.thread_label || t.channel_slug || 'channel',
      slug: t.channel_slug,
      unread_count: t.unread_count
    });
    return;
  }
  if (!t?.other_participant) return;
  await openChat(t.other_participant, t.agency_id, t.organization_id);
};

/** Open a direct thread by user id (e.g. from URL openChatWith=userId&agencyId=...). Used when supervisor clicks "Chat with supervisee". */
const openChatByUserId = async (otherUserId, agencyIdOverride, displayName = '', organizationIdOverride = null) => {
  const useAgencyId = agencyIdOverride ? parseInt(agencyIdOverride, 10) : agencyId.value;
  if (!useAgencyId || !otherUserId) return;
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';
  try {
    chatLoading.value = true;
    const body = {
      agencyId: useAgencyId,
      otherUserId: parseInt(otherUserId, 10)
    };
    const oid =
      organizationIdOverride != null && organizationIdOverride !== ''
        ? parseInt(organizationIdOverride, 10)
        : null;
    if (oid) body.organizationId = oid;
    const resp = await api.post('/chat/threads/direct', body, { skipGlobalLoading: true });
    activeThreadId.value = resp.data?.threadId ?? null;
    activeThreadAgencyId.value = useAgencyId;
    const name = (displayName || '').trim() || 'User';
    const parts = name.split(/\s+/);
    activeChatUser.value = {
      id: parseInt(otherUserId, 10),
      first_name: parts[0] || name,
      last_name: parts.slice(1).join(' ') || ''
    };
    if (activeThreadId.value) {
      await loadMessages({ markRead: true, scrollToBottom: true });
    }
    isOpen.value = true;
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open chat';
  } finally {
    chatLoading.value = false;
  }
};

const scrollMessagesToBottom = async () => {
  await nextTick();
  const el = chatMessagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

const toggleSelectMode = () => {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selectedMessageIds.value = [];
};

const isSelected = (id) => selectedMessageIds.value.includes(Number(id));

const toggleSelected = (id) => {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  if (isSelected(n)) {
    selectedMessageIds.value = selectedMessageIds.value.filter((x) => x !== n);
  } else {
    selectedMessageIds.value = [...selectedMessageIds.value, n];
  }
};

const loadMessages = async ({ markRead, scrollToBottom } = { markRead: true, scrollToBottom: true }) => {
  if (!activeThreadId.value) return;
  try {
    chatLoading.value = true;
    const resp = await api.get(
      `/chat/threads/${activeThreadId.value}/messages`,
      { params: { limit: 60 }, skipGlobalLoading: true }
    );
    chatMessages.value = resp.data || [];
    if (scrollToBottom) {
      await scrollMessagesToBottom();
    }
    const last = chatMessages.value[chatMessages.value.length - 1];
    const canMarkRead =
      !!markRead && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
    if (canMarkRead && last?.id) {
      // Fire-and-forget: don't block UI on read receipts or thread refresh.
      api.post(
        `/chat/threads/${activeThreadId.value}/read`,
        { lastReadMessageId: last.id },
        { skipGlobalLoading: true }
      ).catch(() => {});
      loadThreads().catch(() => {});
    }
  } finally {
    chatLoading.value = false;
  }
};

const send = async () => {
  if (!activeThreadId.value || !draft.value.trim()) return;
  try {
    sending.value = true;
    const body = draft.value.trim();
    draft.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/messages`, { body }, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

const unsend = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  if (m.sender_user_id !== meId.value) return;
  if (m.is_read_by_other) return;
  try {
    sending.value = true;
    await api.delete(`/chat/threads/${activeThreadId.value}/messages/${m.id}`, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to unsend message';
  } finally {
    sending.value = false;
  }
};

const deleteForMe = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  try {
    sending.value = true;
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/${m.id}/delete-for-me`,
      {},
      { skipGlobalLoading: true }
    );
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete message';
  } finally {
    sending.value = false;
  }
};

const deleteSelected = async () => {
  if (!activeThreadId.value) return;
  const ids = selectedMessageIds.value || [];
  if (ids.length === 0) return;
  try {
    sending.value = true;
    chatError.value = '';
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/delete-for-me`,
      { messageIds: ids },
      { skipGlobalLoading: true }
    );
    selectedMessageIds.value = [];
    selectMode.value = false;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete selected messages';
  } finally {
    sending.value = false;
  }
};

const deleteThread = async () => {
  if (!activeThreadId.value) return;
  try {
    sending.value = true;
    chatError.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/delete-for-me`, {}, { skipGlobalLoading: true });
    closeChat();
    await loadThreads();
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete thread';
  } finally {
    sending.value = false;
  }
};

const closeChat = () => {
  activeChatUser.value = null;
  activeChannel.value = null;
  activeThreadId.value = null;
  activeThreadAgencyId.value = null;
  chatMessages.value = [];
  draft.value = '';
  chatError.value = '';
  selectMode.value = false;
  selectedMessageIds.value = [];
};

const fetchMyPresence = async () => {
  try {
    const data = await presenceSession.refreshFromServer();
    if (data) {
      myAvailability.value = data.availability_level || null;
      myHeartbeatStatus.value = data.heartbeat_status || data.status || 'offline';
      myStatusLabel.value = data.status_label || data.presence_display_label || null;
      if (data.session_extend_active && data.presence_session_extend_until) {
        pauseIdleForSessionExtend(data.presence_session_extend_until);
      } else {
        // Server cleared Away extend — resume normal Timedown immediately.
        clearSessionExtendPause({ reschedule: true });
      }
    }
  } catch {
    // ignore
  }
};

const setMyAvailability = async (level) => {
  try {
    await api.post('/presence/availability', { availabilityLevel: level }, { skipGlobalLoading: true });
    myAvailability.value = level;
    statusMenuOpen.value = false;
    await Promise.all([fetchMyPresence(), loadPresence(), loadThreads()]);
  } catch {
    // ignore
  }
};

const toggleMyAvailability = async () => {
  const next = myAvailability.value === 'offline' ? 'everyone' : 'offline';
  await setMyAvailability(next);
};

const quickSetAway = async (reason) => {
  try {
    if (reason === 'out_day') {
      await presenceSession.applyAway({ reason: 'out_day', extendSession: false });
    } else {
      await presenceSession.applyAway({ reason, durationMinutes: 60, extendSession: true });
      pauseIdleForSessionExtend(presenceSession.sessionExtendUntil);
    }
    statusMenuOpen.value = false;
    await Promise.all([fetchMyPresence(), loadPresence()]);
  } catch {
    // ignore
  }
};

const clearMyAway = async () => {
  try {
    await presenceSession.clearAway();
    clearSessionExtendPause({ reschedule: true });
    resetActivityTimer();
    statusMenuOpen.value = false;
    await Promise.all([fetchMyPresence(), loadPresence()]);
  } catch {
    // ignore
  }
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!isAuthenticated.value) return;
    const jobs = [loadPresence(), loadThreads()];
    if (mainTab.value === 'channels' && !isSchoolStaffViewer.value) jobs.push(loadChannels());
    Promise.all(jobs);
    if (activeThreadId.value) {
      // Poll messages without marking them as read (prevents background tabs from auto-reading).
      loadMessages({ markRead: false });
    }
  }, 20000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

watch(agencyId, async () => {
  closeChat();
  const jobs = [loadPresence(), loadThreads()];
  if (mainTab.value === 'channels') jobs.push(loadChannels());
  await Promise.all(jobs);
});

// When URL has openChat=1 (e.g. Messages card clicked), open the drawer.
watch(
  () => route.query?.openChat,
  (val) => {
    if (val === '1' || val === 'true') {
      isOpen.value = true;
      const q = { ...route.query };
      delete q.openChat;
      router.replace({ path: route.path, query: q });
    }
  },
  { immediate: true }
);

// When URL has openChatWith + agencyId (e.g. supervisor clicked "Chat with supervisee"), open that thread in the drawer and clear those params.
watch(
  () => ({ query: route.query, path: route.path }),
  async (newVal) => {
    const openChatWith = newVal.query?.openChatWith;
    const agencyIdFromQuery = newVal.query?.agencyId;
    const openChatWithName = newVal.query?.openChatWithName;
    const organizationIdFromQuery = newVal.query?.organizationId;
    if (!openChatWith || !(agencyIdFromQuery || agencyId.value)) return;
    await openChatByUserId(
      openChatWith,
      agencyIdFromQuery || agencyId.value,
      openChatWithName,
      organizationIdFromQuery
    );
    await loadThreads();
    const q = { ...newVal.query };
    delete q.openChatWith;
    delete q.openChatWithName;
    delete q.organizationId;
    router.replace({ path: newVal.path, query: q });
  },
  { immediate: true }
);

onMounted(async () => {
  if (!isAuthenticated.value) return;
  await Promise.all([fetchMyPresence(), loadPresence(), loadThreads()]);
  startPolling();
});

onUnmounted(() => {
  stopPolling();
  clearHoldTimer();
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});
</script>

<style scoped>
.chat-drawer {
  position: fixed;
  z-index: 1200; /* stay above page nav/buttons */
  display: flex;
  align-items: stretch;
  pointer-events: auto;
  max-height: calc(100vh - 24px);
  /* left/top/transform come from dock style */
}

.chat-drawer.dock-left {
  flex-direction: row;
}
.chat-drawer.dock-right {
  flex-direction: row-reverse;
}
.chat-drawer.dock-top {
  flex-direction: column;
  max-width: min(360px, 96vw);
}
.chat-drawer.dock-bottom {
  flex-direction: column-reverse;
  max-width: min(360px, 96vw);
}

.chat-drawer.dragging {
  z-index: 1400;
  opacity: 0.96;
  transition: none;
}

.dock-hint {
  position: absolute;
  left: 50%;
  top: -28px;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgba(15, 23, 42, 0.85);
  border-radius: 999px;
  padding: 4px 10px;
  pointer-events: none;
}
.chat-drawer.dock-top .dock-hint {
  top: auto;
  bottom: -28px;
}

.rail {
  width: 44px;
  background: transparent; /* no rail background */
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 6px;
  gap: 6px;
  border-radius: 0;
  box-shadow: none;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}
.chat-drawer.dragging .rail {
  cursor: grabbing;
}
.chat-drawer.dock-top .rail,
.chat-drawer.dock-bottom .rail {
  flex-direction: row;
  width: auto;
  min-width: 120px;
  height: 44px;
}

.rail-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Don't crop the icon */
  overflow: visible;
  border-radius: 0;
}

.rail-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain; /* avoid clipping */
}

.icon-fallback {
  font-size: 11px;
  font-weight: 800;
}

.rail-badge {
  font-size: 11px;
  font-weight: 900;
  border-radius: 999px;
  padding: 2px 6px;
  line-height: 1.2;
  background: rgba(15, 23, 42, 0.65); /* subtle pill; rail itself stays invisible */
  color: #fff;
}

.rail-badge-top {
  background: rgba(239, 68, 68, 0.9);
}

.rail-badge-top.zero {
  background: rgba(15, 23, 42, 0.35);
  color: rgba(255, 255, 255, 0.85);
}

.rail-badge-bottom {
  background: rgba(34, 197, 94, 0.35);
  border: 1px solid rgba(34, 197, 94, 0.45);
  color: #dcfce7;
}

.rail-badge-bottom.disabled {
  opacity: 0.55;
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.3);
  color: #e2e8f0;
}

.panel {
  width: 0;
  height: 0; /* prevent huge invisible container when closed */
  max-height: 0;
  overflow: hidden;
  background: white;
  border-right: none;
  transition: width 160ms ease, max-height 160ms ease;
  display: flex;
  flex-direction: column;
}

.chat-drawer.open .panel {
  width: 360px;
  /* Keep it compact by default but never exceed viewport. */
  height: clamp(420px, 72vh, calc(100vh - 24px));
  max-height: calc(100vh - 24px);
  border-right: 1px solid var(--border);
}
.chat-drawer.dock-right.open .panel {
  border-right: none;
  border-left: 1px solid var(--border);
}
.chat-drawer.dock-top.open .panel,
.chat-drawer.dock-bottom.open .panel {
  width: min(360px, 96vw);
  border-right: 1px solid var(--border);
}
.chat-drawer.dock-top.open .panel {
  border-top: 1px solid var(--border);
}
.chat-drawer.dock-bottom.open .panel {
  border-bottom: 1px solid var(--border);
}

.panel-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title {
  font-weight: 800;
  color: var(--text-primary);
}

.subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.nav-stubs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.nav-stub {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.nav-stub.active {
  background: rgba(34, 197, 94, 0.12);
  color: var(--text-primary);
}
.nav-stub:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.nav-stub-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  margin-left: 4px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
.channel-row .channel-hash {
  width: 18px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  color: #0f766e;
  opacity: 0.85;
}
.channel-row.active {
  background: #f0fdfa;
}
.create-channel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  border-bottom: 1px solid #e2e8f0;
}
.create-channel-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}

.filter-chips {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.filter-chip {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
}
.filter-chip.active {
  border-color: #22c55e;
  color: #166534;
  background: #f0fdf4;
}

.name-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.status-line {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.you-chip {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 800;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 6px;
}

.self-footer {
  position: relative;
  border-top: 1px solid var(--border);
  padding: 8px 10px;
  background: #f8fafc;
}
.self-status-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}
.self-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.self-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
}
.self-status-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.self-chevron {
  color: var(--text-secondary);
  font-size: 12px;
}
.status-menu {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(100% + 6px);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  padding: 8px;
  z-index: 5;
  max-height: 280px;
  overflow: auto;
}
.status-menu-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 4px 8px 6px;
}
.status-menu-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-primary);
  cursor: pointer;
}
.status-menu-item:hover,
.status-menu-item.active {
  background: #f0fdf4;
}
.status-menu-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}

.btn.btn-xs {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 8px;
}

.agency-chip {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}

.panel-body {
  position: relative; /* contain the absolute chat-box (prevents “ghost window” on collapse) */
  padding: 12px 14px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbar { margin-bottom: 10px; }
.search {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

.lists {
  height: calc(100% - 84px);
  overflow: auto;
  padding-right: 4px;
}

.section { margin-bottom: 14px; }
.section-title { font-weight: 800; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.person {
  width: 100%;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 8px;
  text-align: left;
}
.person:hover { border-color: var(--primary); }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot-online { background: #22c55e; }
.dot-idle { background: #f59e0b; }
.dot-offline { background: #9ca3af; }
.name { flex: 1; font-weight: 700; color: var(--text-primary); font-size: 13px; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--text-secondary); font-weight: 800; }
.muted { color: var(--text-secondary); font-size: 13px; padding: 6px 2px; }
/* Let the main `.lists` container handle scrolling; don't cap Offline at 240px. */
.scroll { max-height: none; overflow: visible; padding-right: 0; }

.chat-box {
  position: absolute;
  right: 0;
  bottom: 0;
  top: 0;
  width: 360px;
  height: auto;
  border-top: 1px solid var(--border);
  background: white;
  display: flex;
  flex-direction: column;
  min-height: 0; /* critical for flex+overflow scrolling */
  z-index: 1;
}

.chat-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.chat-title { font-weight: 800; }
.chat-box-actions { display: flex; gap: 8px; align-items: center; }
.btn-close { border: none; background: none; font-size: 18px; cursor: pointer; color: var(--text-secondary); }

.chat-messages {
  flex: 1;
  overflow: auto;
  padding: 10px 12px;
  background: #f8fafc;
  min-height: 0; /* allows this flex child to scroll instead of pushing composer off-screen */
}
.msg-list { display: flex; flex-direction: column; gap: 10px; }
.msg-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-row.mine { justify-content: flex-end; }
.msg-select { padding-top: 6px; }
.msg-select input { width: 14px; height: 14px; }
.msg {
  border: 1px solid var(--border);
  background: white;
  border-radius: 12px;
  padding: 8px 10px;
  max-width: 90%;
}
.msg.mine { background: #ecfdf5; border-color: #a7f3d0; }
.msg-meta { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.msg-receipt { margin-left: 6px; font-weight: 900; color: rgba(15, 23, 42, 0.6); }
.msg.mine .msg-receipt { color: rgba(16, 185, 129, 0.9); }
.msg-action {
  margin-left: 10px;
  border: none;
  background: transparent;
  color: rgba(15, 23, 42, 0.55);
  font-weight: 800;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.msg-action:hover { color: rgba(15, 23, 42, 0.75); text-decoration: underline; }
.msg-action:disabled { opacity: 0.6; cursor: not-allowed; }
.msg-body { white-space: pre-wrap; font-size: 13px; color: var(--text-primary); }

.chat-composer {
  border-top: 1px solid var(--border);
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.chat-composer textarea {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  min-height: 56px;
  max-height: 140px;
  resize: vertical;
  font-size: 13px;
}
.chat-composer .btn {
  padding: 0 14px;
  font-size: 13px;
  border-radius: 10px;
  min-width: 56px;
  min-height: 56px; /* match textarea min-height */
  height: 100%; /* match current textarea height as it grows */
}

.loading { color: var(--text-secondary); }
.error { color: #b91c1c; font-size: 13px; }
.empty { color: var(--text-secondary); padding: 10px 2px; }
</style>

