<template>
  <section id="brand-portfolio" class="ptco-band ptco-portfolio" aria-labelledby="ptco-portfolio-title">
    <div class="ptco-wrap">
      <div class="ptco-portfolio-heading">
        <div>
          <p class="ptco-eyebrow">Created by Plot Twist Co.</p>
          <h2 id="ptco-portfolio-title">Different missions.<br><em>A brand of their own.</em></h2>
        </div>
        <div class="ptco-portfolio-intro">
          <p>Explore the websites and identities we’ve created—from care and community organizations to the products that keep everyday work moving.</p>
          <p class="ptco-portfolio-note">Open each brand package in your browser to explore its artwork, colors, and usage guide.</p>
        </div>
      </div>

      <div class="ptco-portfolio-toolbar">
        <div class="ptco-portfolio-filters" role="group" aria-label="Filter brand portfolio">
          <button v-for="category in categories" :key="category" type="button" :aria-pressed="selected === category" @click="selected = category">
            {{ category }} <span>{{ category === 'All brands' ? brands.length : brands.filter(brand => brand.category === category).length }}</span>
          </button>
        </div>
        <p role="status" aria-live="polite">{{ visibleBrands.length }} {{ visibleBrands.length === 1 ? 'brand' : 'brands' }}</p>
      </div>

      <div class="ptco-portfolio-grid">
        <article v-for="brand in visibleBrands" :id="`brand-${brand.id}`" :key="brand.id" class="ptco-portfolio-card" :data-brand="brand.id" :style="{'--brand-color':brand.colors[0]}">
          <div class="ptco-portfolio-art" :class="{'ptco-portfolio-art-wide': brand.logoLayout === 'wide'}">
            <span class="ptco-portfolio-category">{{ brand.category }}</span>
            <img :src="brand.logo" :alt="`${brand.name} logo`" loading="lazy" width="240" height="120">
            <div class="ptco-portfolio-colors" :aria-label="`${brand.name} website colors`">
              <span v-for="color in brand.colors" :key="color" :style="{background:color}" :title="color"></span>
            </div>
          </div>
          <div class="ptco-portfolio-card-body">
            <h3>{{ brand.name }}</h3>
            <p>{{ brand.description }}</p>
            <div class="ptco-portfolio-links">
              <span v-if="brand.status" class="ptco-portfolio-status">{{ brand.status }}</span>
              <a v-else :href="brand.website" target="_blank" rel="noopener noreferrer" :aria-label="`Visit ${brand.name} website (opens in a new tab)`">Visit website <span aria-hidden="true">↗</span></a>
              <a :href="`/assets/ptco/brand-packages/${brand.id}.html`" target="_blank" rel="noopener noreferrer" :aria-label="`View ${brand.name} brand package (opens in a new tab)`">Brand package <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </article>
      </div>
      <div class="ptco-portfolio-closing"><p>Your mission deserves a presence of its own.</p><router-link to="/p/ptco/start?path=operations&service=website">Let’s build your next chapter <PtcoIcon name="arrow"/></router-link></div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import brands from '../../content/ptcoBrandPortfolio.json';
import PtcoIcon from './PtcoIcon.vue';
const categories = ['All brands', ...new Set(brands.map(brand => brand.category))];
const selected = ref('All brands');
const visibleBrands = computed(() => selected.value === 'All brands' ? brands : brands.filter(brand => brand.category === selected.value));
</script>

