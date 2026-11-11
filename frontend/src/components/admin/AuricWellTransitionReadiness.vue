<template>
  <article class="aw-transition">
    <header>
      <p class="aw-eyebrow">AuricWell · {{ agencyName }}</p>
      <h2>EHR Transition reference plan</h2>
      <p>Move a provider’s active caseload into AuricWell, one client at a time, while preserving existing school charts and linking the week’s appointments.</p>
      <p class="aw-review">Implementation reference · Reviewed {{ auricwellTransitionReviewedDate }}. Run imports in the workspace above; this reference is not a completed client checklist.</p>
    </header>

    <section aria-labelledby="aw-transition-process">
      <h3 id="aw-transition-process">The intended process</h3>
      <ol class="aw-steps">
        <li v-for="step in auricwellTransitionSteps" :key="step.title">
          <strong>{{ step.title }}</strong>
          <p>{{ step.detail }}</p>
        </li>
      </ol>
    </section>

    <section aria-labelledby="aw-transition-readiness">
      <h3 id="aw-transition-readiness">Available tools and required setup</h3>
      <p>The workspace reuses current chart, contact, insurance, document and scheduling services. Review these setup requirements and limits before a trial with real records.</p>
      <div class="aw-readiness">
        <details v-for="item in auricwellTransitionReadiness" :key="item.id">
          <summary>
            <span>{{ item.title }}</span>
            <span class="aw-status" :class="`aw-status--${item.status}`">{{ statusLabels[item.status] }}</span>
          </summary>
          <div class="aw-readiness-body">
            <p><strong>Current:</strong> {{ item.current }}</p>
            <p><strong>Next:</strong> {{ item.remaining }}</p>
          </div>
        </details>
      </div>
    </section>

    <section aria-labelledby="aw-transition-archive">
      <h3 id="aw-transition-archive">Medical history: store first, extract later</h3>
      <p>A verified archive is enough for the initial transition. Turning old notes into separate historical sessions is a later option, with review before anything enters the clinical record.</p>
      <div class="aw-options">
        <div v-for="option in auricwellArchiveOptions" :key="option.title" class="aw-option">
          <h4>{{ option.title }}</h4>
          <p>{{ option.detail }}</p>
        </div>
      </div>
    </section>

    <section aria-labelledby="aw-transition-school">
      <h3 id="aw-transition-school">One appointment, shared with the school schedule</h3>
      <ul><li v-for="rule in auricwellSchoolScheduleRules" :key="rule">{{ rule }}</li></ul>
    </section>

    <section aria-labelledby="aw-transition-acceptance">
      <h3 id="aw-transition-acceptance">Required rehearsal before switching a provider</h3>
      <ul><li v-for="check in auricwellTransitionAcceptance" :key="check">{{ check }}</li></ul>
      <p class="aw-review">Start with a small representative caseload: an existing school client, a new client, multiple contacts, secondary insurance, a large PDF, and a recurring appointment with an exception.</p>
    </section>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { useAgencyStore } from '../../store/agency';
import {
  auricwellArchiveOptions,
  auricwellSchoolScheduleRules,
  auricwellTransitionAcceptance,
  auricwellTransitionReadiness,
  auricwellTransitionReviewedDate,
  auricwellTransitionSteps
} from '../../config/auricwellTransitionPlan';

const props = defineProps({ scopedAgencyId: { type: [Number, String], default: null } });
const agencyStore = useAgencyStore();
const agencyName = computed(() => {
  const agency = agencyStore.currentAgency;
  return agency && (!props.scopedAgencyId || Number(agency.id) === Number(props.scopedAgencyId))
    ? agency.name || 'Practice transition'
    : 'Practice transition';
});
const statusLabels = { available: 'Available', partial: 'Review required', setup: 'Setup required', planned: 'Later phase' };
</script>

<style scoped>
.aw-transition { max-width: 1080px; color: var(--text-primary, #17334a); line-height: 1.6; }
.aw-transition header > p { max-width: 85ch; }
.aw-eyebrow { color: var(--primary, #24689b); font-size: .8rem; font-weight: 700; letter-spacing: .06em; }
.aw-transition h2 { margin: 0 0 10px; }
.aw-transition h3 { margin: 0 0 12px; }
.aw-transition h4 { margin: 0 0 8px; font-size: 1rem; }
.aw-transition section { margin-top: 32px; }
.aw-review { color: var(--text-secondary, #506476); font-size: .9rem; }
.aw-steps { padding-left: 25px; }
.aw-steps li { padding-left: 6px; margin-bottom: 16px; }
.aw-steps p { margin: 3px 0 0; }
.aw-readiness { border: 1px solid var(--border, #d7e1e8); border-radius: 10px; overflow: hidden; }
.aw-readiness details + details { border-top: 1px solid var(--border, #d7e1e8); }
.aw-readiness summary { padding: 14px 16px; cursor: pointer; }
.aw-readiness summary > span:first-child { font-weight: 600; }
.aw-status { display: inline-block; margin-left: 12px; padding: 2px 8px; border-radius: 12px; font-size: .78rem; background: var(--bg-alt, #edf3f8); }
.aw-status--available { background: #e8f5ee; color: #225a3d; }
.aw-status--partial { background: #fff2d7; color: #704b10; }
.aw-status--planned { background: #edf1f7; color: #43566e; }
.aw-readiness-body { padding: 0 16px 12px; }
.aw-readiness-body p { margin: 5px 0; }
.aw-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; }
.aw-option { border: 1px solid var(--border, #d7e1e8); border-radius: 10px; padding: 16px; }
.aw-option p { margin: 0; }
.aw-transition ul { padding-left: 22px; }
.aw-transition ul li { margin-bottom: 10px; }
summary:focus-visible { outline: 2px solid var(--primary, #24689b); outline-offset: -3px; }
@media (max-width: 600px) { .aw-status { margin-left: 5px; } .aw-readiness summary { padding: 12px; } }
</style>
