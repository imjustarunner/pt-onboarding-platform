<template><span v-if="links.length" class="public-provider-links"><router-link v-for="link in links" :key="link.path" :to="link.path">{{ link.label }}</router-link></span></template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ hubSlug: { type: String, required: true }, directories: { type: Array, default: undefined } });
const directories = ref([]);
const links = computed(() => (props.directories ?? directories.value).map(d => ({ path: `/${encodeURIComponent(d.slug)}/find-${({counseling:'counselor',tutoring:'tutor',coaching:'coach'})[d.serviceType]}`, label: `${({counseling:'Our providers',tutoring:'Our tutors',coaching:'Our coaches'})[d.serviceType]}${new Set((props.directories ?? directories.value).map(d=>d.slug)).size > 1 ? ` · ${d.name}` : ''}` })));
let generation=0;
watch(()=>props.hubSlug,async slug=>{if(props.directories !== undefined)return;const id=++generation;directories.value=[];try{const {data}=await api.get(`/public/marketing-pages/${encodeURIComponent(slug)}`,{skipAuthRedirect:true,skipGlobalLoading:true});if(id===generation)directories.value=data.page?.providerDirectories||[];}catch{}},{immediate:true});
</script>
<style scoped>.public-provider-links{display:contents}.public-provider-links a{color:inherit;text-decoration:none;font-size:inherit;white-space:nowrap}.public-provider-links a:hover{text-decoration:underline}.public-provider-links a:focus-visible{outline:2px solid currentColor;outline-offset:5px}</style>
