<template>
  <section ref="region" id="product-spotlight" class="ptco-spotlight" role="region" aria-roledescription="carousel" aria-label="Product spotlight" @mouseenter="hovered=true" @mouseleave="hovered=false" @focusin="pauseForFocus">
    <div class="ptco-wrap">
      <div class="spotlight-heading">
        <div><p class="ptco-eyebrow">The Plot Twist Co. product family</p><p class="spotlight-intro">Start with Plot Twist HQ. Find what fits your next chapter.</p></div>
        <div class="spotlight-controls" role="group" aria-label="Spotlight controls">
          <button type="button" data-rotation-control @click="toggleRotation" :aria-label="paused?'Play product rotation':'Pause product rotation'">{{ paused ? '▶ Play' : 'Ⅱ Pause' }}</button>
          <button type="button" aria-label="Previous product" @click="select(activeIndex-1)">←</button>
          <button type="button" aria-label="Next product" @click="select(activeIndex+1)">→</button>
        </div>
      </div>
      <div class="spotlight-frame" :style="{'--spotlight-accent':accents[active.id]}" :aria-live="paused?'polite':'off'" aria-atomic="true">
        <article v-for="(product,index) in products" :key="product.id" class="spotlight-slide" :class="{'is-active':activeIndex===index}" :aria-hidden="activeIndex!==index" :inert="activeIndex!==index" role="group" aria-roledescription="slide" :aria-label="`${index+1} of ${products.length}: ${product.name}`">
          <div class="spotlight-mark"><img :src="product.logo" :alt="product.name" width="190" height="100"></div>
          <div class="spotlight-copy"><p class="ptco-eyebrow">{{ product.audience }}</p><h2>{{ product.name }}</h2><p class="spotlight-description">{{ product.description }}</p></div>
          <div class="spotlight-action"><router-link v-if="product.id==='plottwisthq' || product.route" class="ptco-button" :to="product.id==='plottwisthq'?'/p/ptco/hq':product.route">{{ product.actionLabel || `Explore ${product.name}` }} →</router-link><a v-else class="ptco-button" :href="product.url">Explore {{ product.name }} ↗</a><a href="#products" class="spotlight-all">See all six products ↓</a></div>
        </article>
      </div>
      <div class="spotlight-selector" role="group" aria-label="Choose a product to spotlight">
        <button v-for="(product,index) in products" :key="product.id" type="button" :aria-pressed="activeIndex===index" :aria-label="`Show ${product.name}`" @click="select(index)"><span aria-hidden="true" class="spotlight-dot"></span>{{ product.id==='sstc'?'Summit Stats':product.name }}</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import {computed,onMounted,onUnmounted,ref} from 'vue';
import {ptcoProducts as products} from '../../constants/ptcoProducts';
const region=ref(null),activeIndex=ref(0),paused=ref(false),hovered=ref(false),visible=ref(true);
const active=computed(()=>products[activeIndex.value]);
const accents={plottwisthq:'#970e22',plotline:'#0f2d24',auricwell:'#0649ce',conversa:'#a57b0e',schoolcarebridge:'#139e61',sstc:'#638c35'};
let timer,observer,motion;
function select(index){paused.value=true;activeIndex.value=(index+products.length)%products.length;}
function pauseForFocus(event){if(!event.target.closest('[data-rotation-control]'))paused.value=true;}
function startTimer(){clearInterval(timer);timer=setInterval(()=>{if(!paused.value&&!hovered.value&&visible.value&&!document.hidden)activeIndex.value=(activeIndex.value+1)%products.length;},7000);}
function toggleRotation(){paused.value=!paused.value;startTimer();}
function motionChanged(event){if(event.matches)paused.value=true;}
onMounted(()=>{
  motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  paused.value=motion.matches;
  motion.addEventListener('change',motionChanged);
  if(typeof IntersectionObserver!=='undefined'){
    visible.value=false;
    observer=new IntersectionObserver(entries=>{visible.value=entries[0].isIntersecting;},{threshold:0.2});
    observer.observe(region.value);
  }
  startTimer();
});
onUnmounted(()=>{clearInterval(timer);observer?.disconnect();motion?.removeEventListener('change',motionChanged);});
</script>

