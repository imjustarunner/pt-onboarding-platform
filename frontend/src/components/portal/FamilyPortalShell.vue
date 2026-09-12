<template>
  <div class="family-portal" :style="theme">
    <a class="portal-skip" href="#family-portal-content">Skip to content</a>
    <aside class="portal-sidebar">
      <div class="portal-brand">
        <img v-if="logoUrl && !logoFailed" :src="logoUrl" :alt="`${brandName} logo`" @error="logoFailed = true" />
        <div v-else class="portal-brand-name">{{ brandName || 'Your portal' }}</div>
        <p v-if="brandSubtitle">{{ brandSubtitle }}</p>
        <button class="portal-menu" type="button" :aria-expanded="menuOpen" aria-controls="family-portal-nav" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Close menu' : 'Menu' }} <span aria-hidden="true">☰</span></button>
      </div>
      <div id="family-portal-nav" class="portal-nav-wrap" :class="{ expanded: menuOpen }" @keydown.esc="menuOpen = false">
        <nav aria-label="Your portal">
          <button v-for="item in navigation" :key="item.key" type="button" :class="{ selected: active === item.key }" :aria-current="active === item.key ? 'page' : undefined" @click="navigate(item.key)">
            <PortalIcon :name="item.icon || item.key" /><span>{{ item.label }}</span><span v-if="item.count > 0" class="portal-count">{{ item.count }}</span>
          </button>
        </nav>
        <div class="portal-support">
          <div class="portal-support-art" aria-hidden="true"><PortalIcon name="support" /></div>
          <h2>We’re here for you.</h2><p>Questions about your care, services, or account? Your team can help.</p>
          <button type="button" @click="navigate(supportKey)">Contact your team <PortalIcon name="arrow" /></button>
        </div>
      </div>
    </aside>
    <main id="family-portal-content" class="portal-main" tabindex="-1">
      <header class="portal-topbar">
        <div><p v-if="eyebrow" class="portal-eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p v-if="subtitle" class="portal-subtitle">{{ subtitle }}</p></div>
        <button v-if="userName" class="portal-user" type="button" @click="navigate(accountKey)"><span class="portal-avatar">{{ initials(userName) }}</span><span>{{ userName }}</span><span aria-hidden="true">⌄</span></button>
      </header>
      <slot name="toolbar" />
      <slot />
    </main>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import PortalIcon from './PortalIcon.vue';
