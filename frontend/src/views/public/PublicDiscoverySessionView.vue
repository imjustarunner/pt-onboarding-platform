<template>
  <div class="disc" :style="brandStyle">
    <header class="disc-top">
      <div class="brand">
        <img v-if="agency.logoUrl" :src="agency.logoUrl" :alt="agency.name" class="logo" />
        <strong>{{ agency.name || 'Discovery Call' }}</strong>
      </div>
    </header>

    <main class="disc-main">
      <div v-if="loading" class="state">Loading…</div>
      <div v-else-if="error" class="state err">{{ error }}</div>

      <template v-else>
        <div class="hero">
          <p class="eyebrow">Discovery Call</p>
          <h1 v-if="session.status === 'PROPOSED'">Pick a time that works</h1>
          <h1 v-else-if="session.status === 'BOOKED'">You're booked</h1>
          <h1 v-else>Discovery session</h1>
          <p class="sub">
            with {{ provider?.displayName || 'your coach' }}
            <span v-if="provider?.title"> · {{ provider.title }}</span>
          </p>
        </div>

        <!-- Select options -->
        <section v-if="session.status === 'PROPOSED'" class="card">
          <h2>Available times</h2>
          <p class="hint">Select one option to book your discovery call. This link is private to you.</p>
          <p v-if="scheduleTimezoneLabel" class="hint tz-label">Times are in {{ scheduleTimezoneLabel }}</p>
          <button
            v-for="(opt, idx) in session.proposedOptions || []"
            :key="idx"
            type="button"
            class="opt"
            :class="{ selected: selectedIndex === idx }"
            @click="selectedIndex = idx"
          >
            {{ formatOption(opt) }}
          </button>
          <p v-if="selectError" class="err">{{ selectError }}</p>
          <button type="button" class="primary" :disabled="selectedIndex == null || selecting" @click="confirmSelect">
            {{ selecting ? 'Booking…' : 'Confirm this time →' }}
          </button>
        </section>

        <!-- Booked -->
        <section v-else-if="session.status === 'BOOKED'" class="card">
          <div class="confirmed">
            <div><span>When</span><strong>{{ bookedLabel }}</strong></div>
            <div v-if="scheduleTimezoneLabel"><span>Timezone</span><strong>{{ scheduleTimezoneLabel }}</strong></div>
            <div><span>Duration</span><strong>{{ session.countdownMinutes || 15 }} minutes</strong></div>
            <div><span>Location</span><strong>Virtual</strong></div>
          </div>

          <div class="countdown-wrap" v-if="countdownLabel">
            <div class="countdown-label">Session timer</div>
            <div class="countdown">{{ countdownLabel }}</div>
            <p class="hint">Subtle countdown toward your discovery window ({{ session.countdownMinutes || 15 }} min session).</p>
          </div>

          <p v-if="!joinOpen" class="hint">
            Join opens 15 minutes before your scheduled start. Keep this private link — you'll use it to attend.
          </p>
          <p v-if="videoError" class="err">{{ videoError }}</p>
          <button v-if="joinOpen" type="button" class="primary" :disabled="joining" @click="joinVideo">
            {{ joining ? 'Connecting…' : 'Join discovery session →' }}
          </button>

          <div v-if="videoReady" class="video-box">
            <p class="hint">Video token ready. Open the session room when your coach is present.</p>
            <pre class="token-meta">Session {{ videoMeta.sessionId }}</pre>
          </div>
        </section>

        <section v-else class="card">
          <p>This discovery invite is {{ session.status?.toLowerCase() || 'unavailable' }}.</p>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { timezoneLabelFor } from '../../utils/timezones.js';

const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());

const loading = ref(true);
const error = ref('');
const selectError = ref('');
const videoError = ref('');
const selecting = ref(false);
const joining = ref(false);
const selectedIndex = ref(null);
const session = ref({ status: '', proposedOptions: [], countdownMinutes: 15 });
const provider = ref(null);
const agency = ref({});
const videoReady = ref(false);
const videoMeta = ref({});
const nowTick = ref(Date.now());
let tickTimer = null;

const scheduleTimezoneIana = computed(() => {
  const tz = String(session.value?.timezone || agency.value?.timezone || '').trim();
  return tz || 'America/Denver';
});
const scheduleTimezoneLabel = computed(() => timezoneLabelFor(scheduleTimezoneIana.value));

const brandStyle = computed(() => {
  const p = agency.value.colorPalette || {};
  const primary = typeof p === 'object' ? p.primary || '#1b4332' : '#1b4332';
  return { '--disc-accent': primary };
});

const bookedLabel = computed(() => {
  if (!session.value.bookedStartAt) return '—';
  return new Date(session.value.bookedStartAt).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: scheduleTimezoneIana.value
  });
});

const joinOpen = computed(() => {
  if (session.value.status !== 'BOOKED' || !session.value.bookedStartAt) return false;
  const start = new Date(session.value.bookedStartAt).getTime();
  const end = new Date(session.value.bookedEndAt || session.value.bookedStartAt).getTime();
  const now = nowTick.value;
  return now >= start - 15 * 60 * 1000 && now <= end + 30 * 60 * 1000;
});

