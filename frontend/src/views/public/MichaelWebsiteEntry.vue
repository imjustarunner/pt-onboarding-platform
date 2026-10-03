<template><main><p>Opening Michael V. Mendez Consulting…</p><a :href="destination">Continue to the website</a></main></template>
<script setup>
import {onMounted} from 'vue';
import {useRoute} from 'vue-router';
const route = useRoute();
const destination = route.fullPath;
// Public pages are pre-rendered and served independently of the portal bundle.
onMounted(() => window.location.replace(destination));
</script>
