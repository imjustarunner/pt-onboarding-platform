<template>
  <section class="availability-week" aria-label="Weekly provider availability" :aria-busy="loading">
    <header class="week-toolbar">
      <div class="week-title"><Icon name="calendar"/><h2>{{ offset === 0 ? 'This week’s availability' : 'Weekly availability' }}</h2><span aria-live="polite">{{ rangeLabel }}</span></div>
      <nav aria-label="Choose availability week">
        <button type="button" aria-label="Previous week" :disabled="offset === 0" @click="offset--"><Icon class="week-previous" name="arrow"/></button>
        <button type="button" class="week-current" aria-label="This week" :disabled="offset === 0" @click="offset=0"><Icon name="calendar"/><span>This week</span></button>
        <button type="button" aria-label="Next week" @click="offset++"><Icon name="arrow"/></button>
      </nav>
    </header>
    <p v-if="error" class="week-error" role="alert">{{ error }} <button type="button" @click="load({force:true})">Try again</button></p>
    <div v-if="loading && !weekSchedule" class="week-loading">
      <PublicAvailabilityLoading/>
      <div class="week-skeleton" :style="{'--week-days':days.length}" aria-hidden="true"><div v-for="day in days" :key="day.date"><b>{{ weekday(day.date) }} {{ dayNumber(day.date) }}</b><span></span><span></span></div></div>
    </div>
    <template v-if="weekSchedule">
      <div v-if="officeId" class="week-filter">In-person times: {{ offices.find(office=>String(office.id)===String(officeId))?.name || 'selected office' }} <button type="button" @click="$emit('show-all-offices')">Show all offices</button></div>
      <div ref="scroller" class="week-scroll" tabindex="0" aria-label="Availability by day; scroll to see more days">
        <div class="week-grid" :style="{'--week-days':days.length}">
          <section v-for="day in days" :key="day.date" class="week-day" :class="{'week-day-past':day.past,'week-day-today':day.today}" :aria-label="fullDate(day.date)">
            <h3><span>{{ weekday(day.date) }}</span><b>{{ dayNumber(day.date) }}</b><small v-if="day.today">Today</small></h3>
            <div v-for="opening in day.openings.slice(0,expanded?undefined:3)" :key="opening.key" class="week-opening" :class="{'week-opening-many':opening.choices.length>2}">
              <span class="week-time">{{ time(opening.startAt) }}</span>
              <div class="week-choices">
                <button v-for="choice in opening.choices" :key="choice.format+':'+choice.buildingId" type="button" :class="choice.format==='VIRTUAL'?'week-virtual':'week-office'" :aria-label="choiceLabel(choice)" :title="choiceLabel(choice)" @click="$emit('select',{slot:choice,schedule:weekSchedule})">
                  <Icon :name="choice.format==='VIRTUAL'?'screen':'pin'"/><small v-if="choice.format==='IN_PERSON' && offices.length>1">{{ officeNumber(choice.buildingId) }}</small>
                </button>
              </div>
            </div>
            <button v-if="!expanded && day.openings.length>3" class="week-more" type="button" :aria-label="'Show '+(day.openings.length-3)+' more times for '+fullDate(day.date)" @click="expanded=true">+{{ day.openings.length-3 }} {{ day.openings.length===4?'time':'times' }}</button>
            <span v-if="!day.openings.length" class="week-empty">{{ day.past ? 'Passed' : 'No openings' }}</span>
          </section>
        </div>
      </div>
      <button v-if="expanded" type="button" class="week-less" @click="expanded=false">Show fewer times</button>
      <p class="week-swipe">Swipe to see the rest of the week →</p>
    </template>
    <div v-if="weekSchedule" class="week-freshness"><span>{{ checkedLabel }}<span v-if="loading" role="status"> · Updating this week…</span></span><button type="button" :disabled="loading" @click="load({force:true})">↻ Refresh availability</button></div>
    <p class="week-disclaimer">Days and times are subject to change. We check this week when you open it, reusing recent checks for up to one minute.</p>
    <footer class="week-key">
      <span class="week-virtual"><Icon name="screen"/>Virtual</span>
      <a v-for="(office,index) in offices" :key="office.id" :href="mapUrl(office)" target="_blank" rel="noopener noreferrer" class="week-office-address"><Icon name="pin"/><span><strong>{{ offices.length>1 ? (index+1)+'. ' : '' }}{{ office.name }}</strong><span v-if="office.address"> · {{ office.address }}</span></span><span aria-hidden="true">↗</span></a>
      <span class="week-zone">{{ timeZone }}</span>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../rise/RiseIcon.vue';
