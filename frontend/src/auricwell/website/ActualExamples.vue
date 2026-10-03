<template>
  <ProviderShowcase v-if="kind === 'providers'" />
  <ScheduleShowcase v-else-if="kind === 'schedule'" />
  <KioskShowcase v-else-if="kind === 'kiosk'" />
  <div v-else class="actual-example">
    <div class="actual-example-label"><strong>The app’s treatment-objective ratings</strong><span>Actual component · synthetic data · changes are not saved</span></div>
      <p class="actual-example-hint">Use the real Start / Previous session / This session / Goal controls. Switch between clinician and client ratings, or mark an objective deferred.</p>
      <NoteAidObjectiveRatings :key="resetKey" :goals="goals" :previous-ratings="previousRatings" date-of-service="2026-10-02" client-name="Example client" :kiosk-share-enabled="true" @update:ratings="ratings = $event" />
      <div class="actual-example-actions"><button type="button" @click="resetKey++; ratings = []">Reset example</button><p role="status">{{ ratings.length ? 'Example rating changed locally. Nothing was saved to a chart.' : 'Try a rating. This example never saves to a chart.' }}</p></div>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import ProviderShowcase from './ProviderShowcase.vue';
import ScheduleShowcase from './ScheduleShowcase.vue';
import KioskShowcase from './KioskShowcase.vue';
import NoteAidObjectiveRatings from '../../components/clinical/NoteAidObjectiveRatings.vue';
defineProps({kind: String});
const ratings = ref([]), resetKey = ref(0);
const goals = [{id:301,goal_index:1,goal_text:'Build confidence using coping strategies.',objectives:[{id:401,objective_index:1,objective_text:'Use a coping strategy independently when stress increases.',scale_start:3,scale_current:5,scale_target:8,kiosk_prompt:'How confident do you feel using your coping strategy?'}]}];
const previousRatings = [
  {id:1,objective_id:401,rater_kind:'clinician',scale_value:5,date_of_service:'2026-09-25',disposition:'rated'},
  {id:2,objective_id:401,rater_kind:'client',scale_value:4,date_of_service:'2026-09-25',disposition:'rated'}
];
</script>
<style scoped>
.actual-example{--agency-primary-color:var(--showcase-secondary,#2467a7);--agency-accent-color:var(--showcase-secondary,#2467a7);--primary-color:var(--showcase-secondary,#2467a7);--primary:var(--showcase-secondary,#2467a7);--na-accent:var(--showcase-secondary,#2467a7);background:#fff;border:1px solid #dde5ed;border-radius:12px;padding:26px;min-width:0;color:#213449;font-family:Inter,Arial,sans-serif}
.actual-example-label{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:18px;border-bottom:1px solid #e3eaf3;margin-bottom:20px}.actual-example-label strong{font-size:16px}.actual-example-label span{font-size:12px;color:#64748b;line-height:1.6}.actual-example-hint{font-size:14px;line-height:1.65;color:#526476;margin:0 0 24px}.actual-provider-list{display:grid;gap:20px}.actual-example-result{padding:18px;background:#f2f7fc;border-radius:8px;margin:20px 0 0;font-size:14px;line-height:1.65}.actual-example-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:20px}.actual-example-actions button{padding:10px 14px;border:1px solid #c8d8ed;border-radius:7px;background:white;color:var(--showcase-secondary,#2467a7);cursor:pointer}.actual-example-actions p{font-size:12px;margin:0}.actual-example-actions button:focus-visible{outline:3px solid #ba891e;outline-offset:4px}@media(max-width:600px){.actual-example{padding:16px}.actual-example-label{gap:8px}}
</style>
