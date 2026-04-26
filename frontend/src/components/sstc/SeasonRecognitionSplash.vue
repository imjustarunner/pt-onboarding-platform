<template>
  <Teleport to="body">
    <div v-if="show" class="splash-backdrop" @click.self="dismiss">
      <div class="splash-modal">
        <button class="splash-close" @click="dismiss">×</button>

        <div class="splash-header">
          <span class="splash-trophy">🏆</span>
          <div>
            <div class="splash-title">Recognition Awards</div>
            <div class="splash-sub">Week {{ weekNumber }}</div>
          </div>
        </div>

        <!-- Weekly winners -->
        <div v-if="weeklyWinners.length" class="splash-section">
          <div class="splash-section-label">🏅 This Week's Award Winners</div>
          <div class="splash-rows">
            <div v-for="w in weeklyWinners" :key="`${w.label}-${w.userId}`" class="splash-row">
              <span v-if="w.iconUrl" class="splash-icon">
                <img :src="w.iconUrl" alt="" />
              </span>
              <span v-else class="splash-icon-emoji">{{ emojiFor(w.icon) }}</span>
              <div class="splash-row-body">
                <div class="splash-row-label">{{ w.label }}</div>
                <div class="splash-row-winner">
                  {{ fullName(w) }}
                  <span v-if="w.metricValue != null" class="splash-metric"> · {{ fmtMetric(w.metricValue) }}</span>
                </div>
              </div>
              <a
                v-if="w.workoutId"
                :href="`/workout/${w.workoutId}`"
                class="splash-link"
                title="View workout"
                target="_blank"
              >🔗</a>
            </div>
          </div>
        </div>

        <!-- Season standings -->
        <div v-if="seasonStandings.filter(s => s.leader).length" class="splash-section">
          <div class="splash-section-label">📊 Current Season Standings</div>
          <div class="splash-rows">
            <div
              v-for="s in seasonStandings.filter(s => s.leader)"
              :key="s.categoryId"
              class="splash-row"
            >
              <span v-if="s.iconUrl" class="splash-icon">
                <img :src="s.iconUrl" alt="" />
              </span>
              <span v-else class="splash-icon-emoji">{{ emojiFor(s.icon) }}</span>
              <div class="splash-row-body">
                <div class="splash-row-label">{{ s.label }}</div>
                <div class="splash-row-winner">
                  {{ fullName(s.leader) }}
                  <span v-if="s.leader.metricValue != null" class="splash-metric"> · {{ fmtMetric(s.leader.metricValue) }}</span>
                </div>
              </div>
              <a
                v-if="s.leader?.workoutId"
                :href="`/workout/${s.leader.workoutId}`"
                class="splash-link"
                title="View workout"
                target="_blank"
              >🔗</a>
            </div>
          </div>
        </div>

        <button class="splash-got-it" @click="dismiss">Got it! 🎉</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  seasonId: { type: [Number, String], required: true }
});

const show = ref(false);
const weekNumber = ref(null);
const weeklyWinners = ref([]);
const seasonStandings = ref([]);
let needsWeekly = false;
let needsStandings = false;

const fullName = (w) => {
  if (!w) return '';
  const fn = String(w.firstName || '').trim();
  const ln = String(w.lastName || '').trim();
  return [fn, ln].filter(Boolean).join(' ') || 'A member';
};

const fmtMetric = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '';
};

const emojiFor = (icon) => {
  if (!icon || String(icon).startsWith('icon:')) return '🏅';
  return icon;
};

const dismiss = async () => {
  show.value = false;
  try {
    const types = [];
    if (needsWeekly) types.push('weekly');
    if (needsStandings) types.push('standings');
    if (types.length && weekNumber.value) {
      await api.post(`/summit-stats/seasons/${props.seasonId}/recognition/splash/dismiss`, {
        weekNumber: weekNumber.value,
        splashTypes: types
      });
    }
  } catch { /* ignore dismiss failures */ }
};

const load = async () => {
  try {
    const { data } = await api.get(`/summit-stats/seasons/${props.seasonId}/recognition/splash`);
    if (!data.hasSplash) return;

    weekNumber.value = data.weekNumber;
    weeklyWinners.value = data.weeklyWinners || [];
    seasonStandings.value = data.seasonStandings || [];
    needsWeekly = data.needsWeekly || false;
    needsStandings = data.needsStandings || false;

    const hasContent = weeklyWinners.value.length > 0 ||
      seasonStandings.value.some(s => s.leader);
    if (hasContent) show.value = true;
  } catch { /* ignore — splash is non-critical */ }
};

onMounted(load);
</script>

<style scoped>
.splash-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1300;
  padding: 16px;
}

.splash-modal {
  background: #fff;
  border-radius: 20px;
  padding: 28px 24px 24px;
  width: 100%;
  max-width: 460px;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28);
}

.splash-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #f1f5f9;
  border: none;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
}
.splash-close:hover { background: #e2e8f0; }

.splash-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}
.splash-trophy { font-size: 36px; }
.splash-title { font-size: 1.2rem; font-weight: 800; color: #0f172a; }
.splash-sub { font-size: 0.85rem; color: #64748b; }

.splash-section { margin-bottom: 18px; }
.splash-section-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
  margin-bottom: 8px;
}

.splash-rows { display: flex; flex-direction: column; gap: 6px; }

.splash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.splash-icon img { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; flex-shrink: 0; }
.splash-icon-emoji { font-size: 22px; flex-shrink: 0; }

.splash-row-body { flex: 1; min-width: 0; }
.splash-row-label { font-size: 0.82rem; font-weight: 700; color: #334155; }
.splash-row-winner { font-size: 0.9rem; font-weight: 600; color: #1e293b; }
.splash-metric { font-weight: 400; color: #64748b; }

.splash-link { font-size: 14px; flex-shrink: 0; opacity: 0.7; text-decoration: none; }
.splash-link:hover { opacity: 1; }

.splash-got-it {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4338ca 0%, #7c3aed 100%);
  color: #fff;
  border: none;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
  transition: opacity 0.15s;
}
.splash-got-it:hover { opacity: 0.92; }
</style>
