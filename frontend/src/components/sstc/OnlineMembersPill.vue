<template>
  <div v-if="clubId" class="online-pill-wrap" v-click-outside="closePopover">
    <button
      type="button"
      class="online-pill"
      :class="{ 'online-pill--has-people': onlineCount > 0, 'online-pill--open': open }"
      :title="onlineCount === 0 ? 'No one online right now' : `${onlineCount} member${onlineCount === 1 ? '' : 's'} online`"
      @click="toggleOpen"
    >
      <span class="online-dot" :class="{ 'online-dot--idle': onlineCount === 0 }" aria-hidden="true"></span>
      <span class="online-pill-label">
        <strong>{{ onlineCount }}</strong>
        <span class="online-pill-text">{{ onlineCount === 1 ? 'online' : 'online' }}</span>
      </span>
      <svg class="online-pill-chev" :class="{ 'online-pill-chev--open': open }" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="open" class="online-pop">
      <div class="online-pop-header">
        <div class="online-pop-title">Who's online</div>
        <div class="online-pop-sub">Live • refreshes every {{ Math.round(refreshMs / 1000) }}s</div>
      </div>

      <div v-if="loading && !people.length" class="online-pop-empty">Loading…</div>
      <div v-else-if="error" class="online-pop-error">{{ error }}</div>
      <template v-else>
        <div v-if="onlineList.length" class="online-pop-section">
          <div class="online-pop-section-label">Online ({{ onlineList.length }})</div>
          <div class="online-pop-list">
            <div v-for="p in onlineList" :key="`on-${p.id}`" class="online-pop-row">
              <span class="online-pop-avatar" :class="{ 'online-pop-avatar--me': isMe(p) }">{{ initialsFor(p) }}</span>
              <div class="online-pop-meta">
                <div class="online-pop-name">
                  {{ p.first_name }} {{ p.last_name }}
                  <span v-if="isMe(p)" class="online-pop-me-tag">you</span>
                </div>
                <div v-if="roleLabel(p)" class="online-pop-role">{{ roleLabel(p) }}</div>
              </div>
              <span class="online-pop-status online-pop-status--online">
                <span class="online-dot" aria-hidden="true"></span>
                online
              </span>
            </div>
          </div>
        </div>

        <div v-if="idleList.length" class="online-pop-section">
          <div class="online-pop-section-label">Recently active ({{ idleList.length }})</div>
          <div class="online-pop-list">
            <div v-for="p in idleList" :key="`id-${p.id}`" class="online-pop-row">
              <span class="online-pop-avatar online-pop-avatar--idle">{{ initialsFor(p) }}</span>
              <div class="online-pop-meta">
                <div class="online-pop-name">{{ p.first_name }} {{ p.last_name }}</div>
                <div v-if="roleLabel(p)" class="online-pop-role">{{ roleLabel(p) }}</div>
              </div>
              <span class="online-pop-status online-pop-status--idle">idle</span>
            </div>
          </div>
        </div>

        <div v-if="!onlineList.length && !idleList.length" class="online-pop-empty">
          No one's around right now. Check back soon!
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  clubId: { type: [Number, String], default: null },
  refreshMs: { type: Number, default: 30000 }
});

const authStore = useAuthStore();

const open = ref(false);
const people = ref([]);
const loading = ref(false);
const error = ref('');
let pollTimer = null;

const meId = computed(() => authStore.user?.id);
const isMe = (p) => Number(p?.id) === Number(meId.value);

const onlineList = computed(() =>
  (people.value || []).filter((p) => p.status === 'online').slice(0, 50)
);
const idleList = computed(() =>
  (people.value || []).filter((p) => p.status === 'idle').slice(0, 50)
);
const onlineCount = computed(() => onlineList.value.length);

const initialsFor = (p) => {
  const first = String(p?.first_name || '').trim().charAt(0).toUpperCase();
  const last = String(p?.last_name || '').trim().charAt(0).toUpperCase();
  return `${first}${last}` || (String(p?.email || '?').charAt(0).toUpperCase());
};

const roleLabel = (p) => {
  const r = String(p?.role || '').toLowerCase();
  if (r === 'super_admin') return 'Platform admin';
  if (r === 'admin') return 'Admin';
  if (r === 'support') return 'Support';
  if (r === 'provider_plus' || r === 'provider' || r === 'pt') return 'Member';
  if (r === 'school_staff') return 'Staff';
  return '';
};

const fetchPresence = async () => {
  const cid = Number(props.clubId || 0);
  if (!cid) {
    people.value = [];
    return;
  }
  try {
    if (!people.value.length) loading.value = true;
    error.value = '';
    const resp = await api.get(`/presence/agency/${cid}`, { skipGlobalLoading: true });
    people.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    error.value = 'Couldn\'t load who\'s online';
  } finally {
    loading.value = false;
  }
};

const ensureMyPresenceOnline = async () => {
  // Make sure the *viewer* counts themselves as online so the indicator behaves
  // intuitively for SSTC where everyone wants the casual "online" feel.
  // Provider users default to 'everyone' on the backend, but admins/super-admins
  // default to 'offline'. Force them online while they're on this page so the
  // count makes sense.
  try {
    const meResp = await api.get('/presence/me', { skipGlobalLoading: true });
    const lvl = String(meResp.data?.availability_level || '').toLowerCase();
    if (lvl === 'offline') {
      await api.post('/presence/availability', { availabilityLevel: 'everyone' }, { skipGlobalLoading: true });
    }
  } catch {
    // best-effort; presence endpoint may be transiently unavailable
  }
};

const toggleOpen = () => {
  open.value = !open.value;
  if (open.value) fetchPresence();
};

