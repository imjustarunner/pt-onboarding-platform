<template>
  <Teleport to="body">
    <div
      v-if="hoverCard.visible && tutorialStore.enabled"
      class="sp-tutorial-hover-card"
      :style="hoverCardStyle"
      role="dialog"
      :aria-label="hoverCard.title"
      @mouseenter="clearHoverHideTimer"
      @mouseleave="scheduleHideHoverCard"
    >
      <div class="sp-tutorial-hover-card__title">{{ hoverCard.title }}</div>
      <p class="sp-tutorial-hover-card__desc">{{ hoverCard.description }}</p>
      <div class="sp-tutorial-hover-card__actions">
        <button type="button" class="sp-tutorial-hover-btn ghost" @click="onHoverDismiss('snooze')">
          Remind later
        </button>
        <button type="button" class="sp-tutorial-hover-btn ghost" @click="onHoverDismiss('dismiss')">
          Remove
        </button>
        <button type="button" class="sp-tutorial-hover-btn danger" @click="onHoverTurnOff">
          Turn off tutorial
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAuthStore } from '../../store/auth';
import { useTutorialStore } from '../../store/tutorial';
import {
  SCHOOL_PORTAL_TUTORIAL_ID,
  SCHOOL_PORTAL_TUTORIAL_VERSION,
  schoolPortalGuidedSteps,
  schoolPortalHoverTips
} from '../../tutorial/schoolPortalTutorialSteps';

const props = defineProps({
  disabled: { type: Boolean, default: false }
});

const navigatePortalMode = inject('schoolPortalNavigateMode', null);
const tutorialStore = useTutorialStore();
const authStore = useAuthStore();

let drv = null;
let hoverTimer = null;
let hoverHideTimer = null;
let guidedStartKey = '';
let manualRestartNonce = 0;
let navigatingStep = false;

const hoverCard = ref({
  visible: false,
  tipId: '',
  title: '',
  description: '',
  top: 0,
  left: 0
});

const hoverCardStyle = computed(() => ({
  top: `${hoverCard.value.top}px`,
  left: `${hoverCard.value.left}px`
}));

const isVisible = (el) => {
  try {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  } catch {
    return false;
  }
};

const queryFirstVisible = (selector) => {
  if (!selector) return null;
  const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const nodes = document.querySelectorAll(part);
    for (const el of nodes) {
      if (isVisible(el)) return el;
    }
  }
  return null;
};

const navigateForStep = async (step) => {
  const mode = String(step?.portalMode || '').trim().toLowerCase();
  if (!mode || typeof navigatePortalMode !== 'function') return;
  await navigatePortalMode(mode);
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 80));
};

const buildDriverSteps = () =>
  schoolPortalGuidedSteps.map((step) => {
    const selector = step.selector ? String(step.selector) : '';
    return {
      element: selector
        ? () => queryFirstVisible(selector)
        : undefined,
      popover: {
        ...step.popover,
        showButtons: ['next', 'previous', 'close']
      },
      onHighlightStarted: async () => {
        if (navigatingStep) return;
        navigatingStep = true;
        try {
          if (step.portalMode) {
            await navigateForStep(step);
            await nextTick();
            await new Promise((resolve) => requestAnimationFrame(resolve));
            try {
              drv?.refresh?.();
            } catch {
              // ignore
            }
          }
        } finally {
          navigatingStep = false;
        }
      }
    };
  });

