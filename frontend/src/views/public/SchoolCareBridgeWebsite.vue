<template>
 <div class="scb-site">
  <a class="scb-skip" href="#scb-main">Skip to content</a>
  <header class="scb-header">
   <SchoolCareBridgeBrand :logo="safe(page?.branding?.logoUrl)" />
   <button class="scb-menu" :aria-expanded="menuOpen" aria-controls="scb-nav" @click="menuOpen=!menuOpen">Menu</button>
   <nav id="scb-nav" :class="{'scb-open':menuOpen}" aria-label="Main navigation" @keydown.esc="menuOpen=false">
    <router-link v-for="[label,slug] in nav" :key="slug" :to="path(slug)" :aria-current="section===slug?'page':undefined">{{label}}</router-link>
   </nav>
   <router-link class="scb-button" to="/schoolcarebridge/app">Portal sign in <span aria-hidden="true">→</span></router-link>
  </header>
  <main id="scb-main">
   <p v-if="loading" class="scb-status" role="status">Loading SchoolCareBridge…</p>
   <div v-else-if="error" class="scb-status" role="alert">{{error}} <button @click="load">Try again</button></div>
   <div v-else-if="!content" class="scb-status"><h1>Page not found</h1><router-link :to="path('')">SchoolCareBridge home</router-link></div>
   <template v-else>
    <section class="scb-hero">
     <div class="scb-hero-copy">
      <p class="scb-eyebrow">{{content.eyebrow}}</p>
      <h1>{{custom?.heroTitle || custom?.title || (section==='' && page?.heroTitle) || content.title}}</h1>
      <p class="scb-lead">{{custom?.heroSubtitle || (section==='' && page?.heroSubtitle) || content.description}}</p>
      <div class="scb-actions"><a v-if="contactUrl" class="scb-button" :href="contactUrl" @click="guardPreview">Request a conversation <span aria-hidden="true">→</span></a><span v-else class="scb-pending">School and agency inquiries are opening soon.</span><router-link class="scb-button scb-outline" to="/schoolcarebridge/app">Visit your portal</router-link></div>
      <p class="scb-byline">A program of MH4Kidz · Connecting schools and care teams.</p>
     </div>
     <div class="scb-hero-art"><img :src="safe(custom?.heroImageUrl) || safe(page?.heroImageUrl) || '/assets/mh4kidz/teamwork.webp'" alt="Children connecting through shared activities"/><div class="scb-art-caption"><span>School-centered. Community-connected.</span><strong>More connection.<br/>Brighter possibilities.</strong></div></div>
    </section>
    <section class="scb-section">
     <p class="scb-eyebrow">{{content.label}}</p><h2>{{content.heading}}</h2>
     <div v-if="custom?.body" class="scb-prose" v-html="customHtml"></div>
     <div class="scb-cards"><article v-for="(card,i) in content.cards" :key="card[0]" class="scb-card"><span class="scb-card-number">{{String(i+1).padStart(2,'0')}}</span><h3>{{card[0]}}</h3><p>{{card[1]}}</p></article></div>
    </section>
    <section class="scb-feature">
     <div><p class="scb-eyebrow">Your school. Your community.</p><h2>One familiar place<br/>to work together.</h2><p>SchoolCareBridge brings your school identity and affiliated agencies into the same portal, with MH4Kidz connecting the experience.</p><router-link class="scb-button scb-outline" :to="path('how-it-works')">Explore how it works →</router-link></div>
     <div class="scb-preview" aria-label="Illustrative school portal features"><div class="scb-preview-heading"><span class="scb-dot"></span> Your school portal <span>SchoolCareBridge</span></div><h3>Welcome to your school community.</h3><p>Choose what you need to do next.</p><div class="scb-preview-grid"><div v-for="item in ['Providers','Days & schedule','Student roster','Messages','Digital forms','Upload packet']" :key="item">{{item}} <span>→</span></div></div><small>Illustrative overview · Available tools depend on your permissions.</small></div>
    </section>
    <section class="scb-banner"><div><h2>Stronger connections start here.</h2><p>Bring your school and mental health agency partners together.</p></div><router-link class="scb-button" to="/schoolcarebridge/app">Open SchoolCareBridge →</router-link></section>
   </template>
   <p v-if="previewNotice" class="scb-status" role="status">{{previewNotice}}</p>
  </main>
  <footer class="scb-footer"><SchoolCareBridgeBrand/><div><p>SchoolCareBridge is a program of MH4Kidz.</p><p>Technology managed by Plot Twist Co.</p></div><a href="https://mh4kidz.org">Visit MH4Kidz ↗</a></footer>
 </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import SchoolCareBridgeBrand from '../../components/schoolcarebridge/SchoolCareBridgeBrand.vue';
