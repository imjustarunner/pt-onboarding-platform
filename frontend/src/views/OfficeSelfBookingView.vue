<template><main class="office-reservations"><a :href="`/kiosk-welcome/${route.params.locationId}`">← Office welcome</a><h1>Book an office</h1><p>Choose an available room and a time range today to reserve it for yourself immediately. Future dates are available to browse.</p><KioskOfficeBoard :location-id="route.params.locationId" :initial-selection="route.query" allow-booking /></main></template>
<script setup>
import { useRoute } from 'vue-router';
import KioskOfficeBoard from '../components/kiosk/KioskOfficeBoard.vue';
const route = useRoute();
</script>
<style scoped>.office-reservations{max-width:1250px;margin:auto;padding:32px;color:#24443d}h1{margin-bottom:12px}p{line-height:1.6}a{color:inherit}</style>
