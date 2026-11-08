<template>
 <section class="hero-features" aria-label="Explore AuricWell features" @mouseenter="hovered=true" @mouseleave="hovered=false" @focusin="focused=true" @focusout="leaveFocus" @keydown.left.prevent="move(-1)" @keydown.right.prevent="move(1)" @touchstart.passive="touchStart" @touchend.passive="touchEnd">
  <div class="hf-top"><span>YOUR PRACTICE, CONNECTED</span><span>{{ index+1 }} / {{ slides.length }}</span></div>
  <div class="hf-stage">
   <Transition name="feature-slide" @after-enter="settle">
    <a :key="index" class="hf-slide" :href="featureUrl(current.anchor)" :aria-label="`Explore ${current.title}`" data-analytics-id="hero-feature" :data-analytics-label="current.title">
     <div class="hf-image"><img :src="current.image" :alt="current.alt" @load="imageReady=true" @error="imageReady=true" :fetchpriority="index===0?'high':'auto'" width="1100" height="760"/></div>
     <div class="hf-caption"><span>{{ current.tag }}</span><h2>{{ current.title }}</h2><p>{{ current.description }}</p><strong>Explore the feature <span aria-hidden="true">↗</span></strong></div>
    </a>
   </Transition>
  </div>
  <div class="hf-controls"><div class="hf-dots" role="group" aria-label="Choose a featured workflow"><button v-for="(slide,i) in slides" :key="slide.title" type="button" :aria-label="`Show ${slide.title}`" :aria-pressed="i===index" @click="go(i)"><span></span></button></div><div><button type="button" aria-label="Previous feature" @click="move(-1)">←</button><button type="button" :aria-label="paused?'Play feature slideshow':'Pause feature slideshow'" :aria-pressed="paused" @click="paused=!paused">{{ paused?'▶':'Ⅱ' }}</button><button type="button" aria-label="Next feature" @click="move(1)">→</button></div></div>
  <p class="hf-disclosure">App screens &amp; fictional examples · Click to explore</p>
 </section>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {auricwellWebsiteBase} from '../paths.js';
