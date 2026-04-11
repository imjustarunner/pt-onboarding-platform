<template>
  <div class="live-draft">
    <!-- Header -->
    <div class="draft-header">
      <div class="draft-header__left">
        <button class="btn-back" @click="$router.back()">← Back</button>
        <div class="draft-title-block">
          <h1 class="draft-title">Live Team Draft</h1>
          <span v-if="seasonName" class="draft-season-name">{{ seasonName }}</span>
        </div>
      </div>
      <div class="draft-header__status">
        <span v-if="!session" class="status-badge status-badge--none">Not Set Up</span>
        <span v-else-if="session.status === 'pending'" class="status-badge status-badge--pending">Ready to Start</span>
        <span v-else-if="session.status === 'in_progress'" class="status-badge status-badge--live">
          <span class="live-dot" /> Live
        </span>
        <span v-else-if="session.status === 'completed'" class="status-badge status-badge--done">Draft Complete</span>
        <span v-else class="status-badge status-badge--none">{{ session.status }}</span>
      </div>
    </div>

    <!-- Pick indicator bar (only while in progress) -->
    <div v-if="session?.status === 'in_progress'" class="pick-bar">
      <div v-if="currentPickTeam" class="pick-bar__inner">
        <UserAvatar
          :photo-path="currentPickTeam.captainPhoto"
          :first-name="currentPickTeam.teamName"
          :last-name="''"
          size="sm"
        />
        <div class="pick-bar__text">
          <span class="pick-bar__team">{{ currentPickTeam.teamName }}</span> is picking
          <span class="pick-bar__meta">Round {{ currentRound }} · Pick {{ session.currentPickIndex + 1 }} of {{ session.totalPicks }}</span>
        </div>
        <div v-if="isMyTurn" class="pick-bar__your-turn">Your turn — select a member →</div>
      </div>
      <div v-else class="pick-bar__inner pick-bar__inner--done">All picks have been used. Draft wrapping up…</div>
    </div>

    <!-- Manager controls -->
    <div v-if="isManager" class="manager-controls">
      <div v-if="!session || session.status === 'pending'" class="manager-controls__row">
        <button
          v-if="session?.status === 'pending'"
          class="btn btn-primary btn-sm"
          :disabled="starting"
          @click="startDraft"
        >
          {{ starting ? 'Starting…' : 'Start Draft' }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="showSetup = !showSetup">
          {{ showSetup ? 'Hide Setup' : 'Set Up Draft' }}
        </button>
        <button
          v-if="session"
          class="btn btn-danger-ghost btn-sm"
          :disabled="resetting"
          @click="resetDraft"
        >
          {{ resetting ? 'Resetting…' : 'Reset Draft' }}
        </button>
      </div>
      <div v-if="session?.status === 'in_progress'" class="manager-controls__row">
        <span class="manager-hint">Manager override: click any member card to draft for the current team.</span>
        <button class="btn btn-danger-ghost btn-sm" :disabled="resetting" @click="resetDraft">
          {{ resetting ? 'Resetting…' : 'Reset Draft' }}
        </button>
      </div>
      <div v-if="session?.status === 'completed'" class="manager-controls__row">
        <button class="btn btn-secondary btn-sm" :disabled="resetting" @click="resetDraft">
          {{ resetting ? 'Resetting…' : 'Reset &amp; Redo Draft' }}
        </button>
      </div>
    </div>

    <!-- Setup panel -->
    <div v-if="showSetup && isManager" class="setup-panel">
      <h3 class="setup-panel__title">Draft Setup</h3>
      <div class="setup-panel__row">
        <label class="setup-label">Draft mode</label>
        <div class="setup-mode-btns">
          <button
            class="mode-btn"
            :class="{ 'mode-btn--active': setupMode === 'snake' }"
            @click="setupMode = 'snake'"
          >Snake</button>
          <button
            class="mode-btn"
            :class="{ 'mode-btn--active': setupMode === 'random' }"
            @click="setupMode = 'random'"
          >Random</button>
        </div>
      </div>
      <div class="setup-panel__row">
        <label class="setup-label">Rounds</label>
        <input
          v-model.number="setupRounds"
          type="number"
          min="1"
          max="30"
          class="setup-input-small"
        />
      </div>
      <div class="setup-panel__row setup-panel__row--col">
        <div class="setup-label-row">
          <label class="setup-label">Captain pick order</label>
          <button class="btn-link" @click="shuffleCaptainOrder">🔀 Randomize</button>
        </div>
        <p class="setup-hint">Drag to reorder — Team 1 picks first, then snakes back.</p>
        <div class="captain-order-list">
          <div
            v-for="(teamId, idx) in setupCaptainOrder"
            :key="teamId"
            class="captain-order-item"
            draggable="true"
            @dragstart="dragStart(idx)"
            @dragover.prevent
            @drop="dragDrop(idx)"
          >
            <span class="captain-order-num">{{ idx + 1 }}</span>
            <span class="captain-order-name">{{ teamNameById(teamId) }}</span>
            <span class="drag-handle">⠿</span>
          </div>
        </div>
      </div>
      <div class="setup-panel__actions">
        <button class="btn btn-primary" :disabled="settingUp || !setupCaptainOrder.length" @click="setupDraft">
          {{ settingUp ? 'Saving…' : 'Save Setup' }}
        </button>
        <button class="btn btn-ghost" @click="showSetup = false">Cancel</button>
      </div>
      <p v-if="setupError" class="error-inline">{{ setupError }}</p>
    </div>

    <!-- Main draft area -->
    <div v-if="loading && !session" class="draft-loading">Loading draft…</div>

    <div v-else-if="session?.status === 'completed'" class="draft-complete">
      <div class="confetti-wrap">
        <span v-for="i in 18" :key="i" class="confetti-piece" :style="confettiStyle(i)" />
      </div>
      <div class="draft-complete__card">
        <div class="draft-complete__icon">🏆</div>
        <h2>Draft Complete!</h2>
        <p>All teams have been assembled. Let the season begin!</p>
      </div>
      <!-- Final rosters below -->
    </div>

    <div v-if="session || teams.length" class="draft-body">
      <!-- Left: teams -->
      <div class="teams-panel">
        <h2 class="panel-title">Teams <span class="panel-count">({{ teams.length }})</span></h2>
        <div
          v-for="team in teams"
          :key="team.id"
          class="team-card"
          :class="{ 'team-card--picking': currentPickTeamId === team.id }"
        >
          <div class="team-card__header">
            <div class="team-card__name-row">
              <span v-if="currentPickTeamId === team.id" class="team-card__arrow">▶</span>
              <span class="team-card__name">{{ team.teamName }}</span>
            </div>
            <div v-if="team.captainName" class="team-card__captain">
              <UserAvatar
                :photo-path="team.captainPhoto"
                :first-name="team.captainName.split(' ')[0]"
                :last-name="team.captainName.split(' ').slice(1).join(' ')"
                size="xs"
              />
              <span class="captain-label">{{ team.captainName }}</span>
            </div>
          </div>
          <div v-if="team.picks.length" class="team-card__picks">
            <div v-for="(pick, pi) in team.picks" :key="pick.providerUserId" class="pick-row">
              <span class="pick-num">{{ pi + 1 }}</span>
              <UserAvatar
                :photo-path="pick.photo"
                :first-name="pick.firstName"
                :last-name="pick.lastName"
                size="xs"
              />
              <span class="pick-name">{{ pick.firstName }} {{ pick.lastName }}</span>
            </div>
          </div>
          <div v-else class="team-card__empty">No picks yet</div>
        </div>
      </div>

      <!-- Right: available members -->
      <div class="members-panel">
        <div class="members-panel__header">
          <h2 class="panel-title">
            Available
            <span class="panel-count">({{ availableMembers.length }})</span>
          </h2>
          <input
            v-model="memberSearch"
            class="member-search"
            placeholder="Search members…"
            type="search"
          />
        </div>

        <div v-if="!availableMembers.length" class="members-empty">
          <span v-if="session?.status === 'completed'">All members have been drafted!</span>
          <span v-else>No undrafted members.</span>
        </div>

        <div class="members-grid">
          <div
            v-for="member in filteredMembers"
            :key="member.providerUserId"
            class="member-card"
            :class="{
              'member-card--pickable': canPick,
              'member-card--picking': pickingUserId === member.providerUserId
            }"
            @click="canPick ? draftMember(member) : undefined"
          >
            <div class="member-card__top">
              <UserAvatar
                :photo-path="member.photo"
                :first-name="member.firstName"
                :last-name="member.lastName"
                size="md"
              />
              <div class="member-card__info">
                <div class="member-card__name">{{ member.firstName }} {{ member.lastName }}</div>
                <div v-if="member.draftNote" class="member-card__note-preview">
                  {{ member.draftNote.slice(0, 60) }}{{ member.draftNote.length > 60 ? '…' : '' }}
                </div>
              </div>
              <button
                v-if="canViewNotes"
                class="info-btn"
                :title="member.draftNote ? 'View / edit draft note' : 'Add draft note'"
                @click.stop="openNote(member)"
              >i</button>
            </div>
            <div v-if="canPick" class="member-card__pick-hint">
              {{ pickingUserId === member.providerUserId ? 'Drafting…' : 'Click to draft' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Draft note drawer -->
    <div v-if="noteDrawer.open" class="note-drawer-overlay" @click.self="noteDrawer.open = false">
      <div class="note-drawer">
        <div class="note-drawer__header">
          <h3>Draft Note — {{ noteDrawer.member?.firstName }} {{ noteDrawer.member?.lastName }}</h3>
          <button class="btn-close" @click="noteDrawer.open = false">✕</button>
        </div>
        <div class="note-drawer__body">
          <textarea
            v-if="canEditNotes"
            v-model="noteDrawer.text"
            class="note-textarea"
            rows="6"
            placeholder="Add a draft note visible to managers and captains…"
          />
          <p v-else class="note-readonly">{{ noteDrawer.text || '(No draft note)' }}</p>
        </div>
        <div v-if="canEditNotes" class="note-drawer__actions">
          <button class="btn btn-primary btn-sm" :disabled="noteDrawer.saving" @click="saveNote">
            {{ noteDrawer.saving ? 'Saving…' : 'Save Note' }}
          </button>
          <button class="btn btn-ghost btn-sm" @click="noteDrawer.open = false">Cancel</button>
          <span v-if="noteDrawer.error" class="error-inline">{{ noteDrawer.error }}</span>
        </div>
      </div>
    </div>

    <!-- Global error -->
    <p v-if="globalError" class="global-error">{{ globalError }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { useAuthStore } from '@/store/auth';
import UserAvatar from '@/components/common/UserAvatar.vue';

const route = useRoute();
const authStore = useAuthStore();

const classId = computed(() => Number(route.params.classId));

// --- State ---
const session = ref(null);
const teams = ref([]);
const availableMembers = ref([]);
const currentPickTeamId = ref(null);
const seasonName = ref('');
const loading = ref(false);
const globalError = ref('');
const memberSearch = ref('');
const pickingUserId = ref(null);
const starting = ref(false);
const resetting = ref(false);
const settingUp = ref(false);
const setupError = ref('');
const showSetup = ref(false);
const setupMode = ref('snake');
const setupRounds = ref(10);
const setupCaptainOrder = ref([]);
let dragFromIdx = null;

// Note drawer
const noteDrawer = ref({ open: false, member: null, text: '', saving: false, error: '' });

// Polling
let pollTimer = null;

// --- Permissions ---
const myUserId = computed(() => authStore.user?.id);
const isManager = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff'
    || role === 'clinical_practice_assistant' || role === 'provider_plus';
});
const canEditNotes = computed(() => isManager.value);
const canViewNotes = computed(() => isManager.value || isMyTurn.value);

const currentPickTeam = computed(() => {
  if (!currentPickTeamId.value) return null;
  return teams.value.find((t) => t.id === currentPickTeamId.value) || null;
});

const isMyTurn = computed(() => {
  if (!currentPickTeam.value) return false;
  return Number(currentPickTeam.value.captainUserId) === Number(myUserId.value);
});

const canPick = computed(() => {
  if (session.value?.status !== 'in_progress') return false;
  if (!currentPickTeamId.value) return false;
  return isManager.value || isMyTurn.value;
});

const currentRound = computed(() => {
  if (!session.value) return 1;
  const teamCount = teams.value.length || 1;
  return Math.floor(session.value.currentPickIndex / teamCount) + 1;
});

const filteredMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase();
  if (!q) return availableMembers.value;
  return availableMembers.value.filter(
    (m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
  );
});

