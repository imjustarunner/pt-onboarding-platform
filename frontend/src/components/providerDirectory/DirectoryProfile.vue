<template>
 <article class="directory-profile">
  <img v-if="profile.photoUrl" :src="profile.photoUrl" :alt="profile.name" class="headshot" />
  <div v-else class="initials" aria-hidden="true">{{ initials }}</div>
  <div class="profile-copy"><span v-if="profile.acceptingClients" class="accepting">Accepting new clients</span>
   <h3>{{ profile.name || 'Your name' }}<span v-if="profile.credentials">, {{ profile.credentials }}</span></h3>
   <p v-if="profile.pronouns">{{ profile.pronouns }}</p><p v-if="profile.practice">{{ profile.practice }}</p>
   <p>{{ (profile.locations || []).map(l=>[l.city,l.state].filter(Boolean).join(', ')).filter(Boolean).join(' · ') }}</p>
   <p>{{ [profile.virtual?'Virtual':'',profile.inPerson?'In person':''].filter(Boolean).join(' & ') }}</p>
   <p v-if="profile.virtual">Licensed states: {{ [...new Set((profile.licenses||[]).map(l=>l.state))].join(', ') || 'Add your license' }}</p>
   <p>{{ (profile.languages||[]).join(' · ') }}</p>
   <div class="tags"><span v-for="s in (detail ? profile.specialties : profile.specialties?.slice(0,3))" :key="s">{{ s }}</span></div>
   <template v-if="detail"><p class="biography">{{ profile.bio }}</p>
    <dl><template v-for="[key,label] in [['clientAges','Client ages'],['populations','Populations served'],['approaches','Therapy approaches'],['insurance','Insurance & payment']]" :key="key"><dt>{{ label }}</dt><dd>{{ (profile[key]||[]).join(', ') || 'Not provided' }}</dd></template>
     <dt>Fees</dt><dd>{{ profile.fee || 'Contact provider' }}</dd><dt>Availability</dt><dd>{{ profile.availability || 'Contact provider' }}</dd></dl>
    <div class="contact-links"><a v-if="profile.website" :href="profile.website" target="_blank" rel="noopener noreferrer">Visit website ↗</a><a v-if="profile.publicEmail" :href="`mailto:${profile.publicEmail}`">Email provider</a><a v-if="profile.publicPhone" :href="`tel:${profile.publicPhone.replace(/[^+\d]/g,'')}`">{{ profile.publicPhone }}</a></div>
   </template>
   <button v-else type="button" @click="$emit('open',profile)">View profile →</button>
  </div>
 </article>
</template>
<script setup>
import {computed} from 'vue';const props=defineProps({profile:{type:Object,required:true},detail:Boolean});defineEmits(['open']);
const initials=computed(()=>String(props.profile.name||'Your profile').split(' ').map(v=>v[0]).slice(0,2).join(''));
</script>
<style scoped>
.directory-profile{background:white;border:1px solid #e6dfe9;border-radius:16px;overflow:hidden;color:#302337}.headshot,.initials{width:100%;height:220px;object-fit:cover}.initials{display:grid;place-items:center;background:linear-gradient(135deg,#e0efe6,#f9e7b4);font:54px Georgia,serif;color:#631957}.profile-copy{padding:20px}.profile-copy h3{font:700 22px Georgia,serif;margin:12px 0 6px}.profile-copy p{font-size:14px;margin:6px 0;color:#61566a}.accepting{background:#e4f5e9;color:#226344;border-radius:20px;padding:5px 10px;font-size:12px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.tags span{border-radius:20px;background:#f1ecf6;padding:4px 9px;font-size:12px}.biography{white-space:pre-line;line-height:1.7!important;font-size:16px!important;margin:20px 0!important}dt{font-weight:700;margin-top:14px}dd{margin:5px 0;line-height:1.5}.contact-links{display:flex;gap:14px;flex-wrap:wrap;margin-top:20px}.contact-links a{color:#631957}
</style>
