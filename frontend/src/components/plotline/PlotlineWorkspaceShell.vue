<template>
 <PlotlineCompanyFrame :brand="brand" :context="agency?.name || 'Your people workspace'">
  <template #product-action><router-link :to="`/plotline/company/${agency.id}`">Company home</router-link> · <router-link to="/plotline/app">Switch company</router-link></template>
  <nav class="pl-workspace-nav" aria-label="People operations"><router-link v-for="item in visibleLinks" :key="item.label" :to="`/${agency.portal_url||agency.slug}${item.path}`">{{item.label}}</router-link><PlotlineNotificationsLink :agency="agency" /></nav>
  <div class="pl-workspace-content"><slot /></div>
 </PlotlineCompanyFrame>
</template>
<script setup>
import {computed,watch} from 'vue';
import { useAuthStore } from '../../store/auth';
import {useBrandingStore} from '../../store/branding';
import PlotlineCompanyFrame from './PlotlineCompanyFrame.vue';
import PlotlineNotificationsLink from './PlotlineNotificationsLink.vue';
const props=defineProps({agency:{type:Object,required:true}});
const branding=useBrandingStore();
const auth = useAuthStore();
watch(()=>props.agency.id,()=>branding.fetchAgencyTheme(props.agency.portal_url||props.agency.slug).catch(()=>{}),{immediate:true});
const brand=computed(()=>{let theme=props.agency.theme_settings||props.agency.themeSettings||{};try{if(typeof theme==='string')theme=JSON.parse(theme);}catch{theme={};}return theme.plotlineBrand;});
const links=[{label:'Hiring',path:'/admin/hiring'},{label:'Interviews',path:'/admin/interview-hub'},{label:'Careers',path:'/admin/careers/page'},{label:'Jobs',path:'/admin/careers/jobs'},{label:'Pre-hire',path:'/admin/pre-hire'},{label:'Onboarding',path:'/admin/onboarding'},{label:'Employees & transitions',path:'/admin/employee-relations'}];
const visibleLinks = computed(() => {
  const role = props.agency.agencyAccess?.role || props.agency.effective_role || props.agency.agency_role || auth.user?.role;
  const canEdit = ['admin', 'support', 'super_admin'].includes(role);
  return [
    ...links,
    ...(canEdit ? [{ label: 'Training Studio', path: '/admin/modules/studio' }, { label: 'Contracts', path: '/admin/contracts' }] : []),
    { label: 'Team training', path: '/training' },
    { label: 'Handbook', path: canEdit ? '/admin/workplace-handbook' : '/workplace-handbook' }
  ];
});
</script>
<style scoped>
.pl-workspace-nav{padding:14px 24px;display:flex;flex-wrap:wrap;gap:20px;background:white;border-bottom:1px solid #dce3dd;font-size:14px}.pl-workspace-nav a{color:#205846;text-decoration:none}.pl-workspace-nav a.router-link-active{font-weight:700;text-decoration:underline}.pl-workspace-content{min-height:75vh;padding:12px}.pl-workspace-content :deep(h1),.pl-workspace-content :deep(h2),.pl-workspace-content :deep(h3){font-family:var(--pl-company-heading)}.pl-workspace-content :deep(input),.pl-workspace-content :deep(button),.pl-workspace-content :deep(textarea),.pl-workspace-content :deep(select){font-family:var(--pl-company-body)}
</style>
