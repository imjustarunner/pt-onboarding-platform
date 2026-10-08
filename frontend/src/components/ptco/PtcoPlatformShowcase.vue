<template>
 <div class="ptco-platform-showcase" :class="{'ptco-faq-only': faqOnly}">
  <template v-if="!faqOnly">
   <nav class="ptco-platform-jump" aria-label="Platform examples"><a v-for="[id,label] in sections" :key="id" :href="`#${id}`">{{label}}</a></nav>
   <section id="documentation" class="ptco-band"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">Practice Notes · Intelligence at the point of work</p><h2>Less repeat work.<br>More time for care.</h2></div><p>Guided notes, AI drafting, treatment context and supervision in one workspace. Keep the library and work queue close, then focus on the note when it is time to write.</p></div>
    <div class="ptco-note-gallery product-example"><div class="ptco-example-switch" role="group" aria-label="Practice Notes examples"><button v-for="item in noteViews" :key="item.id" :aria-pressed="noteView===item.id" @click="noteView=item.id">{{item.label}}</button><span>Actual app screens · Fictional records</span></div><figure><a :href="note.src" target="_blank" rel="noopener" :aria-label="`View ${note.label} at full size`"><img :src="note.src" :alt="note.alt" loading="lazy" width="1392" height="1030"></a><figcaption>The shared clinical workspace, shown in its AuricWell presentation. <a :href="note.src" target="_blank" rel="noopener">View full size ↗</a></figcaption></figure></div>
    <div class="ptco-three ptco-feature-grid"><article v-for="[title,body] in documentation" :key="title"><h3>{{title}}</h3><p>{{body}}</p></article></div>
   </div></section>
   <section id="progress" class="ptco-band ptco-soft"><div class="ptco-wrap ptco-progress-layout"><div><p class="ptco-eyebrow">Treatment plans that stay in the conversation</p><h2>Your standards.<br>A visible history.</h2><p>Configure plan sections, goals, objectives and rating scales. Carry the treatment context into notes and retain historical objective ratings across visits.</p><p>Check-in feedback can capture connection with the provider and perceived progress. Compare it with earlier feedback alongside clinical goal history.</p><p class="ptco-small">Custom feedback supports the conversation. It is distinct from validated outcome measures and the clinician’s assessment.</p></div><div class="product-example" data-ptco-example="goals"><ActualExamples kind="goals"/></div></div></section>
   <section id="care-experience" class="ptco-band"><div class="ptco-wrap"><p class="ptco-eyebrow">Before, during and after the visit</p><h2>Connect the whole care experience.</h2><div class="ptco-three ptco-feature-grid"><article v-for="[title,body] in care" :key="title"><h3>{{title}}</h3><p>{{body}}</p></article></div><p class="ptco-small">Features depend on the organization’s plan, permissions, integrations and configured workflow. A private-office guest is not automatically connected to a client chart.</p></div></section>
   <section id="provider-example" class="ptco-band ptco-soft"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">A public path into care</p><h2>Find the right fit.<br>See the next opening.</h2></div><p>Explore the app’s provider cards, fictional biographies and published openings. The selection stays in this example; the practice reviews placement in the real workflow.</p></div><div class="product-example" data-ptco-example="providers"><ProviderShowcase/></div></div></section>
   <ConversaFeature product="hq" />
   <section id="scheduling" class="ptco-band"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">The calendar behind the care</p><h2>A clearer week.<br>A direct path to scheduling.</h2></div><p>See the existing weekly calendar and booking screen with fictional records. Supported confirmation replies update the appointment, so providers can see confirmed visits and those awaiting a response.</p></div><div class="product-example" data-ptco-example="schedule"><ScheduleShowcase/></div><p class="ptco-small">Actual shared-platform captures; the booking screen uses the clinical workspace’s AuricWell presentation.</p><div class="ptco-three ptco-feature-grid"><article><h3>Reminders that fit the visit</h3><p>Configure text and email timing, channels and templates within platform controls and client preferences. Text delivery requires consent and an enabled messaging integration.</p></article><article><h3>A room for the right time</h3><p>See physical office availability, assigned provider time, bookings and holds. Room reservations are a distinct workflow alongside the appointment calendar.</p></article><article><h3>From the visit to billing</h3><p>Connect service details, documentation and claim readiness. Required review, signatures, enrollment and integration setup still apply before submission.</p></article></div></div></section>
   <section id="kiosk" class="ptco-band ptco-soft"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">From the waiting room to the provider</p><h2>A warm welcome.<br>A timely heads-up.</h2></div><p>Try a sample arrival, then inspect the provider’s app alert, email fallback and proposed SMS. Plot Twist HQ branding keeps the treating practice clearly identified.</p></div><div class="product-example" data-ptco-example="kiosk"><KioskShowcase product="hq"/></div></div></section>
   <div class="ptco-shared-content" v-html="plansHtml"></div>
   <section id="onboarding" class="ptco-band ptco-soft"><div class="ptco-wrap"><p class="ptco-eyebrow">Your business. Your starting point.</p><h2>Start fresh. Or bring your history.</h2><div class="ptco-two"><article><h3>Starting a practice</h3><p>Begin with your team, locations, services, fees, intake forms and agreements. Historical imports are not a prerequisite for a new practice.</p></article><article><h3>Transitioning from your current EHR</h3><p>Review exports, staff and payer records, client charts, billing history and clinical documents. Agree on file compatibility, mapping, reconciliation and cutover before changing systems.</p></article></div><router-link class="ptco-button ptco-button-outline" to="/p/ptco/start?path=hq">Discuss your setup →</router-link></div></section>
   <div class="ptco-shared-content" v-html="comparisonHtml"></div>
   <section class="ptco-band ptco-soft"><div class="ptco-wrap ptco-two"><div><p class="ptco-eyebrow">One backend. Two focused experiences.</p><h2>Plot Twist HQ and AuricWell.</h2></div><div><p>Plot Twist HQ is the broader suite for client care, people operations, payroll workflows, programs and public websites. AuricWell is the focused EHR frontend, using the same underlying clinical services.</p><p>Choose the experience that fits your organization. Enabled capabilities, access and rollout readiness are reviewed separately; a feature shown here does not activate an integration.</p><a class="ptco-text-link" href="https://plottwisthq.com/auricwell">Explore the AuricWell website ↗</a></div></div></section>
  </template>
  <div class="ptco-shared-content" v-html="faqHtml"></div>
 </div>
