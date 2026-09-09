<template>
  <div class="mrlp">
    <div class="mrlp-head">
      <h3 class="mrlp-title">My Room lobby</h3>
      <button type="button" class="mrlp-refresh" :disabled="loading" @click="loadLobby">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>
    <p v-if="error" class="mrlp-error">{{ error }}</p>
    <p v-else-if="!loading && !waiting.length" class="mrlp-empty muted">
      No one is waiting.
    </p>
    <ul v-else class="mrlp-list">
      <li v-for="g in waiting" :key="g.id" class="mrlp-guest">
        <img
          v-if="photoSrc(g)"
          class="mrlp-photo"
          :src="photoSrc(g)"
          :alt="`${g.guestDisplayName || 'Guest'} photo`"
        />
        <div v-else class="mrlp-photo mrlp-photo--empty" aria-hidden="true">?</div>
        <div class="mrlp-meta">
          <div class="mrlp-name">{{ g.guestDisplayName || 'Guest' }}</div>
          <div class="mrlp-when muted">{{ formatWhen(g.createdAt) }}</div>
        </div>
        <div class="mrlp-actions">
          <button
            type="button"
            class="mrlp-btn mrlp-btn--admit"
            :disabled="busyId === g.id"
            @click="admitGuest(g.id)"
          >
            Admit
          </button>
          <button
            type="button"
            class="mrlp-btn mrlp-btn--dismiss"
            :disabled="busyId === g.id"
            @click="dismissGuest(g.id)"
          >
            Dismiss
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const loading = ref(false);
const error = ref('');
const waiting = ref([]);
const busyId = ref(null);
let pollTimer = null;

function photoSrc(g) {
  const raw = String(g?.guestPhotoUrl || g?.guest_photo_url || '').trim();
  if (!raw) return '';
  return toUploadsUrl(raw) || raw;
}

function formatWhen(raw) {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function loadLobby() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/my-room/me/lobby', { skipGlobalLoading: true });
    waiting.value = Array.isArray(res?.data?.waiting) ? res.data.waiting : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load lobby';
    waiting.value = [];
  } finally {
    loading.value = false;
  }
}

async function admitGuest(id) {
  const lobbyId = Number(id || 0);
  if (!lobbyId) return;
  busyId.value = lobbyId;
  error.value = '';
  try {
    await api.post(`/my-room/lobby/${lobbyId}/admit`, {}, { skipGlobalLoading: true });
    await loadLobby();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Admit failed';
  } finally {
    busyId.value = null;
  }
}

async function dismissGuest(id) {
  const lobbyId = Number(id || 0);
  if (!lobbyId) return;
  busyId.value = lobbyId;
  error.value = '';
  try {
    await api.post(`/my-room/lobby/${lobbyId}/dismiss`, {}, { skipGlobalLoading: true });
    await loadLobby();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Dismiss failed';
  } finally {
    busyId.value = null;
  }
}

onMounted(() => {
  loadLobby();
  pollTimer = setInterval(loadLobby, 8000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.mrlp { display: flex; flex-direction: column; gap: 0.75rem; }
.mrlp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.mrlp-title { margin: 0; font-size: 1.05rem; color: #0f172a; }
.mrlp-refresh {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font-size: 0.82rem;
  cursor: pointer;
}
.mrlp-empty, .mrlp-error { margin: 0; font-size: 0.9rem; }
.mrlp-error { color: #b91c1c; }
.muted { color: #64748b; }
.mrlp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.65rem; }
.mrlp-guest {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.mrlp-photo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex: 0 0 auto;
  background: #cbd5e1;
}
.mrlp-photo--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-weight: 700;
}
.mrlp-meta { flex: 1 1 auto; min-width: 0; }
.mrlp-name { font-weight: 650; color: #0f172a; }
.mrlp-when { font-size: 0.8rem; }
.mrlp-actions { display: flex; flex-direction: column; gap: 0.3rem; }
.mrlp-btn {
  border-radius: 6px;
  padding: 0.28rem 0.55rem;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid transparent;
}
.mrlp-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.mrlp-btn--admit {
  background: #047857;
  border-color: #047857;
  color: #fff;
}
.mrlp-btn--dismiss {
  background: #fff;
  border-color: #cbd5e1;
  color: #475569;
}
</style>