// --- Data fetching ---
const loadDraft = async () => {
  try {
    const { data } = await api.get(`/learning-program-classes/${classId.value}/draft-session`, {
      skipGlobalLoading: true
    });
    session.value = data.session;
    teams.value = data.teams || [];
    availableMembers.value = data.availableMembers || [];
    currentPickTeamId.value = data.currentPickTeamId || null;
    globalError.value = '';

    // If setup is open and no captain order yet, populate from teams
    if (showSetup.value && !setupCaptainOrder.value.length) {
      setupCaptainOrder.value = teams.value.map((t) => t.id);
    }

    // Stop polling when complete or cancelled
    if (data.session?.status === 'completed' || data.session?.status === 'cancelled') {
      stopPolling();
    }
  } catch (e) {
    globalError.value = e?.response?.data?.error?.message || 'Failed to load draft session';
  }
};

const loadSeasonName = async () => {
  try {
    const { data } = await api.get(`/learning-program-classes/${classId.value}`, { skipGlobalLoading: true });
    seasonName.value = data?.class_name || data?.className || '';
  } catch { /* non-fatal */ }
};

// --- Polling ---
const startPolling = () => {
  if (pollTimer) return;
  pollTimer = setInterval(() => { loadDraft(); }, 2500);
};
const stopPolling = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
};

