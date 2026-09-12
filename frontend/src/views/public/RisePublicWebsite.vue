<template>
  <div class="rise-site">
    <a class="rise-skip" href="#rise-main">Skip to content</a>
    <header class="rise-header" @keydown.esc="closeMenu">
      <RiseBrand :logo="logo" />
      <button ref="menuButton" type="button" class="rise-menu-button" :aria-expanded="menuOpen" aria-controls="rise-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Close' : 'Menu' }} <span aria-hidden="true">{{ menuOpen ? '×' : '☰' }}</span></button>
      <nav id="rise-navigation" :class="{ 'is-open': menuOpen }" aria-label="Primary">
        <router-link v-for="[label, slug] in riseNav" :key="slug" :to="path(slug)" :aria-current="section === slug ? 'page' : undefined" @click="menuOpen = false">{{ label }}</router-link>
      </nav>
      <router-link class="rise-button rise-header-cta" to="/p/rise/join">Get started <RiseIcon name="arrow" /></router-link>
    </header>

    <main id="rise-main" tabindex="-1">
      <div v-if="loading" class="rise-state" role="status">Loading Rise Revive…</div>
      <div v-else-if="error" class="rise-state">
        <p class="rise-eyebrow">Rise Revive</p><h1>{{ notFound ? 'This page isn’t available.' : 'We couldn’t load the website.' }}</h1>
        <p role="alert">{{ error }}</p><button class="rise-button" type="button" @click="load">Try again</button>
      </div>
      <div v-else-if="!knownSection" class="rise-state"><h1>Page not found</h1><router-link class="rise-button" to="/p/rise">Return home</router-link></div>
      <template v-else>
        <section class="rise-hero" :class="[`rise-hero-${section || 'home'}`, { 'rise-hero-mobile-custom': mobileHero }]" :style="heroStyle">
          <div class="rise-wrap rise-hero-inner">
            <div class="rise-hero-copy">
              <p class="rise-eyebrow">{{ hero.eyebrow }}</p><h1>{{ hero.title }}</h1><p class="rise-intro">{{ hero.body }}</p>
              <div class="rise-actions">
                <a v-if="section === 'join'" href="#rise-paths" class="rise-button">Find your next step <RiseIcon name="arrow" /></a>
                <router-link v-else class="rise-button" to="/p/rise/join">Get started <RiseIcon name="arrow" /></router-link>
                <a v-if="section === 'approach'" class="rise-button rise-button-outline" href="#our-process">Learn more</a>
                <router-link v-else-if="section === 'join'" class="rise-button rise-button-outline" to="/p/rise/services">Explore services</router-link>
                <router-link v-else-if="section === 'about'" class="rise-button rise-button-outline" to="/p/rise/approach">Our approach</router-link>
                <router-link v-else class="rise-button rise-button-outline" to="/p/rise/about">Meet Rise Revive</router-link>
              </div>
            </div>
            <p v-if="hero.note" class="rise-handwritten">{{ hero.note }}</p>
          </div>
        </section>

        <section v-if="!section || section === 'approach'" class="rise-value-band" aria-label="Our care philosophy">
          <div class="rise-wrap rise-four">
            <article v-for="[icon, title, body] in section === 'approach' ? risePrinciples : riseValues" :key="title"><RiseIcon :name="icon" /><h2>{{ title }}</h2><p>{{ body }}</p></article>
          </div>
        </section>

        <section v-if="!section || section === 'services'" class="rise-section">
          <div class="rise-wrap">
            <div class="rise-heading-row"><div><p class="rise-eyebrow">Our services</p><h2>Support for a Stronger Tomorrow</h2></div><router-link v-if="!section" class="rise-text-link" to="/p/rise/services">View all services <RiseIcon name="arrow" /></router-link></div>
            <div class="rise-service-grid">
              <router-link v-for="service in riseServices" :key="service.id" :to="`${path('services')}#${service.id}`" class="rise-photo-card"><img :src="riseAssets + service.image" :alt="service.alt" width="1448" height="1086" loading="lazy" /><div><h3>{{ service.title }}</h3><p>{{ service.body }}</p><span aria-hidden="true">↗</span></div></router-link>
            </div>
          </div>
        </section>

        <section v-if="!section" class="rise-section rise-home-story">
          <div class="rise-wrap rise-story-grid">
            <div><p class="rise-eyebrow">Our approach</p><h2>A Higher Standard<br />of Care</h2><span class="rise-rule" /><p>Real conversations, practical support, and a welcoming space. Our approach centers on the person you are and the life you want to build.</p><router-link class="rise-button rise-button-outline" to="/p/rise/approach">Our approach</router-link></div>
            <figure class="rise-landscape"><img :src="riseAssets + 'forest-banner.webp'" alt="Sunrise over a peaceful mountain lake" width="1672" height="941" loading="lazy" /><figcaption>Healing. Growth.<br />A brighter tomorrow,<br />together.</figcaption></figure>
            <aside class="rise-side-note"><RiseIcon name="leaf" /><p class="rise-eyebrow">Space to be yourself</p><h3>Your story.<br />Your pace.<br />Your next chapter.</h3><p>Different journeys. A shared possibility for growth.</p><router-link class="rise-text-link" to="/p/rise/about">Get to know us →</router-link></aside>
          </div>
        </section>

        <template v-if="section === 'about'">
          <section class="rise-section"><div class="rise-wrap rise-two rise-story">
            <div><p class="rise-eyebrow">Our story</p><h2>Rooted in a Bigger Purpose</h2><p>Rise Revive starts with a simple belief: people are capable of more than they often realize. Life can be challenging, and the right support can make room for healing and growth.</p><p>We’re creating a welcoming space where people can be heard, explore their strengths, and move toward what matters to them.</p><p>Whether you’re navigating a difficult season, seeking greater clarity, or investing in your personal growth, there is room for your story here.</p><p class="rise-editorial">Different journeys. A common goal — a healthier, more meaningful life.</p></div>
            <img class="rise-story-image rise-signpost" :src="riseAssets + 'signpost.webp'" alt="A mountain trail sign pointing toward heal, grow, discover, and belong" width="1122" height="1402" loading="lazy" />
          </div></section>
          <section class="rise-value-band"><div class="rise-wrap rise-four"><article v-for="[icon, title, body] in audiences" :key="title"><RiseIcon :name="icon" /><h2>{{ title }}</h2><p>{{ body }}</p></article></div></section>
          <section class="rise-section"><div class="rise-wrap rise-two rise-mission"><figure class="rise-landscape"><img :src="riseAssets + 'approach-hero.webp'" alt="A hiker reflecting beside a mountain lake" width="1672" height="941" loading="lazy" /><figcaption>Healing.<br />Growth. Purpose.<br />Belonging.</figcaption></figure><div><p class="rise-eyebrow">Our mission</p><h2>To Help People Rise in Strength, Revive in Purpose, and Thrive Every Day.</h2><span class="rise-rule" /><p>Personalized support, authentic connection, and a belief in the potential within every person.</p><p class="rise-eyebrow">Our values</p><div class="rise-mini-grid"><article v-for="[icon, title, body] in missionValues" :key="title"><RiseIcon :name="icon" /><h3>{{ title }}</h3><p>{{ body }}</p></article></div></div></div></section>
        </template>

        <template v-if="section === 'approach'">
          <section id="our-process" class="rise-section"><div class="rise-wrap"><p class="rise-eyebrow">A path shaped around you</p><h2>A Thoughtful, Step-by-Step Process</h2><p class="rise-section-intro">Every journey is unique. Our process makes room for your goals, questions, and pace.</p><div class="rise-process-layout"><ol class="rise-process"><li v-for="([icon, title, body], index) in riseSteps" :key="title"><span class="rise-step-number">{{ index + 1 }}</span><RiseIcon :name="icon" /><h3>{{ title }}</h3><p>{{ body }}</p></li></ol><aside class="rise-side-note"><span class="rise-quote-mark" aria-hidden="true">“</span><p class="rise-editorial">Change can begin with one conversation, one step, one choice at a time.</p><p>We make space for the process.</p></aside></div></div></section>
          <section class="rise-section rise-guided"><div class="rise-wrap rise-two"><img class="rise-story-image rise-signpost" :src="riseAssets + 'signpost.webp'" alt="Wooden signs along a mountain trail" width="1122" height="1402" loading="lazy" /><div><p class="rise-eyebrow">Guided by what matters</p><h2>Real Conversations.<br />Practical Support.</h2><p>Our approach is rooted in compassion, curiosity, and a belief in your potential. Your perspective helps shape the work we do together.</p><div class="rise-tools"><div v-for="[icon, text] in tools" :key="text"><RiseIcon :name="icon" /><span>{{ text }}</span></div></div></div></div></section>
        </template>

        <section v-if="section === 'services'" class="rise-section rise-soft"><div class="rise-wrap rise-service-details"><article v-for="service in riseServices" :id="service.id" :key="service.id"><RiseIcon :name="service.id === 'virtual-sessions' ? 'screen' : 'leaf'" /><div><h2>{{ service.title }}</h2><p>{{ service.detail }}</p><router-link class="rise-text-link" to="/p/rise/join">Explore your next step →</router-link></div></article></div></section>

        <section v-if="section === 'resources'" class="rise-section"><div class="rise-wrap">
          <div class="rise-heading-row"><div><p class="rise-eyebrow">A little preparation. A clearer start.</p><h2>Make Space for Your Next Step</h2></div><label class="rise-search">Find a guide<input v-model="resourceSearch" type="search" placeholder="Search resources" /></label></div>
          <div class="rise-resource-grid"><article v-for="resource in filteredResources" :id="resource.id" :key="resource.id" class="rise-resource"><img :src="riseAssets + resource.image" alt="" width="1448" height="1086" loading="lazy" /><div><p class="rise-eyebrow">{{ resource.category }}</p><h3>{{ resource.title }}</h3><p>{{ resource.intro }}</p><details><summary>Read the guide <span aria-hidden="true">+</span></summary><ul><li v-for="item in resource.items" :key="item">{{ item }}</li></ul></details></div></article></div>
          <p v-if="!filteredResources.length" role="status" class="rise-empty">No guides match “{{ resourceSearch }}”. <button type="button" @click="resourceSearch = ''">Clear search</button></p>
        </div></section>

        <section v-if="section === 'join'" id="rise-paths" class="rise-section"><div class="rise-wrap">
          <div class="rise-centered"><p class="rise-eyebrow">Be part of something meaningful</p><h2>Find Your Starting Point</h2><p>A place for clients, care professionals, and community partners.</p></div>
          <div class="rise-join-grid"><article v-for="choice in joinChoices" :key="choice.id" class="rise-join-card"><RiseIcon :name="choice.icon" /><h3>{{ choice.title }}</h3><p>{{ choice.body }}</p><a v-if="choice.href" class="rise-button" :href="choice.href" @click="guardPreview">{{ choice.label }} <RiseIcon name="arrow" /></a><div v-else class="rise-availability"><span class="rise-status-dot" />{{ choice.pending }}</div></article></div>
          <div v-if="!connections.enrollmentUrl" class="rise-opening" role="status"><RiseIcon name="calendar" /><div><h3>Enrollment opening soon</h3><p>{{ connections.openingMessage }}</p></div></div>
          <div v-else class="rise-opening"><RiseIcon name="shield" /><div><h3>Your first step starts here</h3><p>Continue to enrollment to share your information. Completing enrollment does not confirm an appointment; scheduling follows the team’s review.</p></div></div>
          <p v-if="previewNotice" role="status" class="rise-opening">{{ previewNotice }}</p>
        </div></section>

        <section v-if="section === 'contact'" class="rise-section"><div class="rise-wrap rise-contact-grid"><div><p class="rise-eyebrow">We’re here for your next chapter</p><h2>Connect with Us</h2><p>Use an available contact option below or visit the getting-started page for enrollment updates.</p>
          <div class="rise-contact-options"><a v-if="connections.contactUrl" class="rise-button" :href="connections.contactUrl" @click="guardPreview">Contact the team <RiseIcon name="arrow" /></a><a v-if="connections.emailHref" :href="connections.emailHref"><RiseIcon name="mail" />{{ connections.contactEmail }}</a><a v-if="connections.phoneHref" :href="connections.phoneHref"><RiseIcon name="chat" />{{ connections.contactPhone }}</a><p v-if="connections.contactAddress"><RiseIcon name="pin" />{{ connections.contactAddress }}</p></div>
          <div v-if="!hasContact" class="rise-opening"><p>Our contact options will be published here as we prepare to open.</p></div><router-link class="rise-text-link" to="/p/rise/join">View enrollment information →</router-link><p v-if="previewNotice" role="status">{{ previewNotice }}</p></div><img class="rise-story-image" :src="riseAssets + 'in-person.webp'" alt="A welcoming path through a sunlit forest" width="1448" height="1086" loading="lazy" /></div></section>

        <section v-if="['services', 'join', 'contact'].includes(section)" class="rise-section rise-soft"><div class="rise-wrap rise-faq-layout"><div><p class="rise-eyebrow">A clearer beginning</p><h2>A Few Common Questions</h2><p>Start with the information you need to feel prepared.</p></div><div class="rise-faq"><details v-for="[question, answer] in faqs" :key="question"><summary>{{ question }} <span aria-hidden="true">+</span></summary><p>{{ answer }}</p></details></div></div></section>

        <section class="rise-final" :style="finalStyle"><div class="rise-wrap"><p class="rise-eyebrow">Ready to take the next step?</p><h2>{{ section === 'about' ? 'Be Part of Something Meaningful' : 'Let’s Take the Next Step Together.' }}</h2><p>A healthier, more purposeful chapter starts with a little possibility.</p><div class="rise-actions"><router-link class="rise-button rise-button-light" to="/p/rise/join">Join us <RiseIcon name="arrow" /></router-link><router-link class="rise-button rise-button-white-outline" to="/p/rise/contact">Connect with us</router-link></div><div class="rise-final-values"><span><RiseIcon name="leaf" />Your goals</span><span><RiseIcon name="calendar" />Your pace</span><span><RiseIcon name="pin" />Your next chapter</span><span><RiseIcon name="screen" />In-person & virtual options</span></div></div></section>
      </template>
    </main>
    <footer class="rise-footer"><div class="rise-wrap"><div class="rise-footer-top"><RiseBrand :logo="logo" /><nav aria-label="Footer"><router-link v-for="[label, slug] in riseNav" :key="slug" :to="path(slug)">{{ label }}</router-link></nav></div><div class="rise-footer-bottom"><small>© {{ new Date().getFullYear() }} Rise Revive Counseling and Coaching.</small><small>A stronger you starts here.</small></div></div></footer>
    <aside v-if="page && !error && knownSection" class="rise-help">
      <section v-if="helpOpen" id="rise-help-panel" aria-labelledby="rise-help-title"><button type="button" class="rise-help-close" aria-label="Close help" @click="closeHelp">×</button><RiseIcon name="chat" /><h2 id="rise-help-title">A little help getting started</h2><p>Find enrollment information, explore our approach, or see the available ways to reach our team.</p><router-link to="/p/rise/join" @click="helpOpen = false">Getting started →</router-link><router-link to="/p/rise/contact" @click="helpOpen = false">Contact options →</router-link></section>
      <button ref="helpButton" class="rise-help-toggle" type="button" :aria-expanded="helpOpen" aria-controls="rise-help-panel" aria-label="Website help" @click="helpOpen = !helpOpen" @keydown.esc="closeHelp"><RiseIcon name="chat" /></button>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import RiseBrand from '../../components/rise/RiseBrand.vue';
