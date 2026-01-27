<template>
  <!-- No UI: manages Driver.js tours globally -->
  <span style="display:none" />
</template>

<script setup>
import { nextTick, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { driver } from 'driver.js';
import { useAuthStore } from '../store/auth';
import { useTutorialStore } from '../store/tutorial';
import { getTourForRoute } from '../tutorial/registry';

const route = useRoute();
const authStore = useAuthStore();
const tutorialStore = useTutorialStore();

let drv = null;
let activeTourId = null;
let activeTourVersion = null;

const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
  if (el.isContentEditable) return true;
  return false;
};

const stop = () => {
  try {
    if (drv?.isActive?.()) drv.destroy();
  } catch {
    // ignore
  } finally {
    drv = null;
    activeTourId = null;
    activeTourVersion = null;
    window.removeEventListener('keydown', onKeydown, true);
  }
};

const advance = async () => {
  if (!drv || !drv.isActive()) return;
  const userId = authStore.user?.id;
  if (drv.isLastStep()) {
    if (userId && activeTourId && typeof activeTourVersion === 'number') {
      await tutorialStore.markTourComplete(userId, activeTourId, activeTourVersion);
    }
    drv.destroy();
    return;
  }
  drv.moveNext();
};

const onKeydown = (e) => {
  if (!drv || !drv.isActive()) return;
  if (isEditableTarget(e.target)) return;

  // Spacebar can scroll; prevent when used as "Next"
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    e.stopPropagation();
    advance();
  }
};

const filterRenderableSteps = (steps) => {
  return (steps || []).filter((s) => {
    try {
      if (!s?.element) return true; // popovers without anchors are allowed
      if (typeof s.element === 'string') return !!document.querySelector(s.element);
      if (typeof s.element === 'function') return !!s.element();
      return !!s.element; // Element
    } catch {
      return false;
    }
  });
};

const startForCurrentRoute = async () => {
  stop();

  const userId = authStore.user?.id;
  if (!tutorialStore.enabled || !userId) return;

  const tour = getTourForRoute(route);
  if (!tour) return;

  await tutorialStore.ensureLoaded(userId);
  if (tutorialStore.isTourComplete(tour.id, tour.version)) return;

  // Let the page render before querying selectors.
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const steps = filterRenderableSteps(tour.steps);
  if (steps.length === 0) return;

  activeTourId = tour.id;
  activeTourVersion = tour.version;

  drv = driver({
    steps,
    animate: true,
    smoothScroll: true,
    allowClose: true,
    allowKeyboardControl: false, // we handle Enter/Space ourselves
    overlayClickBehavior: () => advance(),
    stagePadding: 6,
    stageRadius: 10,
    disableActiveInteraction: true,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next (Enter/Space)',
    prevBtnText: 'Back',
    doneBtnText: 'Done (Enter/Space)',
    onNextClick: () => advance(),
    onPrevClick: () => drv?.movePrevious?.()
  });

  window.addEventListener('keydown', onKeydown, true);
  drv.drive(0);
};

watch(
  () => [route.name, route.fullPath, tutorialStore.enabled, authStore.user?.id],
  () => {
    startForCurrentRoute();
  },
  { immediate: true }
);

onUnmounted(() => stop());
</script>