// --- Manager actions ---
const setupDraft = async () => {
  setupError.value = '';
  if (!setupCaptainOrder.value.length) { setupError.value = 'Add at least one team'; return; }
  settingUp.value = true;
  try {
    const { data } = await api.post(
      `/learning-program-classes/${classId.value}/draft-session`,
      { draftMode: setupMode.value, captainOrder: setupCaptainOrder.value, rounds: setupRounds.value },
      { skipGlobalLoading: true }
    );
    session.value = data.session;
    teams.value = data.teams || [];
    availableMembers.value = data.availableMembers || [];
    currentPickTeamId.value = data.currentPickTeamId || null;
    showSetup.value = false;
  } catch (e) {
    setupError.value = e?.response?.data?.error?.message || 'Setup failed';
  } finally {
    settingUp.value = false;
  }
};

const startDraft = async () => {
  starting.value = true;
  try {
    const { data } = await api.post(
      `/learning-program-classes/${classId.value}/draft-session/start`,
      {},
      { skipGlobalLoading: true }
    );
    session.value = data.session;
    teams.value = data.teams || [];
    availableMembers.value = data.availableMembers || [];
    currentPickTeamId.value = data.currentPickTeamId || null;
    startPolling();
  } catch (e) {
    globalError.value = e?.response?.data?.error?.message || 'Could not start draft';
  } finally {
    starting.value = false;
  }
};

