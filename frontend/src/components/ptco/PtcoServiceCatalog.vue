<template>
  <section id="services" class="ptco-band ptco-catalog">
    <div class="ptco-wrap">
      <div class="ptco-catalog-heading">
        <div><p class="ptco-eyebrow">Our services</p><h2>Choose the support you need</h2><p>Select a service to learn more, or bring it all together with a management partnership.</p></div>
        <div class="ptco-service-switch" role="group" aria-label="Explore service options">
          <button type="button" :aria-pressed="!partnership" @click="setView(false)">Individual services</button>
          <button type="button" :aria-pressed="partnership" @click="setView(true)">Full-service partnership</button>
        </div>
      </div>
      <div v-if="!partnership" class="ptco-service-grid">
        <router-link v-for="service in ptcoFeaturedServices" :key="service.id" :to="ptcoServicePath(service.id)" class="ptco-service-card">
          <PtcoIcon :name="service.icon"/>
          <div><h3>{{ service.title }}</h3><p>{{ service.body }}</p><small>{{ service.label }}</small></div>
          <span class="ptco-card-arrow" aria-hidden="true"><PtcoIcon name="arrow"/></span>
        </router-link>
      </div>
      <div v-else class="ptco-partnership-panel">
        <div><p class="ptco-eyebrow">One coordinated plan</p><h3>Your back office, working together.</h3><p>Choose the services you need and let Plot Twist Co. coordinate the work. We agree on the scope, responsibilities, systems, and pricing with you.</p></div>
        <ul><li v-for="service in ptcoFeaturedServices" :key="service.id"><PtcoIcon name="check"/><router-link :to="ptcoServicePath(service.id)">{{ service.title }}</router-link></li></ul>
      </div>
      <div class="ptco-partnership-banner">
        <PtcoIcon name="layers"/>
        <div><p class="ptco-eyebrow">Full-service partnership</p><h3>Let us handle it all</h3><p>Connect the people, systems, billing, and operations behind your mission under one management team.</p></div>
        <ul class="ptco-checklist"><li><PtcoIcon name="check"/>A primary point of contact</li><li><PtcoIcon name="check"/>Support that grows with you</li></ul>
        <router-link class="ptco-button" :to="ptcoServicePath('full-service')">Explore the partnership <PtcoIcon name="arrow"/></router-link>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ptcoFeaturedServices, ptcoServicePath } from '../../constants/ptcoWebsite';
import PtcoIcon from './PtcoIcon.vue';
const route = useRoute(), router = useRouter();
const partnership = computed(() => route.query.view === 'partnership');
function setView(full) {
  const query = { ...route.query };
  if (full) query.view = 'partnership'; else delete query.view;
  router.replace({ path: route.path, query, hash: '#services' });
}
</script>
