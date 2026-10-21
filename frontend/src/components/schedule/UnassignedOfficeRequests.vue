<template>
  <section v-if="requests.length" class="room-request-queue" aria-label="Office requests awaiting a room">
    <div class="queue-heading"><div><h3>Requests awaiting a room <span>{{ requests.length }}</span></h3><p>Each request needs one room. These requests do not reserve every room; the CPA can select a suitable room when reviewing.</p></div><router-link v-if="reviewPath" :to="reviewPath">Review requests →</router-link></div>
    <ul><li v-for="r in requests" :key="`${r.id}-${r.date}-${r.startHour}`"><div><strong>{{ r.providerName }}</strong><span class="pending">Pending approval</span></div><div class="when">{{ dateLabel(r.date) }} · {{ hour(r.startHour) }}–{{ hour(r.endHour) }} · {{ frequency(r.frequency) }}</div><div class="preferences">{{ r.preferredRooms?.length ? `Room preferences: ${r.preferredRooms.map((room,i)=>`${i+1}. ${room.label}`).join(' · ')}` : 'No room selected · needs review' }}</div><button v-if="reviewPath" class="review-request" @click="$emit('review', r.key || (r.source === 'booking' ? `booking:${String(r.id).replace('booking-','')}` : `intake:${r.id}`))">Review this request</button></li></ul>
  </section>
</template>
<script setup>
defineEmits(['review']);
defineProps({requests:{type:Array,default:()=>[]},reviewPath:{type:[String,Object],default:''}});
const dateLabel=value=>new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
const hour=value=>`${Number(value)%12||12} ${Number(value)%24<12?'AM':'PM'}`;
const frequency=value=>({ONCE:'One time',WEEKLY:'Weekly',BIWEEKLY:'Every 2 weeks',EVERY_3_WEEKS:'Every 3 weeks',EVERY_4_WEEKS:'Every 4 weeks',MONTHLY:'Monthly'}[value]||value);
</script>
<style scoped>
.review-request { margin-top: 8px; min-height: 44px; border: 1px solid #276448; color: #276448; border-radius: 8px; background: white; padding: 8px 12px; font: inherit; cursor: pointer; }
.room-request-queue{margin:16px 0;padding:18px;border:1px solid #e6cd91;border-radius:14px;background:#fffbef;color:#433719}.queue-heading{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap}.queue-heading h3{margin:0;font-size:16px;color:inherit}.queue-heading h3 span{font-size:12px;background:#f3e5bb;border-radius:20px;padding:3px 8px;margin-left:6px}.queue-heading p{margin:6px 0 0;font-size:13px;line-height:1.5}.queue-heading a{font-weight:600;color:#276448;white-space:nowrap}ul{list-style:none;margin:14px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:10px}li{min-width:0;background:#fff;border:1px solid #ece3cc;border-radius:10px;padding:12px;font-size:13px;line-height:1.5}.pending{display:inline-block;margin-left:10px;font-size:11px;color:#806122;background:#fff2ce;border-radius:15px;padding:2px 7px}.when{margin-top:6px;font-weight:600}.preferences{margin-top:4px;color:#637064}
</style>
