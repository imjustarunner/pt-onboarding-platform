<template>
  <section id="careers-powered-by-plotline" class="pl-wide pl-section pl-careers-directory" aria-labelledby="pl-careers-title">
    <div class="pl-section-heading"><div><p class="pl-eyebrow">Careers powered by Plotline</p><h2 id="pl-careers-title">Their mission.<br>Your <em>next chapter.</em></h2></div><p>Real organizations. Their own stories, teams, and opportunities. Visit each organization’s careers page to explore current roles and apply.</p></div>
    <div class="pl-careers-grid">
      <article v-for="organization in plotlineCareers" :key="organization.slug" :data-careers-organization="organization.slug" :style="{'--organization-color':organization.color}">
        <a :href="organization.url" class="pl-careers-logo" :aria-label="`${organization.name} careers`"><img :src="organization.logo" :alt="organization.name" loading="lazy" width="180" height="80"></a>
        <h3>{{ organization.name }}</h3><p class="pl-careers-headline">{{ organization.headline }}</p><p>{{ organization.description }}</p>
        <a :href="organization.url" class="pl-button" :aria-label="`Visit ${organization.name} careers`">Visit careers page <span aria-hidden="true">↗</span></a><small>Powered by Plotline</small>
      </article>
    </div>
    <p class="pl-careers-note">Each organization manages its own roles, hiring decisions, and applications.</p>
    <router-link v-if="showDirectoryLink" to="/plottline/careers" class="pl-text-link">Explore careers powered by Plotline →</router-link>
  </section>
</template>
<script setup>
import {plotlineCareers} from '../../content/plotlineCareers';
defineProps({showDirectoryLink:Boolean});
</script>
<style scoped>
.pl-careers-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.pl-careers-grid article{display:flex;flex-direction:column;align-items:flex-start;padding:32px;border:1px solid #d8dfd7;border-top:3px solid var(--organization-color);border-radius:16px;background:#fff}.pl-careers-logo{display:flex;align-items:center;width:100%;height:95px;margin-bottom:20px}.pl-careers-logo img{width:auto;max-width:100%;height:80px;object-fit:contain;object-position:left center}.pl-careers-grid h3{margin:0 0 10px;font-size:26px}.pl-careers-grid .pl-careers-headline{color:var(--organization-color);font-weight:600;font-size:16px}.pl-careers-grid p{font-size:14px}.pl-careers-grid .pl-button{margin-top:auto;background:var(--organization-color);border-color:var(--organization-color);font-size:13px}.pl-careers-grid small{font-size:10px;margin-top:18px;color:#677268}.pl-careers-directory .pl-careers-note{font-size:12px;margin:20px 0}.pl-careers-directory>.pl-text-link{display:inline-block;margin-top:8px}@media(max-width:650px){.pl-careers-grid{grid-template-columns:1fr}.pl-careers-grid article{padding:26px}.pl-careers-grid h3{font-size:24px}}
</style>
