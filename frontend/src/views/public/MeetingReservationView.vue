<template><main class="meeting-reservation-page"><h1>Reserve a meeting time</h1><MeetingReservationPicker :endpoint="endpoint" /></main></template>
<script setup>
import {computed} from 'vue';
import {useRoute} from 'vue-router';
import MeetingReservationPicker from '../../components/schedule/MeetingReservationPicker.vue';
const route=useRoute(),endpoint=computed(()=>`/public/meeting-reservations/${encodeURIComponent(String(route.params.token || ''))}`);
</script>
<style scoped>.meeting-reservation-page{min-height:100vh;padding:32px 16px;background:var(--bg-secondary,#f3f6f8)}h1{max-width:760px;margin:0 auto;font-size:28px}</style>
