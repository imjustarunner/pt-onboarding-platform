<template><main><PublicWebsiteContactForm :agency-slug="slug" title="Contact our full support team"/></main></template>
<script setup>
import {computed} from 'vue';
import PublicWebsiteContactForm from '../../components/public/PublicWebsiteContactForm.vue';
const props=defineProps({agencySlug:{type:String,required:true}});
const slug=computed(()=>props.agencySlug);
</script>
