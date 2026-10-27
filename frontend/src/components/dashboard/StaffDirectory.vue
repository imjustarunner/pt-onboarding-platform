<template>
  <section class="staff-directory" aria-label="Staff directory">
    <h2>Staff</h2>
    <label for="staff-directory-search">Find staff by name, role, location, or extension</label>
    <input id="staff-directory-search" v-model="search" type="search" autocomplete="off" placeholder="Search staff…" />
    <p v-if="loading" role="status">Loading staff…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
    <p v-else-if="!agencyId">Choose an organization to view its staff.</p>
    <template v-else>
      <p role="status">{{ matches.length }} staff member{{ matches.length === 1 ? '' : 's' }}</p>
      <div class="staff-directory-grid">
        <article v-for="person in matches" :key="person.id">
          <header><img v-if="person.profilePhotoUrl" :src="person.profilePhotoUrl" alt="" loading="lazy" /><div><h3>{{ person.displayName }}</h3><p>{{ person.title }}<template v-if="person.department"> · {{ person.department }}</template></p></div></header>
          <p><strong>Work phone:</strong> <a v-if="person.workPhone" :href="`tel:${person.workPhone}`">{{ person.workPhone }}</a><span v-else>Not listed</span><span v-if="person.extension"> · Ext. {{ person.extension }}</span></p>
          <p v-if="person.workEmail"><button type="button" class="staff-email" :aria-label="`Email ${person.displayName}`" @click="email(person)">{{ person.workEmail }}</button></p>
          <p><strong>Primary location:</strong> {{ person.primaryLocation || 'Not listed' }}</p>
          <footer><button v-if="Number(person.id) !== Number(userId)" type="button" @click="message(person)">Internal message</button><a v-if="person.profileUrl" :href="person.profileUrl" target="_blank" rel="noopener noreferrer">View profile ↗</a><button v-else type="button" disabled title="This staff member does not have a published website profile">Profile not published</button></footer>
        </article>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { openEmailComposer } from '../../utils/emailComposerWindow';
const props = defineProps({ agencyId: [Number,String], userId: [Number,String] });
const router = useRouter(), route = useRoute();
const staff = ref([]), search = ref(''), loading = ref(false), error = ref('');
let generation = 0;
const normalize = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const matches = computed(() => {
  const tokens = normalize(search.value).split(/\s+/).filter(Boolean);
  return staff.value.map(person => {
    const name = normalize(person.displayName), haystack = normalize([person.displayName,person.title,person.department,person.workPhone,person.extension,person.primaryLocation].join(' '));
    return { person, match: tokens.every(token => haystack.includes(token)), rank: name.startsWith(normalize(search.value)) ? 0 : 1 };
  }).filter(row => row.match).sort((a,b) => a.rank-b.rank || a.person.displayName.localeCompare(b.person.displayName)).map(row => row.person);
});
async function load() {
  const run = ++generation; staff.value = []; error.value = ''; loading.value = !!props.agencyId;
  if (!props.agencyId) return;
  try { const {data} = await api.get('/staff/directory', {params:{agencyId:props.agencyId},skipGlobalLoading:true}); if (run === generation) staff.value = data.staff || []; }
  catch(e) { if (run === generation) error.value = e.response?.data?.error?.message || 'Could not load staff.'; }
  finally { if (run === generation) loading.value = false; }
}
function email(person) { openEmailComposer(router, { mode: 'new', agencyId: Number(props.agencyId), to: person.workEmail }); }
function message(person) { router.push({path:route.path,query:{tab:'chats',openChatWith:String(person.id),agencyId:String(props.agencyId)}}); }
watch(() => [props.agencyId,props.userId], load, {immediate:true});
</script>
<style scoped>
.staff-directory { min-width: 0; }
.staff-directory > label { display: block; margin-bottom: 8px; }
.staff-directory input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font: inherit; background: var(--bg-card); color: var(--text-primary); }
.staff-directory-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,290px),1fr)); gap: 14px; }
article { padding: 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-card); min-width: 0; overflow-wrap: anywhere; }
header { display: flex; align-items: center; gap: 10px; } header img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; } h3 { margin: 0; } p { font-size: 14px; line-height: 1.5; }
.staff-email { border: 0; padding: 0; background: transparent; color: var(--primary, #2467a7); font: inherit; text-align: left; text-decoration: underline; cursor: pointer; overflow-wrap: anywhere; }
.staff-email:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
footer { display: flex; flex-wrap: wrap; gap: 8px; } footer button,footer a { padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-card); color: var(--text-primary); font: inherit; text-decoration: none; cursor: pointer; } footer button:disabled { opacity: .6; cursor: default; }
</style>
