<template>
  <div class="aw-workspace" :class="{ 'aw-collapsed': collapsed, 'aw-menu-open': mobileOpen, 'aw-full-workspace': fullWorkspace, 'aw-sidebar-revealed': collapsed && hoverOpen }" @keydown.esc="mobileOpen=false; accountOpen=false">
    <a class="aw-skip" href="#aw-main">Skip to content</a>
    <button v-if="mobileOpen" class="aw-scrim" aria-label="Close navigation" @click="mobileOpen=false" />
    <aside v-if="!fullWorkspace" class="aw-sidebar" aria-label="Workspace sidebar" @mouseenter="hoverOpen=true" @mouseleave="hoverOpen=false" @focusin="hoverOpen=true" @focusout="leaveSidebar">
      <a class="aw-sidebar-brand" :href="websiteBase" aria-label="AuricWell website"><img :src="AURICWELL_MARK_URL" alt="" /><span>AuricWell</span></a>
      <nav class="aw-nav" aria-label="Practice navigation">
        <RouterLink v-for="item in navigation" :key="item.key" :data-analytics-id="demo ? `nav-${item.key}` : undefined" :to="`/${slug}/${item.key}`" :title="item.label" :aria-label="item.label" :aria-current="section===item.key?'page':undefined" @click="mobileOpen=false"><PortalIcon :name="item.icon"/><span>{{ item.label }}</span></RouterLink>
      </nav>
      <div class="aw-sidebar-bottom">
        <a :href="demo?websiteBase:personalToolUrl(slug,'support')"><PortalIcon name="help"/><span>Help &amp; Support</span></a>
        <button :aria-expanded="!collapsed || hoverOpen" :aria-label="collapsed?'Expand sidebar':'Collapse sidebar'" :title="collapsed?'Expand sidebar':'Collapse sidebar'" @click="collapsed=!collapsed"><PortalIcon :name="collapsed?'arrow':'back'"/><span>Collapse</span></button>
      </div>
    </aside>
    <div class="aw-workspace-body">
      <header v-if="!fullWorkspace" class="aw-topbar">
        <button class="aw-mobile-menu aw-icon-button" aria-label="Open navigation" :aria-expanded="mobileOpen" @click="mobileOpen=!mobileOpen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <form class="aw-search" role="search" @submit.prevent="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
          <input v-model="query" aria-label="Search clients" type="search" placeholder="Search clients by name or initials…" maxlength="120" />
          <button type="submit" class="aw-search-submit">Search</button>
        </form>
        <RouterLink v-if="!demo" :to="`/${slug}/notifications`" class="aw-notification-button aw-icon-button" :aria-label="unread===null?'Notifications':`Notifications, ${unread} unread`"><PortalIcon name="notifications"/><span v-if="unread>0" class="aw-unread-dot"/></RouterLink>
        <div class="aw-account">
          <button :disabled="demo" class="aw-account-toggle" :aria-expanded="accountOpen" aria-controls="aw-account-menu" @click="accountOpen=!accountOpen"><span class="aw-avatar"><img v-if="demo && actor.profile_photo_url" :src="actor.profile_photo_url" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" /><template v-else>{{ initials(actorName) }}</template></span><span class="aw-account-label"><strong>{{ actorName }}{{ actor.credential ? `, ${actor.credential}` : '' }}</strong><small>{{ roleLabel }}</small></span><span aria-hidden="true">⌄</span></button>
          <div v-if="accountOpen" id="aw-account-menu" class="aw-account-menu">
            <RouterLink :to="`/${slug}/account`" @click="accountOpen=false">My Account</RouterLink>
            <RouterLink :to="`/${slug}/settings`" @click="accountOpen=false">Settings</RouterLink>
            <a :href="personalToolUrl(slug === 'innerstrength' ? 'tisi' : slug,'account')">Full-suite account ↗</a>
            <button @click="signOut" :disabled="signingOut">{{ signingOut?'Signing out…':'Sign out' }}</button>
            <p v-if="logoutError" role="alert">{{ logoutError }}</p>
          </div>
        </div>
      </header>
      <header v-else class="aw-workspace-return" aria-label="Workspace return navigation"><RouterLink :to="`/${slug}/overview`" data-analytics-id="workspace-back">← Back to app</RouterLink><span>{{ section === 'billing' ? 'Billing Workspace' : 'Note Workspace' }}</span><RouterLink :to="`/${slug}/appointments`">My Schedule</RouterLink><RouterLink v-if="demo" :to="`/${slug}/tasks`">Tasks &amp; To-do</RouterLink></header>
      <WorkspaceNavigation v-if="!fullWorkspace" :actor="actor" :slug="slug" interface-name="auricwell" :demo="demo" />
      <slot name="notice" />
      <main id="aw-main" class="aw-content" :class="{'aw-content--workspace':fullWorkspace}" tabindex="-1"><slot /></main>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import PortalIcon from '../components/portal/PortalIcon.vue';
