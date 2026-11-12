<template>
  <div class="public-provider-details">
    <section class="profile-panel"><h2>About {{ provider.firstName || provider.displayName }}</h2><p class="profile-bio">{{ profile.publicBlurb || 'The provider has not published a biography yet.' }}</p></section>
    <section v-if="practice" class="profile-panel profile-practice"><p class="profile-eyebrow">THE PRACTICE</p><h2>{{ practice.name }}</h2><p v-if="practice.description">{{ practice.description }}</p><dl><div v-if="practice.setting"><dt>Session setting</dt><dd>{{ practice.setting }}</dd></div><div v-if="practice.service"><dt>Services</dt><dd>{{ practice.service }}</dd></div><div v-if="practice.location"><dt>Practice location</dt><dd>{{ practice.location }}</dd></div><div v-if="practice.languages"><dt>Session languages</dt><dd>{{ practice.languages }}</dd></div></dl><p v-if="practice.firstVisit" class="practice-first-visit"><strong>Getting started</strong>{{ practice.firstVisit }}</p></section>
    <div class="profile-facets"><section v-for="group in groups" :key="group.title" class="profile-panel"><h2>{{ group.title }}</h2><p v-if="group.reviewed">Highlighted areas</p><div class="profile-tags"><span v-for="value in group.values" :key="value">{{ value }}</span></div><p v-if="!group.values.length">No highlighted areas published</p><details v-if="group.more?.length"><summary>{{ group.reviewed ? 'Other areas open to discussing fit' : 'Show more' }}</summary><p v-if="group.reviewed">These areas are available for a fit discussion; they are not claims of specialized training.</p><div class="profile-tags"><span v-for="value in group.more" :key="value">{{ value }}</span></div></details></section></div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { publishedFocus } from '../../navigation/providerFocus.js';
import { uniquePublicFacets } from '../../utils/publicProviderFacets.js';
const props = defineProps({
  provider: { type: Object, required: true },
  profile: { type: Object, default: () => ({}) },
  service: { type: String, default: 'counseling' },
  practice: { type: Object, default: null },
  hideUnpublished: Boolean
});
// Shared by the real public profile and the fictional website example. Preserve
// reviewed highlights, exclusions and the distinction between focus and fit.
const groups = computed(() => [
  {title:props.service==='tutoring'?'Subjects':'Specialties',values:props.provider.tutoringProfile?.subjectAreas||props.provider.specialties||[]},
  {title:'Client ages',values:uniquePublicFacets(props.provider.ageGroups||[])},
  {title:'Populations served',values:props.provider.focus||[]},
  {title:props.service==='tutoring'?'Grades':'Approaches',values:props.provider.tutoringProfile?.gradeLevels||[...(props.provider.modalities||[]),...(props.provider.interventions||[])]},
  {title:'Insurance accepted',values:props.profile.insurancesAccepted||[]},
  {title:'Provider gender',values:props.profile.details?.gender?[props.profile.details.gender]:[]}
].filter(group => props.service !== 'tutoring' || group.title !== 'Insurance accepted').map((group,index) => {
  if(index>3||props.service==='tutoring')return group;
  const focus=publishedFocus(['specialties','ageGroups','populations','modalities'][index],props.profile.details?.clinicalFocus,group.values);
  return {...group,values:focus.top,more:focus.more,reviewed:focus.reviewed};
}).filter(group=>!props.hideUnpublished||group.values.length||group.more?.length));
</script>
<style scoped>
.public-provider-details{display:grid;gap:20px;min-width:0;container-type:inline-size}.profile-panel{padding:26px;border:1px solid #dfebe6;border-radius:15px;background:#fff;box-shadow:0 6px 22px #183d3b04;min-width:0}.profile-panel h2{font-size:1.2rem;letter-spacing:-.3px;line-height:1.4;margin:0 0 20px;color:inherit}.profile-panel p{font-size:14px;line-height:1.75;color:#506570;margin:0}.profile-bio{white-space:pre-line}.profile-facets{display:grid;grid-template-columns:1fr 1fr;gap:20px;min-width:0}.profile-tags{display:flex;flex-wrap:wrap;gap:8px}.profile-tags span{background:#eef5f3;color:#31554e;padding:7px 12px;border-radius:30px;font-size:.85rem;line-height:1.5;overflow-wrap:anywhere}.profile-panel details{margin-top:14px}.profile-panel summary{cursor:pointer;font-size:13px;line-height:1.6;color:var(--profile-brand,#125c49)}.profile-panel details p{font-size:12px;margin:10px 0}.profile-panel>.profile-eyebrow{font-size:10px;letter-spacing:1.3px;color:var(--profile-brand,#125c49);font-weight:650;margin:0 0 9px}.profile-practice dl{display:grid;gap:14px;margin:20px 0 0}.profile-practice dl>div{display:grid;gap:5px}.profile-practice dt{font-size:11px;font-weight:650;color:#64778b}.profile-practice dd{font-size:13px;line-height:1.7;color:#334f65;margin:0}.profile-practice .practice-first-visit{border-top:1px solid #e1e9ed;padding-top:18px;margin-top:20px;font-size:13px}.practice-first-visit strong{display:block;margin-bottom:6px;color:#294b6b}.public-provider-details :focus-visible{outline:3px solid #b98c2f;outline-offset:4px}@container(max-width:500px){.profile-facets{grid-template-columns:1fr}.profile-panel{padding:20px}}@media(max-width:520px){.profile-facets{grid-template-columns:1fr}.profile-panel{padding:20px}}
</style>
