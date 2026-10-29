<template>
  <RouterView :route="route" />
</template>

<script setup>
import { provide, shallowReactive, watch } from 'vue';
import { RouterView, routeLocationKey } from 'vue-router';
import { meetingViewportKey } from '../../utils/meetingMiniMode';

const props = defineProps({ route: { type: Object, required: true }, viewport: { type: Object, required: true } });
// RouterView's route prop alone does not scope useRoute() in Vue Router 4.
// Keep the live meeting's IDs and invitation query while the app navigates.
const meetingRoute = shallowReactive({ ...props.route });
watch(() => props.route, route => Object.assign(meetingRoute, route));
provide(routeLocationKey, meetingRoute);
provide(meetingViewportKey, props.viewport);
</script>
