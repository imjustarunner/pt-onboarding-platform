<template>
  <div v-if="hasContent" class="srs-wrap">
    <!-- Last Week's Winners -->
    <div v-if="weeklyWinners.length" class="srs-section">
      <div class="srs-label">
        <span class="srs-label-icon">🏅</span>
        Week {{ lastPostedWeek }} Award Winners
      </div>
      <div class="srs-rows">
        <div v-for="w in weeklyWinners" :key="`${w.label}-${w.userId}`" class="srs-row">
          <span v-if="w.iconUrl" class="srs-award-icon">
            <img :src="w.iconUrl" alt="" />
          </span>
          <span v-else class="srs-award-emoji">{{ emojiForIcon(w.icon) }}</span>
          <span class="srs-award-label">{{ w.label }}</span>
          <span class="srs-award-winner">
            <button
              v-if="w.userId && !compact"
              class="srs-name-btn"
              @click="emit('openProfile', { userId: w.userId, name: fullName(w) })"
            >{{ fullName(w) }}</button>
            <span v-else>{{ fullName(w) }}</span>
          </span>
          <span v-if="w.metricValue != null" class="srs-metric">{{ fmtMetric(w.metricValue) }}</span>
          <a
            v-if="w.workoutId && !compact"
            :href="`/workout/${w.workoutId}`"
            class="srs-workout-link"
            title="View workout"
            target="_blank"
          >🔗</a>
        </div>
      </div>
    </div>

    <!-- Season Standings -->
    <div v-if="seasonStandings.length" class="srs-section">
      <div class="srs-label">
        <span class="srs-label-icon">🏆</span>
        Season Standings
      </div>
      <div class="srs-rows">
        <div v-for="s in seasonStandings" :key="s.categoryId" class="srs-row">
          <span v-if="s.iconUrl" class="srs-award-icon">
            <img :src="s.iconUrl" alt="" />
          </span>
          <span v-else class="srs-award-emoji">{{ emojiForIcon(s.icon) }}</span>
          <span class="srs-award-label">{{ s.label }}</span>
          <template v-if="s.leader">
            <span class="srs-award-winner">
              <button
                v-if="s.leader.userId && !compact"
                class="srs-name-btn"
                @click="emit('openProfile', { userId: s.leader.userId, name: fullName(s.leader) })"
              >{{ fullName(s.leader) }}</button>
              <span v-else>{{ fullName(s.leader) }}</span>
            </span>
            <span v-if="s.leader.metricValue != null" class="srs-metric">{{ fmtMetric(s.leader.metricValue) }}</span>
            <a
              v-if="s.leader.workoutId && !compact"
              :href="`/workout/${s.leader.workoutId}`"
              class="srs-workout-link"
              title="View workout"
              target="_blank"
            >🔗</a>
          </template>
          <span v-else class="srs-no-leader">No entries yet</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  seasonId: { type: [Number, String], required: true },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(['openProfile']);

const loading = ref(false);
const lastPostedWeek = ref(null);
const weeklyWinners = ref([]);
const seasonStandings = ref([]);

const hasContent = computed(() => weeklyWinners.value.length > 0 || seasonStandings.value.length > 0);

const fullName = (w) => {
  if (!w) return '';
  const fn = String(w.firstName || '').trim();
  const ln = String(w.lastName || '').trim();
  return [fn, ln].filter(Boolean).join(' ') || 'Unknown';
};

const fmtMetric = (v) => {
  if (v == null) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '';
};

const emojiForIcon = (icon) => {
  if (!icon || String(icon).startsWith('icon:')) return '🏅';
  return icon;
};

const load = async () => {
  if (!props.seasonId) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/seasons/${props.seasonId}/recognition/standings`, { skipAuthRedirect: true });
    lastPostedWeek.value = data.lastPostedWeek || null;
    weeklyWinners.value = data.weeklyWinners || [];
    seasonStandings.value = data.seasonStandings || [];
  } catch { /* ignore — section stays hidden */ } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(() => props.seasonId, load);
</script>

<style scoped>
.srs-wrap { display: flex; flex-direction: column; gap: 14px; }

.srs-section {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
}

.srs-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f1f5f9;
  background: #f8fafc;
}
.srs-label-icon { font-size: 14px; }

.srs-rows { display: flex; flex-direction: column; }

.srs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.88rem;
}
.srs-row:last-child { border-bottom: none; }

.srs-award-icon img { width: 22px; height: 22px; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
.srs-award-emoji { font-size: 18px; flex-shrink: 0; }

.srs-award-label {
  flex: 1;
  font-weight: 600;
  color: #1e293b;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.srs-award-winner {
  font-weight: 500;
  color: #475569;
  white-space: nowrap;
}

.srs-name-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: #4338ca;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.srs-name-btn:hover { color: #312e81; }

.srs-metric {
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  font-size: 0.87rem;
}

.srs-workout-link {
  font-size: 14px;
  text-decoration: none;
  flex-shrink: 0;
  opacity: 0.7;
}
.srs-workout-link:hover { opacity: 1; }

.srs-no-leader { color: #94a3b8; font-style: italic; font-size: 0.82rem; }
</style>
