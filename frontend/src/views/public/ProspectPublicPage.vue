<template>
  <main class="prospect-page">
    <p v-if="loading" class="prospect-state" role="status">Preparing your preview…</p>
    <section v-else-if="error" class="prospect-state"><h1>This page is unavailable</h1><p role="alert">{{ error }}</p><button @click="load">Try again</button></section>
    <template v-else-if="page">
      <aside v-if="page.status === 'DEMO'" class="preview-notice" aria-label="Demonstration notice"><strong>Prepared for {{ page.name }}</strong><span>{{ page.notice }}</span></aside>
      <header class="prospect-header"><a href="#" aria-label="Back to top" @click.prevent="scrollTop"><img v-if="page.logoUrl" :src="page.logoUrl" :alt="page.name"><strong v-else>{{ page.name }}</strong></a><a class="outline-link" :href="page.loginUrl">Organization sign in <span aria-hidden="true">↗</span></a></header>
      <section class="prospect-hero">
        <p class="eyebrow">{{ careers ? 'A PLACE TO GROW' : 'YOUR NEXT CHAPTER STARTS WITH SUPPORT' }}</p>
        <h1>{{ careers ? 'Meaningful work.\nA team behind you.' : 'Find your person.\nTake your next step.' }}</h1>
        <p>{{ careers ? `Explore what a career with ${page.name} could look like.` : `Meet the ${page.name} team and explore care that fits your next chapter.` }}</p>
        <div class="hero-details"><span>Colorado Springs, Colorado</span><span>Two offices &amp; telehealth</span><span v-if="!careers">{{ page.providers.length }} providers</span></div>
      </section>
      <section v-if="!careers" class="prospect-content">
        <div class="section-heading"><div><p class="eyebrow">THE TEAM</p><h2>Connection comes first.</h2></div><label class="search-label">Find a provider<input v-model="search" type="search" placeholder="Name, focus, or location…"></label></div>
        <p v-if="page.status === 'DEMO'" class="section-note">Meet your actual website-listed team. Times below are sample availability prepared for this demonstration.</p>
        <div class="provider-grid"><article v-for="provider in providers" :key="provider.id" class="provider-card">
          <div class="provider-top"><span class="provider-monogram" aria-hidden="true">{{ initials(provider.name) }}</span><span class="location-badge">{{ /telehealth/i.test(provider.office || '') ? 'Telehealth' : provider.office || 'Counseling' }}</span></div>
          <h3>{{ provider.name }}</h3><p class="credential">{{ provider.credential || provider.title }}</p>
          <p class="provider-bio">{{ provider.bio || 'Connect with the practice to learn more about this provider’s approach.' }}</p>
          <div class="specialties"><span v-for="focus in (provider.details.specialties || []).slice(0,3)" :key="focus">{{ focus }}</span></div>
          <details v-if="provider.availability.length" class="sample-slots"><summary>Explore sample availability</summary><p>Illustrative weekly openings · Mountain time</p><span v-for="slot in provider.availability" :key="slot.id">{{ slot.day_of_week }} · {{ time(slot.start_time) }}–{{ time(slot.end_time) }}</span></details>
          <p v-else class="availability-empty">Contact the practice for current availability.</p>
        </article></div>
        <p v-if="!providers.length" role="status">No providers match your search.</p>
      </section>
      <section v-else class="prospect-content">
        <div class="section-heading"><div><p class="eyebrow">YOUR NEXT CHAPTER</p><h2>{{ page.status === 'DEMO' ? 'Imagine the possibilities.' : 'Join the team.' }}</h2></div><span class="role-count">{{ page.jobs.length }} {{ page.status === 'DEMO' ? 'example roles' : 'open roles' }}</span></div>
        <p v-if="page.status === 'DEMO'" class="section-note">These realistic example roles demonstrate your branded careers page. They are not actual vacancies and do not accept real applications.</p>
        <article v-for="job in page.jobs" :key="job.id" class="job-card"><div><span v-if="job.isExample" class="example-badge">Example role · Demonstration only</span><h3>{{ job.title }}</h3><p class="job-location">{{ job.city }}, {{ job.state }} · {{ job.schedule_text }}</p><p>{{ (job.description_text || '').replace(/^DEMONSTRATION ONLY — NOT AN ACTUAL VACANCY\.\s*/, '') }}</p></div><a v-if="job.isExample || job.applicationUrl" :href="job.isExample ? `https://plotlinepo.com/app/${page.slug}/admin/careers/jobs` : job.applicationUrl">{{ job.isExample ? 'Explore hiring workspace' : 'View application' }} <span aria-hidden="true">→</span></a></article>
        <p v-if="!page.jobs.length" class="empty-jobs">There are no published roles right now.</p>
      </section>
      <section class="office-section"><div><p class="eyebrow">ROOTED IN YOUR COMMUNITY</p><h2>A familiar place to begin.</h2></div><article v-for="office in page.offices" :key="office.id"><h3>{{ office.name }}</h3><p>{{ office.street_address }}<br>{{ office.city }}, {{ office.state }} {{ office.postal_code }}</p></article></section>
      <section v-if="page.status === 'DEMO'" class="workspace-callout"><div><p class="eyebrow">YOUR ORGANIZATION, ALREADY SET UP</p><h2>See how it comes together.</h2><p>Your team, sample {{ careers ? 'hiring workflow' : 'clients and schedules' }}, and a workspace ready to explore.</p></div><a class="solid-link" :href="careers ? `https://plotlinepo.com/app/${page.slug}` : page.workspaceUrl">Enter your demo workspace →</a></section>
      <footer class="prospect-footer"><span>{{ page.name }}</span><a :href="careers ? 'https://plotlinepo.com' : 'https://auricwell.com'">{{ careers ? 'Careers powered by Plotline' : 'Provider experience by AuricWell' }} ↗</a><span v-if="page.status === 'DEMO'">Proposed branding · Demonstration preview</span></footer>
    </template>
  </main>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute(), page = ref(null), loading = ref(true), error = ref(''), search = ref('');
