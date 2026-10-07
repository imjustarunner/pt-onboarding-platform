<template>
  <BrandedLegalDocument v-if="profile && docType !== 'publicproof'" :profile="profile" :type="docType" />
  <main v-else-if="docType === 'publicproof'" class="legal-status">
    <h1>{{ profile?.name || 'Platform' }} SMS Consent Proof</h1>
    <a :href="proofUrl" target="_blank" rel="noopener noreferrer">Open consent proof</a>
    <iframe :src="proofUrl" title="SMS consent proof" referrerpolicy="no-referrer" />
  </main>
  <main v-else class="legal-status">
    <p v-if="loading" role="status">Loading this organization’s policies…</p>
    <template v-else><h1>Organization policies</h1><p role="alert">{{ error }}</p><button type="button" @click="loadProfile">Try again</button></template>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import BrandedLegalDocument from '../../components/legal/BrandedLegalDocument.vue';
import { tenantLegalProfiles, legalProfileForContext, canonicalLegalSlug } from '../../content/tenantLegalProfiles.js';
import { publicSiteSlug } from '../../utils/publicDomainRouting.js';
import { guessPortalSlugFromHostname } from '../../utils/orgScopedPath.js';
const route=useRoute();
const host=typeof window==='undefined'?'':window.location.hostname;
const profile=ref(null), loading=ref(false), error=ref('');
const docType=computed(()=>({privacy:'privacypolicy',hipaa:'platformhipaa'}[route.params?.legalSection] || route.meta?.legalDocType || route.params?.legalSection || 'privacypolicy'));
const slug=computed(()=>route.params?.organizationSlug || route.meta?.legalOrganizationSlug || route.params?.hubSlug || (route.path||'').match(/^\/p\/([^/]+)/)?.[1] || publicSiteSlug(host) || guessPortalSlugFromHostname(host));
const branding=useBrandingStore();
const proofUrl=computed(()=>{
  const source=String(branding.platformBranding?.public_proof_url||'https://docs.google.com/document/d/1Wsft2HBQM0g4Thllgpq5jf9PYhNmAH4ho_zSg_mfvIE/preview');
  try { const url=new URL(source); if(!['https:','http:'].includes(url.protocol))throw new Error(); return source.replace(/\/edit(?:\?.*)?$/, '/preview'); } catch { return ''; }
});
watch(docType,async type=>{if(type==='publicproof'&&!branding.platformBranding)await branding.fetchPlatformBranding();},{immediate:true});
let sequence=0;
async function loadProfile() {
  const request=++sequence;
  profile.value=null; error.value=''; loading.value=true;
  const known=legalProfileForContext({host,organizationSlug:slug.value,path:route.path});
  if(known || !slug.value) { profile.value=known||tenantLegalProfiles.ptco; loading.value=false; return; }
  try {
    const {data}=await api.get(`/agencies/slug/${encodeURIComponent(slug.value)}`,{skipAuthRedirect:true,skipGlobalLoading:true});
    if(request!==sequence)return;
    if(!data?.name || ![data.slug,data.portal_url].some(s=>canonicalLegalSlug(s)===canonicalLegalSlug(slug.value))) throw new Error('Organization identity did not match this address.');
    // Unknown organizations get a service notice, never an inferred provider NPP.
    let origin=typeof window==='undefined'?'https://plottwisthq.com':window.location.origin;
    try { const website=new URL(data.website_url); if(website.protocol==='https:')origin=website.origin; } catch { /* Use this app's organization-scoped route. */ }
    profile.value={legalOrigin:typeof window==='undefined'?'https://plottwisthq.com':window.location.origin,slug:slug.value,name:data.name,legalName:data.official_name||data.name,origin,kind:'service',color:/^#[0-9a-f]{6}$/i.test(data.color_palette?.primary||'')?data.color_palette.primary:'#285e51',logo:/^(https:\/\/|\/(?!\/))/.test(data.logo_url||'')?data.logo_url:'',email:data.support_team_email||'',phone:data.phone_number||'',contactUrl:`${origin}/${encodeURIComponent(slug.value)}/support`};
  } catch { if(request===sequence)error.value='We could not load this organization’s policies. Please try again or contact your organization for a copy.'; }
  finally { if(request===sequence)loading.value=false; }
}
watch(slug,loadProfile,{immediate:true});
</script>
<style scoped>
.legal-status{padding:32px;max-width:1000px;margin:auto}.legal-status iframe{display:block;width:100%;min-height:80vh;border:0;margin-top:24px}
</style>