import RiseIcon from '../../components/rise/RiseIcon.vue';
import { riseAssets, riseNav, riseHeroes, riseServices, riseValues, risePrinciples, riseSteps, riseResources, riseImage, resolveRiseConnections } from '../../constants/riseWebsite';

const route = useRoute();
const page = ref(null), loading = ref(true), error = ref(''), notFound = ref(false);
const menuOpen = ref(false), helpOpen = ref(false), menuButton = ref(null), helpButton = ref(null);
const resourceSearch = ref(''), previewNotice = ref('');
const section = computed(() => String(route.params.section || ''));
const knownSection = computed(() => Object.hasOwn(riseHeroes, section.value));
const path = slug => `/p/rise${slug ? `/${slug}` : ''}`;
const logo = computed(() => riseImage(page.value?.branding?.logoUrl));
const connections = computed(() => resolveRiseConnections(page.value?.branding));
const hasContact = computed(() => connections.value.contactUrl || connections.value.emailHref || connections.value.phoneHref || connections.value.contactAddress);
const hero = computed(() => {
  const base = riseHeroes[section.value] || riseHeroes[''];
  const custom = section.value ? page.value?.branding?.contentPages?.find(p => p.slug === section.value) : page.value;
  return { ...base, title: custom?.heroTitle || base.title, body: custom?.heroSubtitle || base.body, image: riseImage(custom?.heroImageUrl) || riseAssets + base.image };
});
const mobileHero = computed(() => !section.value && riseImage(connections.value.homeMobileImageUrl));
const heroStyle = computed(() => ({ '--rise-hero': `url(${JSON.stringify(hero.value.image)})`, ...(mobileHero.value ? { '--rise-mobile-hero': `url(${JSON.stringify(mobileHero.value)})` } : {}) }));
const finalStyle = computed(() => ({ '--rise-banner': `url(${JSON.stringify(riseImage(connections.value.ctaImageUrl) || riseAssets + 'forest-banner.webp')})` }));
const filteredResources = computed(() => {
  const query = resourceSearch.value.trim().toLowerCase();
  return riseResources.filter(item => `${item.title} ${item.category} ${item.intro} ${item.items.join(' ')}`.toLowerCase().includes(query));
});
const joinChoices = computed(() => [
  { id: 'client', icon: 'leaf', title: 'I’m Looking for Support', body: 'Explore counseling and coaching, share your needs, and take the first step toward care.', href: connections.value.enrollmentUrl, label: 'Begin enrollment', pending: 'Enrollment opening soon' },
  { id: 'provider', icon: 'people', title: 'I’d Like to Join the Team', body: 'Bring your experience and care to a community focused on helping people grow.', href: connections.value.careersUrl, label: 'Explore opportunities', pending: 'Opportunities will be posted here' },
  { id: 'partner', icon: 'heart', title: 'I’m a Community Partner', body: 'Explore ways to connect your community with support and build meaningful relationships.', href: connections.value.partnerUrl, label: 'Connect about partnership', pending: 'Partnership information opening soon' }
]);
const audiences = [['people', 'Individuals', 'Your story, strengths, and next chapter.'], ['heart', 'Relationships', 'Connection and the people who matter to you.'], ['people', 'Families', 'Room for the relationships that shape your life.'], ['mountain', 'Growth & Performance', 'Purpose, resilience, and balance.']];
const missionValues = [['leaf', 'People First', 'You are a person, first.'], ['shield', 'Authentic Care', 'Real conversations. Real support.'], ['mountain', 'Growth Mindset', 'Progress over perfection.'], ['people', 'Inclusive & Welcoming', 'All backgrounds. All stories.']];
const tools = [['chat', 'Authentic conversations'], ['target', 'Practical tools & skills'], ['leaf', 'A focus on your strengths'], ['screen', 'In-person & virtual options'], ['heart', 'Support through transitions'], ['people', 'Inclusive, welcoming care']];
const faqs = computed(() => [
  ['How do I get started?', connections.value.enrollmentUrl ? 'Choose Begin enrollment on the Join Us page. The team will review your information and confirm the next steps with you.' : connections.value.openingMessage],
  ['Does enrollment book an appointment?', 'No. Enrollment starts the process. The team will confirm the service, provider, availability, and appointment details with you.'],
  ['Can I ask about costs before starting?', 'Yes. Ask the team about fees, payment options, and any insurance questions before agreeing to services. The public website does not verify coverage or quote a personal balance.'],
  ['How do I choose in-person or virtual support?', 'Discuss your preference with the team. Options depend on your needs, location, provider availability, and the service you choose.']
]);
const previewMode = window.parent !== window && route.query.marketingPreview === '1';
function guardPreview(event) { if (previewMode) { event.preventDefault(); previewNotice.value = 'This is an editor preview. Open the published site to continue.'; } }
function closeMenu() { menuOpen.value = false; menuButton.value?.focus(); }
function closeHelp() { helpOpen.value = false; helpButton.value?.focus(); }
function keydown(event) { if (event.key === 'Escape' && helpOpen.value) closeHelp(); }
let loadVersion = 0;
async function load() {
  const version = ++loadVersion;
  loading.value = true; error.value = ''; notFound.value = false;
  try {
    const { data } = await api.get('/public/marketing-pages/rise', { skipAuthRedirect: true, skipGlobalLoading: true });
    if (version !== loadVersion) return;
    if (!data?.page || data.page.slug !== 'rise') throw new Error('Invalid page response');
    page.value = data.page;
  } catch (e) {
    if (version !== loadVersion) return;
    notFound.value = e.response?.status === 404;
    error.value = notFound.value ? 'The website may not be published yet. Please check back soon.' : 'Please try again in a moment.';
  } finally { if (version === loadVersion) loading.value = false; }
}
function receivePreview(event) {
  if (!previewMode || event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== 'marketing-preview' || event.data.page?.slug !== 'rise') return;
  loadVersion++; page.value = event.data.page; loading.value = false; error.value = '';
}
watch(section, async () => {
  menuOpen.value = false; helpOpen.value = false; previewNotice.value = '';
  document.title = `${riseNav.find(([, slug]) => slug === section.value)?.[0] || 'Page not found'} | Rise Revive`;
  await nextTick();
}, { immediate: true });
onMounted(() => {
  window.addEventListener('message', receivePreview); window.addEventListener('keydown', keydown);
  if (previewMode) window.parent.postMessage({ type: 'marketing-preview-ready' }, window.location.origin);
  else load();
});
onUnmounted(() => { loadVersion++; window.removeEventListener('message', receivePreview); window.removeEventListener('keydown', keydown); });
</script>
<style src="../../styles/riseWebsite.css"></style>