const resetDraft = async () => {
  if (!confirm('Reset the draft? This will clear all team assignments and remove the session.')) return;
  resetting.value = true;
  try {
    await api.delete(`/learning-program-classes/${classId.value}/draft-session`, { skipGlobalLoading: true });
    session.value = null;
    currentPickTeamId.value = null;
    // Reload to refresh available members and clear picks
    await loadDraft();
    stopPolling();
  } catch (e) {
    globalError.value = e?.response?.data?.error?.message || 'Reset failed';
  } finally {
    resetting.value = false;
  }
};

// --- Captain pick ---
const draftMember = async (member) => {
  if (!canPick.value || pickingUserId.value) return;
  pickingUserId.value = member.providerUserId;
  try {
    const { data } = await api.post(
      `/learning-program-classes/${classId.value}/draft-session/pick`,
      { providerUserId: member.providerUserId },
      { skipGlobalLoading: true }
    );
    session.value = data.session;
    teams.value = data.teams || [];
    availableMembers.value = data.availableMembers || [];
    currentPickTeamId.value = data.currentPickTeamId || null;
    if (data.session?.status === 'completed') stopPolling();
  } catch (e) {
    globalError.value = e?.response?.data?.error?.message || 'Pick failed';
  } finally {
    pickingUserId.value = null;
  }
};

