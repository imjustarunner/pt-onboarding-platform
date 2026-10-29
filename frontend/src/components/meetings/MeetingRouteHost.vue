<template>
  <div v-if="heldRoute" v-show="!mini" class="meeting-route" :class="{ 'meeting-route--supervision': isSupervision }">
    <MeetingRouteView :key="heldRoute.path" :route="heldRoute" :viewport="viewport" />
  </div>
  <section v-if="otherMeeting" class="meeting-route-conflict" role="status">
    <p>You already have a meeting open in Mini.</p>
    <button type="button" class="btn btn-primary" @click="restore">Return to that meeting</button>
    <p>Leave that meeting before joining another one.</p>
  </section>
  <RouterView v-else-if="!heldRoute || (mini && route.path !== heldRoute.path)" :key="route.path" />
</template>

<script setup>
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import { RouterView, useRouter, isNavigationFailure } from 'vue-router';
import MeetingRouteView from './MeetingRouteView.vue';
import { useActiveMeeting } from '../../composables/useActiveMeeting';

const props = defineProps({ canMinimize: { type: Boolean, default: false } });
const router = useRouter();
const route = router.currentRoute;
const { state, setMiniMode, clearMiniMode } = useActiveMeeting();
const heldRoute = shallowRef(null);
const isMeeting = route => /^(Organization)?Join(Supervision|TeamMeeting)$/.test(String(route.name || ''));
const mini = computed(() => !!heldRoute.value && state.active);
const otherMeeting = computed(() => mini.value && isMeeting(route.value) && route.value.path !== heldRoute.value.path);
const isSupervision = computed(() => String(heldRoute.value?.name || '').endsWith('Supervision'));

watch([route, () => props.canMinimize], ([current]) => {
  if (state.active && heldRoute.value && props.canMinimize && current.path !== heldRoute.value.path) return;
  if (state.active) clearMiniMode();
  heldRoute.value = isMeeting(current) ? current : null;
}, { immediate: true });

async function minimize() {
  if (!props.canMinimize || !heldRoute.value || state.active) return;
  const meetingPath = heldRoute.value.fullPath;
  const slug = heldRoute.value.params.organizationSlug;
  // Do not change media, attendance, or capture ownership: only move the view.
  if (!setMiniMode({ meetingPath })) return;
  try {
    const failure = await router.push(slug ? `/${slug}/dashboard` : '/dashboard');
    if (isNavigationFailure(failure)) clearMiniMode();
  } catch { clearMiniMode(); }
}
async function restore() {
  if (heldRoute.value) await router.push(heldRoute.value.fullPath);
}
const viewport = { mini, canMinimize: computed(() => props.canMinimize), minimize, restore, transcriptionStatus: ref('') };
onUnmounted(clearMiniMode);
</script>

<style scoped>
.meeting-route { min-width: 0; }
.meeting-route--supervision { min-height: 100dvh; background: #0c1018; }
.meeting-route-conflict { padding: 24px; }
</style>
