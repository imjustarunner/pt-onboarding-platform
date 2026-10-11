<template>
  <nav class="school-roadmap" aria-label="Four phases of school practice">
    <header><div><p class="roadmap-eyebrow">ITSCO · Care where students are</p><h3>Your school year, step by step.</h3></div><p>From your first assignment to ongoing care.<br />Choose a phase to find the next step.</p></header>
    <ol class="phase-grid">
      <li v-for="phase in phases" :key="phase.slug" :class="['phase', `phase-${phase.number}`]">
        <a class="phase-heading" :href="`#school-practice-guide-${phase.slug}`" @click.prevent="$emit('open', phase.slug)"><span class="phase-number">{{ phase.number.toString().padStart(2, '0') }}</span><span class="phase-label">Phase {{ phase.number }}</span><h4>{{ phase.title.replace(/^Phase \d+\s*·\s*/, '') }}</h4><span class="phase-arrow" aria-hidden="true">↗</span></a>
        <ul><li v-for="step in phase.steps" :key="step.slug"><a :href="`#school-practice-guide-${step.slug}`" @click.prevent="$emit('open', step.slug)">{{ step.title.replace(/^\d+\.\s*/, '') }}<span aria-hidden="true">→</span></a></li></ul>
      </li>
    </ol>
    <a v-if="checklist" class="readiness-link" :href="`#school-practice-guide-${checklist.slug}`" @click.prevent="$emit('open', checklist.slug)"><span aria-hidden="true">✓</span> {{ checklist.title }} <span aria-hidden="true">↗</span></a>
  </nav>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ sections: { type: Array, required: true } });
defineEmits(['open']);
const phaseSlugs = ['school-assignment', 'client-intake', 'caseload-management', 'essential-protocols'];
// Navigation uses the edition's actual headings. Edits and removals cannot leave
// a second, contradictory copy of the procedures in the illustrated roadmap.
const phases = computed(() => phaseSlugs.flatMap((slug, index) => {
  const section = props.sections.find(s => s.slug === slug);
  return section ? [{ ...section, number: index + 1, steps: props.sections.filter(s => s.parent_slug === slug) }] : [];
}));
const checklist = computed(() => props.sections.find(s => s.slug === 'provider-readiness-checklist'));
</script>
<style scoped>
.school-roadmap{padding:clamp(22px,4vw,48px);background:#fffcf4;border-block:1px solid #e5e6d7;color:#233e36}.school-roadmap header{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:26px}.roadmap-eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#4c6a5e;margin:0 0 12px}.school-roadmap h3{font-family:inherit;font-size:clamp(22px,2.5vw,32px);line-height:1.4;margin:0;letter-spacing:-.035em}.school-roadmap header>p{font-size:12px;line-height:1.9;margin:0;max-width:290px}.phase-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.phase{--phase-color:#e2f0f4;--phase-ink:#235669;border:1px solid #d8e0d8;border-radius:12px;overflow:hidden;background:#fff}.phase-2{--phase-color:#fff0c5;--phase-ink:#72551f}.phase-3{--phase-color:#d9eee6;--phase-ink:#275a4a}.phase-4{--phase-color:#ffe3d5;--phase-ink:#7c4431}.phase-heading{position:relative;display:flex;flex-direction:column;min-height:178px;padding:20px;background:var(--phase-color);color:var(--phase-ink);text-decoration:none}.phase-number{font-size:32px;font-weight:700;letter-spacing:-.06em;line-height:1;margin-bottom:16px}.phase-label{font-size:9px;text-transform:uppercase;letter-spacing:.12em}.phase h4{font-family:inherit;font-size:15px;line-height:1.55;font-weight:700;margin:9px 0 0}.phase-arrow{position:absolute;top:20px;right:20px;font-size:21px}.phase ul{list-style:none;padding:4px 16px 12px;margin:0}.phase li+li{border-top:1px solid #eef0e9}.phase li a{display:flex;align-items:start;justify-content:space-between;gap:8px;font-size:11px;line-height:1.85;padding:12px 0;color:#364b42;text-decoration:none}.phase li a span{color:#708478;flex-shrink:0}.phase a:hover{text-decoration:underline;text-underline-offset:4px}.readiness-link{display:flex;width:fit-content;align-items:center;gap:12px;margin-top:23px;color:#245943;font-size:12px;font-weight:700;text-decoration:none}.readiness-link>span:first-child{border-radius:50%;background:#e5eede;width:25px;height:25px;display:grid;place-items:center}.school-roadmap a:focus-visible{outline:3px solid #14543e;outline-offset:-3px}.readiness-link:focus-visible{outline-offset:4px!important}@media(max-width:1050px){.phase-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.phase-heading{min-height:145px}.school-roadmap header{align-items:start;flex-direction:column;gap:14px}}@media(max-width:480px){.phase-grid{grid-template-columns:1fr;gap:18px}.phase-heading{min-height:0;padding:18px 22px}.phase-number{font-size:28px;margin-bottom:12px}.phase li a{font-size:12px}.phase ul{padding-inline:22px}.school-roadmap header>p{font-size:11px}}
</style>
