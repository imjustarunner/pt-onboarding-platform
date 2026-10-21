<template>
  <div class="ptco-site">
    <a class="ptco-skip" href="#ptco-main">Skip to content</a>
    <header class="ptco-header" @keydown.esc="menuOpen=false"><router-link class="ptco-brand" to="/p/ptco"><img :src="logo" alt=""><span>Plot Twist Co.<small>Businesses for a brighter tomorrow</small></span></router-link>
      <button class="ptco-menu" type="button" :aria-expanded="menuOpen" aria-controls="ptco-nav" @click="menuOpen=!menuOpen">Menu <span aria-hidden="true">☰</span></button>
      <nav id="ptco-nav" class="ptco-nav-plotline" :class="{'is-open':menuOpen}" aria-label="Primary" @keydown.esc="menuOpen=false"><router-link v-for="[label,slug] in ptcoNav.filter(item => item[1] !== 'resources')" :key="slug" :to="`/p/ptco${slug?'/'+slug:''}`" :aria-current="section===slug?'page':undefined" @click="menuOpen=false">{{ label }}</router-link><a :href="PLOTLINE_WEBSITE_URL">Plotline</a><PublicWebsiteProviderLinks :directories="page?.providerDirectories || []" hub-slug="ptco" /><PublicResourcesMenu resources-path="/p/ptco/resources" /></nav>
      <a class="ptco-button ptco-button-outline ptco-header-portal" :href="portalLoginUrl">Portal Login</a>
      <router-link class="ptco-button ptco-header-cta" to="/p/ptco/start">Let’s talk <PtcoIcon name="arrow"/></router-link>
    </header>
    <main id="ptco-main" tabindex="-1">
      <div v-if="loading" class="ptco-loading" role="status">Loading Plot Twist Co.…</div>
      <div v-else-if="error" class="ptco-loading"><h1>We couldn’t load this page.</h1><p role="alert">{{ error }}</p><button class="ptco-button" @click="load">Try again</button></div>
      <div v-else-if="!knownSection" class="ptco-loading"><h1>Page not found</h1><router-link to="/p/ptco">Return to Plot Twist Co.</router-link></div>
      <template v-else>
        <section v-if="serviceLanding || activeService" class="ptco-service-hero" :class="{'ptco-service-hero-detail': activeService}">
          <div class="ptco-wrap">
            <router-link v-if="activeService" class="ptco-breadcrumb" to="/p/ptco/services">← All services</router-link>
            <div class="ptco-service-hero-copy"><p class="ptco-eyebrow">{{ serviceHero.kicker }}</p><h1>{{ serviceHero.title }} <em v-if="serviceHero.accent">{{ serviceHero.accent }}</em></h1><p>{{ serviceHero.body }}</p>
              <div class="ptco-actions"><router-link class="ptco-button" :to="serviceHero.primary.to">{{ serviceHero.primary.label }} <PtcoIcon name="arrow"/></router-link><router-link class="ptco-button ptco-button-light" :to="serviceHero.secondary.to">{{ serviceHero.secondary.label }}</router-link></div>
            </div>
            <div v-if="serviceLanding" class="ptco-service-promises"><span><PtcoIcon name="settings"/>One partner.<br>Connected support.</span><span><PtcoIcon name="chart"/>From a single service<br>to a complete plan.</span><span><PtcoIcon name="heart"/>Built around<br>your mission.</span></div>
          </div>
        </section>
        <section v-else-if="section !== 'conversa'" class="ptco-hero" :class="`ptco-hero-${section||'home'}`" :style="{'--ptco-hero':`url(${JSON.stringify(hero.image)})`}">
          <div class="ptco-wrap"><div class="ptco-hero-copy"><p class="ptco-eyebrow">{{ hero.kicker }}</p><h1>{{ hero.title }} <em>{{ hero.accent }}</em></h1><p class="ptco-hero-intro">{{ hero.body }}</p><p v-if="hero.note" class="ptco-hero-note">{{ hero.note }}</p><div class="ptco-actions"><router-link class="ptco-button" :to="!section?'/p/ptco/hq':section==='start'?'#business-intake':'/p/ptco/start'" @click="section==='start'&&scrollToIntake($event)">{{ !section?'Explore Plot Twist HQ':section==='start'?'Begin intake':section==='about'?'Partner with us':'Get started' }} <PtcoIcon name="arrow"/></router-link><router-link v-if="section!== 'start'" class="ptco-button ptco-button-outline" :to="!section?'/p/ptco/start':section==='about'?'/p/ptco/about#partnership':section==='hq'?'/p/ptco/hq#hq-walkthrough':'/p/ptco/hq'">{{ !section?'Let’s talk':section==='about'?'See our model':section==='hq'?'See the walkthrough':'Explore Plot Twist HQ' }}</router-link></div>
          <div class="ptco-hero-values"><span><PtcoIcon name="people"/>Expert support<br>from setup to scale</span><span><PtcoIcon name="heart"/>A healthier tomorrow<br>for your business</span><span><PtcoIcon name="chart"/>People. Operations.<br>Possibility.</span></div></div></div>
          <small v-if="!section||section==='hq'" class="ptco-preview-label">Illustrative platform preview</small>
        </section>

        <PtcoProducts v-if="section==='products'" />

        <PtcoServiceCatalog v-if="serviceLanding" />
        <PtcoServiceDetail v-if="activeService" :key="activeService.id" :service="activeService" />
        <section v-if="serviceLanding" class="ptco-who-strip"><div class="ptco-wrap"><div><p class="ptco-eyebrow">Who we serve</p><h2>Built for organizations like yours</h2><p>Mental health practices, school-based providers, nonprofits, and mission-driven service organizations.</p></div><router-link class="ptco-button ptco-button-outline" to="/p/ptco/industries">Who we serve <PtcoIcon name="arrow"/></router-link></div></section>

        <template v-if="section==='about'">
          <section class="ptco-band"><div class="ptco-wrap"><div class="ptco-centered"><p class="ptco-eyebrow">A better way for service-based businesses</p><h2>Why Plot Twist Co. exists</h2><p>Your mission deserves support that strengthens what makes your business unique.</p></div><div class="ptco-three"><article v-for="item in principles" :key="item.title" class="ptco-card ptco-horizontal"><PtcoIcon :name="item.icon"/><div><h3>{{ item.title }}</h3><p>{{ item.body }}</p></div></article></div></div></section>
          <section id="partnership" class="ptco-band ptco-soft"><div class="ptco-wrap ptco-model"><div><p class="ptco-eyebrow">Aligned incentives. Real growth.</p><h2>How our partnership model works</h2><p>We start with your goals, agree on the support you need, and build a plan for working together. Scope, responsibilities, and pricing are discussed before a partnership begins.</p><router-link class="ptco-button" to="/p/ptco/start">Let’s discuss your business →</router-link></div><div><div class="ptco-four"><article v-for="[icon,title] in [['chart','Your growth guides the work.'],['people','Your team stays at the center.'],['settings','Systems support your purpose.'],['heart','Your ownership model is explicit.']]" :key="title"><PtcoIcon :name="icon"/><h3>{{ title }}</h3></article></div><div class="ptco-model-flow"><span>Your vision</span><b>→</b><span>Our shared plan</span><b>→</b><span>A stronger business</span></div></div></div></section>
          <section class="ptco-band"><div class="ptco-wrap ptco-model"><div><p class="ptco-eyebrow">Smarter systems. Stronger businesses.</p><h2>Thoughtful technology.<br>Human partnership.</h2><p>Use automation and AI where they help reduce repetitive work. Keep people responsible for the decisions that affect your business and clients.</p></div><div><h3 class="ptco-editorial">AI where it helps. Human partnership where it matters most.</h3><div class="ptco-services"><router-link v-for="s in ptcoFeaturedServices" :key="s.id" class="ptco-card" :to="ptcoServicePath(s.id)"><PtcoIcon :name="s.icon"/><h3>{{ s.title }}</h3></router-link></div></div></div></section>
        </template>

        <PtcoConversaProduct v-if="section === 'conversa'" />
        <PtcoProducts v-if="section==='about'" />
        <ConversaFeature v-if="section === 'products'" product="ptco" />
        <PtcoDivisions v-if="section==='about'" detailed />
        <PtcoPartnerships v-if="['about','industries'].includes(section)" />
        <PtcoConsultants v-if="section==='about'" />


        <section v-if="section==='hq'" id="hq-walkthrough" class="ptco-band"><div class="ptco-wrap"><div class="ptco-centered"><p class="ptco-eyebrow">Explore your next workspace</p><h2>Connected work. A clearer picture.</h2><p>Explore the workflows available in Plot Twist HQ. Your setup depends on your services and enabled features.</p></div><div class="ptco-product"><div class="ptco-product-nav" role="group" aria-label="Explore platform areas"><button v-for="feature in ptcoHqFeatures" :key="feature.id" :aria-pressed="activeFeature===feature.id" @click="activeFeature=feature.id"><PtcoIcon :name="feature.icon"/>{{ feature.title }}</button></div><article class="ptco-product-panel" aria-live="polite"><p class="ptco-eyebrow">Workflow walkthrough</p><h2>{{ feature.title }}</h2><p>{{ feature.body }}</p><ol class="ptco-workflow"><li v-for="(step,i) in feature.steps" :key="step"><span>{{ i+1 }}</span>{{ step }}</li></ol><ul class="ptco-checklist"><li v-for="bullet in feature.bullets" :key="bullet"><PtcoIcon name="check"/>{{ bullet }}</li></ul><router-link class="ptco-button" to="/p/ptco/start?path=hq">Request your workspace →</router-link></article></div><div class="ptco-three ptco-product-notes"><article><PtcoIcon name="people"/><h3>Your company has its own workspace</h3><p>Company identity, team access, and service settings belong to the tenant.</p></article><article><PtcoIcon name="shield"/><h3>Access follows responsibility</h3><p>Client, guardian, staff, and administrator experiences are shaped by assigned permissions.</p></article><article><PtcoIcon name="settings"/><h3>Schools are affiliations</h3><p>Connect schools and programs to the company that serves them, with explicit access.</p></article></div><p class="ptco-small">This walkthrough explains workflows; it does not connect to client records or display live business metrics.</p></div></section>

        <PtcoPlatformShowcase v-if="section==='hq'" />
        <section v-if="!section" class="ptco-band ptco-soft"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">See the connected workflow</p><h2>From finding care<br>to following through.</h2></div><p>Explore real app components and fictional examples, from provider availability and Note Workspace to office check-in and arrival notifications.</p></div><div class="ptco-three ptco-showcase-links"><router-link class="ptco-card" to="/p/ptco/hq#provider-example"><PtcoIcon name="people"/><h3>Meet a provider. Find a time.</h3><p>Profiles, published openings, the real calendar and scheduling screens.</p><span>Try the examples →</span></router-link><router-link class="ptco-card" to="/p/ptco/hq#kiosk"><PtcoIcon name="calendar"/><h3>A connected arrival.</h3><p>Try the kiosk, then see app and email alerts plus the provider SMS preview.</p><span>Explore check-in →</span></router-link><router-link class="ptco-card" to="/p/ptco/hq#compare"><PtcoIcon name="document"/><h3>Compare clinical workflows.</h3><p>Plot Twist HQ, TherapyNotes and SimplePractice, with official sources.</p><span>See the comparison →</span></router-link></div></div></section>

        <section v-if="['about','industries'].includes(section)" class="ptco-band ptco-soft"><div class="ptco-wrap"><div class="ptco-section-heading"><div><p class="ptco-eyebrow">Industries we serve</p><h2>Different businesses. A shared purpose.</h2></div><p>We support purpose-driven professionals and organizations making a difference in their communities.</p></div><div class="ptco-industries" :class="{'ptco-industries-expanded':section==='industries'}"><router-link v-for="item in ptcoIndustries" :key="item.id" :to="`/p/ptco/start?industry=${item.id}`"><div class="ptco-industry-photo"><img :src="item.image" :alt="`${item.title} collaborating in a workspace`" loading="lazy" width="1536" height="1024"><h3>{{ item.title }}</h3></div><p v-if="section==='industries'">{{ item.body }}</p></router-link></div></div></section>

        <section v-if="section==='resources'" class="ptco-band"><div class="ptco-wrap"><div class="ptco-centered"><p class="ptco-eyebrow">A useful place to start</p><h2>Clarity for your next step</h2><p>Practical guides to prepare for a conversation about your business.</p></div><div class="ptco-three"><article v-for="resource in ptcoResources" :id="resource.id" :key="resource.id" class="ptco-card ptco-resource"><PtcoIcon name="document"/><h2>{{ resource.title }}</h2><p>{{ resource.intro }}</p><ol><li v-for="item in resource.items" :key="item">{{ item }}</li></ol><router-link class="ptco-text-link" to="/p/ptco/start">Talk through your next steps →</router-link></article></div></div></section>

        <template v-if="section==='start'">
          <section class="ptco-band"><div class="ptco-wrap"><div class="ptco-centered"><p class="ptco-eyebrow">Find the right starting point</p><h2>Choose your path</h2><p>Every business is different. Tell us what you need, and we’ll help you take the next step.</p></div><div class="ptco-four ptco-paths"><button v-for="path in ptcoPaths" :key="path.id" class="ptco-card" :aria-pressed="selectedPath===path.id" @click="choosePath(path.id)"><PtcoIcon :name="path.icon"/><h3>{{ path.title }}</h3><p>{{ path.body }}</p><span class="ptco-path-select">{{ selectedPath===path.id?'Selected':'Select →' }}</span></button></div></div></section>
          <div class="ptco-wrap"><PtcoBusinessIntake :preview="previewMode" :path="selectedPath" :industry="String(route.query.industry||'')" :service="String(route.query.service||'')"/></div>
          <section class="ptco-band"><div class="ptco-wrap"><p class="ptco-eyebrow">Common questions</p><h2>You have questions. We have answers.</h2><p><router-link to="/p/ptco/hq#faq">Explore the platform FAQs →</router-link></p><div class="ptco-three ptco-faq"><details v-for="[q,a] in faqs" :key="q"><summary>{{ q }}</summary><p>{{ a }}</p></details></div></div></section>
        </template>

        <PtcoPlatformShowcase v-if="!section || section==='contact'" faq-only :compact="!section" />
        <section v-if="!section" class="ptco-band"><div class="ptco-wrap ptco-values"><div><p class="ptco-eyebrow">More than a service</p><h2>A true partnership.</h2></div><article v-for="[icon,title,body] in values" :key="title"><PtcoIcon :name="icon"/><h3>{{ title }}</h3><p>{{ body }}</p></article></div></section>
