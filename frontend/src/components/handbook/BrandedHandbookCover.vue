<template>
  <div :class="['branded-cover', { 'isi-cover': isi, 'landscape-cover': coverImage, 'compact-title': titleLines.some(line => line.replace(/\.$/, '').length > 9) }]" :style="colors" role="img" :aria-label="`${organization} ${titleLines.join(' ')} cover`">
    <img v-if="coverImage" class="cover-landscape" :src="coverImage" alt="" />
    <div v-else class="cover-shapes" aria-hidden="true"><span /><span /><span /></div>
    <div class="cover-heading">
      <img v-if="logo" :src="logo" alt="" class="brand-mark" />
      <span>{{ organization }}</span>
    </div>
    <div class="cover-title"><span class="cover-kicker">{{ isi ? 'Stronger People. Brighter Tomorrows.' : 'Our people. Our work. Our shared direction.' }}</span><strong>{{ titleLines[0] }}<br />{{ titleLines[1].replace(/\.$/, '') }}<span class="cover-dot">.</span></strong><span class="cover-rule" /><p>{{ isi ? 'HEAL · GROW · PERFORM · BELONG' : 'A guide to working well, together.' }}</p></div>
    <footer>{{ isi ? 'Inner Strength Institute' : 'Company edition' }}<span>People &amp; practice</span></footer>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ organization: { type: String, required: true }, presentation: { type: Object, default: () => ({}) }, isi: Boolean, titleLines: { type: Array, default: () => ['Workplace', 'handbook'] } });
const safeColor = (value, fallback) => /^#[a-f0-9]{6}$/i.test(value || '') ? value : fallback;
const colors = computed(() => ({ '--cover-primary': props.isi ? '#0b1f3a' : safeColor(props.presentation.primaryColor, '#223a50'), '--cover-accent': props.isi ? '#2f6b3a' : safeColor(props.presentation.accentColor, '#426c60') }));
const logo = computed(() => props.isi ? '/assets/branding/innerstrength-mark.png' : /^(\/(?!\/)|https:\/\/)/.test(props.presentation.logoUrl || '') ? props.presentation.logoUrl : '');
const coverImage = computed(() => props.isi ? '/assets/tisi/mountain-banner.webp' : /^\/assets\/handbooks\/[a-z0-9-]+\.(jpg|webp|png)$/.test(props.presentation.coverImageUrl || '') ? props.presentation.coverImageUrl : '');
</script>
<style scoped>
.branded-cover{aspect-ratio:3/4;position:relative;isolation:isolate;overflow:hidden;border-radius:4px;background:#f7f8fa;color:#12233a;padding:clamp(12px,2vw,24px);display:flex;flex-direction:column;justify-content:space-between;font-family:var(--handbook-font, var(--font-ptco));box-shadow:0 16px 35px #07162824;min-width:0}.cover-landscape{position:absolute;z-index:-2;width:100%;height:100%;object-fit:cover;inset:0}.isi-cover:before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,#f7f8faf5 0%,#f7f8fad9 30%,#f7f8fae8 64%,#0b1f3a24 100%)}.cover-heading{display:flex;align-items:center;gap:12px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;overflow-wrap:anywhere}.brand-mark{width:32px;height:32px;object-fit:contain}.cover-title{margin-top:12%;position:relative}.cover-kicker{display:block;max-width:20em;line-height:1.7;font-size:10px;font-weight:600;color:var(--cover-accent)}strong{display:block;font-size:clamp(22px,2.8vw,34px);line-height:1.08;font-weight:800;letter-spacing:-.055em;color:var(--cover-primary);margin:22px 0;overflow-wrap:anywhere}.cover-dot{color:var(--cover-accent)}.cover-rule{display:block;width:22%;height:4px;background:var(--cover-accent)}p{font-size:clamp(9px,.9vw,12px);font-weight:700;letter-spacing:.12em;margin-top:20px;line-height:1.8}footer{margin-top:18%;display:flex;justify-content:space-between;gap:12px;border-top:1px solid #12233a35;padding-top:12px;font-size:9px;line-height:1.6;font-weight:600}.cover-shapes{position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,#f7f8fa 45%,#e8edf0)}.cover-shapes span{display:block;position:absolute;bottom:-20%;right:-25%;width:110%;height:55%;border-radius:50%;border:1px solid var(--cover-primary);opacity:.12;transform:rotate(-28deg)}.cover-shapes span:nth-child(2){bottom:-12%;right:-18%}.cover-shapes span:nth-child(3){bottom:-5%;right:-10%;background:var(--cover-accent);opacity:.1}@media(max-width:700px){strong{font-size:clamp(24px,6vw,34px)}.cover-heading{font-size:10px}.cover-kicker{font-size:10px}p{font-size:11px}.brand-mark{width:32px;height:32px}}

/* The cover is a real page layout at both full size and thumbnail size. */
.branded-cover{container-type:inline-size;padding:clamp(10px,1.7vw,24px)}
.cover-heading{font-size:5cqw;gap:4cqw}.brand-mark{width:12cqw;height:12cqw}
.cover-kicker{font-size:4.8cqw}.cover-title{margin-top:8cqw}.cover-title strong{font-size:18cqw;margin:8cqw 0}
.cover-title p{font-size:4.8cqw;margin-top:7cqw}.branded-cover footer{font-size:3.7cqw;margin-top:12cqw;padding-top:5cqw}
.isi-cover:before{background:linear-gradient(180deg,#f7f8faf5 0%,#f7f8fad9 30%,#f7f8fae8 64%,#f7f8faad 100%)}
.landscape-cover:before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,#f7f8faf5 0%,#f7f8faef 42%,#f7f8fa8f 100%)}
.compact-title .cover-title strong{font-size:14cqw;overflow-wrap:normal}
</style>
