<template>
  <div class="actual-example">
    <div class="actual-example-label"><strong>{{ kind === 'providers' ? 'The app’s provider cards' : 'The app’s treatment-objective ratings' }}</strong><span>Actual component · synthetic data · changes are not saved</span></div>
    <template v-if="kind === 'providers'">
      <p class="actual-example-hint">These are the same provider cards used in the provider finder. Try a published time or “View availability.” In the app, the care team confirms placement.</p>
      <div class="actual-provider-list">
        <PublicProviderCard v-for="provider in providers" :key="provider.id" :provider="provider" @book="selectTime" @view-profile="showProvider" @office-selected="showOffice" />
      </div>
      <p class="actual-example-result" role="status" aria-live="polite">{{ selection }}</p>
    </template>
    <template v-else>
      <p class="actual-example-hint">Use the real Start / Previous session / This session / Goal controls. Switch between clinician and client ratings, or mark an objective deferred.</p>
      <NoteAidObjectiveRatings :key="resetKey" :goals="goals" :previous-ratings="previousRatings" date-of-service="2026-10-02" client-name="Example client" :kiosk-share-enabled="true" @update:ratings="ratings = $event" />
      <div class="actual-example-actions"><button type="button" @click="resetKey++; ratings = []">Reset example</button><p role="status">{{ ratings.length ? 'Example rating changed locally. Nothing was saved to a chart.' : 'Try a rating. This example never saves to a chart.' }}</p></div>
    </template>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import PublicProviderCard from '../../components/publicServices/PublicProviderCard.vue';
import NoteAidObjectiveRatings from '../../components/clinical/NoteAidObjectiveRatings.vue';
const props = defineProps({kind: String});
const selection = ref('Example only. No appointment or hold will be created.');
const ratings = ref([]), resetKey = ref(0);
// Relative synthetic dates keep the component’s real date labels useful.
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
const slot = (offset, hour, format) => { const start=new Date(tomorrow); start.setDate(start.getDate()+offset); start.setHours(hour); return {startAt:start.toISOString(),endAt:new Date(+start+3000000).toISOString(),programType:format,frequency:'WEEKLY',availabilityType:'RECURRING'}; };
const providers = [
  {id:901,displayName:'Avery Lane',title:'Licensed Professional Counselor',acceptingNewClients:true,onlineScheduling:true,profile:{publicBlurb:'Example profile for an individual therapy provider.'},specialties:['Anxiety','Life transitions'],modalities:['Individual therapy'],ageGroups:['Adults'],availability:{slots:[slot(0,10,'VIRTUAL'),slot(2,14,'VIRTUAL')],nextAvailableAt:slot(0,10,'VIRTUAL').startAt}},
  {id:902,displayName:'Jordan Reed',title:'Licensed Clinical Social Worker',acceptingNewClients:true,onlineScheduling:true,profile:{publicBlurb:'Example profile showing in-person availability.'},specialties:['Stress','Coping skills'],modalities:['Individual therapy'],ageGroups:['Adults'],availability:{slots:[slot(1,9,'IN_PERSON'),slot(3,15,'IN_PERSON')],nextAvailableAt:slot(1,9,'IN_PERSON').startAt}}
];
const goals = [{id:301,goal_index:1,goal_text:'Build confidence using coping strategies.',objectives:[{id:401,objective_index:1,objective_text:'Use a coping strategy independently when stress increases.',scale_start:3,scale_current:5,scale_target:8,kiosk_prompt:'How confident do you feel using your coping strategy?'}]}];
const previousRatings = [
  {id:1,objective_id:401,rater_kind:'clinician',scale_value:5,date_of_service:'2026-09-25',disposition:'rated'},
  {id:2,objective_id:401,rater_kind:'client',scale_value:4,date_of_service:'2026-09-25',disposition:'rated'}
];
function selectTime(provider, time) { selection.value = `${provider.displayName} · ${new Date(time.startAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}. Example only: no hold or appointment was created.`; }
function showProvider(provider) { selection.value = `${provider.displayName} selected. The live app opens this provider’s profile and availability. This website example does not open a live practice or create a booking.`; }
function showOffice() { selection.value = 'Office selection is part of the live provider finder. This example uses no real office data.'; }
</script>
<style scoped>
.actual-example{--agency-primary-color:#2467a7;--agency-accent-color:#2467a7;--primary-color:#2467a7;--primary:#2467a7;--na-accent:#2467a7;background:#fff;border:1px solid #dde5ed;border-radius:12px;padding:26px;min-width:0;color:#213449;font-family:Inter,Arial,sans-serif}
.actual-example-label{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:18px;border-bottom:1px solid #e3eaf3;margin-bottom:20px}.actual-example-label strong{font-size:16px}.actual-example-label span{font-size:12px;color:#64748b;line-height:1.6}.actual-example-hint{font-size:14px;line-height:1.65;color:#526476;margin:0 0 24px}.actual-provider-list{display:grid;gap:20px}.actual-example-result{padding:18px;background:#f2f7fc;border-radius:8px;margin:20px 0 0;font-size:14px;line-height:1.65}.actual-example-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:20px}.actual-example-actions button{padding:10px 14px;border:1px solid #c8d8ed;border-radius:7px;background:white;color:#2467a7;cursor:pointer}.actual-example-actions p{font-size:12px;margin:0}.actual-example-actions button:focus-visible{outline:3px solid #ba891e;outline-offset:4px}@media(max-width:600px){.actual-example{padding:16px}.actual-example-label{gap:8px}}
</style>