<PublicWebsiteContactForm v-if="section==='contact'" agency-slug="ptco" />
        <section v-if="section !== 'conversa'" class="ptco-final"><div class="ptco-wrap"><div><p class="ptco-eyebrow">Your next chapter starts here.</p><h2>Let’s build a brighter tomorrow — together.</h2><p>Get support, useful tools, and a partner who understands your purpose.</p></div><router-link class="ptco-button ptco-button-light" to="/p/ptco/start">Let’s talk →</router-link><span class="ptco-motto">People.<br>Purpose.<br>Possibility.</span></div></section>
      </template>
    </main>
    <footer class="ptco-footer"><div class="ptco-wrap ptco-footer-grid"><router-link class="ptco-brand" to="/p/ptco"><img src="/assets/ptco/logo.webp" alt=""><span>Plot Twist Co.<small>Businesses for a brighter tomorrow</small></span></router-link><nav aria-label="Footer"><a href="https://plottwisthq.com/records-request">Request my records</a><h3>Quick links</h3><a :href="PLOTLINE_WEBSITE_URL">Plotline · People operations</a><router-link v-for="[label,slug] in ptcoNav" :key="slug" :to="`/p/ptco${slug?'/'+slug:''}`">{{ label }}</router-link></nav><div><h3>Your next step</h3><router-link to="/p/ptco/services/medical-billing">Medical billing</router-link><router-link to="/p/ptco/services/credentialing">Credentialing</router-link><a href="https://fundtred.com">FundThred · Financial support</a><router-link to="/p/ptco/contact">Contact our team</router-link><router-link to="/p/ptco/products">Our products</router-link><router-link to="/p/ptco/conversa">Explore Conversa</router-link><router-link to="/p/ptco/hq">Explore Plot Twist HQ</router-link><router-link to="/p/ptco/hq#compare">Compare clinical workflows</router-link><router-link to="/p/ptco/hq#faq">Platform FAQs</router-link><a :href="portalLoginUrl">Portal Login</a></div><div><h3>Start a conversation</h3><p>Tell us where you are today<br>and where you want to go.</p><router-link class="ptco-button" to="/p/ptco/start">Begin intake →</router-link></div></div><div class="ptco-wrap ptco-footer-bottom"><small>© {{ new Date().getFullYear() }} Plot Twist Co. All rights reserved.</small><small>Different support. A brighter tomorrow.</small></div><p><a href="/community-standards">Community Standards &amp; communication privacy</a></p></footer>
  </div>
