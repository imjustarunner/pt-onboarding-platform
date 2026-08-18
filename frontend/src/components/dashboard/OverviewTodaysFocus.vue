<template>
  <section v-if="!dismissed" class="todays-focus" :class="{ 'todays-focus--collapsed': collapsed }" aria-label="Today's Focus">
    <div class="todays-focus__main">
      <header class="todays-focus__head">
        <button
          type="button"
          class="todays-focus__head-toggle"
          :aria-expanded="!collapsed"
          @click="collapsed = !collapsed"
        >
          <svg
            class="todays-focus__chevron"
            :class="{ 'todays-focus__chevron--open': !collapsed }"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
          <div>
            <h3 class="todays-focus__title">
              Today’s Focus
              <span v-if="visibleItems.length" class="todays-focus__count">{{ visibleItems.length }} items</span>
            </h3>
            <p v-if="!collapsed" class="todays-focus__sub">Your personalized momentum for the day.</p>
          </div>
        </button>
        <div class="todays-focus__head-actions">
          <button
            type="button"
            class="todays-focus__icon-btn"
            aria-label="Dismiss Today's Focus"
            title="Dismiss for now"
            @click="dismiss"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </header>

      <template v-if="!collapsed">
        <div v-if="loading" class="todays-focus__loading">Loading focus…</div>
        <ul v-else-if="displayItems.length" class="todays-focus__list">
          <li v-for="(item, idx) in displayItems" :key="`${item.label}-${idx}`" class="todays-focus__item">
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

        <div v-if="moreCount > 0" class="todays-focus__more">
          <button type="button" class="link-btn" @click="$emit('view-momentum')">
            {{ moreCount }} more item{{ moreCount === 1 ? '' : 's' }} in Momentum ↗
          </button>
        </div>

        <div class="todays-focus__footer">
          <button type="button" class="link-btn" @click="$emit('add-sticky')">+ Add Momentum Sticky</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="$emit('view-momentum')">
            View All Momentum ↗
          </button>
        </div>
      </template>
    </div>
    <div v-if="!collapsed" class="todays-focus__ring" aria-hidden="true">
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
  <div v-else class="todays-focus-dismissed">
    <button type="button" class="link-btn" @click="restore">Show Today’s Focus</button>
  </div>
</template>

<script setup>
import { onMounted, ref, toRef, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useMomentumDigestFocus } from '../../composables/useMomentumDigestFocus';

const COLLAPSED_KEY = 'overview_focus_collapsed';
const DISMISSED_KEY = 'overview_focus_dismissed';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

defineEmits(['view-momentum', 'add-sticky']);

const authStore = useAuthStore();
const collapsed = ref(sessionStorage.getItem(COLLAPSED_KEY) === '1');
const dismissed = ref(sessionStorage.getItem(DISMISSED_KEY) === '1');

const {
  loading,
  visibleItems,
  displayItems,
  moreCount,
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

function dismiss() {
  dismissed.value = true;
  sessionStorage.setItem(DISMISSED_KEY, '1');
}

function restore() {
  dismissed.value = false;
  sessionStorage.removeItem(DISMISSED_KEY);
}

watch(collapsed, (val) => {
  sessionStorage.setItem(COLLAPSED_KEY, val ? '1' : '0');
});

onMounted(fetch);
watch(() => props.agencyId, fetch);
</script>

<style scoped>
.todays-focus {
  display: grid;
  grid-template-columns: 1fr 100px;
  gap: 12px;
  background: linear-gradient(135deg, #fef9c3 0%, #fef08a 40%, #fde68a 100%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
}
.todays-focus--collapsed {
  grid-template-columns: 1fr;
  padding: 10px 14px;
}
.todays-focus__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
}
.todays-focus__head-toggle {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  padding: 0;
  flex: 1;
  min-width: 0;
}
.todays-focus__chevron {
  flex-shrink: 0;
  margin-top: 3px;
  color: rgba(0, 0, 0, 0.45);
  transition: transform 0.15s ease;
}
.todays-focus__chevron--open {
  transform: rotate(180deg);
}
.todays-focus__head-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.todays-focus__icon-btn {
  border: 0;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
  line-height: 0;
}
.todays-focus__icon-btn:hover {
  background: rgba(255, 255, 255, 0.8);
  color: rgba(0, 0, 0, 0.7);
}
.todays-focus__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: #1a1a1a;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.todays-focus__count {
  font-size: 11px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.5);
}
.todays-focus__sub {
  margin: 2px 0 8px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
}
.todays-focus__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.todays-focus__item {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 8px;
  align-items: start;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  padding: 8px 10px;
}
.todays-focus__label { font-size: 12px; font-weight: 600; color: #1a1a1a; line-height: 1.35; }
.todays-focus__tags { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
.tag {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  padding: 1px 6px;
  color: #57534e;
}
.todays-focus__actions { display: flex; gap: 4px; }
.todays-focus__more {
  margin-top: 6px;
}
.todays-focus__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  gap: 8px;
  flex-wrap: wrap;
}
.link-btn {
  border: 0;
  background: transparent;
  color: #166534;
  font-weight: 700;
  cursor: pointer;
  font-size: 12px;
}
.todays-focus__ring {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.todays-focus__ring svg {
  width: 88px;
  height: 88px;
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
.ring-label strong { font-size: 0.95rem; color: #166534; }
.ring-label span { font-size: 9px; color: #57534e; font-weight: 600; }
.todays-focus__loading,
.todays-focus__empty { font-size: 12px; color: rgba(0, 0, 0, 0.5); margin-top: 8px; }
.todays-focus-dismissed {
  margin-bottom: 10px;
}
@media (max-width: 700px) {
  .todays-focus { grid-template-columns: 1fr; }
  .todays-focus__ring { justify-content: flex-start; }
}

:global([data-theme="dark"]) .todays-focus {
  background: linear-gradient(135deg, #3f3a1a 0%, #2a2614 50%, #1f1c12 100%);
  border-color: rgba(253, 230, 138, 0.22);
}
:global([data-theme="dark"]) .todays-focus__chevron,
:global([data-theme="dark"]) .todays-focus__icon-btn {
  color: #fde68a;
}
:global([data-theme="dark"]) .todays-focus__icon-btn {
  background: rgba(0, 0, 0, 0.28);
}
:global([data-theme="dark"]) .todays-focus__icon-btn:hover {
  background: rgba(0, 0, 0, 0.45);
  color: #fef9c3;
}
:global([data-theme="dark"]) .todays-focus__title,
:global([data-theme="dark"]) .todays-focus__label {
  color: #fef9c3;
}
:global([data-theme="dark"]) .todays-focus__count,
:global([data-theme="dark"]) .todays-focus__sub,
:global([data-theme="dark"]) .todays-focus__loading,
:global([data-theme="dark"]) .todays-focus__empty {
  color: rgba(254, 243, 199, 0.65);
}
:global([data-theme="dark"]) .todays-focus__item {
  background: rgba(0, 0, 0, 0.28);
}
:global([data-theme="dark"]) .tag {
  background: rgba(0, 0, 0, 0.35);
  color: #fde68a;
}
:global([data-theme="dark"]) .link-btn {
  color: #86efac;
}
:global([data-theme="dark"]) .ring-bg { stroke: rgba(253, 230, 138, 0.2); }
:global([data-theme="dark"]) .ring-fg { stroke: #86efac; }
:global([data-theme="dark"]) .ring-label strong { color: #86efac; }
:global([data-theme="dark"]) .ring-label span { color: #fde68a; }
</style>
