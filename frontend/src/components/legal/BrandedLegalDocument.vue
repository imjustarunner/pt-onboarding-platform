<template>
  <main v-if="document" class="itsco-legal" id="legal-document" :style="{'--legal-brand':profile.color}">
    <header>
      <a class="wordmark" :href="profile.origin"><img v-if="profile.logo" :src="profile.logo" alt="" />{{ profile.name }}</a>
      <nav :aria-label="`${profile.name} legal documents`">
        <a v-for="link in links" :key="link.type" :href="profile.origin + link.path" :aria-current="link.type === type ? 'page' : undefined">{{ link.label }}</a>
      </nav>
      <p class="eyebrow">{{ profile.legalName }} · Your information and your choices</p>
      <h1>{{ document.title }}</h1>
      <p class="date">Effective October 5, 2026 · Version {{ ITSCO_LEGAL_VERSION }}</p>
      <p class="intro">{{ document.intro }}</p>
      <button type="button" class="print-button" @click="printDocument">Print or save as PDF</button>
    </header>
    <nav class="contents" aria-label="On this page">
      <strong>On this page</strong>
      <a v-for="section in document.sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a>
    </nav>
    <article :aria-label="document.title">
      <section v-for="section in document.sections" :key="section.id" :id="section.id">
        <h2>{{ section.title }}</h2>
        <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
        <ul v-if="section.items.length"><li v-for="item in section.items" :key="item">{{ item }}</li></ul>
        <p v-for="link in section.links" :key="link.href"><a :href="link.href.startsWith('/') ? profile.origin + link.href : link.href">{{ link.label }}</a></p>
      </section>
    </article>
    <footer>{{ profile.legalName }} · <a :href="profile.origin">{{ profile.name }}</a> · <a href="#legal-document">Back to top</a></footer>
  </main>
</template>

<script setup>
import { computed } from 'vue';
import { ITSCO_LEGAL_VERSION } from '../../content/itscoLegalDocuments.js';
import { tenantLegalProfiles, tenantLegalLinks } from '../../content/tenantLegalProfiles.js';
import { legalDocumentsForProfile } from '../../content/tenantLegalDocuments.js';
const props = defineProps({ type: { type: String, required: true }, profile: {type:Object, default:()=>tenantLegalProfiles.itsco} });
const links = computed(()=>tenantLegalLinks(props.profile));
const document = computed(() => legalDocumentsForProfile(props.profile)[props.type]);
const printDocument = () => window.print();
</script>

<style scoped>
.itsco-legal { background:#fffdf7; color:#243e3c; min-height:100vh; padding:32px max(24px, calc((100% - 880px) / 2)); font-family:'Avenir Next', system-ui, sans-serif; line-height:1.75; overflow-wrap:anywhere; }
.wordmark { font-size:28px; font-weight:750; text-decoration:none; }
.wordmark span { display:block; font-size:13px; font-weight:500; }
nav { display:flex; flex-wrap:wrap; gap:12px 24px; padding:20px 0; }
.wordmark img { display:block; width:auto; max-width:230px; height:68px; object-fit:contain; margin-bottom:16px; }
a { color:var(--legal-brand,#285e51); text-underline-offset:4px; }
a[aria-current=page] { font-weight:750; }
.eyebrow { margin-top:32px; font-size:13px; }
h1 { font-family:Georgia,serif; font-weight:500; font-size:clamp(30px,5vw,46px); line-height:1.2; margin:12px 0; }
.date { font-size:13px; color:#526660; }
.intro { font-size:18px; }
.print-button { border:1px solid #285e51; border-radius:6px; padding:12px 18px; background:var(--legal-brand,#285e51); color:white; font:inherit; cursor:pointer; }
.contents { display:grid; gap:6px; border-block:1px solid #d3ded5; margin-top:28px; }
section { padding-top:24px; scroll-margin-top:24px; }
h2 { font-size:22px; line-height:1.4; color:inherit; }
li { margin:12px 0; }
footer { border-top:1px solid #d3ded5; margin-top:40px; padding:24px 0; }
:is(a,button):focus-visible { outline:3px solid #2867d7; outline-offset:4px; }
@media print {
 .itsco-legal { padding:0; background:white; color:black; font-size:11pt; }
 nav,.print-button,.eyebrow,footer { display:none; }
 h1 { font-size:25pt; } h2 { font-size:15pt; break-after:avoid; }
 p,li { orphans:3; widows:3; } a { color:inherit; }
}
</style>
