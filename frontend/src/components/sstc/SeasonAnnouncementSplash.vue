<template>
  <transition name="splash-fade">
    <div v-if="active" class="splash-overlay" role="dialog" aria-modal="true" @click.self="dismiss">
      <div class="splash-card">
        <header class="splash-head">
          <div class="splash-eyebrow">{{ active.clubName }} · New season</div>
          <h2 class="splash-headline">{{ active.headline }}</h2>
          <div v-if="active.seasonName" class="splash-season">
            {{ active.seasonName }}
            <span v-if="seasonDates(active)" class="splash-season-dates">{{ seasonDates(active) }}</span>
          </div>
        </header>
        <div v-if="active.body" class="splash-body" v-html="bodyHtml(active.body)"></div>

        <div class="splash-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            @click="respond('joined')"
          >I'm in</button>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="busy"
            @click="respond('remind_me')"
          >Remind me when it starts</button>
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="busy"
            @click="respond('sitting_out')"
          >Sit this one out</button>
        </div>

        <footer class="splash-foot">
          <div v-if="remaining > 1" class="splash-progress">
            {{ index + 1 }} of {{ pending.length }} announcements
          </div>
          <div class="splash-foot-actions">
            <button
              type="button"
              class="splash-link"
              :disabled="busy"
              @click="dismiss"
            >Close</button>
            <button
              type="button"
              class="splash-link splash-link--danger"
              :disabled="busy"
              @click="dismissForever"
              title="Stop showing me invites and announcements from this club"
            >Don't show me {{ active.clubName }} again</button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';

const pending = ref([]);
const index = ref(0);
const busy = ref(false);

const active = computed(() => pending.value[index.value] || null);
const remaining = computed(() => Math.max(0, pending.value.length - index.value));

function seasonDates(a) {
  const start = a?.seasonStartsAt ? formatDate(a.seasonStartsAt) : null;
  const end = a?.seasonEndsAt ? formatDate(a.seasonEndsAt) : null;
  if (start && end) return `· ${start} – ${end}`;
  if (start) return `· starts ${start}`;
  return '';
}
function formatDate(s) {
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}
function bodyHtml(s) {
  // Very small linkifier; otherwise plain-text with line breaks.
  const escaped = String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\n/g, '<br>');
}

async function load() {
  try {
    const res = await api.get('/summit-stats/me/pending-season-announcements');
    pending.value = Array.isArray(res.data?.announcements) ? res.data.announcements : [];
    index.value = 0;
  } catch (_) {
    pending.value = [];
  }
}

async function respond(decision) {
  const a = active.value;
  if (!a || busy.value) return;
  busy.value = true;
  try {
    await api.post(`/summit-stats/me/season-announcements/${a.id}/respond`, {
      response: decision
    });
    advance();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to record response');
  } finally {
    busy.value = false;
  }
}

async function dismiss() {
  const a = active.value;
  if (!a || busy.value) return;
  busy.value = true;
  try {
    await api.post(`/summit-stats/me/season-announcements/${a.id}/respond`, {
      response: 'dismissed'
    });
    advance();
  } catch (_) {
    advance();
  } finally {
    busy.value = false;
  }
}

async function dismissForever() {
  const a = active.value;
  if (!a || busy.value) return;
  if (!confirm(`You won't receive any more invites or announcements from ${a.clubName}. You can re-enable this later from Account settings. Continue?`)) {
    return;
  }
  busy.value = true;
  try {
    await api.post(`/summit-stats/me/clubs/${a.clubId}/dismiss-invites`, {});
    // Mark this announcement dismissed too so it disappears from this session.
    try {
      await api.post(`/summit-stats/me/season-announcements/${a.id}/respond`, {
        response: 'dismissed'
      });
    } catch (_) { /* best effort */ }
    // Drop all queued items from this club for this session.
    pending.value = pending.value.filter((p) => Number(p.clubId) !== Number(a.clubId));
    if (index.value >= pending.value.length) index.value = Math.max(0, pending.value.length - 1);
  } finally {
    busy.value = false;
  }
}

function advance() {
  if (index.value + 1 < pending.value.length) {
    index.value += 1;
  } else {
    pending.value = [];
    index.value = 0;
  }
}

onMounted(() => { load(); });
</script>

<style scoped>
.splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  backdrop-filter: blur(2px);
}
.splash-card {
  background: white;
  width: 100%;
  max-width: 520px;
  border-radius: 16px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
  padding: 22px 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.splash-head { display: flex; flex-direction: column; gap: 4px; }
.splash-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-color, #4f46e5);
}
.splash-headline {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  line-height: 1.2;
  color: #0f172a;
}
.splash-season {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.splash-season-dates { font-weight: 500; color: #64748b; }
.splash-body {
  font-size: 14px;
  line-height: 1.55;
  color: #334155;
  white-space: pre-wrap;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}
.splash-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.splash-actions .btn { width: 100%; }
.splash-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
  font-size: 12px;
}
.splash-progress { color: #64748b; font-weight: 600; }
.splash-foot-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.splash-link {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: #64748b;
  text-decoration: underline;
}
.splash-link:hover:not(:disabled) { color: #0f172a; }
.splash-link--danger { color: #b91c1c; }
.splash-link--danger:hover:not(:disabled) { color: #7f1d1d; }
.splash-link:disabled { opacity: 0.5; cursor: progress; }

.splash-fade-enter-active, .splash-fade-leave-active { transition: opacity 0.18s; }
.splash-fade-enter-from, .splash-fade-leave-to { opacity: 0; }

@media (min-width: 600px) {
  .splash-actions { flex-direction: row; }
  .splash-actions .btn { flex: 1; }
}
</style>
