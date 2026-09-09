<template>
  <section v-if="!dismissed" class="todays-focus" :class="{ 'todays-focus--collapsed': collapsed }" aria-label="Today's Focus">
    <div class="todays-focus__main">
      <header class="todays-focus__head">
        <div class="todays-focus__head-main">
          <button
            type="button"
            class="todays-focus__head-toggle"
            :aria-expanded="!collapsed"
            @click="toggleCollapsed"
          >
            <span
              class="todays-focus__expand"
              :class="{ 'todays-focus__expand--pulse': collapsed }"
              aria-hidden="true"
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
              >
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </span>
            <div>
              <h3 class="todays-focus__title">
                Today’s Focus
                <span v-if="visibleItems.length" class="todays-focus__count">{{ visibleItems.length }} items</span>
              </h3>
              <p v-if="!collapsed" class="todays-focus__sub">Your personalized momentum for the day.</p>
            </div>
          </button>
          <button
            v-if="collapsed && rotateItem"
            type="button"
            class="todays-focus__rotate-teaser"
            @click="onOpenItem(rotateItem)"
          >
            <span class="todays-focus__rotate-label">{{ rotateItem.label }}</span>
            <span class="todays-focus__rotate-meta">
              {{ rotateIndex + 1 }}/{{ displayItems.length }} · Open ↗
            </span>
          </button>
        </div>
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
        <div v-else-if="displayItems.length" class="todays-focus__carousel">
          <div
            class="todays-focus__item todays-focus__item--rotate"
            role="button"
            tabindex="0"
            @click="onOpenItem(rotateItem)"
            @keydown.enter.prevent="onOpenItem(rotateItem)"
            @keydown.space.prevent="onOpenItem(rotateItem)"
          >
            <input type="checkbox" :checked="!!rotateItem?._done" disabled @click.stop />
            <div class="todays-focus__body">
              <div class="todays-focus__label">{{ rotateItem?.label }}</div>
              <div class="todays-focus__tags">
                <span v-for="tag in rotateItem?.tags || ['Today']" :key="tag" class="tag">{{ tag }}</span>
                <span class="tag tag--open">Open ↗</span>
              </div>
            </div>
            <div class="todays-focus__actions" @click.stop>
              <button
                v-if="canAct(rotateItem)"
                type="button"
                class="btn btn-primary btn-xs"
                :disabled="actingKey === rotateItem?.label"
                @click="onAct(rotateItem)"
              >
                {{ actingKey === rotateItem?.label ? '…' : 'Done' }}
              </button>
              <button type="button" class="btn btn-secondary btn-xs" @click="onSnooze(rotateItem)">Snooze</button>
            </div>
          </div>
          <div class="todays-focus__dots" role="tablist" aria-label="Focus items">
            <button
              v-for="(item, idx) in displayItems"
              :key="`${item.label}-${idx}`"
              type="button"
              class="todays-focus__dot"
              :class="{ 'todays-focus__dot--active': idx === rotateIndex }"
              :aria-label="`Show focus item ${idx + 1}`"
              :aria-selected="idx === rotateIndex"
              role="tab"
              @click="setRotateIndex(idx)"
            />
          </div>
        </div>
        <p v-else class="todays-focus__empty">All clear for now.</p>

        <div v-if="moreCount > 0" class="todays-focus__more">
          <button type="button" class="link-btn" @click="onViewMomentum('more')">
            {{ moreCount }} more item{{ moreCount === 1 ? '' : 's' }} in My Work ↗
          </button>
        </div>

        <div class="todays-focus__footer">
          <button type="button" class="link-btn" @click="onAddSticky">+ Add Sticky</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="onViewMomentum('view_all')">
            View All My Work ↗
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
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useMomentumDigestFocus } from '../../composables/useMomentumDigestFocus';
import api from '../../services/api';

const COLLAPSED_KEY = 'overview_focus_collapsed';
const DISMISSED_KEY = 'overview_focus_dismissed';
const ROTATE_MS = 5000;

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['view-momentum', 'add-sticky', 'open-item']);

const authStore = useAuthStore();
const collapsed = ref(sessionStorage.getItem(COLLAPSED_KEY) !== '0');
const dismissed = ref(sessionStorage.getItem(DISMISSED_KEY) === '1');
const rotateIndex = ref(0);
let rotateTimer = null;

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

const rotateItem = computed(() => {
  const list = displayItems.value || [];
  if (!list.length) return null;
  const idx = ((rotateIndex.value % list.length) + list.length) % list.length;
  return list[idx] || list[0];
});

function setRotateIndex(idx) {
  const list = displayItems.value || [];
  if (!list.length) {
    rotateIndex.value = 0;
    return;
  }
  rotateIndex.value = ((Number(idx) % list.length) + list.length) % list.length;
  restartRotateTimer();
}

function advanceRotate() {
  const list = displayItems.value || [];
  if (list.length < 2) return;
  rotateIndex.value = (rotateIndex.value + 1) % list.length;
}

function stopRotateTimer() {
  if (rotateTimer) {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
}

function restartRotateTimer() {
  stopRotateTimer();
  if (dismissed.value || (displayItems.value || []).length < 2) return;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    return;
  }
  rotateTimer = setInterval(advanceRotate, ROTATE_MS);
}

