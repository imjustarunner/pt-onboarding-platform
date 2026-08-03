<template>
  <section class="todays-focus" aria-label="Today's Focus">
    <div class="todays-focus__main">
      <header class="todays-focus__head">
        <div>
          <h3 class="todays-focus__title">
            Today’s Focus
            <span class="todays-focus__count">{{ visibleItems.length }} items</span>
          </h3>
          <p class="todays-focus__sub">Your personalized momentum for the day.</p>
        </div>
      </header>

      <div v-if="loading" class="todays-focus__loading">Loading focus…</div>
      <ul v-else-if="visibleItems.length" class="todays-focus__list">
        <li v-for="(item, idx) in visibleItems" :key="`${item.label}-${idx}`" class="todays-focus__item">
          <input type="checkbox" :checked="!!item._done" disabled />
          <div class="todays-focus__body">
            <div class="todays-focus__label">{{ item.label }}</div>
            <div class="todays-focus__tags">
              <span v-for="tag in item.tags || ['Today']" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </div>
          <div class="todays-focus__actions">
            <button
              v-if="canAct(item)"
              type="button"
              class="btn btn-primary btn-xs"
              :disabled="actingKey === item.label"
              @click="act(item)"
            >
              {{ actingKey === item.label ? '…' : 'Done' }}
            </button>
            <button type="button" class="btn btn-secondary btn-xs" @click="snooze(item.label)">Snooze</button>
          </div>
        </li>
      </ul>
      <p v-else class="todays-focus__empty">All clear for now.</p>

      <div class="todays-focus__footer">
        <button type="button" class="link-btn" @click="$emit('add-sticky')">+ Add Momentum Sticky</button>
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('view-momentum')">
          View All Momentum ↗
        </button>
      </div>
    </div>
    <div class="todays-focus__ring" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <path
          class="ring-bg"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          class="ring-fg"
          :stroke-dasharray="`${progressPct}, 100`"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <div class="ring-label">
        <strong>{{ progressPct }}%</strong>
        <span>Day Progress</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, toRef, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useMomentumDigestFocus } from '../../composables/useMomentumDigestFocus';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

defineEmits(['view-momentum', 'add-sticky']);

const authStore = useAuthStore();
const {
  loading,
  visibleItems,
  progressPct,
  actingKey,
  snooze,
  canAct,
  act,
  fetch
} = useMomentumDigestFocus({
  userId: () => authStore.user?.id,
  agencyId: toRef(props, 'agencyId')
});

onMounted(fetch);
watch(() => props.agencyId, fetch);
</script>

<style scoped>
.todays-focus {
  display: grid;
  grid-template-columns: 1fr 140px;
  gap: 16px;
  background: linear-gradient(135deg, #fef9c3 0%, #fef08a 40%, #fde68a 100%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 18px 20px;
  margin-bottom: 18px;
}
.todays-focus__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #1a1a1a;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.todays-focus__count {
  font-size: 12px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.55);
}
.todays-focus__sub {
  margin: 4px 0 12px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
}
.todays-focus__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.todays-focus__item {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  gap: 10px;
  align-items: start;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  padding: 10px 12px;
}
.todays-focus__label { font-size: 13px; font-weight: 600; color: #1a1a1a; }
.todays-focus__tags { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.tag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  padding: 2px 8px;
  color: #57534e;
}
.todays-focus__actions { display: flex; gap: 6px; }
.todays-focus__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  gap: 10px;
  flex-wrap: wrap;
}
.link-btn {
  border: 0;
  background: transparent;
  color: #166534;
  font-weight: 700;
  cursor: pointer;
  font-size: 13px;
}
.todays-focus__ring {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.todays-focus__ring svg {
  width: 120px;
  height: 120px;
  transform: rotate(-90deg);
}
.ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.55);
  stroke-width: 3.2;
}
.ring-fg {
  fill: none;
  stroke: #166534;
  stroke-width: 3.2;
  stroke-linecap: round;
}
.ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.ring-label strong { font-size: 1.1rem; color: #166534; }
.ring-label span { font-size: 10px; color: #57534e; font-weight: 600; }
.todays-focus__loading,
.todays-focus__empty { font-size: 13px; color: rgba(0, 0, 0, 0.55); }
@media (max-width: 700px) {
  .todays-focus { grid-template-columns: 1fr; }
  .todays-focus__ring { justify-content: flex-start; }
}
</style>
