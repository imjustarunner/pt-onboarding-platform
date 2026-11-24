<script setup>
import MessageLinkText from '../components/messages/MessageLinkText.vue';
defineProps({ text: { type: String, default: '' } });
</script>

<template><MessageLinkText :text="text" /></template>