function trackFocusClick(action, extra = {}) {
  api.post(
    '/auth/activity-log',
    {
      actionType: 'todays_focus_click',
      agencyId: Number(props.agencyId || 0) || undefined,
      metadata: {
        action,
        itemCount: visibleItems.value.length,
        collapsed: collapsed.value,
        ...extra
      }
    },
    { skipGlobalLoading: true }
  ).catch(() => {});
}

function toggleCollapsed() {
  const next = !collapsed.value;
  collapsed.value = next;
  trackFocusClick(next ? 'collapse' : 'expand');
}

function dismiss() {
  trackFocusClick('dismiss');
  dismissed.value = true;
  sessionStorage.setItem(DISMISSED_KEY, '1');
  stopRotateTimer();
}

function restore() {
  dismissed.value = false;
  sessionStorage.removeItem(DISMISSED_KEY);
  trackFocusClick('restore');
  restartRotateTimer();
}

function onAct(item) {
  trackFocusClick('done', { label: item?.label, source: item?.source || null });
  act(item);
}

function onSnooze(item) {
  trackFocusClick('snooze', { label: item?.label, source: item?.source || null });
  snooze(item.label);
}

function onOpenItem(item) {
  if (!item) return;
  trackFocusClick('open_item', { label: item.label, source: item.source || null });
  emit('open-item', item);
}

function onViewMomentum(from) {
  trackFocusClick('view_all_my_work', { from });
  emit('view-momentum');
}

function onAddSticky() {
  trackFocusClick('add_sticky');
  emit('add-sticky');
}

watch(collapsed, (val) => {
  sessionStorage.setItem(COLLAPSED_KEY, val ? '1' : '0');
});

watch(displayItems, (list) => {
  if (!list?.length) {
    rotateIndex.value = 0;
    stopRotateTimer();
    return;
  }
  if (rotateIndex.value >= list.length) rotateIndex.value = 0;
  restartRotateTimer();
});

onMounted(async () => {
  await fetch();
  restartRotateTimer();
});
watch(() => props.agencyId, async () => {
  await fetch();
  restartRotateTimer();
});
onUnmounted(stopRotateTimer);
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
.todays-focus__head-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
.todays-focus__expand {
  flex-shrink: 0;
  margin-top: 1px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  color: #166534;
}
.todays-focus__expand--pulse {
  animation: todays-focus-expand-pulse 1.6s ease-in-out infinite;
}
.todays-focus__chevron {
  color: currentColor;
  transition: transform 0.15s ease;
}
.todays-focus__chevron--open {
  transform: rotate(180deg);
}
@keyframes todays-focus-expand-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(22, 101, 52, 0.45);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 8px rgba(22, 101, 52, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(22, 101, 52, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .todays-focus__expand--pulse {
    animation: none;
  }
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
.todays-focus__rotate-teaser {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin-left: 32px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
}
.todays-focus__rotate-label {
  font-size: 12px;
  font-weight: 650;
  color: #166534;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.todays-focus__rotate-meta {
  font-size: 10px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.todays-focus__carousel {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  border: 0;
  width: 100%;
  text-align: left;
  font: inherit;
}
.todays-focus__item--rotate {
  cursor: pointer;
}
.todays-focus__item--rotate:hover {
  background: rgba(255, 255, 255, 0.85);
}
.todays-focus__dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
}
.todays-focus__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  border: 0;
  padding: 0;
  background: rgba(22, 101, 52, 0.28);
  cursor: pointer;
}
.todays-focus__dot--active {
  background: #166534;
  transform: scale(1.15);
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
.tag--open {
  background: #166534;
  color: #fff;
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
:global([data-theme="dark"]) .todays-focus__expand {
  background: rgba(0, 0, 0, 0.35);
  color: #86efac;
}
:global([data-theme="dark"]) .todays-focus__expand--pulse {
  animation-name: todays-focus-expand-pulse-dark;
}
@keyframes todays-focus-expand-pulse-dark {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(134, 239, 172, 0.45);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 8px rgba(134, 239, 172, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(134, 239, 172, 0);
  }
}
:global([data-theme="dark"]) .todays-focus__icon-btn {
  color: #fde68a;
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
:global([data-theme="dark"]) .todays-focus__empty,
:global([data-theme="dark"]) .todays-focus__rotate-meta {
  color: rgba(254, 243, 199, 0.65);
}
:global([data-theme="dark"]) .todays-focus__rotate-label {
  color: #86efac;
}
:global([data-theme="dark"]) .todays-focus__item {
  background: rgba(0, 0, 0, 0.28);
}
:global([data-theme="dark"]) .todays-focus__item--rotate:hover {
  background: rgba(0, 0, 0, 0.42);
}
:global([data-theme="dark"]) .todays-focus__dot {
  background: rgba(134, 239, 172, 0.3);
}
:global([data-theme="dark"]) .todays-focus__dot--active {
  background: #86efac;
}
:global([data-theme="dark"]) .tag {
  background: rgba(0, 0, 0, 0.35);
  color: #fde68a;
}
:global([data-theme="dark"]) .tag--open {
  background: #166534;
  color: #ecfdf5;
}
:global([data-theme="dark"]) .link-btn {
  color: #86efac;
}
:global([data-theme="dark"]) .ring-bg { stroke: rgba(253, 230, 138, 0.2); }
:global([data-theme="dark"]) .ring-fg { stroke: #86efac; }
:global([data-theme="dark"]) .ring-label strong { color: #86efac; }
:global([data-theme="dark"]) .ring-label span { color: #fde68a; }
</style>
