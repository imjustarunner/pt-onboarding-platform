<template>
 <div class="provider-profile">
  <header class="profile-nav"><BrandingLogo v-if="branding.displayLogoUrl" class="profile-logo"/><strong>{{ agencyName }}</strong><router-link :to="finderPath">Find a provider</router-link></header>
  <main v-if="loading" class="profile-container" role="status">Loading provider profile…</main>
  <main v-else-if="error" class="profile-container" role="alert"><h1>Profile unavailable</h1><p>{{ error }}</p><button @click="load">Try again</button></main>
  <main v-else-if="provider" class="profile-container">
   <nav class="profile-crumb" aria-label="Breadcrumb"><router-link :to="finderPath">Find a provider</router-link><span aria-hidden="true"> / </span>{{ provider.displayName }}</nav>
   <PublicProviderProfileEditor :provider="provider" :agency-id="agencyId" @saved="load" />
   <section class="profile-intro">
    <img v-if="provider.profilePhotoUrl && !photoFailed" :src="provider.profilePhotoUrl" :alt="provider.displayName" @error="photoFailed=true"/>
    <div v-else class="profile-initials" aria-label="Photo not provided">{{ initials }}</div>
    <div><p class="profile-eyebrow">{{ agencyName }}</p><h1>{{ provider.displayName }}</h1><div class="profile-tags"><span v-if="provider.credential">{{provider.credential}}</span><a v-for="place in provider.officeLocations||[]" :key="place.id" class="profile-office-button" :href="`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address||place.name)}`" target="_blank" rel="noopener noreferrer">⌖ {{place.name}} ↗</a><span v-if="schedule?.inPerson?.status==='accepting'">In person</span><span v-if="schedule?.virtual?.status==='accepting'">Virtual</span></div><p class="profile-title">{{ provider.title || serviceLabel }}</p><p v-if="provider.serviceFocus">{{ provider.serviceFocus }}</p><span class="profile-status">{{ statusLabel(overallProviderStatus({...provider,details:profile.details},schedule||{})) }}</span></div>
   </section>
   <div class="profile-layout">
    <div class="profile-content">
     <section class="profile-panel"><h2>About {{ provider.firstName || provider.displayName }}</h2><p class="profile-bio">{{ profile.publicBlurb || 'The provider has not published a biography yet.' }}</p></section>
     <div class="profile-facets"><section v-for="group in groups" :key="group.title" class="profile-panel"><h2>{{ group.title }}</h2><div class="profile-tags"><span v-for="value in group.values" :key="value">{{ value }}</span></div><p v-if="!group.values.length">Not yet published</p></section></div>
     <section v-if="provider.tutoringProfile" class="profile-panel"><h2>Learning rates & packages</h2><p v-for="(rate,format) in provider.tutoringProfile.hourlyRates||{}" :key="format">{{format}}: {{rate==null?'Contact us for pricing':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(rate/100)+' / hour'}}</p><article v-for="pkg in provider.tutoringProfile.packages||[]" :key="pkg.id"><h3>{{pkg.name}}</h3><ul><li v-for="(c,i) in pkg.components" :key="i">{{c.sessions}} × {{c.minutes}} minutes · {{c.service}} · {{c.format}} · {{c.pricingMode==='provider-discount'?c.discountPercent+'% off this service provider’s hourly rate':c.educationLevel}}</li></ul><p>{{pkg.totalCents==null?'Contact us for pricing':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(pkg.totalCents/100)}} · Confirm the participating providers with our team.</p><router-link :to="{path:joinPath.path,query:{...joinPath.query,program:pkg.program,packageId:pkg.id}}">Request this package →</router-link></article></section><section v-if="profile.selfPayRateLabel" class="profile-panel"><h2>Self-pay</h2><strong>{{ profile.selfPayRateLabel }}</strong><p v-if="profile.selfPayRateNote">{{ profile.selfPayRateNote }}</p><p>Confirm coverage and any applicable costs with the team before starting services.</p></section>
    </div>
    <aside class="profile-panel profile-availability">
     <PublicProviderAvailabilityPanel :agency-slug="slug" :provider="{...provider,details:profile.details}" :service-type="service" :office-id="route.query.officeId||''" @hold="hold=$event" @loaded="schedule=$event"/>
     <router-link class="profile-continue" :to="joinPath">{{ hold ? 'Continue enrollment with this preference' : 'Continue to enrollment' }} →</router-link>
     <p class="profile-note">A selected weekly time stays on hold until placement is resolved. The team must confirm appointments.</p>
    </aside>
   </div>
  </main>
 </div>
