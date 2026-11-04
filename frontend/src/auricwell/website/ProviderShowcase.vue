<template>
  <div class="provider-showcase">
    <div class="showcase-label"><span>Try the provider finder</span><small>Fictional profiles · AI-generated portraits · No booking is created</small></div>
    <div class="showcase-layout">
      <div class="showcase-cards">
        <PublicProviderCard v-for="provider in providers" :key="provider.id" :provider="provider" separate-availability-action :class="{ 'is-selected': selected.id === provider.id }" @book="chooseTime" @view-profile="chooseProvider" @view-availability="showAvailability" />
      </div>
      <section class="showcase-detail" :aria-label="view === 'profile' ? 'Example provider profile' : 'Example provider availability'">
        <header><img :src="selected.profilePhotoUrl" :alt="`Fictional portrait of ${selected.displayName}`" width="56" height="56"><div><p>{{ view === 'profile' ? 'PROVIDER PROFILE' : 'APPOINTMENT AVAILABILITY' }}</p><h3 ref="detailHeading" tabindex="-1">{{ selected.displayName }}</h3><span>{{ selected.title }}</span></div></header>
        <div class="showcase-view-switch" role="group" aria-label="Provider detail view"><button type="button" :aria-pressed="view === 'profile'" @click="chooseProvider(selected)">Profile</button><button type="button" :aria-pressed="view === 'availability'" @click="showAvailability(selected)">Availability</button></div>
        <div v-if="view === 'profile'" class="showcase-full-profile">
          <div class="showcase-profile-status"><span>Meadowbrook Therapy</span><strong>Accepting new clients · Fictional profile</strong></div>
          <PublicProviderProfileDetails :key="selected.id" :provider="selected" :profile="selectedProfile" :practice="selected.practice" hide-unpublished />
          <button type="button" class="showcase-profile-action" @click="showAvailability(selected)">View {{ selected.firstName }}’s availability →</button>
        </div>
        <div v-else class="showcase-availability">
        <div class="showcase-facts"><span>{{ selected.format === 'VIRTUAL' ? 'Virtual sessions' : 'In-person sessions' }}</span><span>Individual therapy · 50 minutes</span><span>{{ selected.ageGroups.join(' · ') }}</span></div>
        <h4>Find a time that works</h4>
        <PublicProviderOpeningCalendar :days="days" :week="week" :min-date="today" :format="selected.format" fixed-format :time-zone="timeZone" @update:week="changeWeek" @select="time => chooseTime(selected, time, false)" />
        <p class="calendar-scroll-hint">Scroll to see more days.</p>
        <p v-if="!days.length" class="showcase-empty">Choose today or a future date to explore sample openings.</p>
        <div class="showcase-selection" role="status" aria-live="polite">
          <template v-if="chosenTime"><strong>{{ selected.displayName }} · {{ formatTime(chosenTime.startAt) }}</strong><p>{{ chosenTime.programType === 'VIRTUAL' ? 'Virtual' : 'In person' }} · Weekly · 50 minutes</p><span>Example only: no hold or appointment was created.</span><button type="button" @click="chosenTime = null">Clear selection</button></template>
          <template v-else>Select a sample opening. In the app, the care team confirms placement.</template>
        </div>
        <button type="button" class="showcase-read-profile" @click="chooseProvider(selected)">Read {{ selected.firstName }}’s full profile →</button>
        </div>
      </section>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue';
