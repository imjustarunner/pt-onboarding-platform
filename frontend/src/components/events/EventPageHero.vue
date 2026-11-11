<script setup>
import { computed, ref, watch } from 'vue';
import { CalendarDays, MapPin, UserRound, CalendarClock } from '@lucide/vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({ event: { type: Object, required: true }, branding: { type: Object, default: () => ({}) }, visibility: { type: String, default: 'Private event' }, status: { type: String, default: '' } });
const failedImage = ref(false);
const image = computed(() => {
  const value = String(props.event.heroImageUrl || props.event.publicHeroImageUrl || '').trim();
  return value && !failedImage.value && !/^(?:javascript|data|vbscript):/i.test(value) ? toUploadsUrl(value) : '';
});
watch(() => props.event.heroImageUrl || props.event.publicHeroImageUrl, () => { failedImage.value = false; });
const location = computed(() => props.event.eventLocationName || props.event.locationName || 'Location to be confirmed');
const address = computed(() => props.event.eventLocationAddress || props.event.locationAddress || 'We’ll share the details here.');
const organizer = computed(() => props.event.organizerNames?.join(', ') || props.branding.agencyName || 'Your event team');
function format(value, options) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '';
  try { return new Intl.DateTimeFormat(undefined, { ...options, timeZone: props.event.timezone || 'America/Denver' }).format(new Date(value)); }
  catch { return new Date(value).toLocaleString(); }
}
const day = computed(() => format(props.event.startsAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) || 'Date & time to be decided');
const time = computed(() => {
  if (!props.event.startsAt) return 'Help choose the details in the event votes.';
  const start = format(props.event.startsAt, { hour: 'numeric', minute: '2-digit' });
  const end = format(props.event.endsAt, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const sameDay = format(props.event.startsAt, { dateStyle: 'short' }) === format(props.event.endsAt, { dateStyle: 'short' });
  return end ? `${start} – ${sameDay ? end : format(props.event.endsAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : start;
});
</script>

<template>
  <header class="event-page-hero" :class="{ 'has-photo': image }" id="event-overview">
    <div class="event-hero-copy">
      <div class="event-hero-labels"><span>{{ branding.agencyName || 'Your organization' }} · {{ visibility }}</span><span v-if="status" class="event-hero-status"><i aria-hidden="true" />{{ status }}</span></div>
      <h1>{{ event.title }}</h1>
      <div class="event-hero-facts">
        <div><CalendarDays :size="25" aria-hidden="true" /><span><strong>{{ day }}</strong><small>{{ time }}</small></span></div>
        <div><MapPin :size="25" aria-hidden="true" /><span><strong>{{ location }}</strong><small>{{ address }}</small></span></div>
        <div><UserRound :size="25" aria-hidden="true" /><span><small>Organized by</small><strong>{{ organizer }}</strong></span></div>
      </div>
      <p v-if="event.description" class="event-hero-description">{{ event.description }}</p>
      <slot />
    </div>
    <div class="event-hero-art" :class="{ 'event-hero-art--photo': image }" aria-hidden="true">
      <img v-if="image" :src="image" alt="" :style="{ objectPosition: event.publicHeroFocalPoint || 'center' }" @error="failedImage = true" />
      <template v-else><span class="event-art-orbit one" /><span class="event-art-orbit two" /><div class="event-art-note"><CalendarClock :size="48" :stroke-width="1.2" /><span>Good things<br />happen together.</span></div><span class="event-art-dot" /></template>
    </div>
  </header>
</template>

<style scoped>
.event-page-hero{position:relative;isolation:isolate;display:flex;overflow:hidden;border:1px solid #ffffff;border-radius:20px;background:linear-gradient(115deg,#fff 60%,#f5f9f7);box-shadow:0 8px 32px #20365208;color:#182438;min-width:0}.event-hero-copy{padding:30px 34px;flex:1;min-width:0;z-index:1}.event-hero-labels{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12px;font-weight:650;color:#26374d}.event-hero-status{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border-radius:30px;color:#176337;background:#edf8ef;font-size:11px}.event-hero-status i{width:6px;height:6px;border-radius:50%;background:#218844}.event-page-hero h1{font-size:clamp(26px,2.65vw,39px);line-height:1.16;letter-spacing:-1.1px;font-weight:760;margin:17px 0 22px;color:#172336;overflow-wrap:anywhere}.event-hero-facts{display:flex;gap:0;max-width:850px}.event-hero-facts>div{display:flex;gap:12px;align-items:center;flex:1;min-width:0;padding:0 22px;border-left:1px solid #e4e9ef}.event-hero-facts>div:first-child{padding-left:0;border:0}.event-hero-facts svg{flex-shrink:0;color:#34445d}.event-hero-facts strong,.event-hero-facts small{display:block;line-height:1.6;overflow-wrap:anywhere}.event-hero-facts strong{font-size:12px;font-weight:650}.event-hero-facts small{font-size:11px;color:#47566d}.event-hero-description{font-size:13px;line-height:1.8;margin:20px 0 0;white-space:pre-wrap;color:#3b4c62;overflow-wrap:anywhere}.event-hero-art{position:relative;width:210px;flex-shrink:0;overflow:hidden;background:#e7f0ec;display:grid;place-items:center}.event-hero-art:before{content:'';position:absolute;width:210px;height:310px;left:-155px;top:-32px;background:#fff;border-radius:50%;z-index:1}.event-hero-art--photo{width:28%;min-width:210px;background:#e7eeeb}.event-hero-art img{width:100%;height:100%;position:absolute;inset:0;object-fit:cover}.event-art-orbit{position:absolute;border:1px solid #c5dacf;border-radius:50%;width:280px;height:280px;top:-140px;right:-100px}.event-art-orbit.two{top:125px;right:-165px;width:330px;height:330px;background:#d8e9e0;border-color:#d8e9e0}.event-art-note{position:relative;z-index:2;transform:rotate(-8deg);padding:25px 19px;background:#ffffffd9;border:1px solid #fff;border-radius:15px;box-shadow:0 12px 30px #264b3812;color:#3f7160;font-size:13px;line-height:1.5;letter-spacing:-.2px;display:grid;gap:15px}.event-art-dot{position:absolute;width:14px;height:14px;background:#a2c7ad;border-radius:50%;top:22px;left:35px}@media(max-width:1050px){.event-hero-art:not(.event-hero-art--photo){width:155px}.event-hero-copy{padding:28px}.event-hero-facts{flex-wrap:wrap;gap:18px}.event-hero-facts>div{flex-basis:40%;padding:0;border:0}.event-hero-facts>div:last-child{flex-basis:100%}}@media(max-width:680px){.event-page-hero{flex-direction:column-reverse;border-radius:16px}.event-hero-art{display:none}.event-hero-art--photo{display:block;width:100%;height:155px;min-width:0}.event-hero-art:before{display:none}.event-hero-copy{padding:23px 21px}.event-page-hero h1{font-size:28px;margin:17px 0 22px}.event-hero-facts{display:grid;gap:17px}.event-hero-facts>div{padding:0}.event-hero-facts strong{font-size:13px}.event-hero-facts small{font-size:12px}.event-hero-labels{gap:10px;font-size:11px}}
</style>