// --- Draft note drawer ---
const openNote = (member) => {
  noteDrawer.value = { open: true, member, text: member.draftNote || '', saving: false, error: '' };
};
const saveNote = async () => {
  noteDrawer.value.saving = true;
  noteDrawer.value.error = '';
  try {
    await api.put(
      `/learning-program-classes/${classId.value}/draft-report/${noteDrawer.value.member.providerUserId}/note`,
      { noteText: noteDrawer.value.text },
      { skipGlobalLoading: true }
    );
    // Update local copy
    const m = availableMembers.value.find((x) => x.providerUserId === noteDrawer.value.member.providerUserId);
    if (m) m.draftNote = noteDrawer.value.text;
    noteDrawer.value.open = false;
  } catch (e) {
    noteDrawer.value.error = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    noteDrawer.value.saving = false;
  }
};

// --- Setup helpers ---
const teamNameById = (teamId) => {
  return teams.value.find((t) => t.id === teamId)?.teamName || `Team ${teamId}`;
};
const shuffleCaptainOrder = () => {
  setupCaptainOrder.value = [...setupCaptainOrder.value].sort(() => Math.random() - 0.5);
};
const dragStart = (idx) => { dragFromIdx = idx; };
const dragDrop = (toIdx) => {
  if (dragFromIdx === null || dragFromIdx === toIdx) return;
  const arr = [...setupCaptainOrder.value];
  const [item] = arr.splice(dragFromIdx, 1);
  arr.splice(toIdx, 0, item);
  setupCaptainOrder.value = arr;
  dragFromIdx = null;
};

// --- Confetti helper ---
const confettiStyle = (i) => ({
  left: `${(i / 18) * 100}%`,
  animationDelay: `${(i * 0.15) % 1.8}s`,
  background: ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#ec4899'][i % 6]
});

// --- Lifecycle ---
watch(showSetup, (val) => {
  if (val && !setupCaptainOrder.value.length) {
    setupCaptainOrder.value = teams.value.map((t) => t.id);
  }
});

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadDraft(), loadSeasonName()]);
  loading.value = false;
  if (session.value?.status === 'in_progress') startPolling();
});

onUnmounted(() => { stopPolling(); });
</script>