<style scoped>
.ptco-spotlight{padding:32px 0 24px;border-bottom:1px solid var(--ptco-line);background:#fbf9f6}
.spotlight-heading{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:20px}
.spotlight-heading .ptco-eyebrow{margin:0 0 6px}.spotlight-heading .spotlight-intro{margin:0;font-size:14px}
.spotlight-controls{display:flex;gap:8px;flex-shrink:0}.spotlight-controls button{min-width:44px;min-height:44px;padding:8px 12px;border:1px solid #d9cdce;border-radius:8px;background:white;color:var(--ptco-ink);cursor:pointer;font-size:14px}
.spotlight-frame{display:grid;border:1px solid #e4dadb;border-top:3px solid var(--spotlight-accent);border-radius:12px;background:white;overflow:hidden}
.spotlight-slide{grid-area:1/1;visibility:hidden;pointer-events:none;display:grid;grid-template-columns:190px minmax(0,1fr) 220px;align-items:center;gap:32px;padding:28px 32px;min-height:246px}
.spotlight-slide.is-active{visibility:visible;pointer-events:auto;animation:spotlight-appear .25s ease-out}
.spotlight-mark{display:flex;align-items:center;justify-content:center}.spotlight-mark img{width:100%;height:110px;object-fit:contain}
.spotlight-copy{min-width:0}.spotlight-copy .ptco-eyebrow{color:var(--spotlight-accent);margin:0 0 10px;font-size:10px}.spotlight-copy h2{font-size:clamp(28px,2.5vw,38px);margin:0 0 12px}.spotlight-copy .spotlight-description{margin:0;max-width:68ch;font-size:15px;line-height:1.6}
.spotlight-action{display:grid;gap:16px;justify-items:center}.spotlight-action .ptco-button{width:100%;padding-inline:16px;font-size:13px}.spotlight-all{font-size:13px;text-underline-offset:4px}
.spotlight-selector{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 12px;margin-top:16px}.spotlight-selector button{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;border-radius:6px;background:transparent;padding:10px 12px;min-height:44px;color:#535b6e;cursor:pointer;font-size:12px;line-height:1.4}.spotlight-selector button[aria-pressed=true]{border-color:#c8b7b9;color:#6c0c1b;background:#fff;font-weight:700}.spotlight-dot{width:6px;height:6px;border-radius:50%;background:#bbb0b0;flex:none}.spotlight-selector button[aria-pressed=true] .spotlight-dot{background:#970e22}
@keyframes spotlight-appear{from{opacity:.45}to{opacity:1}}
@media(max-width:1000px){.spotlight-slide{grid-template-columns:130px minmax(0,1fr);gap:20px;min-height:290px}.spotlight-action{grid-column:1/-1;display:flex;justify-content:space-between}.spotlight-action .ptco-button{width:auto;max-width:70%}.spotlight-all{flex-shrink:0}}
@media(max-width:600px){.ptco-spotlight{padding:24px 0 18px}.spotlight-heading{align-items:flex-start;flex-direction:column;gap:12px}.spotlight-heading .spotlight-intro{font-size:13px}.spotlight-slide{grid-template-columns:1fr;align-content:start;gap:16px;min-height:460px;padding:24px 20px}.spotlight-mark{justify-content:flex-start}.spotlight-mark img{width:145px;height:60px;object-position:left center}.spotlight-copy h2{font-size:29px}.spotlight-copy .spotlight-description{font-size:14px;line-height:1.5}.spotlight-action{display:grid;justify-content:start;justify-items:start;align-self:end;margin-top:auto}.spotlight-action .ptco-button{max-width:100%;width:auto}.spotlight-selector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.spotlight-selector button{justify-content:flex-start;padding:8px;font-size:11px}.spotlight-slide{grid-template-rows:60px 1fr auto}}
@media(prefers-reduced-motion:reduce){.spotlight-slide{animation:none}}
</style>
