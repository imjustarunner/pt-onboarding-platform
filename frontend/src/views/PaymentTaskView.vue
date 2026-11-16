<template><PaymentTask v-if="ready" :token="route.params.token" :task-id="route.query.task" :agency-id="route.query.agencyId" /><p v-else role="status">Opening your secure payment task…</p></template>
<script setup>
import { ref,onMounted,computed } from 'vue';
import {useAuthStore} from '../store/auth';
import {provideFamilyLocale} from '../composables/useFamilyLocale';
import { useRoute,useRouter } from 'vue-router';
import PaymentTask from '../components/billing/PaymentTask.vue';
import api from '../services/api';
const route=useRoute(),router=useRouter(),ready=ref(false);
const authStore=useAuthStore();provideFamilyLocale({userId:computed(()=>authStore.user?.id),enrollmentLocale:computed(()=>route.query.lang||'en'),requestedLocale:computed(()=>route.query.lang)});
onMounted(async()=>{try{await api.get('/users/me');ready.value=true;}catch(e){if(e.response?.status===401)await router.replace({path:'/login',query:{redirect:route.fullPath}});else ready.value=true;}});
</script>
