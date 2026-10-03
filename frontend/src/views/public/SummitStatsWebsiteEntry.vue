<template><main><p>Opening Summit Stats Team Challenge…</p><a :href="destination">Continue to the website</a></main></template>
<script setup>
import {onMounted} from 'vue';
import {useRoute} from 'vue-router';
import {isSstcPublicHost, sstcPublicPaths, SSTC_ORIGIN} from '../../sstc/website/routing.mjs';
const route = useRoute();
const host = window.location.hostname;
const local = ['localhost','127.0.0.1'].includes(host);
const destination = local ? route.fullPath : `${isSstcPublicHost(host) ? '' : SSTC_ORIGIN}${sstcPublicPaths.clean(route.fullPath)}`;
// Static public pages intentionally do not load member/manager application data.
onMounted(() => window.location.replace(destination));
</script>
