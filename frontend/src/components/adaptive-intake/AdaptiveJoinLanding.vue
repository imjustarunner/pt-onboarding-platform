<template>
  <div class="ajl" :class="[`ajl--${presentation.device}`, `ajl--footer-${view.footerStyle}`, { 'ajl--design': designMode, 'ajl--rail-first': view.railPlacement === 'before' }]" :style="themeVars" @click.capture="selectFromCanvas" @keydown="selectWithKeyboard">
    <link rel="stylesheet" :href="JOIN_FONT_HREF" />
    <div class="ajl-bg" :style="backgroundStyle" aria-hidden="true" />
    <aside class="ajl-rail" aria-label="Organization and support">
      <template v-for="key in view.order.rail" :key="key">
        <section v-if="!view.hidden[key]" class="ajl-block" :class="[`ajl-block--${key}`, { 'ajl-block--selected': designMode && selectedElement === key }]" :style="blockStyle(key)" v-bind="elementAttrs(key)">
          <JoinCustomElement v-if="elementFor(key)?.type" :element="elementFor(key)" :copy="copy" />
          <template v-else-if="key === 'logo'">
            <img v-if="logoUrl" class="ajl-logo" :src="logoUrl" :alt="agencyName" />
            <span v-else class="ajl-logo-fallback">{{ agencyName.charAt(0) }}</span>
          </template>
          <p v-else-if="key === 'tagline'" class="ajl-tagline">{{ copy.sidebarTagline }}</p>
          <p v-else-if="key === 'script'" class="ajl-script">{{ copy.sidebarScript }}</p>
          <ul v-else-if="key === 'values'" class="ajl-values"><li v-for="(value, index) in [copy.value1, copy.value2, copy.value3].filter(Boolean)" :key="index"><span aria-hidden="true">{{ ['♡', '◇', '❧'][index] }}</span>{{ value }}</li></ul>
          <div v-else-if="key === 'help'" class="ajl-help">
            <h2>{{ copy.helpTitle }}</h2><p>{{ copy.helpBody }}</p>
            <a v-if="contactTel" class="ajl-help-line" :href="`tel:${contactTel}`">{{ contactPhone }}</a>
            <a v-if="contactEmail" class="ajl-help-line" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
            <button v-if="copy.sendMessage" type="button" class="ajl-help-btn" @click="continueAction('contact-support')">{{ copy.sendMessage }}</button>
          </div>
        </section>
      </template>
    </aside>
    <main class="ajl-main">
      <h1 v-if="view.hidden.welcome" class="ajl-sr-only">{{ agencyName }} intake</h1>
      <div v-if="canEdit && !designMode" class="ajl-editbar"><button ref="editButton" type="button" class="ajl-edit-btn" @click="designerOpen = true">Edit this page</button><span v-if="savedNotice" role="status">{{ savedNotice }}</span></div>
      <template v-for="key in view.order.main" :key="key">
        <section v-if="!view.hidden[key]" class="ajl-block" :class="[`ajl-block--${key}`, { 'ajl-block--selected': designMode && selectedElement === key }]" :style="blockStyle(key)" v-bind="elementAttrs(key)">
          <JoinCustomElement v-if="elementFor(key)?.type" :element="elementFor(key)" :copy="copy" />
          <h1 v-else-if="key === 'welcome' && copy.welcomeTitle" class="ajl-welcome">{{ copy.welcomeTitle }}</h1>
          <p v-else-if="key === 'glad' && copy.welcomeGlad" class="ajl-glad">{{ copy.welcomeGlad }}</p>
          <p v-else-if="key === 'lead' && copy.welcomeLead" class="ajl-lead">{{ copy.welcomeLead }}</p>
          <div v-else-if="key === 'cards'" class="ajl-cards">
            <template v-for="cardKey in view.order.cards" :key="cardKey">
              <article v-if="!view.hidden[cardKey]" class="ajl-card" :class="[`ajl-card--${cardKey}`, { 'ajl-card--disabled': cardKey === 'full' && !full.enabled, 'ajl-block--selected': designMode && selectedElement === cardKey }]" :style="{ textAlign: view.align[cardKey] || 'left' }" v-bind="elementAttrs(cardKey)">
                <div class="ajl-card-top"><span class="ajl-card-icon" aria-hidden="true">{{ cardKey === 'quick' ? '⚡' : '▤' }}</span><span class="ajl-card-time">{{ cards[cardKey].duration }}</span></div>
                <h2>{{ cards[cardKey].title }}</h2><p class="ajl-card-tag">{{ cards[cardKey].tagline }}</p><p class="ajl-card-desc">{{ cards[cardKey].description }}</p>
                <ul v-if="cards[cardKey].bullets?.length"><li v-for="(bullet, i) in cards[cardKey].bullets" :key="i">{{ bullet }}</li></ul>
                <button type="button" class="ajl-cta" :disabled="!designMode && cardKey === 'full' && !full.enabled" @click="continueAction('continue', cardKey)">{{ cardKey === 'full' && !full.enabled ? (full.disabledReason || 'Not available yet') : cards[cardKey].cta }}</button>
                <p class="ajl-card-foot">{{ cards[cardKey].footer }}</p>
              </article>
            </template>
          </div>
        </section>
      </template>
    </main>
    <footer v-if="view.footerStyle !== 'hidden' && !view.hidden.footer" class="ajl-footer" :style="{ textAlign: view.align.footer, justifyContent: view.align.footer === 'right' ? 'flex-end' : view.align.footer === 'center' ? 'center' : 'flex-start' }" :class="{ 'ajl-block--selected': designMode && selectedElement === 'footer' }" v-bind="elementAttrs('footer')">
      <span v-for="(item, index) in footerTrust" :key="index">{{ item }}</span><strong>{{ copy.slogan }}</strong>
    </footer>
  </div>
  <JoinPageDesigner v-if="designerOpen && canEdit" :config="config" :agency-slug="agencySlug" :service-type="serviceType" :quick="quick" :full="full" :contact-phone="contactPhone" :contact-tel="contactTel" :contact-email="contactEmail" @close="closeDesigner" @saved="onSaved" />
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { JOIN_FONT_HREF, fontFamilyById, writeJoinLandingCache } from '../../utils/joinLandingTemplate';
import { joinDesignElements, joinCards, resolveJoinPresentation, safeJoinImage } from '../../utils/joinPageDesign';
import JoinCustomElement from './JoinCustomElement.vue';
import { pickTenantWelcomeUrl } from '../../utils/tenantBrandAssets';
const JoinPageDesigner = defineAsyncComponent(() => import('./JoinPageDesigner.vue'));
const props = defineProps({
  config: { type: Object, default: null }, agencySlug: { type: String, default: '' }, serviceType: { type: String, default: '' },
  quick: { type: Object, required: true }, full: { type: Object, required: true },
  contactPhone: { type: String, default: '' }, contactTel: { type: String, default: '' }, contactEmail: { type: String, default: '' },
  canEdit: { type: Boolean, default: false }, designMode: { type: Boolean, default: false }, selectedElement: { type: String, default: '' }
});
const emit = defineEmits(['continue', 'contact-support', 'tenant-updated', 'select-element']);
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth);
const designerOpen = ref(false); const savedNotice = ref(''); const editButton = ref(null);
const presentation = computed(() => resolveJoinPresentation(props.config, viewportWidth.value));
const view = computed(() => presentation.value.view); const copy = computed(() => presentation.value.copy);
const elements = computed(() => joinDesignElements(presentation.value.design));
const elementFor = key => elements.value.find(e => e.id === key);
const cards = computed(() => joinCards(copy.value, props.quick, props.full));
const agencyName = computed(() => props.config?.agency?.name || 'Welcome');
const logoUrl = computed(() => safeJoinImage(props.config?.branding?.logoUrl || props.config?.branding?.agencyLogoUrl || props.config?.branding?.organizationLogoUrl || props.config?.agency?.logo_url || props.config?.agency?.logoUrl || (props.agencySlug === 'itsco' ? '/assets/provider-action/itsco-logo.png' : '')));
const backgroundStyle = computed(() => ({ backgroundImage: `url(${JSON.stringify(view.value.backgroundUrl || presentation.value.design.backgroundUrl || pickTenantWelcomeUrl(props.agencySlug || props.config?.agency?.slug) || props.config?.themeImageUrl || '/assets/intake-themes/greenintakethemecounseling.jpg')})`, backgroundPosition: `${view.value.backgroundX}% ${view.value.backgroundY}%` }));
const themeVars = computed(() => ({
  '--ajl-body-font': fontFamilyById(view.value.fonts.body), '--ajl-welcome-font': fontFamilyById(view.value.fonts.welcome), '--ajl-script-font': fontFamilyById(view.value.fonts.script), '--ajl-card-font': fontFamilyById(view.value.fonts.cardTitle),
  '--ajl-welcome-size': `${view.value.sizes.welcome}rem`, '--ajl-glad-size': `${view.value.sizes.glad}rem`, '--ajl-lead-size': `${view.value.sizes.lead}rem`, '--ajl-card-size': `${view.value.sizes.cardTitle}rem`,
  '--ajl-background-wash': view.value.backgroundWash / 100, '--ajl-heading-color': view.value.headingColor, '--ajl-primary-color': view.value.primaryColor, '--ajl-secondary-color': view.value.secondaryColor, '--ajl-surface-color': view.value.surfaceColor,
  '--ajl-padding': `${view.value.padding}px`, '--ajl-gap': `${view.value.gap}px`
}));
const footerTrust = computed(() => String(props.config?.locale || props.config?.language || document.documentElement.lang || 'en').startsWith('es') ? ['Su información está segura', 'Protegido por HIPAA', 'Solo toma unos minutos', 'Personas reales. Apoyo real.'] : ['Your Information Is Secure', 'HIPAA Protected', 'Only Takes a Few Minutes', 'Real People. Real Support.']);
function blockStyle(key) {
  const sizes = view.value.sizes; const position = view.value.positions[key] || { x: 0, y: 0 };
  const align = view.value.align[key] || 'left';
  const free = '(100cqw - 100%)';
  const minX = align === 'center' ? 'calc((100% - 100cqw) / 2)' : align === 'right' ? 'calc(100% - 100cqw)' : '0px';
  const maxX = align === 'center' ? `calc(${free} / 2)` : align === 'right' ? '0px' : `calc${free}`;
  const style = { textAlign: align, alignSelf: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', transform: `translate(clamp(${minX}, ${position.x}px, ${maxX}), max(calc(-1 * var(--ajl-padding) / 2), ${position.y}px))` };
  if (['tagline', 'script', 'values'].includes(key)) style.fontSize = `${sizes[key]}rem`;
  const element = elementFor(key);
  if (element?.type === 'image') style.width = `${sizes[element.size]}px`;
  if (key === 'logo') style.width = `${sizes.logoWidth}px`;
  if (key === 'help' && sizes.helpWidth) style.width = `${sizes.helpWidth}px`;
  if (key === 'cards') { style.width = `${sizes.cardsWidth}px`; style.alignSelf = view.value.align.cards === 'center' ? 'center' : view.value.align.cards === 'right' ? 'flex-end' : 'flex-start'; }
  return style;
}
function elementAttrs(key) { return { 'data-design-element': key, ...(props.designMode ? { tabindex: 0, 'aria-label': elementFor(key)?.label } : {}) }; }
function selectFromCanvas(event) {
  if (!props.designMode) return;
  const element = event.target.closest('[data-design-element]');
  if (element) { event.preventDefault(); event.stopPropagation(); emit('select-element', element.dataset.designElement); }
}
function selectWithKeyboard(event) { if (props.designMode && ['Enter', ' '].includes(event.key)) selectFromCanvas(event); }
function continueAction(event, pathway) { if (!props.designMode) emit(event, pathway); }
function resize() { viewportWidth.value = window.innerWidth; }
onMounted(() => window.addEventListener('resize', resize));
onBeforeUnmount(() => window.removeEventListener('resize', resize));
async function closeDesigner() { designerOpen.value = false; await nextTick(); editButton.value?.focus(); }
function onSaved(data) {
  if (props.config) {
    if (data.copy) props.config.copy = data.copy;
    if (data.branding) props.config.branding = data.branding;
    if (data.supportContact) props.config.supportContact = data.supportContact;
    writeJoinLandingCache(props.agencySlug, props.serviceType || props.config.activeService?.serviceType || 'default', props.config);
  }
  emit('tenant-updated', data); savedNotice.value = 'Page saved.';
}
</script>
<style scoped>
.ajl { min-height: 100vh; display: grid; grid-template-columns: clamp(230px, 24vw, 320px) minmax(0, 1fr); grid-template-rows: 1fr auto; position: relative; color: #16324a; font-family: var(--ajl-body-font), sans-serif; overflow-x: clip; }
.ajl *, .ajl *::before, .ajl *::after { box-sizing: border-box; }
.ajl-bg { position: absolute; inset: 0; background-size: cover; background-repeat: no-repeat; background-color: #e9f2ef; z-index: 0; }
.ajl-bg::after { content: ''; position: absolute; inset: 0; background: #fff; opacity: var(--ajl-background-wash); }
.ajl-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.ajl-rail, .ajl-main, .ajl-footer { position: relative; z-index: 1; min-width: 0; }
.ajl-rail { container-type: inline-size; grid-column: 1; grid-row: 1; padding: var(--ajl-padding); display: flex; flex-direction: column; gap: 14px; }
.ajl-main { container-type: inline-size; grid-column: 2; grid-row: 1; padding: var(--ajl-padding); display: flex; flex-direction: column; gap: var(--ajl-gap); }
.ajl-block { position: relative; max-width: 100%; min-width: 0; }
.ajl-block--help { margin-top: auto; }
.ajl-logo { display: block; width: 100%; height: auto; object-fit: contain; }
.ajl-logo-fallback { display: grid; place-items: center; width: 60px; height: 60px; background: #d9e9e5; border-radius: 50%; font-size: 30px; }
.ajl-tagline { margin: 0; font: inherit; font-weight: 700; letter-spacing: .1em; color: #1f6b4a; }
.ajl-script { margin: 0; font-family: var(--ajl-script-font); font-size: inherit; line-height: 1.15; }
.ajl-values { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; font-size: inherit; }
.ajl-values li { display: flex; gap: 10px; align-items: start; }
.ajl-help { border: 1px solid #16324a25; background: #ffffffea; border-radius: 16px; padding: 18px; box-shadow: 0 8px 24px #152d4210; }
.ajl-help h2 { margin: 0 0 6px; font-size: 1.1rem; color: inherit; }
.ajl-help p { margin: 0 0 10px; font-size: .95rem; }
.ajl-help-line { display: block; color: #16324a; margin: 6px 0; font-size: .95rem; overflow-wrap: anywhere; }
.ajl-help-btn, .ajl-edit-btn { border: 0; border-radius: 8px; min-height: 44px; padding: 10px 16px; background: var(--ajl-secondary-color); color: white; cursor: pointer; font-weight: 700; }
.ajl-help-btn { width: 100%; margin-top: 10px; }
.ajl-editbar { display: flex; gap: 14px; align-items: center; }
.ajl-welcome { font-family: var(--ajl-welcome-font); font-size: var(--ajl-welcome-size); line-height: 1.1; margin: 0; color: var(--ajl-heading-color); font-weight: 400; }
.ajl-glad { font-size: var(--ajl-glad-size); margin: 0; font-weight: 700; color: #16324a; }
.ajl-lead { font-size: var(--ajl-lead-size); line-height: 1.6; margin: 0; max-width: 740px; color: #243b36; }
.ajl-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.ajl-card { min-width: 0; display: flex; flex-direction: column; border: 1px solid #16324a22; border-radius: 18px; padding: 26px; background: var(--ajl-surface-color); box-shadow: 0 12px 32px #10231f12; }
.ajl-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
.ajl-card-icon { font-size: 25px; color: #28644b; background: #e5f2e9; width: 46px; height: 46px; display: grid; place-items: center; border-radius: 12px; }
.ajl-card-time { color: #49605f; font-size: .9rem; }
.ajl-card h2 { font-family: var(--ajl-card-font); font-size: var(--ajl-card-size); line-height: 1.25; margin: 0 0 10px; color: #17483d; }
.ajl-card--full h2 { color: #1d4d8c; }
.ajl-card-tag { margin: 0 0 12px; font-weight: 700; }
.ajl-card-desc { margin: 0; line-height: 1.5; color: #49605f; }
.ajl-card ul { padding-left: 20px; line-height: 1.65; margin: 18px 0 24px; }
.ajl-cta { margin-top: auto; border: 0; border-radius: 8px; padding: 13px 18px; min-height: 48px; background: var(--ajl-primary-color); color: white; font: inherit; font-weight: 700; cursor: pointer; }
.ajl-card--full .ajl-cta { background: var(--ajl-secondary-color); }
.ajl-cta:disabled { background: #526574; cursor: default; }
.ajl-card-foot { margin: 12px 0 0; font-size: .85rem; color: #49605f; line-height: 1.4; }
.ajl-footer { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 16px 32px; justify-content: center; padding: 20px; background: #ffffffd9; font-size: .85rem; }
.ajl--footer-dark .ajl-footer { background: #16324a; color: white; }
.ajl--footer-white .ajl-footer { background: white; }
.ajl--footer-clear .ajl-footer { background: transparent; }
.ajl--footer-frost .ajl-footer { backdrop-filter: blur(10px); }
.ajl p, .ajl h1, .ajl h2, .ajl li, .ajl button { overflow-wrap: anywhere; }
.ajl :is(button, a, [tabindex]):focus-visible { outline: 3px solid #2867d7; outline-offset: 4px; }
.ajl--design [data-design-element] { cursor: pointer; min-height: 24px; }
.ajl--design [data-design-element]:hover { outline: 1px dashed #2867d7; outline-offset: 3px; }
.ajl--design .ajl-block--selected { outline: 3px solid #2867d7; outline-offset: 4px; }
@media (max-width: 1100px) { .ajl-cards { grid-template-columns: 1fr; } }
@media (max-width: 860px) {
  .ajl { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto; }
  .ajl-main { container-type: inline-size; grid-column: 1; grid-row: 1; }
  .ajl-rail { container-type: inline-size; grid-column: 1; grid-row: 2; }
  .ajl--rail-first .ajl-rail { grid-row: 1; }
  .ajl--rail-first .ajl-main { grid-row: 2; }
  .ajl-block--help { margin-top: 10px; }
  .ajl-card { padding: 22px; }
}
</style>