</template>
<script setup>
import {uniquePublicFacets} from '../../utils/publicProviderFacets';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';
import PublicProviderProfileEditor from '../../components/publicServices/PublicProviderProfileEditor.vue';
import PublicProviderAvailabilityPanel from '../../components/publicServices/PublicProviderAvailabilityPanel.vue';
import {overallProviderStatus,statusLabel} from '../../utils/providerDirectoryStatus';
import { useBrandingStore } from '../../store/branding';
const route=useRoute(), branding=useBrandingStore();
const slug=computed(()=>String(route.params.organizationSlug||''));
const service=computed(()=>['counseling','tutoring','coaching','consulting'].includes(route.query.serviceType)?route.query.serviceType:'counseling');
const serviceLabel=computed(()=>({counseling:'Counseling',tutoring:'Tutoring',coaching:'Life coaching',consulting:'Consulting'})[service.value]);
const finderPath=computed(()=>({path:`/${encodeURIComponent(slug.value)}/find-${({counseling:'counselor',tutoring:'tutor',coaching:'coach',consulting:'consultant'})[service.value]}`,query:{program:route.query.program,officeId:route.query.officeId,programType:route.query.officeId?'IN_PERSON':undefined}}));
const joinPath=computed(()=>({path:`/join/${encodeURIComponent(slug.value)}/${slug.value==='nlu'&&service.value==='tutoring'?'learning':service.value}`,query:{providerId:provider.value?.id,serviceType:service.value,program:route.query.program}}));
const provider=ref(null),profile=ref({}),agencyName=ref(''),agencyId=ref(0),loading=ref(false),error=ref(''),photoFailed=ref(false),hold=ref(null),schedule=ref(null);
const initials=computed(()=>String(provider.value?.displayName||'').split(' ').map(s=>s[0]).slice(0,2).join(''));
const groups=computed(()=>[
 {title:service.value==='tutoring'?'Subjects':'Specialties',values:provider.value?.tutoringProfile?.subjectAreas||provider.value?.specialties||[]},
 {title:'Client ages',values:uniquePublicFacets(provider.value?.ageGroups||[])},
 {title:'Populations served',values:provider.value?.focus||[]},
 {title:service.value==='tutoring'?'Grades':'Approaches',values:provider.value?.tutoringProfile?.gradeLevels||[...(provider.value?.modalities||[]),...(provider.value?.interventions||[])]},
 {title:'Insurance accepted',values:profile.value?.insurancesAccepted||[]},
 {title:'Languages',values:profile.value?.details?.languages||[]},
 {title:'Provider gender',values:profile.value?.details?.gender?[profile.value.details.gender]:[]}
]);
let generation=0;
async function load(){const id=++generation;loading.value=true;error.value='';photoFailed.value=false;provider.value=null;schedule.value=null;hold.value=null;
 try{const {data}=await api.get(`/public/agency-services/${encodeURIComponent(slug.value)}/providers/${Number(route.params.providerId)}`,{params:{serviceType:service.value,bookingMode:'NEW_CLIENT',officeId:route.query.officeId},skipAuthRedirect:true});if(id!==generation)return;provider.value=data.provider;profile.value=data.profile;agencyId.value=Number(data.agency?.id)||0;agencyName.value=data.agency?.name||slug.value;document.title=`${data.provider.displayName} | ${agencyName.value}`;}
 catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'This profile could not be loaded.';}finally{if(id===generation)loading.value=false;}}