const countdownLabel = computed(() => {
  if (session.value.status !== 'BOOKED' || !session.value.bookedStartAt) return '';
  const start = new Date(session.value.bookedStartAt).getTime();
  const end = new Date(session.value.bookedEndAt || start).getTime();
  const now = nowTick.value;
  const mins = Number(session.value.countdownMinutes || 15);
  if (now < start) {
    const diff = Math.max(0, start - now);
    return `Starts in ${formatMs(diff)}`;
  }
  if (now <= end) {
    const remaining = Math.max(0, end - now);
    const total = Math.max(1, end - start);
    const usedPct = Math.min(100, Math.round(((total - remaining) / total) * 100));
    return `${formatMs(remaining)} left · ${usedPct}% of ${mins} min`;
  }
  return 'Session ended';
});

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function formatOption(opt) {
  const d = new Date(opt.startAt);
  const when = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: scheduleTimezoneIana.value
  });
  return when;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/discovery-sessions/public/${encodeURIComponent(token.value)}`, {
      skipAuthRedirect: true
    });
    session.value = res.data?.session || {};
    provider.value = res.data?.provider || null;
    agency.value = res.data?.agency || {};
    if (typeof agency.value.colorPalette === 'string') {
      try {
        agency.value.colorPalette = JSON.parse(agency.value.colorPalette);
      } catch {
        agency.value.colorPalette = {};
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load invite.';
  } finally {
    loading.value = false;
  }
}

async function confirmSelect() {
  if (selectedIndex.value == null) return;
  selecting.value = true;
  selectError.value = '';
  try {
    const res = await api.post(
      `/discovery-sessions/public/${encodeURIComponent(token.value)}/select`,
      { optionIndex: selectedIndex.value },
      { skipAuthRedirect: true }
    );
    session.value = {
      ...session.value,
      ...(res.data?.discoverySession
        ? {
            status: res.data.discoverySession.status,
            bookedStartAt: res.data.discoverySession.booked_start_at,
            bookedEndAt: res.data.discoverySession.booked_end_at,
            countdownMinutes: res.data.discoverySession.countdown_minutes
          }
        : { status: 'BOOKED' })
    };
  } catch (e) {
    selectError.value = e.response?.data?.error?.message || e.message || 'Could not book time.';
  } finally {
    selecting.value = false;
  }
}

async function joinVideo() {
  joining.value = true;
  videoError.value = '';
  try {
    const res = await api.get(`/discovery-sessions/public/${encodeURIComponent(token.value)}/video-token`, {
      skipAuthRedirect: true
    });
    videoMeta.value = res.data || {};
    videoReady.value = true;
  } catch (e) {
    videoError.value = e.response?.data?.error?.message || e.message || 'Could not join video.';
  } finally {
    joining.value = false;
  }
}

onMounted(() => {
  load();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<style scoped>
.disc {
  --disc-accent: #1b4332;
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(244, 246, 244, 0.88), #f4f6f4 55%),
    radial-gradient(800px 360px at 50% 0%, color-mix(in srgb, var(--disc-accent) 18%, transparent), transparent 70%);
  color: #111827;
  font-family: system-ui, -apple-system, sans-serif;
}
.disc-top {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem 1.25rem;
}
.brand { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; color: var(--disc-accent); }
.logo { width: 32px; height: 32px; object-fit: contain; border-radius: 6px; background: #fff; }
.disc-main { max-width: 720px; margin: 0 auto; padding: 0 1.25rem 2.5rem; }
.hero { margin: 0.5rem 0 1.25rem; }
.eyebrow { color: var(--disc-accent); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.72rem; margin: 0 0 0.35rem; }
.hero h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.1rem); color: var(--disc-accent); }
.sub { color: #64748b; }
.card {
  background: #fff;
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 0.65rem;
}
.opt {
  text-align: left;
  border: 1.5px solid #c5d4cb;
  background: #fff;
  border-radius: 12px;
  padding: 0.75rem 0.9rem;
  cursor: pointer;
  font-weight: 700;
  color: var(--disc-accent);
}
.opt.selected { background: var(--disc-accent); color: #fff; border-color: var(--disc-accent); }
.primary {
  margin-top: 0.35rem;
  background: var(--disc-accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  font-weight: 800;
  cursor: pointer;
}
.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { color: #64748b; font-size: 0.85rem; margin: 0; }
.tz-label { font-weight: 700; color: #475569; }
.err { color: #b91c1c; }
.state { padding: 2rem; text-align: center; }
.confirmed { display: grid; gap: 0.55rem; }
.confirmed div { display: grid; gap: 0.1rem; }
.confirmed span { font-size: 0.75rem; color: #64748b; }
.countdown-wrap {
  margin-top: 0.5rem;
  padding: 0.85rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--disc-accent) 8%, #fff);
}
.countdown-label { font-size: 0.72rem; font-weight: 700; color: var(--disc-accent); text-transform: uppercase; letter-spacing: 0.06em; }
.countdown { font-size: 1.35rem; font-weight: 800; color: var(--disc-accent); margin-top: 0.2rem; }
.video-box { margin-top: 0.75rem; padding: 0.75rem; border-radius: 10px; background: #f8fafc; }
.token-meta { font-size: 0.7rem; overflow: auto; color: #64748b; }
</style>