import { portalTheme } from '../../utils/familyPortalTheme';
const props = defineProps({ brandName: String, brandSubtitle: String, logoUrl: String, primaryColor: String, title: String, subtitle: String, eyebrow: String, userName: String, navigation: { type: Array, default: () => [] }, active: String, supportKey: { type: String, default: 'messages' }, accountKey: { type: String, default: 'account' } });
const emit = defineEmits(['navigate']);
const menuOpen = ref(false), logoFailed = ref(false);
const theme = computed(() => portalTheme(props.primaryColor));
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
function navigate(key) { menuOpen.value = false; emit('navigate', key); }
watch(() => props.logoUrl, () => { logoFailed.value = false; });
</script>
<style scoped>
.family-portal{display:grid;grid-template-columns:244px minmax(0,1fr);min-height:100vh;background:var(--portal-bg);color:#172746;font-family:var(--font-family,Inter,'Segoe UI',sans-serif);font-size:14px;line-height:1.55;--primary:var(--portal-accent);--primary-color:var(--portal-accent);--primary-hover:var(--portal-accent);--text-primary:#172746;--text-secondary:#52627b;--border:#dfe7f1;--bg:#fff;--bg-muted:var(--portal-tint)}
.family-portal *{box-sizing:border-box}.portal-sidebar{background:#fff;border-right:1px solid #e2eaf3;padding:28px 18px;position:sticky;top:0;height:100vh;overflow-y:auto}.portal-brand img{display:block;width:100%;max-height:82px;object-fit:contain;object-position:left center}.portal-brand-name{font-size:25px;font-weight:750;line-height:1.15;letter-spacing:-.7px;color:#152947;overflow-wrap:anywhere}.portal-brand p{font-size:12px;color:#596b85;margin:10px 0 0}.portal-nav-wrap nav{display:grid;gap:5px;margin-top:34px}.portal-nav-wrap nav button{display:flex;align-items:center;gap:14px;width:100%;padding:12px 14px;color:#2e4261;text-align:left;background:transparent;border:0;border-radius:9px;font:inherit;cursor:pointer}.portal-nav-wrap nav button:hover{background:var(--portal-tint)}.portal-nav-wrap nav button.selected{background:var(--portal-tint);color:var(--portal-accent);font-weight:650}.portal-nav-wrap svg{width:22px;height:22px;flex-shrink:0}.portal-count{margin-left:auto;background:var(--portal-accent);color:var(--portal-on-accent);border-radius:20px;padding:1px 7px;font-size:12px}.portal-support{margin-top:38px;background:linear-gradient(145deg,var(--portal-tint),#f8fafc);border-radius:15px;padding:20px}.portal-support-art{height:65px;display:flex;align-items:center;color:var(--portal-accent)}.portal-support-art svg{width:46px;height:46px}.portal-support h2{font-size:18px;line-height:1.35;margin:8px 0}.portal-support p{font-size:13px;color:#52627b;margin:0 0 18px}.portal-support button{border:0;border-radius:8px;padding:11px 12px;background:var(--portal-accent);color:var(--portal-on-accent);font:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;cursor:pointer}.portal-main{min-width:0;width:100%;max-width:1630px;margin:0 auto;padding:28px 28px 48px;outline:none}.portal-topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:25px}.portal-topbar h1{font-size:clamp(25px,2.35vw,36px);line-height:1.22;letter-spacing:-1px;margin:0;font-weight:720;color:#132546}.portal-subtitle{margin:7px 0 0;color:#596d8e;font-size:16px}.portal-eyebrow{margin:0 0 6px;text-transform:uppercase;letter-spacing:1.8px;font-size:10px;font-weight:700;color:var(--portal-accent)}.portal-user{display:flex;align-items:center;gap:12px;flex-shrink:0;border:0;background:transparent;font:inherit;color:#233855;padding:0;cursor:pointer}.portal-avatar{display:grid;place-items:center;width:43px;height:43px;border-radius:50%;background:var(--portal-tint);color:var(--portal-accent);font-weight:700}.portal-menu{display:none}.portal-skip{position:fixed;top:-60px;left:16px;z-index:500;background:#fff;padding:12px;color:var(--portal-accent)}.portal-skip:focus{top:10px}.family-portal :deep(button:focus-visible),.family-portal :deep(a:focus-visible),.family-portal :deep(input:focus-visible),.family-portal :deep(select:focus-visible){outline:3px solid var(--portal-accent);outline-offset:3px}.family-portal :deep(button){touch-action:manipulation}.family-portal :deep(a){color:var(--portal-accent)}
@media(min-width:1650px){.family-portal{grid-template-columns:270px minmax(0,1fr)}}
@media(max-width:1080px){.family-portal{grid-template-columns:205px minmax(0,1fr)}.portal-sidebar{padding:24px 12px}.portal-main{padding:24px 20px}.portal-user>span:not(.portal-avatar){display:none}.portal-support{padding:16px}}
@media(max-width:760px){.family-portal{display:block}.portal-sidebar{position:relative;height:auto;overflow:visible;padding:16px 20px;border-right:0;border-bottom:1px solid #e2eaf3}.portal-brand{position:relative;padding-right:88px;min-height:40px}.portal-brand img{max-height:48px;max-width:205px}.portal-brand-name{font-size:21px}.portal-brand p{font-size:11px}.portal-menu{display:flex;gap:10px;position:absolute;right:0;top:4px;background:#fff;border:1px solid #d9e3ef;border-radius:8px;padding:10px;color:#243858;font:inherit}.portal-nav-wrap{display:none}.portal-nav-wrap.expanded{display:block}.portal-nav-wrap nav{margin-top:18px;grid-template-columns:repeat(2,minmax(0,1fr))}.portal-nav-wrap nav button{padding:12px 8px;font-size:13px;gap:10px}.portal-support{display:none}.portal-main{padding:24px 16px}.portal-topbar{gap:12px;margin-bottom:20px}.portal-topbar h1{font-size:27px}.portal-subtitle{font-size:14px}.portal-avatar{width:36px;height:36px}.portal-user{padding-top:3px}}
@media(prefers-reduced-motion:reduce){.family-portal :deep(*){scroll-behavior:auto!important;transition:none!important}}
</style>
