<template>
  <section class="supervision-rsvp-summary" aria-label="Supervision RSVP responses">
    <h3>Attending <span>{{ accepted.length }}</span></h3>
    <p v-if="loading" role="status">Loading responses…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else>
      <ul v-if="accepted.length"><li v-for="person in accepted" :key="person.userId">{{ person.name }}<small v-if="person.isPresenter"> · Presenter</small></li></ul>
      <p v-else>No confirmed attendees yet.</p>
      <details v-if="canSeeDeclined && declined.length">
        <summary>Not attending · {{ declined.length }}</summary>
        <ul><li v-for="person in declined" :key="person.userId">{{ person.name }}<p v-if="person.declineReason">{{ person.declineReason }}</p></li></ul>
      </details>
      <small v-if="canSeeDeclined">Declined responses are visible only to organizers and authorized staff.</small>
    </template>
  </section>
</template>
<script setup>
import { computed } from 'vue';
const props=defineProps({people:{type:Array,default:()=>[]},canSeeDeclined:Boolean,loading:Boolean,error:{type:String,default:''}});
const accepted=computed(()=>props.people.filter(p=>['SIGNED_UP','JOINED','LEFT'].includes(String(p.status || '').toUpperCase())));
const declined=computed(()=>props.people.filter(p=>['DECLINED','WITHDRAWN'].includes(String(p.status || '').toUpperCase())));
</script>
<style scoped>
.supervision-rsvp-summary { padding:12px 16px; margin:10px 0; border:1px solid var(--border-color,#dbe3ed); border-radius:12px; background:var(--bg-card,#fff); }
h3 { margin:0 0 8px; font-size:1rem; } h3 span { font-size:.85rem; margin-left:6px; }
ul { display:flex; flex-wrap:wrap; gap:6px 18px; list-style:none; margin:8px 0; padding:0; }
p { margin:5px 0; } small { opacity:.8; } details { margin:10px 0; } summary { cursor:pointer; }
</style>
