<template>
  <div class="aw-workspace" :class="{ 'aw-collapsed': collapsed, 'aw-menu-open': mobileOpen }" @keydown.esc="mobileOpen=false; accountOpen=false">
    <a class="aw-skip" href="#aw-main">Skip to content</a>
    <button v-if="mobileOpen" class="aw-scrim" aria-label="Close navigation" @click="mobileOpen=false" />
    <aside class="aw-sidebar" aria-label="Workspace sidebar">
      <a class="aw-sidebar-brand" :href="websiteBase" aria-label="AuricWell website"><img :src="AURICWELL_MARK_URL" alt="" /><span>AuricWell</span></a>
      <nav class="aw-nav" aria-label="Practice navigation">
        <RouterLink v-for="item in navigation" :key="item.key" :to="`/${slug}/${item.key}`" :title="item.label" :aria-current="section===item.key?'page':undefined" @click="mobileOpen=false"><PortalIcon :name="item.icon"/><span>{{ item.label }}</span></RouterLink>
      </nav>
      <div class="aw-sidebar-bottom">
        <a :href="demo?websiteBase:personalToolUrl(slug,'support')"><PortalIcon name="help"/><span>Help &amp; Support</span></a>
        <button :aria-expanded="!collapsed" aria-label="Toggle sidebar width" @click="collapsed=!collapsed"><PortalIcon :name="collapsed?'arrow':'back'"/><span>Collapse</span></button>
      </div>
    </aside>
    <div class="aw-workspace-body">
      <header class="aw-topbar">
        <button class="aw-mobile-menu aw-icon-button" aria-label="Open navigation" :aria-expanded="mobileOpen" @click="mobileOpen=!mobileOpen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <form class="aw-search" role="search" @submit.prevent="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
          <input v-model="query" aria-label="Search clients" type="search" placeholder="Search clients by name or initials…" maxlength="120" />
          <button type="submit" class="aw-search-submit">Search</button>
        </form>
        <RouterLink v-if="!demo" :to="`/${slug}/notifications`" class="aw-notification-button aw-icon-button" :aria-label="unread===null?'Notifications':`Notifications, ${unread} unread`"><PortalIcon name="notifications"/><span v-if="unread>0" class="aw-unread-dot"/></RouterLink>
        <div class="aw-account">
          <button :disabled="demo" class="aw-account-toggle" :aria-expanded="accountOpen" aria-controls="aw-account-menu" @click="accountOpen=!accountOpen"><span class="aw-avatar">{{ initials(actorName) }}</span><span class="aw-account-label"><strong>{{ actorName }}{{ actor.credential ? `, ${actor.credential}` : '' }}</strong><small>{{ roleLabel }}</small></span><span aria-hidden="true">⌄</span></button>
          <div v-if="accountOpen" id="aw-account-menu" class="aw-account-menu">
            <RouterLink :to="`/${slug}/account`" @click="accountOpen=false">My Account</RouterLink>
            <RouterLink :to="`/${slug}/settings`" @click="accountOpen=false">Settings</RouterLink>
            <a :href="personalToolUrl(slug,'account')">Open full suite ↗</a>
            <button @click="signOut" :disabled="signingOut">{{ signingOut?'Signing out…':'Sign out' }}</button>
            <p v-if="logoutError" role="alert">{{ logoutError }}</p>
          </div>
        </div>
      </header>
      <slot name="notice" />
      <main id="aw-main" class="aw-content" tabindex="-1"><slot /></main>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import PortalIcon from '../components/portal/PortalIcon.vue';
import { AURICWELL_MARK_URL } from '../constants/auricwellBrand';
import { personalToolUrl, initials } from './workspace';
const props=defineProps({actor:Object,slug:String,section:String,navigation:Array,websiteBase:String,unread:{type:Number,default:null},demo:Boolean});
const router=useRouter(), query=ref(''),collapsed=ref(false),mobileOpen=ref(false),accountOpen=ref(false),signingOut=ref(false),logoutError=ref('');
const actorName=computed(()=>[props.actor.first_name,props.actor.last_name].filter(Boolean).join(' ')||'My account');
const roleLabel=computed(()=>({provider:'Provider',support:'Support',admin:'Agency administrator',super_admin:'Administrator'}[props.actor.role]||'Practice member'));
function search(){if(query.value.trim())router.push({path:`/${props.slug}/clients`,query:{search:query.value.trim()}});}
async function signOut(){
  if(props.demo){logoutError.value='This is a fictional demo; no account is signed in.';return;}
  signingOut.value=true;logoutError.value='';
  try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();window.dispatchEvent(new Event('auricwell-session-ended'));window.location.assign(`/${encodeURIComponent(props.slug)}/login`);}
  catch{logoutError.value='Could not sign out. Please try again.';signingOut.value=false;}
}
</script>