const careers = computed(() => route.params.surface === 'careers');
const providers = computed(() => (page.value?.providers || []).filter(p => !search.value.trim() || [p.name,p.office,p.bio,...(p.details.specialties || [])].join(' ').toLowerCase().includes(search.value.trim().toLowerCase())));
const initials = name => name.split(/\s+/).map(w => w[0]).slice(0,2).join('');
const time = value => { const [h,m] = String(value).split(':'); return `${Number(h)%12 || 12}${m==='00'?'':`:${m}`} ${Number(h)<12?'AM':'PM'}`; };
const scrollTop = () => window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
let controller;
async function load() {
  controller?.abort(); controller = new AbortController(); const current = controller;
  loading.value = true; error.value = '';
  try {
    const surface = careers.value ? 'careers' : 'providers';
    const response = await fetch(`/api/prospect-demos/public/${surface}/${encodeURIComponent(route.params.alias)}`, {cache:'no-store',signal:current.signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Please contact the organization for its current page.');
    page.value = data; document.title = `${data.name} | ${careers.value ? 'Careers · Plotline' : 'Providers · AuricWell'}`;
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = data.status === 'DEMO' ? 'noindex, nofollow' : 'index, follow';
  } catch(e) { if (e.name !== 'AbortError') error.value = e.message; }
  finally { if (current === controller) loading.value = false; }
}
watch(() => [route.params.alias,route.params.surface], load, {immediate:true});
onBeforeUnmount(() => controller?.abort());
</script>
<style scoped>
.prospect-page{--navy:#18324c;--blue:#5ea2e7;--gold:#d3ab61;background:#f9faf8;color:var(--navy);font-family:Inter,'Helvetica Neue',Arial,sans-serif;min-height:100vh}.prospect-page *{box-sizing:border-box}.prospect-page a{color:inherit}.preview-notice{display:flex;gap:18px;align-items:center;padding:14px max(5vw,20px);background:#eaf1f8;border-bottom:1px solid #cfdfed;font-size:12px;line-height:1.6}.preview-notice strong{flex-shrink:0}.preview-notice span{max-width:960px}.prospect-header{max-width:1320px;margin:auto;padding:26px 5vw;display:flex;align-items:center;justify-content:space-between;gap:20px}.prospect-header img{width:260px;max-width:48vw;height:70px;object-fit:contain;object-position:left}.outline-link,.solid-link{display:inline-flex;align-items:center;justify-content:center;gap:12px;padding:13px 20px;border:1px solid #b9c9d7;border-radius:6px;font-size:13px;font-weight:650;text-decoration:none}.solid-link{background:var(--navy);color:#fff!important;border-color:var(--navy)}.prospect-hero{position:relative;padding:58px 5vw 80px;text-align:center;background:radial-gradient(ellipse at 85% 0,#e7eff9,transparent 50%),linear-gradient(160deg,#f9faf8,#f1f5f1);border-bottom:1px solid #e0e8e5}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.17em;margin:0 0 20px;color:#527087}.prospect-hero h1{font-family:Georgia,serif;font-size:clamp(38px,5vw,68px);font-weight:400;line-height:1.1;white-space:pre-line;letter-spacing:-.035em;margin:0 0 24px}.prospect-hero>p:not(.eyebrow){max-width:560px;margin:0 auto;font-size:17px;line-height:1.8;color:#5c6e7b}.hero-details{display:flex;justify-content:center;flex-wrap:wrap;gap:10px 26px;margin-top:32px;font-size:12px;color:#627680}.hero-details span:before{content:'•';color:var(--gold);margin-right:10px}.prospect-content{max-width:1320px;margin:auto;padding:64px 5vw}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:24px}.section-heading h2,.office-section h2,.workspace-callout h2{font-family:Georgia,serif;font-size:34px;font-weight:400;margin:0;letter-spacing:-.02em}.section-heading .eyebrow{margin-bottom:12px}.search-label{font-size:12px;display:grid;gap:8px;min-width:260px}.search-label input{border:1px solid #cad7dd;border-radius:6px;padding:13px 15px;background:#fff;font:inherit;font-size:14px;max-width:100%}.section-note{font-size:13px;color:#617386;line-height:1.8;max-width:800px;margin:24px 0 28px}.provider-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:30px}.provider-card{background:#fff;border:1px solid #e0e7e9;border-radius:12px;padding:26px;display:flex;flex-direction:column;min-width:0}.provider-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:22px}.provider-monogram{display:grid;place-items:center;width:62px;height:62px;border-radius:50%;background:#eaf0f7;color:#466684;font-family:Georgia,serif;font-size:24px}.location-badge,.example-badge{font-size:10px;background:#edf3ef;color:#486653;border-radius:4px;padding:7px 9px;line-height:1.5}.provider-card h3,.job-card h3{font-family:Georgia,serif;font-weight:400;font-size:25px;margin:0 0 8px}.credential{font-size:12px;color:#527087;margin:0 0 17px;line-height:1.6}.provider-bio{font-size:13px;line-height:1.85;color:#657482;flex:1}.specialties{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 20px}.specialties span{font-size:10px;padding:5px 7px;background:#f2f5f7;border-radius:3px;max-width:100%;overflow-wrap:anywhere}.sample-slots{border-top:1px solid #e7ecef;padding-top:17px;font-size:12px}.sample-slots summary{cursor:pointer;font-weight:650;line-height:1.7}.sample-slots p{font-size:10px;color:#687987}.sample-slots>span{display:block;padding:8px 0;color:#4c6478}.availability-empty{font-size:12px;color:#627680}.job-card{border-top:1px solid #d9e1e5;padding:30px 0;display:grid;grid-template-columns:1fr auto;gap:40px;align-items:center}.job-card .example-badge{display:inline-block;background:#f8efdb;color:#80612b;margin-bottom:17px}.job-card p{font-size:14px;color:#617386;line-height:1.85;max-width:790px}.job-card .job-location{font-size:12px}.job-card>a{font-size:12px;font-weight:650;white-space:nowrap}.role-count{font-size:12px;color:#617386}.empty-jobs{padding:35px 0;color:#617386}.office-section{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:35px;padding:46px max(5vw,20px);background:#edf2f0}.office-section .eyebrow{margin-bottom:12px}.office-section h2{font-size:29px}.office-section h3{font-size:14px;font-weight:650}.office-section article p{font-size:13px;line-height:1.8;color:#617386}.workspace-callout{max-width:1320px;margin:auto;padding:65px 5vw;display:flex;align-items:center;justify-content:space-between;gap:30px}.workspace-callout p:not(.eyebrow){font-size:13px;color:#617386;line-height:1.8}.prospect-footer{border-top:1px solid #dfe6e8;padding:25px 5vw;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:11px;color:#617386}.prospect-state{padding:15vh 8vw}.prospect-page :focus-visible{outline:3px solid #2a76be;outline-offset:4px}@media(max-width:1000px){.provider-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.office-section{grid-template-columns:1fr 1fr}.office-section>div{grid-column:1/-1}}@media(max-width:640px){.preview-notice{display:block}.preview-notice strong{display:block;margin-bottom:5px}.prospect-header{padding-top:18px;padding-bottom:18px}.prospect-header img{height:50px}.outline-link{padding:10px;font-size:11px}.prospect-hero{padding:35px 6vw 45px}.hero-details{gap:12px}.prospect-content{padding-top:40px}.section-heading{display:block}.search-label{margin-top:24px;min-width:0}.provider-grid{grid-template-columns:1fr}.provider-card{padding:24px}.job-card{grid-template-columns:1fr;gap:15px}.office-section{grid-template-columns:1fr;gap:15px}.workspace-callout{display:block;padding-top:40px;padding-bottom:40px}.workspace-callout>a{margin-top:15px}.prospect-footer{display:grid;gap:12px}}
</style>