import PublicAvailabilityLoading from './PublicAvailabilityLoading.vue';
import {getCachedProviderWeek,getProviderTimeZone,readProviderWeek} from '../../services/publicAvailabilityRead';
import { availabilityLabel } from '../../utils/availabilityLabel';
import { availabilityDate, availabilityMonday, addAvailabilityDays, hasWeekendOpenings, providerAvailabilityWeek } from '../../utils/providerAvailabilityWeek';
const props=defineProps({agencySlug:{type:String,required:true},providerId:{type:Number,required:true},serviceType:{type:String,default:'counseling'},summary:Object,officeId:{type:[String,Number],default:''}});
const emit=defineEmits(['select','loaded','show-all-offices']);
const offset=ref(0), loading=ref(false), error=ref(''), weekSchedule=ref(null), expanded=ref(false), seenWeekend=ref(false), clock=ref(Date.now());
const options=computed(()=>({agencySlug:props.agencySlug,providerId:props.providerId,serviceType:props.serviceType}));
const scroller=ref(null), resolvedTimeZone=ref(getProviderTimeZone(options.value));
const timeZone=computed(()=>resolvedTimeZone.value || props.summary?.timeZone || 'America/Denver');
const currentWeek=computed(()=>availabilityMonday(availabilityDate(clock.value,timeZone.value)));
const weekStart=computed(()=>addAvailabilityDays(currentWeek.value,offset.value*7));
const offices=computed(()=>weekSchedule.value?.locations || props.summary?.locations || []);
const weekends=computed(()=>seenWeekend.value || (weekSchedule.value?.typicalAvailability||[]).some(value=>/saturday|sunday|weekend/i.test(value)) || hasWeekendOpenings(props.summary?.slots,timeZone.value) || (props.summary?.typicalAvailability||[]).some(value=>/saturday|sunday|weekend/i.test(value)));
const slots=computed(()=>(weekSchedule.value?.slots||[]).filter(slot=>weekSchedule.value?.[slot.format==='VIRTUAL'?'virtual':'inPerson']?.status==='accepting' && (slot.format!=='IN_PERSON'||!props.officeId||String(slot.buildingId)===String(props.officeId))));
const days=computed(()=>providerAvailabilityWeek({weekStart:weekStart.value,slots:slots.value,timeZone:timeZone.value,now:clock.value,weekends:weekends.value}));
const calendarDate=value=>new Date(`${value}T12:00:00Z`);
const dateLabel=value=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(calendarDate(value));
const rangeLabel=computed(()=>`${dateLabel(weekStart.value)} – ${dateLabel(addAvailabilityDays(weekStart.value,weekends.value?6:4))}`);
const fullDate=value=>new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(calendarDate(value));
const weekday=value=>new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(calendarDate(value));
const dayNumber=value=>calendarDate(value).getUTCDate();
const time=value=>new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:timeZone.value}).format(new Date(value));
const officeNumber=id=>{const index=offices.value.findIndex(office=>String(office.id)===String(id));return index<0?'':index+1;};
const mapUrl=office=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([office.name,office.address].filter(Boolean).join(', '))}`;
function choiceLabel(slot){
  const office=offices.value.find(item=>String(item.id)===String(slot.buildingId));
  const setting=slot.format==='VIRTUAL'?'Virtual':[office?.name||slot.buildingName||'In person',office?.address].filter(Boolean).join(', ');
  return `Select ${fullDate(availabilityDate(slot.startAt,timeZone.value))}, ${time(slot.startAt)}–${time(slot.endAt)}, ${setting}, ${availabilityLabel(slot)}`;
}
const checkedLabel=computed(()=>{
  const checked=Date.parse(weekSchedule.value?.checkedAt);
  return Number.isFinite(checked) ? 'Schedule checked '+new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:timeZone.value}).format(checked) : 'Available schedule loaded';
});
function scrollToToday(){
  const element=scroller.value,today=element?.querySelector('.week-day-today');
  if(today && element.scrollWidth>element.clientWidth)element.scrollLeft=today.getBoundingClientRect().left-element.getBoundingClientRect().left+element.scrollLeft-4;
}
let generation=0;
async function load({force=false}={}){
  const id=++generation;error.value='';expanded.value=false;
  const positionWeek=weekSchedule.value?.weekStart!==weekStart.value;
  const request={...options.value,weekStart:weekStart.value};
  weekSchedule.value=getCachedProviderWeek(request);
  loading.value=true;
  const requestedWeek=weekStart.value;
  try{
    if(weekSchedule.value && positionWeek){await nextTick();if(id!==generation)return;scrollToToday();}
    const data=await readProviderWeek(request,{force});
    if(id!==generation)return;
    if(data.weekStart!==requestedWeek)throw new Error('Weekly availability is updating. Please try again shortly.');
    resolvedTimeZone.value=data.timeZone || timeZone.value;
    // Correct the initial calendar week if the agency's timezone differs at a week boundary.
    // The week watcher starts the corrected request; never display the wrong week.
    if(weekStart.value!==requestedWeek)return;
    weekSchedule.value=data;
    if(offset.value===0)emit('loaded',data);
    if(hasWeekendOpenings(data.slots,timeZone.value))seenWeekend.value=true;
  }catch(e){if(id===generation)error.value=e.response?.data?.error?.message||e.message||'Could not check this week’s openings. Please try again.';}
  finally{
    if(id===generation){
      loading.value=false;await nextTick();
      if(id===generation && positionWeek)scrollToToday();
    }
  }
}
watch([()=>props.agencySlug,()=>props.providerId,()=>props.serviceType],()=>{offset.value=0;seenWeekend.value=false;resolvedTimeZone.value=getProviderTimeZone(options.value);});
watch([()=>props.agencySlug,()=>props.providerId,()=>props.serviceType,weekStart],()=>load(),{immediate:true});
const timer=setInterval(()=>{clock.value=Date.now();},60000);
onBeforeUnmount(()=>{generation++;clearInterval(timer);});
</script>

<style scoped>
.availability-week{background:#fff;border:1px solid #d3e2db;border-radius:14px;margin:0 0 24px;color:#214b40;box-shadow:0 4px 20px #214b4005;min-width:0;overflow:hidden;font-family:inherit}
.week-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e5ede8;flex-wrap:wrap}
.week-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.availability-week svg{width:17px;height:17px;flex-shrink:0}.week-title h2{font-size:16px;font-weight:650;margin:0;color:#214b40}.week-title>span{font-size:12px;color:#61776d}
.week-toolbar nav{display:flex;gap:5px}.availability-week button{font:inherit;cursor:pointer}.week-toolbar button{display:inline-flex;align-items:center;justify-content:center;min-width:34px;min-height:34px;border:1px solid #d6e2dc;border-radius:7px;padding:5px 9px;background:#fff;color:#24553f;font-size:12px}.week-toolbar button:disabled{opacity:.4;cursor:default}.week-previous{transform:rotate(180deg)}
.week-scroll{overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding:4px}.week-grid{display:grid;grid-template-columns:repeat(var(--week-days),minmax(172px,1fr));min-width:calc(var(--week-days)*172px)}
.week-day{padding:10px 8px;min-height:100px;min-width:0;scroll-snap-align:start}.week-day+.week-day{border-left:1px solid #e5ede8}.week-day h3{display:flex;align-items:center;gap:6px;margin:0 0 10px;font-size:12px;font-weight:500;color:#61776d}.week-day h3 b{font-size:13px;color:#2b5143}.week-day h3 small{font-size:9px;margin-left:auto;color:#176240;background:#e3f2e9;padding:3px 5px;border-radius:5px}.week-day-today{background:#f5faf7}.week-day-past{background:#f4f5f4;color:#9aaba2}.week-day-past h3,.week-day-past h3 b,.week-day-past .week-empty{color:#8e9b94}
.week-opening{display:flex;align-items:center;justify-content:space-between;gap:3px;margin-top:5px;min-height:32px;border-radius:7px;background:#f5f8f6;padding-left:7px}.week-time{font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}.week-choices{display:flex;gap:2px;flex-shrink:0;flex-wrap:nowrap;justify-content:flex-end}.week-opening-many{flex-wrap:wrap}.week-opening-many .week-choices{flex-wrap:wrap;max-width:100%}.week-choices button{display:inline-flex;gap:1px;align-items:center;justify-content:center;min-height:32px;min-width:30px;padding:5px;border:1px solid #cddfd5;background:#fff;border-radius:6px}.week-choices button:hover{background:#e7f3ed;border-color:#49906c}.week-choices button small{font-size:9px;font-weight:700}.week-virtual{color:#09609d!important}.week-office{color:#216344}.week-empty{display:block;font-size:11px;color:#6e8076;padding:10px 0}
.week-more,.week-less,.week-filter button{font-size:11px;border:0;background:transparent;color:#23694a;text-decoration:underline;text-underline-offset:3px;min-height:32px;padding:4px 0}.week-less{margin:0 18px}.week-loading,.week-error{font-size:13px;margin:0;padding:22px 18px}.week-error{color:#a53227}.week-error button{margin-left:6px}.week-filter{font-size:12px;padding:8px 18px;background:#f2f7f4}.week-filter button{margin-left:8px}
.week-key{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;border-top:1px solid #e5ede8;padding:10px 18px;font-size:11px;line-height:1.5}.week-key>span:first-child{display:inline-flex;gap:5px;align-items:center}.week-office-address{display:inline-flex;align-items:center;gap:5px;color:#2b5b46!important;text-decoration:none}.week-office-address:hover{text-decoration:underline}.week-office-address strong{font-weight:650}.week-zone{margin-left:auto;color:#6a7c72;font-size:10px}.week-swipe{display:none}.availability-week :focus-visible{outline:3px solid #7db49b;outline-offset:2px}
@media(max-width:700px){.week-toolbar{padding:12px;gap:8px}.week-title{gap:6px}.week-title h2{font-size:15px}.week-title>span{width:100%;margin-left:23px}.week-key{padding:10px 12px;gap:8px}.week-office-address{flex-basis:100%;align-items:flex-start}.week-key .week-zone{margin-left:0}.week-swipe{display:block;margin:0;padding:4px 12px 10px;font-size:10px;color:#718077}.week-grid{grid-template-columns:repeat(var(--week-days),172px);min-width:calc(var(--week-days)*172px)}}
.week-current svg{display:none}
@media(max-width:700px){.week-toolbar{flex-wrap:nowrap;padding:10px 12px;gap:6px}.week-title{gap:4px;min-width:0}.week-title>svg{display:none}.week-title h2{font-size:14px}.week-title>span{margin-left:0;font-size:11px}.week-toolbar nav{flex-shrink:0}.week-toolbar button{min-width:32px;padding:5px 7px}.week-current svg{display:block}.week-current span{display:none}.week-day{padding:8px}.week-day h3{margin-bottom:8px}.week-more{min-height:26px}.week-key{padding:8px 12px;gap:6px 8px;line-height:1.4}.week-key .week-zone{margin-left:auto;order:0}.week-office-address{order:1}.week-swipe{padding:2px 12px 6px}}
.week-loading{padding:14px 18px}.week-skeleton{display:grid;grid-template-columns:repeat(var(--week-days),minmax(90px,1fr));gap:12px;overflow:hidden;margin-top:14px}.week-skeleton>div{min-width:0;padding:2px 4px}.week-skeleton b{font-size:11px;color:#72867a}.week-skeleton span{display:block;height:22px;margin-top:8px;border-radius:6px;background:linear-gradient(100deg,#eef3ef 20%,#dcebe1 45%,#eef3ef 70%);background-size:250% 100%;animation:week-shimmer 1.8s ease-in-out infinite}.week-skeleton span:last-child{width:70%}.week-freshness{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 18px;border-top:1px solid #e5ede8;font-size:11px;color:#557160}.week-freshness button{background:none;border:0;color:#23694a;font-size:11px;min-height:30px;padding:2px 0;text-decoration:underline;text-underline-offset:3px}
@keyframes week-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}@media(prefers-reduced-motion:reduce){.week-skeleton span{animation:none}}@media(max-width:700px){.week-loading{padding:12px}.week-skeleton{gap:8px}.week-freshness{padding:6px 12px;flex-wrap:wrap}}
.week-disclaimer{font-size:11px;line-height:1.5;color:#61776d;margin:0;padding:7px 18px;border-top:1px solid #e5ede8}.week-freshness button:disabled{opacity:.55;cursor:wait}
</style>