</template>
<script setup>
import ConversaFeature from '../../components/conversa/ConversaFeature.vue';
import PublicWebsiteContactForm from "../../components/public/PublicWebsiteContactForm.vue";
import { PLOTLINE_WEBSITE_URL } from '../../utils/plotline';
import PtcoConversaProduct from '../../components/ptco/PtcoConversaProduct.vue';
import PtcoProducts from '../../components/ptco/PtcoProducts.vue';
import PtcoDivisions from '../../components/ptco/PtcoDivisions.vue';
import PtcoPlatformShowcase from '../../components/ptco/PtcoPlatformShowcase.vue';
import PtcoPartnerships from '../../components/ptco/PtcoPartnerships.vue';
import PtcoConsultants from '../../components/ptco/PtcoConsultants.vue';
import PublicResourcesMenu from "../../components/public/PublicResourcesMenu.vue";
import PublicWebsiteProviderLinks from "../../components/public/PublicWebsiteProviderLinks.vue";
import {computed,onMounted,onUnmounted,ref,watch,nextTick} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import api from '../../services/api';
import PtcoIcon from '../../components/ptco/PtcoIcon.vue';
import PtcoServiceCatalog from '../../components/ptco/PtcoServiceCatalog.vue';
import PtcoServiceDetail from '../../components/ptco/PtcoServiceDetail.vue';
import PtcoBusinessIntake from '../../components/ptco/PtcoBusinessIntake.vue';
import {ptcoNav,ptcoServices,ptcoFeaturedServices,ptcoFullService,ptcoServicePath,ptcoIndustries,ptcoPaths,ptcoHqFeatures,ptcoResources} from '../../constants/ptcoWebsite';
import {safeMarketingHref} from '../../utils/marketingPageQuality';
import {portalLoginUrlForPublicSite} from '../../utils/publicPortalUrl.js';
const portalLoginUrl=portalLoginUrlForPublicSite('ptco');
const route=useRoute(),router=useRouter(),menuOpen=ref(false),page=ref(null),loading=ref(true),error=ref('');
const section=computed(()=>String(route.params.section||''));
const activeService=computed(()=>section.value === 'services' ? [...ptcoServices,ptcoFullService].find(service=>service.id===route.params.service) : undefined);
const serviceLanding=computed(()=>!section.value || (section.value === 'services' && !route.params.service));
const knownSection=computed(()=>route.params.service ? Boolean(activeService.value) : ['','about','services','products','conversa','hq','industries','resources','start','contact'].includes(section.value));
const serviceHero=computed(()=>{
 if(activeService.value?.id === 'website') return {kicker:'Websites & identities by Plot Twist Co.',title:activeService.value.title,body:activeService.value.detail,primary:{label:'Explore our work',to:{path:route.path,hash:'#brand-portfolio'}},secondary:{label:'Request a custom quote',to:'/p/ptco/start?path=operations&service=website'}};
 if(activeService.value) return {kicker:'Plot Twist Co. services',title:activeService.value.title,body:activeService.value.detail,primary:{label:'Request a custom quote',to:`/p/ptco/start?path=operations&service=${activeService.value.id}`},secondary:{label:'Explore all services',to:'/p/ptco/services'}};
 return {kicker:'Full-service back-office support',title:'Everything behind your mission.',accent:'Forward.',body:'Medical billing, credentialing, people, finances, and operations. Choose the support you need, or let Plot Twist Co. build a complete plan for your organization.',primary:{label:'View all services',to:{path:route.path,query:route.query,hash:'#services'}},secondary:{label:'Get a custom plan',to:'/p/ptco/start?path=operations&service=full-service'}};
});
watch(()=>[route.params.section,route.params.service,route.hash],()=>{
 if(section.value!=='services'||route.params.service||!route.hash)return;
 const id=route.hash.slice(1);
 if([...ptcoServices,ptcoFullService].some(service=>service.id===id))router.replace({path:ptcoServicePath(id),query:route.query});
 else if(id==='powered-by-plottwistco')router.replace('/p/ptco/about#powered-by-plottwistco');
},{immediate:true});
const logo=computed(()=>safeMarketingHref(page.value?.branding?.logoUrl)||'/assets/ptco/logo-flat.webp');
const selectedPath=ref('starting');
watch(()=>route.query.path,p=>{if(ptcoPaths.some(x=>x.id===p))selectedPath.value=p;},{immediate:true});
function updatePageTitle(){document.title=section.value==='conversa'?'Conversa — Messages, Team Texts & Secure Care | Plot Twist Co.':`${activeService.value?.title || ptcoNav.find(([,s])=>s===section.value)?.[0]||'Get started'} | Plot Twist Co.`;}
watch(()=>route.fullPath,()=>{menuOpen.value=false;updatePageTitle();},{immediate:true});
function scrollToIntake(event){event?.preventDefault();document.getElementById('business-intake')?.scrollIntoView({behavior:'smooth',block:'start'});}
function choosePath(path){selectedPath.value=path;scrollToIntake();}
const activeFeature=ref('clients');const feature=computed(()=>ptcoHqFeatures.find(f=>f.id===activeFeature.value));
const heroes={
 '':{kicker:'Plot Twist HQ · Your connected management suite',title:'Build. Manage. Scale.',accent:'Your Next Chapter.',body:'Bring your people, client care, and business operations together with Plot Twist HQ, the all-in-one management suite by Plot Twist Co. Add focused products and expert support as your organization grows.',image:'/assets/ptco/home-hero.webp'},
 about:{kicker:'Same purpose. A brighter tomorrow.',title:'Built to Support Your Vision',accent:'— Not Replace It.',body:'We partner with service-based businesses to help them build, manage, and grow without losing ownership of their purpose or identity.',note:'Independent associates, equity affiliates, and majority-owned subsidiaries each have a clear relationship and agreed scope of support.',image:'/assets/ptco/about-hero.webp'},
 start:{kicker:'Same purpose. A brighter tomorrow.',title:'Let’s Get Your',accent:'Business Moving.',body:'Expert support and a connected workspace for your next chapter. Tell us where you are today and what you need.',note:'From initial setup to long-term operations, we’re with you every step of the way.',image:'/assets/ptco/start-hero.webp'},
 services:{kicker:'Support from setup to scale.',title:'Your Purpose.',accent:'A Stronger Foundation.',body:'Bring clarity to the work behind your business, with support built around your goals, your team, and the people you serve.',image:'/assets/ptco/about-hero.webp'},
 products:{kicker:'Products by Plot Twist Co.',title:'Connected technology.',accent:'A workspace for your work.',body:'Explore Plot Twist HQ for business operations, AuricWell for therapy practices, Conversa for connected communications, Plotline for people operations, SchoolCareBridge for schools and care teams, and Summit Stats Team Challenge for fitness clubs and community competitions.',image:'/assets/ptco/about-hero.webp'},
 hq:{kicker:'Welcome to Plot Twist HQ',title:'Your Business.',accent:'Connected.',body:'Bring client workflows, people operations, scheduling, and billing into one workspace. Explore how the parts fit together.',image:'/assets/ptco/home-hero.webp'},
 industries:{kicker:'Different businesses. A shared purpose.',title:'For the People',accent:'Who Help People.',body:'Support for mental health agencies, consultants, coaches, tutors, and other purpose-driven service businesses.',image:'/assets/ptco/about-hero.webp'},
 contact:{kicker:'Let’s connect',title:'Start a',accent:'Conversation.',body:'Ask our team about management services, your organization, or website support.',image:'/assets/ptco/start-hero.webp'},
 resources:{kicker:'A little clarity goes a long way.',title:'Prepare for Your',accent:'Next Chapter.',body:'Practical starting points for launching a business, improving operations, and planning your move to a connected workspace.',image:'/assets/ptco/start-hero.webp'}
};
const hero=computed(()=>{const h={...(heroes[section.value]||heroes[''])};const custom=section.value ? page.value?.branding?.contentPages?.find(p=>p.slug===section.value) : page.value; if(custom?.heroImageUrl)h.image=safeMarketingHref(custom.heroImageUrl)||h.image;if(custom?.heroTitle){h.title=custom.heroTitle;h.accent='';if(h.title.endsWith('Your Next Chapter.')){h.title=h.title.slice(0,-18).trim();h.accent='Your Next Chapter.';}}if(custom?.heroSubtitle)h.body=custom.heroSubtitle;return h;});
const previewMode=window.parent!==window&&route.query.marketingPreview==='1';
let loadId=0;
async function load(){const id=++loadId;loading.value=true;error.value='';try{const {data}=await api.get('/public/marketing-pages/ptco',{skipAuthRedirect:true,skipGlobalLoading:true});if(id===loadId)page.value=data.page;}catch{if(id===loadId)error.value='The site is temporarily unavailable. Please try again.';}finally{if(id===loadId)loading.value=false;}}
function receive(event){if(previewMode&&event.origin===location.origin&&event.source===window.parent&&event.data?.type==='marketing-preview'&&event.data.page?.slug==='ptco'){page.value=event.data.page;loading.value=false;}}
onMounted(async()=>{updatePageTitle();window.addEventListener('message',receive);if(previewMode)window.parent.postMessage({type:'marketing-preview-ready'},location.origin);else await load();await nextTick();if(route.hash&&!route.hash.startsWith('#invite='))document.getElementById(route.hash.slice(1))?.scrollIntoView();});
onUnmounted(()=>{loadId++;window.removeEventListener('message',receive);});
const principles=[{icon:'shield',title:'Support without takeover',body:'Your purpose, culture, and business identity belong to you. Our role is to strengthen them.'},{icon:'settings',title:'Systems that serve your vision',body:'Build practical processes around your mission and the way your team works.'},{icon:'people',title:'A partner, not a replacement',body:'Stay in control with a partner who brings support, perspective, and shared commitment.'}];
const values=[['clock','Greater efficiency','Reduce repetitive work.'],['bulb','More clarity','Understand your next steps.'],['shield','Clear responsibilities','Know who owns each process.'],['chart','Better organization','Keep your work connected.'],['heart','Ongoing support','A team in your corner.']];
const faqs=[['Who does Plot Twist Co. support?','We work with service-based businesses, especially mental health agencies, as well as consultants, coaches, tutors, and other purpose-driven organizations.'],['Is Plot Twist HQ included?','We will discuss whether Plot Twist HQ fits your needs, which features you need, and the scope and pricing before you commit.'],['Can you help an established business?','Yes. Tell us what is working, where the friction is, and what you would like to improve. We can discuss a transition or a focused support plan.']];
</script>
<style src="../../styles/ptcoWebsite.css"></style>
<style src="../../styles/ptcoServices.css"></style>
