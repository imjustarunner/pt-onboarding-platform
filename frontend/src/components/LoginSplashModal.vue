<template>
  <Teleport to="body">
    <Transition name="ls-fade">
      <div v-if="visible" class="ls-overlay" role="dialog" aria-modal="true" aria-labelledby="ls-title" @click.self="dismiss">
        <div class="ls-card" :style="cardStyle">
          <!-- Header -->
          <div class="ls-header" :style="headerBg">
            <img v-if="logoUrl" :src="logoUrl" class="ls-logo" alt="Season logo" />
            <div class="ls-header-text">
              <p class="ls-welcome">Welcome back! 👋</p>
              <h2 id="ls-title" class="ls-season">{{ currentSeason?.name }}</h2>
              <p class="ls-since">Here's what happened since your last visit</p>
            </div>
            <button class="ls-close" type="button" @click="dismiss" aria-label="Dismiss">✕</button>
          </div>

          <!-- Season tabs (if multiple) -->
          <div v-if="seasons.length > 1" class="ls-tabs">
            <button
              v-for="(s, i) in seasons"
              :key="s.classId"
              class="ls-tab"
              :class="{ active: seasonIdx === i }"
              @click="seasonIdx = i"
            >{{ s.name }}</button>
          </div>

          <!-- Teams -->
          <div class="ls-body">
            <div v-if="!currentSeason?.teams?.length" class="ls-empty">No team data yet.</div>
            <template v-else>
              <div
                v-for="team in currentSeason.teams"
                :key="team.teamId"
                class="ls-team-row"
                :class="{ 'ls-team-row--mine': team.teamId === currentSeason.myTeamId }"
              >
                <div class="ls-team-left">
                  <span class="ls-team-name">{{ team.teamName }}</span>
                  <span v-if="team.teamId === currentSeason.myTeamId" class="ls-my-badge">Your Team</span>
                </div>
                <div class="ls-team-stats">
                  <!-- Since last visit -->
                  <div class="ls-since-block">
                    <span class="ls-since-label">Since your last visit</span>
                    <div class="ls-since-nums">
                      <span class="ls-since-val" v-if="team.pointsSince > 0">
                        +{{ team.pointsSince }} <span class="ls-unit">pts</span>
                      </span>
                      <span class="ls-since-val" v-if="team.milesSince > 0">
                        +{{ team.milesSince }} <span class="ls-unit">mi</span>
                      </span>
                      <span class="ls-none" v-if="team.pointsSince === 0 && team.milesSince === 0">No new activity</span>
                    </div>
                  </div>
                  <!-- Season total -->
                  <div class="ls-total-block">
                    <span class="ls-total-val">{{ team.totalPoints }}</span><span class="ls-total-unit">pts total</span>
                    <span class="ls-total-sep">·</span>
                    <span class="ls-total-val">{{ team.totalMiles }}</span><span class="ls-total-unit">mi total</span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="ls-footer">
            <button class="ls-dismiss-btn" type="button" @click="dismiss">Got it!</button>
            <button class="ls-pref-btn" type="button" @click="goToPreferences">Manage preferences</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useBrandingStore } from '../store/branding.js';
import { toUploadsUrl } from '../utils/uploadsUrl.js';

const props = defineProps({
  seasons: { type: Array, default: () => [] },
  lastLogoutAt: { type: String, default: null }
});

const emit = defineEmits(['dismiss']);

const router = useRouter();
const brandingStore = useBrandingStore();

const visible = ref(true);
const seasonIdx = ref(0);

const currentSeason = computed(() => props.seasons[seasonIdx.value] || null);

const logoUrl = computed(() => {
  const path = currentSeason.value?.logoPath;
  return path ? toUploadsUrl(path) : null;
});

const bannerUrl = computed(() => {
  const path = currentSeason.value?.bannerPath;
  return path ? toUploadsUrl(path) : null;
});

const accent = computed(() => brandingStore.effectivePrimaryColor || '#ff6b35');

const cardStyle = computed(() => ({ '--ls-accent': accent.value }));