const slides=[
 {title:'Notes, with Narriva',tag:'NARRIVA · NOTE WORKSPACE',anchor:'documentation',image:'/auricwell/examples/narriva-feature-20261107.webp',alt:'Narriva Note Workspace with a fictional treatment plan and prepared SOIP note',description:'Your session narrative. Your treatment context. A draft ready for your review.'},
 {title:'A warmer arrival',tag:'OFFICES · KIOSK & CHECK-IN',anchor:'kiosk',image:'/auricwell/examples/kiosk-feature-20261107.webp',alt:'Fictional office kiosk and client check-in questions',description:'Connect office check-in, client feedback and a timely heads-up for the provider.'},
 {title:'Keep the conversation close',tag:'CONVERSA · CLIENT TEXTING',anchor:'texting',image:'/assets/conversa/ui/conversa-therapy-preview-20261103.png',alt:'Conversa therapy messaging interface with fictional conversations',description:'Assigned-provider texting, appointment reminders and practice support in one place.'},
 {title:'From coverage to claim review',tag:'BILLING · CONNECTED WORKSPACE',anchor:'billing',image:'/auricwell/examples/billing-claims-20261103.png',alt:'Billing Workspace with fictional claims and review statuses',description:'Reviewed insurance-card details and a clearer queue for claims and follow-up.'},
 {title:'Room for the whole day',tag:'SCHEDULING · THE CONNECTED DAY',anchor:'scheduling',image:'/auricwell/examples/calendar-feature-20261108.png',alt:'Practice appointment calendar with fictional clients',description:'One-hour visits, supervision and team time. Confirmed, virtual and canceled examples.'},
 {title:'See the story across visits',tag:'NARRIVA · TREATMENT PROGRESS',anchor:'narriva-review',image:'/auricwell/examples/progress-feature-20261107.webp',alt:'Illustrative treatment objective ratings across five fictional visits',description:'Compare objective ratings and review the context behind a treatment plan.'}
];
const index=ref(0),hovered=ref(false),focused=ref(false),hidden=ref(false),paused=ref(false),imageReady=ref(false),transitioning=ref(false);
const current=computed(()=>slides[index.value]);
const featureUrl=anchor=>`${auricwellWebsiteBase().replace(/\/$/,'')}/product#${anchor}`;
let timer,media,touchX=null;
const stop=()=>clearTimeout(timer);
function schedule(){stop();if(!paused.value&&!hovered.value&&!focused.value&&!hidden.value&&imageReady.value&&!transitioning.value)timer=setTimeout(()=>move(1),3000);}
function go(value){if(index.value===value)return;stop();imageReady.value=false;transitioning.value=true;index.value=value;}
function move(delta){go((index.value+delta+slides.length)%slides.length);}
function settle(){transitioning.value=false;schedule();}
function leaveFocus(event){if(!event.currentTarget.contains(event.relatedTarget))focused.value=false;}
function visibility(){hidden.value=document.hidden;}
function preference(event){if(event.matches)paused.value=true;}
function touchStart(event){touchX=event.changedTouches[0]?.clientX??null;}
function touchEnd(event){const x=event.changedTouches[0]?.clientX;if(touchX!=null&&x!=null&&Math.abs(x-touchX)>45)move(x<touchX?1:-1);touchX=null;}
watch([paused,hovered,focused,hidden,imageReady],schedule);
onMounted(()=>{visibility();media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(media?.matches)paused.value=true;media?.addEventListener?.('change',preference);document.addEventListener('visibilitychange',visibility);schedule();});
onBeforeUnmount(()=>{stop();document.removeEventListener('visibilitychange',visibility);media?.removeEventListener?.('change',preference);});
</script>
<style scoped>
.hero-features{background:#fff;border:1px solid #d8e4f1;border-radius:22px;box-shadow:0 25px 70px #19385d14;overflow:hidden;min-width:0;text-align:left;color:#142e55}.hf-top{display:flex;justify-content:space-between;padding:18px 22px;font-size:9px;font-weight:700;letter-spacing:1.4px;color:#617a9c;border-bottom:1px solid #e3eaf3}.hf-top>span+span{letter-spacing:0;color:#9b7a34}.hf-stage{height:500px;position:relative;overflow:hidden;background:linear-gradient(140deg,#edf4ff,#fff)}.hf-slide{position:absolute;inset:0;display:grid;grid-template-rows:minmax(0,1fr) auto;color:inherit;text-decoration:none!important}.hf-image{min-height:0;padding:12px 12px 0;overflow:hidden}.hf-image img{width:100%!important;height:100%!important;object-fit:contain;object-position:center;border:1px solid #d6e3f1;border-radius:10px 10px 0 0;background:#fff;box-shadow:0 8px 30px #13376114}.hf-caption{padding:12px 18px;background:#fff;position:relative;border-top:1px solid #e2eaf3}.hf-caption>span{font-size:8px;font-weight:750;letter-spacing:1.3px;color:#947126}.hf-caption h2{font-size:23px!important;line-height:1.25!important;letter-spacing:-.7px!important;margin:5px 0!important}.hf-caption p{font-size:11px!important;line-height:1.7!important;margin:0 0 6px!important;color:#61778e}.hf-caption strong{font-size:10px;color:#1e609b}.hf-caption strong>span{margin-left:8px}.hf-controls{display:flex;justify-content:space-between;align-items:center;padding:10px 17px 0;gap:5px}.hf-controls>div{display:flex;gap:3px}.hf-controls button{width:30px;height:30px;padding:0;background:#fff;border:1px solid #dce6f1;border-radius:50%;color:#406991;cursor:pointer;font:inherit;font-size:12px}.hf-dots button{border:0;width:22px!important;display:grid;place-items:center}.hf-dots button>span{display:block;width:5px;height:5px;border-radius:50%;background:#c3d2e3;transition:width .2s}.hf-dots button[aria-pressed=true]>span{background:#215e9a;width:16px;border-radius:4px}.hf-disclosure{font-size:8px!important;line-height:1.6!important;margin:8px 22px 14px!important;color:#8a9ab0}.hero-features :focus-visible{outline:3px solid #be953f;outline-offset:-3px}.feature-slide-enter-active,.feature-slide-leave-active{transition:transform .45s cubic-bezier(.22,.61,.36,1)}.feature-slide-enter-from{transform:translateX(100%)}.feature-slide-leave-to{transform:translateX(-100%)}.feature-slide-leave-active{pointer-events:none}@media(max-width:600px){.hf-stage{height:450px}.hf-image{padding:10px 10px 0}.hf-caption{padding:12px 15px}.hf-caption h2{font-size:21px!important}.hf-top{padding:15px 18px;font-size:8px}}@media(prefers-reduced-motion:reduce){.feature-slide-enter-active,.feature-slide-leave-active{transition:none}}
</style>