<style scoped>
/* --------------- Layout --------------- */
.live-draft {
  min-height: 100vh;
  background: var(--bg-base, #0f172a);
  color: var(--text-primary, #f1f5f9);
  font-family: inherit;
  display: flex;
  flex-direction: column;
}

/* --------------- Header --------------- */
.draft-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  gap: 16px;
  flex-wrap: wrap;
}
.draft-header__left { display: flex; align-items: center; gap: 16px; }
.btn-back {
  background: none; border: none; color: var(--text-secondary, #94a3b8);
  cursor: pointer; font-size: 14px; padding: 6px 0;
}
.btn-back:hover { color: var(--text-primary, #f1f5f9); }
.draft-title-block { display: flex; flex-direction: column; gap: 2px; }
.draft-title { font-size: 20px; font-weight: 700; margin: 0; line-height: 1.2; }
.draft-season-name { font-size: 12px; color: var(--text-secondary, #94a3b8); }

.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
}
.status-badge--none { background: rgba(148,163,184,.15); color: #94a3b8; }
.status-badge--pending { background: rgba(245,158,11,.15); color: #f59e0b; }
.status-badge--live { background: rgba(16,185,129,.15); color: #10b981; }
.status-badge--done { background: rgba(99,102,241,.15); color: #818cf8; }
.live-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #10b981;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

/* --------------- Pick bar --------------- */
.pick-bar {
  background: linear-gradient(90deg, rgba(16,185,129,.15), rgba(99,102,241,.1));
  border-bottom: 1px solid rgba(16,185,129,.2);
  padding: 12px 24px;
}
.pick-bar__inner {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.pick-bar__text { display: flex; flex-direction: column; gap: 2px; }
.pick-bar__team { font-weight: 700; font-size: 15px; }
.pick-bar__meta { font-size: 12px; color: var(--text-secondary, #94a3b8); }
.pick-bar__your-turn {
  margin-left: auto; padding: 6px 14px; border-radius: 8px;
  background: rgba(16,185,129,.2); color: #10b981; font-weight: 600; font-size: 13px;
}
.pick-bar__inner--done { color: var(--text-secondary, #94a3b8); font-size: 14px; }

/* --------------- Manager controls --------------- */
.manager-controls {
  padding: 12px 24px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.manager-controls__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.manager-hint { font-size: 13px; color: var(--text-secondary, #94a3b8); }

/* --------------- Setup panel --------------- */
.setup-panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  margin: 16px 24px;
  padding: 20px;
}
.setup-panel__title { font-size: 15px; font-weight: 700; margin: 0 0 16px; }
.setup-panel__row {
  display: flex; align-items: center; gap: 16px; margin-bottom: 14px; flex-wrap: wrap;
}
.setup-panel__row--col { flex-direction: column; align-items: flex-start; }
.setup-label { font-size: 13px; font-weight: 600; color: var(--text-secondary, #94a3b8); min-width: 100px; }
.setup-label-row { display: flex; align-items: center; gap: 12px; }
.setup-hint { font-size: 12px; color: var(--text-secondary, #94a3b8); margin: 4px 0 8px; }
.setup-mode-btns { display: flex; gap: 8px; }
.mode-btn {
  padding: 6px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,.15);
  background: transparent; color: var(--text-primary, #f1f5f9); cursor: pointer;
  font-size: 13px; font-weight: 500;
}
.mode-btn--active {
  background: rgba(99,102,241,.25); border-color: #818cf8; color: #c7d2fe;
}
.setup-input-small {
  width: 72px; padding: 6px 10px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06);
  color: var(--text-primary, #f1f5f9); font-size: 14px;
}
.captain-order-list { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 340px; }
.captain-order-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-radius: 8px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
  cursor: grab;
}
.captain-order-num {
  width: 20px; height: 20px; border-radius: 50%;
  background: rgba(99,102,241,.25); color: #c7d2fe;
  font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.captain-order-name { flex: 1; font-size: 14px; }
.drag-handle { color: var(--text-secondary, #94a3b8); font-size: 16px; }
.setup-panel__actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.btn-link {
  background: none; border: none; color: #818cf8; cursor: pointer; font-size: 13px;
  text-decoration: underline; padding: 0;
}

/* --------------- Draft body --------------- */
.draft-loading { padding: 60px 24px; text-align: center; color: var(--text-secondary, #94a3b8); }
.draft-body {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 0;
  flex: 1;
  overflow: hidden;
}
@media (max-width: 768px) {
  .draft-body { grid-template-columns: 1fr; }
}

/* --------------- Teams panel --------------- */
.teams-panel {
  border-right: 1px solid rgba(255,255,255,0.08);
  padding: 20px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
}
.panel-title { font-size: 14px; font-weight: 700; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .05em; }
.panel-count { font-weight: 400; color: var(--text-secondary, #94a3b8); }

.team-card {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.team-card--picking {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16,185,129,.2);
}
.team-card__header {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  display: flex; flex-direction: column; gap: 6px;
}
.team-card__name-row { display: flex; align-items: center; gap: 6px; }
.team-card__arrow { color: #10b981; font-size: 12px; }
.team-card__name { font-weight: 700; font-size: 14px; }
.team-card__captain { display: flex; align-items: center; gap: 6px; }
.captain-label { font-size: 12px; color: var(--text-secondary, #94a3b8); }
.team-card__picks { padding: 8px 14px; display: flex; flex-direction: column; gap: 4px; }
.pick-row { display: flex; align-items: center; gap: 8px; }
.pick-num {
  width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,.08);
  font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pick-name { font-size: 13px; }
.team-card__empty { padding: 10px 14px; font-size: 12px; color: var(--text-secondary, #94a3b8); font-style: italic; }

/* --------------- Members panel --------------- */
.members-panel {
  padding: 20px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
}
.members-panel__header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.member-search {
  flex: 1; min-width: 140px; padding: 7px 12px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06);
  color: var(--text-primary, #f1f5f9); font-size: 13px;
}
.members-empty { color: var(--text-secondary, #94a3b8); font-size: 14px; padding: 12px 0; }
.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.member-card {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  padding: 12px;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
  position: relative;
}
.member-card--pickable {
  cursor: pointer;
  border-color: rgba(16,185,129,.3);
}
.member-card--pickable:hover {
  background: rgba(16,185,129,.07);
  border-color: #10b981;
  transform: translateY(-1px);
}
.member-card--picking {
  opacity: 0.6;
  pointer-events: none;
}
.member-card__top { display: flex; align-items: flex-start; gap: 10px; }
.member-card__info { flex: 1; min-width: 0; }
.member-card__name { font-size: 14px; font-weight: 600; line-height: 1.3; }
.member-card__note-preview { font-size: 11px; color: var(--text-secondary, #94a3b8); margin-top: 3px; line-height: 1.4; }
.member-card__pick-hint {
  font-size: 11px; color: #10b981; margin-top: 8px; font-weight: 600; text-align: center;
}
.info-btn {
  width: 22px; height: 22px; border-radius: 50%; background: rgba(99,102,241,.25);
  border: none; color: #c7d2fe; font-size: 12px; font-weight: 700;
  cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.info-btn:hover { background: rgba(99,102,241,.4); }

/* --------------- Note drawer --------------- */
.note-drawer-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 200;
  display: flex; align-items: flex-end; justify-content: center;
}
@media (min-width: 600px) {
  .note-drawer-overlay { align-items: center; }
}
.note-drawer {
  background: var(--bg-surface, #1e293b);
  border-radius: 16px 16px 0 0;
  padding: 24px;
  width: 100%; max-width: 500px;
  border: 1px solid rgba(255,255,255,.12);
}
@media (min-width: 600px) {
  .note-drawer { border-radius: 16px; }
}
.note-drawer__header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;
}
.note-drawer__header h3 { margin: 0; font-size: 16px; font-weight: 700; }
.btn-close {
  background: none; border: none; color: var(--text-secondary, #94a3b8);
  font-size: 18px; cursor: pointer; padding: 0;
}
.note-textarea {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.05);
  color: var(--text-primary, #f1f5f9); font-size: 14px; resize: vertical;
  font-family: inherit; box-sizing: border-box;
}
.note-readonly { font-size: 14px; color: var(--text-secondary, #94a3b8); min-height: 80px; }
.note-drawer__actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }

/* --------------- Draft complete --------------- */
.draft-complete {
  position: relative; padding: 40px 24px 20px; text-align: center;
  overflow: hidden;
}
.confetti-wrap {
  position: absolute; top: 0; left: 0; right: 0; height: 160px; overflow: hidden; pointer-events: none;
}
.confetti-piece {
  position: absolute; width: 8px; height: 8px; border-radius: 2px;
  top: -10px;
  animation: confettiFall 2s ease-in both infinite;
}
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(180px) rotate(360deg); opacity: 0; }
}
.draft-complete__card {
  display: inline-flex; flex-direction: column; align-items: center; gap: 8px;
  background: rgba(255,255,255,.05); border-radius: 16px;
  padding: 28px 40px; border: 1px solid rgba(255,255,255,.1);
}
.draft-complete__icon { font-size: 40px; }
.draft-complete__card h2 { margin: 0; font-size: 22px; }
.draft-complete__card p { margin: 0; color: var(--text-secondary, #94a3b8); font-size: 14px; }

/* --------------- Buttons (local) --------------- */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #4f46e5; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #4338ca; }
.btn-secondary { background: rgba(255,255,255,.1); color: var(--text-primary, #f1f5f9); border: 1px solid rgba(255,255,255,.15); }
.btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,.15); }
.btn-ghost { background: transparent; color: var(--text-secondary, #94a3b8); }
.btn-ghost:hover:not(:disabled) { color: var(--text-primary, #f1f5f9); }
.btn-danger-ghost { background: transparent; color: #ef4444; border: 1px solid rgba(239,68,68,.3); }
.btn-danger-ghost:hover:not(:disabled) { background: rgba(239,68,68,.1); }
.btn-sm { padding: 5px 12px; font-size: 13px; }

/* --------------- Misc --------------- */
.error-inline { font-size: 13px; color: #ef4444; }
.global-error {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: #7f1d1d; color: #fecaca; padding: 10px 20px; border-radius: 8px;
  font-size: 13px; z-index: 300; max-width: 400px; text-align: center;
}
</style>