const closePopover = () => { open.value = false; };

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(fetchPresence, Math.max(10000, Number(props.refreshMs) || 30000));
};
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onMounted(async () => {
  await ensureMyPresenceOnline();
  await fetchPresence();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});

watch(() => props.clubId, () => {
  fetchPresence();
});

const vClickOutside = {
  mounted(el, binding) {
    el.__clickOutside__ = (e) => {
      if (!el.contains(e.target)) binding.value(e);
    };
    document.addEventListener('mousedown', el.__clickOutside__, true);
  },
  unmounted(el) {
    if (el.__clickOutside__) {
      document.removeEventListener('mousedown', el.__clickOutside__, true);
      el.__clickOutside__ = null;
    }
  }
};
</script>

<style scoped>
.online-pill-wrap {
  position: relative;
  display: inline-block;
}

.online-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: rgb(15, 23, 42);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
  backdrop-filter: blur(8px);
}
.online-pill:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(15, 23, 42, 0.3);
}
.online-pill:active {
  transform: scale(0.98);
}
.online-pill--has-people {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(240, 253, 244, 0.95);
}
.online-pill--has-people:hover {
  background: rgba(240, 253, 244, 1);
  border-color: rgba(34, 197, 94, 0.6);
}
.online-pill--open {
  border-color: rgba(34, 197, 94, 0.7);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
}

.online-pill-label {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.online-pill-label strong { font-weight: 800; }
.online-pill-text {
  font-weight: 500;
  color: rgba(15, 23, 42, 0.75);
}

.online-pill-chev {
  width: 10px;
  height: 10px;
  color: rgba(15, 23, 42, 0.55);
  transition: transform 0.18s ease;
}
.online-pill-chev--open { transform: rotate(180deg); }

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(34, 197, 94);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
  display: inline-block;
}
.online-dot--idle {
  background: rgba(148, 163, 184, 0.9);
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
}

.online-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(320px, 88vw);
  max-height: 60vh;
  overflow-y: auto;
  background: white;
  color: rgb(15, 23, 42);
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2);
  z-index: 1100;
  padding: 12px 14px 14px;
}

.online-pop-header { margin-bottom: 8px; }
.online-pop-title { font-size: 14px; font-weight: 700; }
.online-pop-sub { font-size: 11px; color: rgba(15, 23, 42, 0.55); margin-top: 2px; }

.online-pop-section + .online-pop-section { margin-top: 10px; }
.online-pop-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.55);
  margin: 6px 0 4px;
}

.online-pop-list { display: flex; flex-direction: column; gap: 4px; }

.online-pop-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 8px;
}
.online-pop-row:hover { background: rgba(15, 23, 42, 0.04); }

.online-pop-avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(99, 102, 241), rgb(34, 197, 94));
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.online-pop-avatar--me {
  background: linear-gradient(135deg, rgb(245, 158, 11), rgb(234, 88, 12));
}
.online-pop-avatar--idle {
  background: linear-gradient(135deg, rgb(148, 163, 184), rgb(100, 116, 139));
}

.online-pop-meta { flex: 1; min-width: 0; }
.online-pop-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.online-pop-me-tag {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: rgb(234, 88, 12);
  letter-spacing: 0.05em;
}
.online-pop-role { font-size: 11px; color: rgba(15, 23, 42, 0.55); }

.online-pop-status {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.online-pop-status--online { color: rgb(22, 163, 74); }
.online-pop-status--idle { color: rgba(15, 23, 42, 0.5); }

.online-pop-empty,
.online-pop-error {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
  padding: 12px 4px;
  text-align: center;
}
.online-pop-error { color: rgb(220, 38, 38); }

@media (prefers-color-scheme: dark) {
  .online-pill {
    background: rgba(15, 23, 42, 0.6);
    color: rgb(248, 250, 252);
    border-color: rgba(248, 250, 252, 0.15);
  }
  .online-pill-text { color: rgba(248, 250, 252, 0.7); }
  .online-pill-chev { color: rgba(248, 250, 252, 0.6); }
  .online-pill--has-people {
    background: rgba(20, 83, 45, 0.4);
    border-color: rgba(34, 197, 94, 0.4);
  }
  .online-pop {
    background: rgb(15, 23, 42);
    color: rgb(248, 250, 252);
    border-color: rgba(248, 250, 252, 0.1);
  }
  .online-pop-sub,
  .online-pop-section-label,
  .online-pop-role,
  .online-pop-empty { color: rgba(248, 250, 252, 0.6); }
  .online-pop-row:hover { background: rgba(248, 250, 252, 0.05); }
  .online-pop-status--idle { color: rgba(248, 250, 252, 0.5); }
}

[data-theme='dark'] .online-pill {
  background: rgba(15, 23, 42, 0.6);
  color: rgb(248, 250, 252);
  border-color: rgba(248, 250, 252, 0.15);
}
[data-theme='dark'] .online-pill-text { color: rgba(248, 250, 252, 0.7); }
[data-theme='dark'] .online-pill-chev { color: rgba(248, 250, 252, 0.6); }
[data-theme='dark'] .online-pill--has-people {
  background: rgba(20, 83, 45, 0.4);
  border-color: rgba(34, 197, 94, 0.4);
}
[data-theme='dark'] .online-pop {
  background: rgb(15, 23, 42);
  color: rgb(248, 250, 252);
  border-color: rgba(248, 250, 252, 0.1);
}
[data-theme='dark'] .online-pop-sub,
[data-theme='dark'] .online-pop-section-label,
[data-theme='dark'] .online-pop-role,
[data-theme='dark'] .online-pop-empty { color: rgba(248, 250, 252, 0.6); }
[data-theme='dark'] .online-pop-row:hover { background: rgba(248, 250, 252, 0.05); }
[data-theme='dark'] .online-pop-status--idle { color: rgba(248, 250, 252, 0.5); }
</style>
