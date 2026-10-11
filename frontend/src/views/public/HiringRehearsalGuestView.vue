<template><ItscoRehearsal v-if="token" guest/><main v-else class="missing"><h1>Open your private test link</h1><p>Use the complete link copied from the ITSCO rehearsal. No account or application is needed.</p></main></template>
<script setup>
import {provide} from 'vue';
import ItscoRehearsal from '../admin/ItscoRehearsalView.vue';
import api from '../../services/api';
import {rehearsalSourceHttp} from '../../components/rehearsal/sourceHttp';
const token=new URLSearchParams(window.location.hash.slice(1)).get('access');
provide('rehearsalSourceHttp',rehearsalSourceHttp(api.defaults.baseURL,token||''));
</script>
<style scoped>.missing{max-width:720px;padding:40px;margin:auto;font-family:Montserrat,sans-serif}</style>