const headerBg = computed(() => {
  if (bannerUrl.value) {
    return {
      backgroundImage: `url(${bannerUrl.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }
  return { background: `linear-gradient(135deg, #1a1a2e 0%, ${accent.value} 100%)` };
});

function dismiss() {
  visible.value = false;
  emit('dismiss');
}

function goToPreferences() {
  dismiss();
  router.push('/account?tab=preferences');
}
</script>

<style scoped>
/* Overlay */
.ls-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(3px);
  padding: 16px;
}
@media (min-width: 600px) {
  .ls-overlay { align-items: center; }
}

/* Card */
.ls-card {
  background: #fff;
  border-radius: 20px 20px 20px 20px;
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}

/* Header */
.ls-header {
  position: relative;
  padding: 24px 20px 20px;
  border-radius: 20px 20px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: linear-gradient(135deg, #1a1a2e 0%, #ff6b35 100%);
}
.ls-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  border-radius: 20px 20px 0 0;
}
.ls-logo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.7);
  object-fit: cover;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.ls-header-text {
  flex: 1;
  position: relative;
  z-index: 1;
}
.ls-welcome { margin: 0; color: rgba(255,255,255,0.8); font-size: 0.78rem; }
.ls-season { margin: 2px 0 4px; color: #fff; font-size: 1.15rem; font-weight: 700; }
.ls-since { margin: 0; color: rgba(255,255,255,0.7); font-size: 0.75rem; }
.ls-close {
  position: relative;
  z-index: 1;
  background: rgba(255,255,255,0.2);
  border: none;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ls-close:hover { background: rgba(255,255,255,0.35); }

/* Season tabs */
.ls-tabs {
  display: flex;
  border-bottom: 1px solid #e9ecef;
  overflow-x: auto;
}
.ls-tab {
  flex: 1;
  padding: 10px 8px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 0.82rem;
  font-weight: 600;
  color: #6c757d;
  cursor: pointer;
  white-space: nowrap;
  margin-bottom: -1px;
}
.ls-tab.active {
  color: var(--ls-accent, #ff6b35);
  border-bottom-color: var(--ls-accent, #ff6b35);
}

/* Body */
.ls-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.ls-empty { text-align: center; padding: 20px; color: #aaa; }

.ls-team-row {
  border: 1px solid #e9ecef;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fafafa;
}
.ls-team-row--mine {
  border-color: var(--ls-accent, #ff6b35);
  background: color-mix(in srgb, var(--ls-accent, #ff6b35) 6%, white);
}
.ls-team-left { display: flex; align-items: center; gap: 8px; }
.ls-team-name { font-weight: 700; font-size: 0.95rem; color: #212529; }
.ls-my-badge {
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--ls-accent, #ff6b35);
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ls-team-stats { display: flex; flex-direction: column; gap: 4px; }
.ls-since-block { display: flex; flex-direction: column; gap: 2px; }
.ls-since-label { font-size: 0.72rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.04em; }
.ls-since-nums { display: flex; gap: 12px; flex-wrap: wrap; }
.ls-since-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ls-accent, #ff6b35);
}
.ls-unit { font-size: 0.75rem; font-weight: 500; color: #888; }
.ls-none { font-size: 0.82rem; color: #bbb; font-style: italic; }
.ls-total-block {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
}
.ls-total-val { font-size: 0.88rem; font-weight: 600; color: #495057; }
.ls-total-unit { font-size: 0.75rem; color: #888; }
.ls-total-sep { color: #ccc; margin: 0 2px; }

/* Footer */
.ls-footer {
  padding: 12px 20px 20px;
  display: flex;
  gap: 10px;
  border-top: 1px solid #f0f0f0;
}
.ls-dismiss-btn {
  flex: 1;
  padding: 12px;
  background: var(--ls-accent, #ff6b35);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}
.ls-dismiss-btn:hover { opacity: 0.88; }
.ls-pref-btn {
  padding: 12px 14px;
  background: transparent;
  border: 1.5px solid #dee2e6;
  border-radius: 12px;
  font-size: 0.82rem;
  color: #6c757d;
  cursor: pointer;
}
.ls-pref-btn:hover { border-color: #adb5bd; color: #495057; }

/* Transition */
.ls-fade-enter-active, .ls-fade-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.ls-fade-enter-from, .ls-fade-leave-to { opacity: 0; transform: translateY(20px); }
</style>