</template>
<script setup>
import ConversaFeature from '../conversa/ConversaFeature.vue';
import {computed,ref} from 'vue';
import ActualExamples from '../../auricwell/website/ActualExamples.vue';
import ProviderShowcase from '../../auricwell/website/ProviderShowcase.vue';
import ScheduleShowcase from '../../auricwell/website/ScheduleShowcase.vue';
import KioskShowcase from '../../auricwell/website/KioskShowcase.vue';
import {comparisonSection,faqSection} from '../../auricwell/website/compare.mjs';
import {planSection} from '../../auricwell/website/story.mjs';
import {publicSitePaths} from '../../utils/publicDomainRouting.js';
const props=defineProps({faqOnly:Boolean,compact:Boolean});
const sections=[['documentation','Practice Notes'],['progress','Treatment progress'],['care-experience','Care experience'],['provider-example','Provider finder'],['conversa-features','Conversa'],['scheduling','Scheduling'],['kiosk','Kiosk & alerts'],['plans','Plans'],['compare','Compare EHRs'],['faq','FAQs']];
const base=publicSitePaths(window.location.hostname)?.clean('/p/ptco').replace(/\/$/,'') ?? '/p/ptco';
// These HTML renderers contain only repository-owned copy; no CMS or user input.
const comparisonHtml=comparisonSection({product:'hq'}),plansHtml=planSection({product:'platform'});
const faqHtml=computed(()=>faqSection({product:'hq',compact:props.compact,base}));
const noteView=ref('workspace');
const noteViews=[{id:'workspace',label:'Practice Notes',src:'/auricwell/examples/practice-notes.png',alt:'Actual shared Practice Notes workspace with the note library on the left and work queue on the right; synthetic records and AuricWell clinical branding.'},{id:'editor',label:'Guided note editor',src:'/auricwell/examples/note-editor.png',alt:'Actual guided clinical note editor showing structured steps and service details with synthetic records.'}];
const note=computed(()=>noteViews.find(item=>item.id===noteView.value));
const documentation=[
 ['Guided sections, informed drafts','Set the client, service, timing and treatment focus. Work through documentation prompts, use AI assistance where configured, then review the narrative before signing.'],
 ['Supervision with context','Keep drafts, outstanding work and review status together. Review-only workflows may avoid an additional cosign where appropriate; required approvals remain in place.'],
 ['Corrections with a history','Add amendments, corrections and late entries while retaining the signed original. Timing, service and claim checks help surface missing requirements; they do not guarantee an error-free note or payment.']
];
const care=[
 ['Clients and multiple guardians','Separate account relationships support the people authorized to help each client. Guardian permissions determine which forms, appointments and information they can access.'],
 ['Enrollment from your website','Configurable public enrollment links connect intake questions, digital forms and signed acknowledgements. Shape the starting experience around your services and practice requirements.'],
 ['Arrival with useful context','Office kiosk check-in alerts the provider. Optional connection and progress feedback can inform the visit and stay connected to the treatment history.'],
 ['Private virtual offices','A permanent provider office link and individual guest admission create a familiar place to meet. Premium supports one guest; Premium Plus supports additional individually admitted guests.'],
 ['Waiting rooms and interactive tools','Optional waiting-room music, games and whiteboard activities can support virtual visits. Tools depend on the session type and enabled integrations.'],
 ['Transcription with acknowledgement','In-person and virtual transcription use applicable signed acknowledgements and recording controls. Authorized transcripts can support summaries and clinician-reviewed draft notes.']
];
</script>
<style src="../../styles/ptcoPlatformShowcase.css"></style>