import WorkspaceNavigation from '../components/WorkspaceNavigation.vue';
import { AURICWELL_MARK_URL } from '../constants/auricwellBrand';
import { personalToolUrl, initials } from './workspace';
import { useDashboardCardState } from '../composables/useDashboardCardState.js';
const props=defineProps({actor:Object,slug:String,section:String,navigation:Array,websiteBase:String,unread:{type:Number,default:null},demo:Boolean});
const router=useRouter(), query=ref(''),mobileOpen=ref(false),accountOpen=ref(false),signingOut=ref(false),logoutError=ref('');
const sidebarState=useDashboardCardState({kind:'auricwell-sidebar',userId:computed(()=>props.actor.id),agencyId:computed(()=>props.slug),cardIds:['navigation'],persist:computed(()=>!props.demo)});
const hoverOpen=ref(false),schedulePinned=ref(false);
const fullWorkspace=computed(()=>['documentation','billing'].includes(props.section));
const collapsed=computed({get:()=>props.section==='appointments'?!schedulePinned.value:sidebarState.collapsedCards.value.includes('navigation'),set:value=>{if(props.section==='appointments')schedulePinned.value=!value;else sidebarState.setCollapsed('navigation',value);}});
function leaveSidebar(event){if(!event.currentTarget.contains(event.relatedTarget))hoverOpen.value=false;}
watch(()=>props.section,()=>{hoverOpen.value=false;schedulePinned.value=false;mobileOpen.value=false;});
const actorName=computed(()=>[props.actor.first_name,props.actor.last_name].filter(Boolean).join(' ')||'My account');
const roleLabel=computed(()=>({provider:'Provider',support:'Support',admin:'Agency administrator',super_admin:'Superadmin'}[props.actor.role]||'Practice member'));
function search(){if(query.value.trim())router.push({path:`/${props.slug}/clients`,query:{search:query.value.trim()}});}
async function signOut(){
  if(props.demo){logoutError.value='This is a fictional demo; no account is signed in.';return;}
  signingOut.value=true;logoutError.value='';
  try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();window.dispatchEvent(new Event('auricwell-session-ended'));window.location.assign(`/${encodeURIComponent(props.slug)}/login`);}
  catch{logoutError.value='Could not sign out. Please try again.';signingOut.value=false;}
}
</script>

<style scoped>
.aw-full-workspace{display:block}.aw-full-workspace .aw-content--workspace{max-width:none;width:100%;padding:0;margin:0}.aw-workspace-return{display:flex;align-items:center;gap:18px;padding:9px 18px;border-bottom:1px solid #dce5ee;background:#fff;flex-wrap:wrap;font-size:13px}.aw-workspace-return>a:first-child{font-weight:700}.aw-workspace-return>span{margin-right:auto;color:#526986}.aw-workspace-return a{min-height:30px;display:inline-flex;align-items:center}
@media(min-width:761px){.aw-collapsed .aw-sidebar{width:82px;z-index:80}.aw-sidebar-revealed .aw-sidebar{width:250px;box-shadow:8px 0 28px #102b4925}.aw-sidebar-revealed .aw-sidebar-brand{padding:0 26px}.aw-sidebar-revealed .aw-sidebar-brand span,.aw-sidebar-revealed .aw-nav span,.aw-sidebar-revealed .aw-sidebar-bottom span{display:initial}.aw-sidebar-revealed .aw-sidebar .aw-nav{padding:20px 16px}.aw-sidebar-revealed .aw-sidebar .aw-nav a{justify-content:flex-start;padding:13px 16px}.aw-sidebar-revealed .aw-sidebar-bottom{padding:16px 26px}}
</style>