import PublicProviderProfileDetails from '../../components/publicServices/PublicProviderProfileDetails.vue';
import PublicProviderCard from '../../components/publicServices/PublicProviderCard.vue';
import PublicProviderOpeningCalendar from '../../components/publicServices/PublicProviderOpeningCalendar.vue';
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ymd = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today = ymd(new Date());
const initial = new Date(); initial.setDate(initial.getDate()+1); while ([0,6].includes(initial.getDay())) initial.setDate(initial.getDate()+1);
const week = ref(ymd(initial));
function openings(start, provider) {
  const result = [], first = new Date(`${start}T12:00:00`);
  if (!Number.isFinite(+first)) return result;
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(first); date.setDate(date.getDate()+offset);
    if ([0,6].includes(date.getDay())) continue;
    for (const hour of provider.id === 901 ? [10,14] : [9,15]) {
      const at = new Date(date); at.setHours(hour,0,0,0);
      if (+at <= Date.now()) continue;
      result.push({startAt:at.toISOString(),endAt:new Date(+at+50*60000).toISOString(),programType:provider.format,frequency:'WEEKLY',availabilityType:'RECURRING'});
    }
  }
  return result;
}
const providers = [
  {id:901,firstName:'Avery',displayName:'Avery Lane',credential:'LPC',title:'Licensed Professional Counselor',format:'VIRTUAL',profilePhotoUrl:'/auricwell/examples/avery-lane.jpg',acceptingNewClients:true,onlineScheduling:true,
    profile:{publicBlurb:'A thoughtful, practical approach to anxiety, life transitions, and feeling more like yourself.',insurancesAccepted:['Example Health Plan (fictional)']},
    specialties:['Anxiety','Life transitions','Stress management'],modalities:['Cognitive behavioral therapy (CBT)','Mindfulness-informed skills','Strengths-based care'],ageGroups:['Adults (18+)','Young Adults (18-25)'],focus:['Individuals','Adults navigating work and relationship changes','Young adults building confidence'],
    bio:'“We’ll make space for what feels difficult and work toward changes that fit your everyday life.”\n\nI work with adults who want support with anxiety, periods of change, and the pressure of everyday responsibilities. Together, we explore patterns, identify what matters to you, and practice useful coping skills.\n\nMy approach combines cognitive behavioral strategies with a warm, collaborative space. We agree on goals, check in on how therapy is feeling, and review progress as we go.',
    practice:{name:'Meadowbrook Therapy',description:'A fictional adult therapy practice centered on collaborative goals, practical skills and a welcoming relationship with your provider.',setting:'Virtual sessions',service:'Individual therapy · 50-minute appointments',location:'Online care in Colorado · Fictional practice',languages:'English',firstVisit:'Start by talking about what brings you to therapy, what you hope will change, and whether this approach feels like a good fit.'}},
  {id:902,firstName:'Jordan',displayName:'Jordan Reed',credential:'LCSW',title:'Licensed Clinical Social Worker',format:'IN_PERSON',profilePhotoUrl:'/auricwell/examples/jordan-reed.jpg',acceptingNewClients:true,onlineScheduling:true,
    profile:{publicBlurb:'A welcoming space to navigate stress, build coping skills, and reconnect with what matters.',insurancesAccepted:['Example Health Plan (fictional)']},
    specialties:['Stress','Coping skills','Work–life balance'],modalities:['Individual therapy','Solution-focused strategies','Mindfulness-informed skills'],ageGroups:['Adults (18+)','Seniors (65+)'],focus:['Individuals','Adults balancing work and caregiving','Older adults navigating change'],
    bio:'“You bring your experience; we’ll work together to find a way forward.”\n\nI help adults explore stress, strengthen coping skills, and turn therapy goals into manageable next steps. My practice includes adults balancing work, relationships and caregiving, as well as older adults navigating life changes.\n\nSessions make room for your story and for practical exercises we can work on together. We discuss what feels useful, adjust the plan when needed, and keep your goals at the center.',
    practice:{name:'Meadowbrook Therapy',description:'A fictional adult therapy practice offering a calm, collaborative setting for reflection, skill building and ongoing care.',setting:'In-person sessions',service:'Individual therapy · 50-minute appointments',location:'Sample Denver office · Fictional location',languages:'English',firstVisit:'We can explore your current concerns, the supports you already use, and the goals you would like to work toward together.'}}
].map(provider => { const slots = openings(week.value,provider).slice(0,4); return {...provider,availability:{slots,nextAvailableAt:slots[0]?.startAt}}; });
const selected = ref(providers[0]), view = ref('profile'), chosenTime = ref(null), detailHeading = ref(null);
const selectedProfile = computed(()=>({...selected.value.profile,publicBlurb:selected.value.bio}));
const days = computed(() => {
  const grouped = new Map();
  for (const time of openings(week.value,selected.value)) {
    const label = new Date(time.startAt).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    if (!grouped.has(label)) grouped.set(label,[]);
    grouped.get(label).push(time);
  }
  return [...grouped];
});
const formatTime = value => new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
async function focusDetail() { await nextTick(); detailHeading.value?.focus({preventScroll:true}); if (window.innerWidth < 1100) detailHeading.value?.scrollIntoView({behavior:'smooth',block:'start'}); }
function chooseProvider(provider) { selected.value=provider; view.value='profile'; chosenTime.value=null; week.value=ymd(initial); focusDetail(); }
function showAvailability(provider) { selected.value=provider; view.value='availability'; chosenTime.value=null; week.value=ymd(initial); focusDetail(); }
function chooseTime(provider,time,focus=true) { selected.value=provider; view.value='availability'; chosenTime.value=time; if (focus) {week.value=ymd(new Date(time.startAt)); focusDetail();} }
function changeWeek(value) {week.value=value; chosenTime.value=null;}
</script>
<style scoped>
.provider-showcase{--agency-primary-color:var(--showcase-primary,#0649ce);--agency-accent-color:var(--showcase-primary,#0649ce);min-width:0;color:#213449;font-family:Inter,Arial,sans-serif}.showcase-label{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;align-items:center}.showcase-label>span{font-size:15px;font-weight:650}.showcase-label small{font-size:12px;color:#64748b}.showcase-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:24px;align-items:start}.showcase-cards{display:grid;gap:14px;min-width:0}.showcase-cards :deep(.provider-card){grid-template-columns:minmax(0,1fr);gap:12px;padding:20px;border-color:#dce5f1;box-shadow:0 3px 14px #133c7608}.showcase-cards :deep(.is-selected){border-color:#8cadf0}.showcase-cards :deep(.card-identity){gap:16px;flex-direction:row}.showcase-cards :deep(.avatar){width:86px;height:112px;border-radius:9px}.showcase-cards :deep(.card-name){font-size:20px;color:#112044}.showcase-cards :deep(.card-title-label){font-size:12px}.showcase-cards :deep(.card-bio){margin:8px 0;font-size:13px;line-height:1.55;-webkit-line-clamp:3}.showcase-cards :deep(.card-accepting){margin:8px 0;font-size:12px}.showcase-cards :deep(.card-tags){gap:5px}.showcase-cards :deep(.tag){font-size:11px;padding:4px 7px;background:#f0f5fc;color:#40597c}.showcase-cards :deep(.card-detail){margin:6px 0;font-size:12px}.showcase-cards :deep(.card-office-buttons:empty){display:none}.showcase-cards :deep(.card-location-row){margin-top:8px}.showcase-cards :deep(.card-slots){display:none}.showcase-cards :deep(.card-actions){grid-column:1;justify-content:flex-end;gap:10px}.showcase-cards :deep(.card-actions button){flex:initial;padding:9px 15px;min-height:40px;font-size:12px}.showcase-detail{min-width:0;background:white;border:1px solid #dce5f1;border-radius:12px;padding:24px}.showcase-detail header{display:flex;gap:14px;align-items:center}.showcase-detail header img{object-fit:cover;border-radius:50%}.showcase-detail header p{font-size:10px;letter-spacing:1.4px;color:#64748b;margin:0 0 5px}.showcase-detail h3{font-size:22px;line-height:1.3;letter-spacing:-.5px;margin:0 0 4px}.showcase-detail header span{font-size:12px;color:#526476}.showcase-bio{font-size:13px;line-height:1.75;color:#526476;margin:18px 0 12px}.showcase-facts{display:flex;gap:8px 16px;flex-wrap:wrap;font-size:11px;color:#526476;padding-bottom:18px;border-bottom:1px solid #e3eaf3}.showcase-detail h4{font-size:16px;margin:20px 0 14px}.showcase-detail :deep(.opening-controls){grid-template-columns:minmax(180px,240px)}.showcase-detail :deep(.opening-days){grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:8px}.showcase-detail :deep(.opening-day){padding:8px}.showcase-detail :deep(.opening-day button){font-size:11px;padding:8px 4px;background:#f3f7ff;border-color:#d4e1f7;line-height:1.5}.showcase-selection{margin-top:18px;padding:14px 16px;border-radius:8px;background:var(--showcase-soft,#f2f6fd);font-size:12px;line-height:1.6}.showcase-selection strong{display:block;color:#123b7a}.showcase-selection p{margin:3px 0;font-size:12px}.showcase-selection span{display:block;color:#526476;font-size:11px}.showcase-selection button{margin-top:8px;background:none;border:0;padding:4px 0;color:var(--showcase-primary,#0649ce);cursor:pointer;text-decoration:underline}.showcase-empty{font-size:13px}.provider-showcase :focus-visible{outline:3px solid #ba891e;outline-offset:4px}
@media(max-width:1099px){.showcase-layout{grid-template-columns:1fr}.showcase-cards{grid-template-columns:1fr 1fr}.showcase-cards :deep(.card-identity){flex-direction:column}.showcase-cards :deep(.card-actions button){flex:1}}
@media(max-width:620px){.showcase-cards{grid-template-columns:1fr}.showcase-cards :deep(.card-identity){flex-direction:row;gap:12px}.showcase-cards :deep(.provider-card){padding:16px}.showcase-cards :deep(.avatar){width:72px;height:96px}.showcase-cards :deep(.card-name){font-size:18px}.showcase-cards :deep(.card-bio){-webkit-line-clamp:4}.showcase-detail{padding:18px}.showcase-detail :deep(.opening-days){grid-template-columns:repeat(2,minmax(0,1fr))}.showcase-detail :deep(.opening-controls){grid-template-columns:1fr}.showcase-label small{max-width:34ch}.showcase-detail h3{scroll-margin-top:16px}}
.calendar-scroll-hint{display:none}@media(max-width:620px){.showcase-detail :deep(.opening-days){display:grid;grid-auto-flow:column;grid-auto-columns:140px;grid-template-columns:none;overflow-x:auto;padding:3px 3px 10px;scroll-snap-type:x proximity}.showcase-detail :deep(.opening-day){scroll-snap-align:start}.calendar-scroll-hint{display:block;font-size:11px;color:#64748b;margin:8px 0 0}}
.showcase-detail{--profile-brand:var(--showcase-primary,#0649ce)}.showcase-view-switch{display:flex;gap:8px;padding:18px 0;margin:6px 0 0;border-bottom:1px solid #e3eaf3}.showcase-view-switch button{font:inherit;font-size:12px;padding:10px 16px;border:1px solid #c8d8eb;border-radius:7px;background:#fff;color:#526b88;cursor:pointer}.showcase-view-switch button[aria-pressed=true]{background:#eaf2ff;border-color:#9ebbe8;color:#184f99;font-weight:650}.showcase-profile-status{display:flex;justify-content:space-between;flex-wrap:wrap;gap:9px;font-size:11px;margin:20px 0;color:#60738d}.showcase-profile-status strong{font-size:10px;font-weight:600;color:#28734e}.showcase-full-profile :deep(.profile-panel){padding:20px;border-color:#e0e7f0;border-radius:10px;box-shadow:none}.showcase-full-profile :deep(.profile-panel h2){font-size:17px;margin-bottom:13px;letter-spacing:-.3px;line-height:1.4;color:#193755}.showcase-full-profile :deep(.profile-panel p){font-size:13px;line-height:1.85}.showcase-full-profile :deep(.profile-facets){gap:14px}.showcase-full-profile :deep(.profile-tags span){font-size:11px;background:#f0f5fc;color:#365b84;padding:6px 10px}.showcase-profile-action{display:block;font:inherit;font-size:13px;font-weight:600;width:100%;padding:14px 18px;margin-top:22px;border:1px solid var(--showcase-primary,#0649ce);border-radius:8px;color:white;background:var(--showcase-primary,#0649ce);cursor:pointer}.showcase-read-profile{font:inherit;font-size:12px;line-height:1.7;padding:12px 0 0;border:0;background:none;color:var(--showcase-primary,#0649ce);cursor:pointer}.showcase-availability .showcase-facts{padding-top:20px}.showcase-full-profile{min-width:0}
</style>