const injectPopoverActions = (popoverDom) => {
  if (!popoverDom?.footerButtons) return;

  const syncJumpSelect = () => {
    const jumpSelect = popoverDom.footerButtons.querySelector('[data-sp-tutorial-jump]');
    if (!jumpSelect || !drv?.isActive?.()) return;
    const idx = drv.getActiveIndex?.() ?? 0;
    jumpSelect.value = String(idx);
  };

  if (!popoverDom.footerButtons.querySelector('[data-sp-tutorial-end]')) {
    const wrap = document.createElement('div');
    wrap.className = 'sp-tutorial-popover-extra';
    wrap.setAttribute('data-sp-tutorial-end', '1');

    const jumpWrap = document.createElement('label');
    jumpWrap.className = 'sp-tutorial-popover-jump';
    jumpWrap.setAttribute('aria-label', 'Jump to tutorial step');

    const jumpLabel = document.createElement('span');
    jumpLabel.className = 'sp-tutorial-popover-jump-label';
    jumpLabel.textContent = 'Jump to';

    const jumpSelect = document.createElement('select');
    jumpSelect.className = 'sp-tutorial-popover-jump-select';
    jumpSelect.setAttribute('data-sp-tutorial-jump', '1');
    schoolPortalGuidedSteps.forEach((step, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index + 1}. ${step.popover?.title || step.id}`;
      jumpSelect.appendChild(option);
    });
    jumpSelect.addEventListener('change', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = Number(jumpSelect.value);
      if (!Number.isFinite(nextIndex)) return;
      void jumpToGuidedStep(nextIndex);
    });

    jumpWrap.appendChild(jumpLabel);
    jumpWrap.appendChild(jumpSelect);
    wrap.appendChild(jumpWrap);

    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'sp-tutorial-popover-end';
    endBtn.textContent = 'End tutorial';
    endBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void endTutorialNow({ markComplete: false });
    });

    const remindBtn = document.createElement('button');
    remindBtn.type = 'button';
    remindBtn.className = 'sp-tutorial-popover-remind';
    remindBtn.textContent = 'Remind later';
    remindBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void remindTutorialLater();
    });

    wrap.appendChild(remindBtn);
    wrap.appendChild(endBtn);
    popoverDom.footerButtons.insertBefore(wrap, popoverDom.footerButtons.firstChild);
  }

  syncJumpSelect();
};

const stopGuidedTour = () => {
  try {
    if (drv?.isActive?.()) drv.destroy();
  } catch {
    // ignore
  } finally {
    drv = null;
    window.removeEventListener('keydown', onGuidedKeydown, true);
  }
};

const saveGuidedStepProgress = async (stepIndex) => {
  const userId = authStore.user?.id;
  if (!userId) return;
  await tutorialStore.saveTourStepIndex(
    userId,
    SCHOOL_PORTAL_TUTORIAL_ID,
    SCHOOL_PORTAL_TUTORIAL_VERSION,
    stepIndex
  );
};

const pauseGuidedTour = async () => {
  const idx = drv?.getActiveIndex?.() ?? 0;
  await saveGuidedStepProgress(idx);
  stopGuidedTour();
};

const jumpToGuidedStep = async (stepIndex) => {
  if (!drv?.isActive?.()) return;
  const idx = Math.max(0, Math.min(schoolPortalGuidedSteps.length - 1, Number(stepIndex) || 0));
  const stepMeta = schoolPortalGuidedSteps[idx];
  if (stepMeta?.portalMode) {
    await navigateForStep(stepMeta);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  drv.drive(idx);
  try {
    drv?.refresh?.();
  } catch {
    // ignore
  }
  await saveGuidedStepProgress(idx);
  try {
    const popoverDom = drv?.getState?.('popover');
    if (popoverDom?.footerButtons) injectPopoverActions(popoverDom);
  } catch {
    // ignore
  }
};

const endTutorialNow = async ({ markComplete = false } = {}) => {
  const userId = authStore.user?.id;
  if (markComplete && userId) {
    await tutorialStore.markTourComplete(userId, SCHOOL_PORTAL_TUTORIAL_ID, SCHOOL_PORTAL_TUTORIAL_VERSION);
  }
  stopGuidedTour();
  tutorialStore.setEnabled(false);
};

const remindTutorialLater = async () => {
  const userId = authStore.user?.id;
  if (userId) {
    await tutorialStore.applyTipAction(userId, SCHOOL_PORTAL_TUTORIAL_ID, 'snooze');
  }
  stopGuidedTour();
  tutorialStore.setEnabled(false);
};

const advanceGuided = async () => {
  if (!drv?.isActive?.()) return;
  const userId = authStore.user?.id;
  if (drv.isLastStep()) {
    if (userId) {
      await tutorialStore.markTourComplete(userId, SCHOOL_PORTAL_TUTORIAL_ID, SCHOOL_PORTAL_TUTORIAL_VERSION);
    }
    stopGuidedTour();
    return;
  }

  const nextIndex = (drv.getActiveIndex?.() ?? 0) + 1;
  const nextMeta = schoolPortalGuidedSteps[nextIndex];
  if (nextMeta?.portalMode) {
    await navigateForStep(nextMeta);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  drv.moveNext();
  try {
    drv?.refresh?.();
  } catch {
    // ignore
  }
  await saveGuidedStepProgress(drv.getActiveIndex?.() ?? nextIndex);
};

const isEditableTarget = (el) => {
  if (!el) return false;
  // Tour popover buttons should not block Space / Arrow shortcuts.
  if (el instanceof Element && el.closest('.driver-popover')) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return !!el.isContentEditable;
};

const onGuidedKeydown = (e) => {
  if (!drv?.isActive?.()) return;
  if (isEditableTarget(e.target)) return;

  if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowRight') {
    e.preventDefault();
    e.stopPropagation();
    void advanceGuided();
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    void pauseGuidedTour();
  }
};

const startGuidedTour = async ({ force = false } = {}) => {
  if (props.disabled || !tutorialStore.enabled) return;
  const userId = authStore.user?.id;
  if (!userId) return;

  await tutorialStore.ensureLoaded(userId);
  const tourKey = `${SCHOOL_PORTAL_TUTORIAL_ID}@${SCHOOL_PORTAL_TUTORIAL_VERSION}|nonce:${manualRestartNonce}`;
  if (!force && guidedStartKey === tourKey) return;
  if (!force && tutorialStore.isTourComplete(SCHOOL_PORTAL_TUTORIAL_ID, SCHOOL_PORTAL_TUTORIAL_VERSION)) {
    return;
  }

  stopGuidedTour();
  guidedStartKey = tourKey;

  await navigateForStep({ portalMode: 'home' });
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const steps = buildDriverSteps();
  if (!steps.length) return;

  const savedIndex = tutorialStore.getTourStepIndex(
    SCHOOL_PORTAL_TUTORIAL_ID,
    SCHOOL_PORTAL_TUTORIAL_VERSION
  );
  const startIndex = Math.max(0, Math.min(steps.length - 1, savedIndex));

  if (startIndex > 0) {
    const startMeta = schoolPortalGuidedSteps[startIndex];
    if (startMeta?.portalMode) {
      await navigateForStep(startMeta);
      await nextTick();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  drv = driver({
    steps,
    animate: true,
    smoothScroll: true,
    allowClose: true,
    allowKeyboardControl: false,
    overlayClickBehavior: () => {
      // Ignore accidental outside clicks — use End tutorial or Escape to pause.
    },
    stagePadding: 6,
    stageRadius: 10,
    disableActiveInteraction: true,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next (Space / →)',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    onPopoverRender: (popoverDom) => injectPopoverActions(popoverDom),
    onHighlighted: (_el, _step, { state }) => {
      void saveGuidedStepProgress(state?.activeIndex ?? drv?.getActiveIndex?.() ?? 0);
      if (state?.popover?.footerButtons) {
        injectPopoverActions(state.popover);
      }
    },
    onCloseClick: () => {
      void pauseGuidedTour();
    },
    onNextClick: () => {
      void advanceGuided();
    },
    onPrevClick: () => {
      const prevIndex = Math.max(0, (drv.getActiveIndex?.() ?? 0) - 1);
      const prevMeta = schoolPortalGuidedSteps[prevIndex];
      void (async () => {
        if (prevMeta?.portalMode) {
          await navigateForStep(prevMeta);
          await nextTick();
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        drv?.movePrevious?.();
        try {
          drv?.refresh?.();
        } catch {
          // ignore
        }
        await saveGuidedStepProgress(drv?.getActiveIndex?.() ?? prevIndex);
      })();
    },
    onDestroyed: () => {
      drv = null;
      window.removeEventListener('keydown', onGuidedKeydown, true);
    }
  });

  window.addEventListener('keydown', onGuidedKeydown, true);
  drv.drive(startIndex);
  void saveGuidedStepProgress(startIndex);
};

const hideHoverCard = () => {
  hoverCard.value = {
    visible: false,
    tipId: '',
    title: '',
    description: '',
    top: 0,
    left: 0
  };
};

const clearHoverHideTimer = () => {
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
};

const scheduleHideHoverCard = () => {
  clearHoverHideTimer();
  hoverHideTimer = setTimeout(() => hideHoverCard(), 200);
};

const positionHoverCard = (el) => {
  const rect = el.getBoundingClientRect();
  const width = 320;
  const margin = 12;
  let left = rect.left;
  let top = rect.bottom + margin;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - width - margin);
  }
  if (top + 180 > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - 180 - margin);
  }
  hoverCard.value.top = top;
  hoverCard.value.left = left;
};

const showHoverForTarget = (target) => {
  if (!tutorialStore.enabled || props.disabled) return;
  if (drv?.isActive?.()) return;
  const tourEl = target?.closest?.('[data-tour]');
  if (!tourEl) return;
  const tipId = String(tourEl.getAttribute('data-tour') || '').trim();
  if (!tipId || tutorialStore.isTipHidden(tipId)) return;
  const tip = schoolPortalHoverTips[tipId];
  if (!tip) return;

  positionHoverCard(tourEl);
  hoverCard.value = {
    visible: true,
    tipId,
    title: tip.title,
    description: tip.description,
    top: hoverCard.value.top,
    left: hoverCard.value.left
  };
};

const onPointerOver = (event) => {
  if (!tutorialStore.enabled || props.disabled) return;
  if (drv?.isActive?.()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.sp-tutorial-hover-card')) return;

  clearHoverHideTimer();
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => showHoverForTarget(target), 650);
};

const onPointerOut = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  scheduleHideHoverCard();
};

const onHoverDismiss = async (action) => {
  const tipId = hoverCard.value.tipId;
  const userId = authStore.user?.id;
  if (tipId && userId) {
    await tutorialStore.applyTipAction(userId, tipId, action);
  }
  hideHoverCard();
};

const onHoverTurnOff = () => {
  hideHoverCard();
  tutorialStore.setEnabled(false);
};

watch(
  () => tutorialStore.enabled,
  (enabled, wasEnabled) => {
    if (!enabled) {
      stopGuidedTour();
      hideHoverCard();
      return;
    }
    if (enabled && !wasEnabled) {
      manualRestartNonce += 1;
      guidedStartKey = '';
      void startGuidedTour({ force: true });
    }
  }
);

onMounted(() => {
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  if (tutorialStore.enabled) {
    void startGuidedTour();
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerover', onPointerOver, true);
  document.removeEventListener('pointerout', onPointerOut, true);
  clearHoverHideTimer();
  if (hoverTimer) clearTimeout(hoverTimer);
  stopGuidedTour();
});

defineExpose({
  restartGuidedTour: () => startGuidedTour({ force: true })
});
</script>

<style scoped>
.sp-tutorial-hover-card {
  position: fixed;
  z-index: 10050;
  width: min(320px, calc(100vw - 24px));
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  padding: 12px 14px 10px;
  pointer-events: auto;
}

.sp-tutorial-hover-card__title {
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 6px;
}

.sp-tutorial-hover-card__desc {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.45;
  color: #475569;
}

.sp-tutorial-hover-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sp-tutorial-hover-btn {
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  padding: 5px 8px;
  cursor: pointer;
}

.sp-tutorial-hover-btn.ghost:hover {
  border-color: #94a3b8;
}

.sp-tutorial-hover-btn.danger {
  border-color: #fecaca;
  background: #fff1f2;
  color: #b91c1c;
}
</style>

<style>
/* Driver popover extras (rendered outside scoped tree) */
.sp-tutorial-popover-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-right: auto;
  padding-right: 8px;
}

.driver-popover-footer {
  flex-wrap: wrap;
  gap: 8px;
}

.sp-tutorial-popover-end,
.sp-tutorial-popover-remind {
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
  line-height: 1.2;
}

.sp-tutorial-popover-jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

.sp-tutorial-popover-jump-label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

.sp-tutorial-popover-jump-select {
  max-width: min(220px, 42vw);
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  padding: 5px 8px;
}

.sp-tutorial-popover-end {
  border-color: #fecaca;
  background: #fff1f2;
  color: #b91c1c;
}

.sp-tutorial-popover-end:hover,
.sp-tutorial-popover-remind:hover {
  filter: brightness(0.97);
}
</style>