import { useStandalonePublicWebsite, publicWebsiteUrl as safe } from '../../composables/useStandalonePublicWebsite';
import '../../styles/schoolCareBridge.css';
const {page,loading,error,menuOpen,section,load,guardPreview,previewNotice}=useStandalonePublicWebsite('schoolcarebridge','SchoolCareBridge | A program of MH4Kidz');
const path=slug=>`/schoolcarebridge${slug?'/'+slug:''}`;
const nav=[['For Schools','for-schools'],['For Agencies','for-agencies'],['How It Works','how-it-works'],['About','about'],['Resources','resources'],['Security','security']];
const settings=computed(()=>page.value?.branding?.schoolcarebridgeWebsite||{});
const mh4Contact=ref('');
const contactUrl=computed(()=>safe(settings.value.demoUrl||settings.value.contactUrl||settings.value.partnerUrl||mh4Contact.value));
onMounted(async()=>{try{const {data}=await api.get('/public/marketing-pages/mh4kidz',{skipAuthRedirect:true,skipGlobalLoading:true});mh4Contact.value=data?.page?.branding?.mh4kidzWebsite?.contactUrl||'';}catch{/* Configured destinations are optional. */}});
const custom=computed(()=>page.value?.branding?.contentPages?.find(p=>p.slug===section.value));
const customHtml=computed(()=>DOMPurify.sanitize(marked.parse(custom.value?.body||''),{FORBID_TAGS:['form','input','button','textarea','select','style','iframe']}));
const pages={
 '':{eyebrow:'Connecting schools. Supporting students.',title:'A bridge between schools and the care students need.',description:'Coordinate school-based mental health services with trusted agency partners through one school-centered experience.',label:'Built around your school',heading:'Less searching. More working together.',cards:[['Your school’s portal','A familiar home with your school’s name, colors, and affiliated agencies.'],['Connected care teams','Find providers, view schedules, and communicate with the people supporting your school.'],['Enrollment in one place','Use digital forms or upload completed packets through existing school workflows.'],['Access that fits your role','Work with the information and tools your account is authorized to use.']]},
 'for-schools':{eyebrow:'For schools',title:'A simpler way to coordinate school-based support.',description:'Give school staff one place to find providers, coordinate paperwork, and keep services organized.',label:'Built for school staff',heading:'Your school’s next steps, together.',cards:[['Find your providers','See the agency partners and providers serving your school.'],['Coordinate enrollment','Send digital forms, find printable documents, and upload completed packets.'],['Stay organized','Review schedules, rosters, messages, and pending school workflows.'],['Keep your school identity','Your school’s branding stays prominent alongside SchoolCareBridge and MH4Kidz.']]},
 'for-agencies':{eyebrow:'For mental health agencies',title:'Stronger school partnerships. A shared place to coordinate.',description:'Bring your existing school partnerships into a familiar portal while keeping your agency’s operational workspace.',label:'Working across schools',heading:'Stay connected to each school community.',cards:[['School partnerships','Open the school portals your account is authorized to access.'],['Clear agency identity','Your logo appears with affiliated schools and your agency remains identified in relevant workflows.'],['Shared workflows','Continue using existing forms, documents, schedules, and communication.'],['Your operational workspace','Reach your agency’s existing tools when you need deeper management functionality.']]},
 'how-it-works':{eyebrow:'How it works',title:'From your first sign-in to everyday coordination.',description:'Existing accounts and school workflows come together in a school-branded experience.',label:'A familiar process',heading:'Start with your school. Continue with your team.',cards:[['Enter your email','School staff are directed to their school, or choose among their school memberships.'],['Sign in securely','Use your existing password or Google sign-in where your organization has enabled it.'],['Open your school portal','See your school’s identity and the agencies affiliated with it.'],['Coordinate support','Use the schedules, roster, forms, and messaging available to your role.']]},
 about:{eyebrow:'About SchoolCareBridge',title:'Connected schools. Supported communities.',description:'SchoolCareBridge is a program of MH4Kidz that helps schools and mental health agencies coordinate school-based services.',label:'Our connection',heading:'A school-centered experience, supported by MH4Kidz.',cards:[['MH4Kidz','Operates the SchoolCareBridge program and its public experience.'],['Schools','Bring their communities, staff, and school-specific coordination needs.'],['Affiliated agencies','Provide and coordinate services through their authorized school relationships.'],['Plot Twist Co','Manages the underlying technology used by SchoolCareBridge.']]},
 resources:{eyebrow:'Resources',title:'Find the next step for your school community.',description:'Start with the resources already available in your school portal and explore MH4Kidz’s public programs.',label:'Useful starting points',heading:'Support for everyday coordination.',cards:[['School documents','Sign in to find the documents and links configured for your school.'],['Enrollment support','Find digital forms, printable packets, and upload tools in your portal.'],['Your care partners','Use your portal to connect with authorized agency staff and providers.'],['MH4Kidz programs','Visit MH4Kidz to explore published programs and community resources.']]},
 security:{eyebrow:'Access and privacy',title:'The right access for your role.',description:'SchoolCareBridge uses the existing platform’s authentication and school access controls. A school address identifies the portal; it does not grant permission to view its information.',label:'A shared responsibility',heading:'School coordination with scoped access.',cards:[['Existing identity','Use your established account and organization’s configured sign-in policies.'],['School membership','Your authenticated access is checked when opening a school portal.'],['Scoped information','Existing role and release-of-information controls continue to govern student information.'],['Recognizable destinations','School-specific branding helps you recognize the portal you are entering.']]}
};
const content=computed(()=>pages[section.value]||(custom.value?{...pages.about,eyebrow:'SchoolCareBridge',title:custom.value.title,cards:[]}:null));
</script>