<style scoped>
.ptco-portfolio{background:#faf8f5;padding-block:48px;scroll-margin-top:24px}
.ptco-portfolio-heading{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:40px;margin-bottom:30px}
.ptco-portfolio-heading h2{font-size:clamp(31px,3vw,46px);line-height:1.15;margin:0;letter-spacing:-1px}
.ptco-portfolio-heading h2 em{color:var(--ptco-red);font-weight:400}
.ptco-portfolio-intro>p{max-width:550px;font-size:15px;line-height:1.7;margin-bottom:12px}
.ptco-portfolio-intro .ptco-portfolio-note{font-size:12px;margin-bottom:0;color:#666576}
.ptco-portfolio-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid #e5ddda;padding-block:22px}
.ptco-portfolio-toolbar>p{font-size:12px;margin:0;white-space:nowrap}
.ptco-portfolio-filters{display:flex;gap:8px;flex-wrap:wrap}
.ptco-portfolio-filters button{display:flex;align-items:center;gap:10px;min-height:44px;border:1px solid #dfd6d2;border-radius:6px;padding:10px 14px;color:#4b4852;background:transparent;font:600 12px/1.4 Inter,Arial,sans-serif;cursor:pointer}
.ptco-portfolio-filters button span{font-size:10px;opacity:.75}
.ptco-portfolio-filters button[aria-pressed=true]{color:white;background:#761224;border-color:#761224}
.ptco-portfolio-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.ptco-portfolio-card{min-width:0;display:flex;flex-direction:column;background:white;border:1px solid #e4ddda;border-radius:10px;overflow:hidden;scroll-margin-top:24px}
.ptco-portfolio-art{position:relative;display:flex;align-items:center;justify-content:center;height:207px;padding:48px 28px 28px;background:linear-gradient(135deg,#fff,#faf9f6);border-bottom:1px solid #f0eae7}
.ptco-portfolio-category{position:absolute;top:18px;left:22px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#696572}
.ptco-portfolio-art>img{display:block;max-width:100%;width:240px;height:120px;object-fit:contain}
.ptco-portfolio-art-wide>img{width:280px;max-width:115%;height:150px;object-fit:contain}
.ptco-portfolio-colors{position:absolute;bottom:0;left:0;right:0;display:flex;height:5px}
.ptco-portfolio-colors span{flex:1}
.ptco-portfolio-card-body{display:flex;flex-direction:column;flex:1;padding:24px}
.ptco-portfolio-card h3{font-size:24px;line-height:1.25;margin:0 0 12px}
.ptco-portfolio-card-body>p{font-size:13px;line-height:1.7;margin:0 0 22px}
.ptco-portfolio-status{font-size:11px;color:#716056}
.ptco-portfolio-links{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:auto;padding-top:16px;border-top:1px solid #eee7e4}
.ptco-portfolio-links>a{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:12px;line-height:1.4;text-decoration:none;font-weight:650;color:#761224}
.ptco-portfolio-links>a:last-child{color:#51505b;font-weight:500}
.ptco-portfolio-links>a:hover{text-decoration:underline;text-underline-offset:4px}
.ptco-portfolio-links svg{width:16px;height:16px}
.ptco-portfolio-closing{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:32px;padding:25px 0 0;border-top:1px solid #dfd6d2}
.ptco-portfolio-closing p{font:24px/1.3 Georgia,serif;margin:0}
.ptco-portfolio-closing a{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--ptco-red);text-underline-offset:5px}
.ptco-portfolio-closing svg{width:18px;height:18px}
@media(max-width:1000px){.ptco-portfolio-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ptco-portfolio-heading{grid-template-columns:1fr;gap:18px}.ptco-portfolio-intro>p{max-width:720px}.ptco-portfolio-toolbar{align-items:flex-start}.ptco-portfolio-toolbar>p{padding-top:12px}}
@media(max-width:600px){.ptco-portfolio{padding-block:32px}.ptco-portfolio-grid{grid-template-columns:1fr;gap:20px}.ptco-portfolio-toolbar{display:block}.ptco-portfolio-filters{display:grid;grid-template-columns:1fr 1fr}.ptco-portfolio-filters button{justify-content:space-between;text-align:left;font-size:11px;padding:10px}.ptco-portfolio-card-body{padding:22px}.ptco-portfolio-closing{flex-direction:column;align-items:flex-start}.ptco-portfolio-heading h2{font-size:33px}}
</style>
