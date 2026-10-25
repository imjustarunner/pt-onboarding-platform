<template>
  <section class="aw-tools"><p class="aw-eyebrow">{{ agency.name }}</p><h1>{{ title }}</h1>
    <template v-if="section==='notifications'">
      <p class="aw-subtitle">Your notifications for this practice.</p>
      <div class="aw-tools-actions"><button @click="$emit('refresh')">Refresh</button><a :href="personalToolUrl(slug,'notifications')">Manage notifications ↗</a></div>
      <div class="aw-panel"><p v-if="loading" class="aw-empty" role="status">Loading notifications…</p><p v-else-if="error" class="aw-empty aw-error" role="alert">{{ error }}</p><div v-else-if="!notifications.length" class="aw-empty"><PortalIcon name="notifications"/><h2>You’re all caught up</h2><p>New updates will appear here.</p></div>
        <a v-for="item in notifications" v-else :key="item.id" class="aw-list-row" :href="personalToolUrl(slug,'notifications')"><PortalIcon name="notifications"/><span class="aw-row-main"><strong>{{ item.title || 'Practice update' }}</strong><small>{{ item.message }}</small></span><span v-if="!item.viewer_is_read && !item.is_read" class="aw-badge">Unread</span><span aria-hidden="true">›</span></a>
      </div>
    </template>
    <template v-else>
      <p class="aw-subtitle">{{ descriptions[section] }}</p>
      <div v-if="section==='account'" class="aw-profile-summary"><span class="aw-avatar">{{ initials(actorName) }}</span><div><h2>{{ actorName }}</h2><p>{{ actor.email }}</p><small>{{ actor.role.replaceAll('_',' ') }} · {{ agency.name }}</small></div></div>
      <div class="aw-tool-grid"><a v-for="tool in tools" :key="tool.key" class="aw-tool-card" :href="personalToolUrl(slug,tool.key)"><PortalIcon :name="tool.icon"/><h2>{{ tool.label }}</h2><p>{{ tool.description }}</p><span>Open {{ tool.label.toLowerCase() }} ↗</span></a></div>
      <p class="aw-caption">These tools open your existing personal workspace with the same account and practice permissions.</p>
    </template>
  </section>
</template>
<script setup>
import {computed} from 'vue';
import PortalIcon from '../components/portal/PortalIcon.vue';
import {personalToolUrl,initials} from './workspace';
const props=defineProps({section:String,agency:Object,actor:Object,slug:String,notifications:{type:Array,default:()=>[]},loading:Boolean,error:String});
defineEmits(['refresh']);
const actorName=computed(()=>[props.actor.first_name,props.actor.last_name].filter(Boolean).join(' '));
const title=computed(()=>({account:'My Account',settings:'Settings',payroll:'My Payroll',notifications:'Notifications'}[props.section]));
const descriptions={account:'Your profile, credentials and personal documents.',settings:'Manage your availability, preferences and notification settings.',payroll:'Your pay, time submissions and compensation details.'};
const catalog={account:{key:'account',icon:'account',label:'Account details',description:'Review and update your personal information.'},credentials:{key:'credentials',icon:'shield',label:'Credentials',description:'Manage your professional credentials and supporting documents.'},documents:{key:'documents',icon:'documents',label:'My documents',description:'Open your assigned documents and completed paperwork.'},preferences:{key:'preferences',icon:'settings',label:'Preferences',description:'Manage your personal application and communication preferences.'},notifications:{key:'notifications',icon:'notifications',label:'Notification settings',description:'Review alerts and choose how you receive updates.'},schedule:{key:'schedule',icon:'sessions',label:'My availability',description:'Open your calendar to publish and manage available time.'},payroll:{key:'payroll',icon:'billing',label:'Payroll & submissions',description:'View your payroll details and submit eligible time or expenses.'},compensation:{key:'compensation',icon:'documents',label:'My compensation',description:'Review compensation information made available to your account.'},benefits:{key:'benefits',icon:'people',label:'Benefits',description:'Review the benefits available through your agency.'}};
const tools=computed(()=>({account:['account','credentials','documents'],settings:['preferences','notifications','schedule'],payroll:['payroll','compensation','benefits']}[props.section]||[]).map(k=>catalog[k]));
</script>
