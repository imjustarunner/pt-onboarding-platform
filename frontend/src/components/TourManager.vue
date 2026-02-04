<template>
  <!-- No UI: manages Driver.js tours globally -->
  <span style="display:none" />
</template>

<script setup>
import { computed, nextTick, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { driver } from 'driver.js';
import { useAuthStore } from '../store/auth';
import { useTutorialStore } from '../store/tutorial';
import { useAgencyStore } from '../store/agency';
import { useOverlaysStore } from '../store/overlays';
import { useSuperadminBuilderStore } from '../store/superadminBuilder';
import { getTourForRoute } from '../tutorial/registry';

const route = useRoute();
const authStore = useAuthStore();
const tutorialStore = useTutorialStore();
const agencyStore = useAgencyStore();
const overlaysStore = useOverlaysStore();
const builderStore = useSuperadminBuilderStore();

let drv = null;
let activeTourId = null;
let activeTourVersion = null;
let lastAutoStartedKey = null;

const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

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
  const isVisible = (el) => {
    try {
      if (!el || !(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      // getClientRects() is empty for display:none and for many off-DOM cases
      if (el.getClientRects().length === 0) return false;
      return true;
    } catch {
      return false;
    }
  };

  return (steps || []).filter((s) => {
    try {
      if (!s?.element) return true; // popovers without anchors are allowed
      if (typeof s.element === 'string') {
        const el = document.querySelector(s.element);
        return !!el && isVisible(el);
      }
      if (typeof s.element === 'function') {
        const el = s.element();
        return !!el && isVisible(el);
      }
      return !!s.element && isVisible(s.element); // Element
    } catch {
      return false;
    }
  });
};

const startForCurrentRoute = async () => {
  const userId = authStore.user?.id;
  if (!tutorialStore.enabled || !userId) return;

  const isSuperAdmin = authStore.user?.role === 'super_admin';
  const draftTour = isSuperAdmin ? builderStore.getTutorialDraftForRouteName(route.name) : null;

  let publishedTour = null;
  if (!draftTour && currentAgencyId.value && route?.name) {
    const overlays = await overlaysStore.fetchRouteOverlays(currentAgencyId.value, String(route.name));
    const enabled = overlays?.tutorial?.enabled !== false;
    const cfg = overlays?.tutorial?.config || null;
    if (enabled && cfg && typeof cfg === 'object' && Array.isArray(cfg.steps)) {
      publishedTour = cfg;
    }
  }

  const tour = draftTour || publishedTour || getTourForRoute(route);
  if (!tour) return;

  await tutorialStore.ensureLoaded(userId);

  // Only auto-start when the "page tour identity" changes.
  // This prevents re-start loops on query-string tweaks or minor reactive updates.
  const routeName = String(route?.name || '');
  const tab = String(route?.query?.tab || '');
  const tourKey = `${String(tour.id)}@${String(tour.version)}|${routeName}|${tab}`;
  if (drv?.isActive?.() && activeTourId === tour.id && activeTourVersion === tour.version) return;
  if (lastAutoStartedKey === tourKey) return;
  lastAutoStartedKey = tourKey;

  stop();

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
  () => [route.name, route.query?.tab, tutorialStore.enabled, authStore.user?.id, currentAgencyId.value],
  () => {
    startForCurrentRoute();
  },
  { immediate: true }
);

onUnmounted(() => stop());
</script>