watch(()=>[slug.value,route.params.providerId,service.value],load,{immediate:true});
</script>
<style scoped>
.profile-office-button{display:inline-flex;padding:9px 14px;border:1px solid #b3cec0;border-radius:24px;background:#eef6f1;text-decoration:none}

.provider-profile{--profile-brand:var(--agency-primary-color,#125c49);min-height:100vh;color:#143842;background:linear-gradient(140deg,#f0f7f4,#fbfcfd 60%);font-family:var(--agency-font-family,system-ui,sans-serif)}.profile-nav{display:flex;align-items:center;gap:20px;padding:20px 4vw;background:#fff;border-bottom:1px solid #e0e9e5;flex-wrap:wrap}.profile-nav>a{margin-left:auto}.profile-logo{max-width:230px;height:48px}.profile-container{padding:26px 4vw 70px;margin:auto;max-width:1600px}.profile-crumb{font-size:.85rem;margin-bottom:28px}.provider-profile a{color:color-mix(in srgb,var(--profile-brand) 65%,#073831)}.profile-intro{display:flex;align-items:center;gap:36px;padding:20px 0 38px}.profile-intro img,.profile-initials{width:190px;height:190px;object-fit:cover;border:6px solid white;border-radius:50%;box-shadow:0 8px 25px #183d3b12}.profile-initials{display:grid;place-items:center;background:#d9e9e0;font-size:3rem}.profile-intro h1{font-size:clamp(1.8rem,3vw,3rem);letter-spacing:-.035em;margin:8px 0 12px}.profile-eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.75rem;color:var(--profile-brand)}.profile-title{font-size:1.1rem}.profile-status{display:inline-block;background:#e2f2e9;color:#1d624c;border-radius:40px;padding:10px 16px;font-size:.85rem}.profile-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(340px,1fr);gap:24px;align-items:start}.profile-content{display:grid;gap:20px}.profile-panel{padding:26px;border:1px solid #dfebe6;border-radius:15px;background:#fff;box-shadow:0 6px 22px #183d3b04}.profile-panel h2{font-size:1.2rem;margin:0 0 20px}.profile-panel p{line-height:1.75;color:#506570}.profile-bio{white-space:pre-line}.profile-facets{display:grid;grid-template-columns:1fr 1fr;gap:20px}.profile-tags{display:flex;flex-wrap:wrap;gap:8px}.profile-tags span{background:#eef5f3;color:#31554e;padding:7px 12px;border-radius:30px;font-size:.85rem}.profile-continue{display:block;background:var(--profile-brand);color:#fff!important;text-align:center;text-decoration:none;padding:16px;border-radius:9px;margin-top:24px}.profile-note{font-size:.8rem}.provider-profile :focus-visible{outline:3px solid #248f79;outline-offset:3px}@media(max-width:950px){.profile-layout{grid-template-columns:1fr}.profile-availability{grid-row:1}.profile-intro{gap:20px}.profile-intro img,.profile-initials{width:130px;height:130px}}@media(max-width:520px){.profile-intro{flex-direction:column;align-items:flex-start}.profile-facets{grid-template-columns:1fr}.profile-panel{padding:20px}.profile-nav strong{display:block;font-size:.9rem}}
.profile-intro img,.profile-initials{height:260px;border-radius:14px;object-position:50% 20%;flex-shrink:0}@media(max-width:950px){.profile-intro img,.profile-initials{width:130px;height:180px}}@media(max-width:520px){.profile-intro{flex-direction:row;align-items:flex-start;gap:15px}.profile-intro img,.profile-initials{width:100px;height:160px}.profile-intro h1{font-size:26px}}
</style>
