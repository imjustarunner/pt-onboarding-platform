<template>
  <Teleport :to="portal">
    <aside v-if="active" ref="bubble" class="dashboard-learning-tip" :style="position" role="dialog" :aria-label="active.title" @pointerdown.stop>
      <strong>{{ active.title }}</strong>
      <p>{{ active.description }}</p>
      <div v-if="active.demo === 'move'" class="tip-demo tip-demo--move" aria-label="Example: move a dashboard section down">
        <div>▣ My Schedule <span>↓</span></div><div>▣ My Work</div>
      </div>
      <div v-else-if="active.demo === 'search'" class="tip-demo tip-demo--search" aria-label="Example: search for My Credentials">
        <div>⌕ My Credentials</div><div class="tip-result">My Account → My Credentials ↗</div>
      </div>
      <div v-else-if="active.demo === 'collapse'" class="tip-demo tip-demo--collapse" aria-label="Example: collapse a card into a small summary">
        <div>My Work <span>↑</span><small>5 notes to complete</small></div>
      </div>
      <div v-else-if="active.demo === 'weekend'" class="tip-demo tip-demo--weekend" aria-label="Example: Settings, Layout, then show weekends">
        <div>⚙ Settings → Layout</div><div class="tip-result">Show weekends <span class="tip-switch" aria-hidden="true"></span></div>
        <div class="tip-week">Mon · Tue · Wed · Thu · Fri <b>· Sat · Sun</b></div>
      </div>
      <div v-else-if="active.demo === 'fullscreen'" class="tip-demo tip-demo--fullscreen" aria-label="Example: expand the calendar, then exit full screen"><div>⛶ My Schedule<small>Mon · Tue · Wed · Thu · Fri</small><small>Exit full screen · Esc</small></div></div>
      <div v-else-if="active.demo === 'colors'" class="tip-demo" aria-label="Example color key"><div>🔵 Client session</div><div>🟣 Supervision</div><div>🟠 Office assigned</div></div>
      <div v-else-if="active.demo === 'library'" class="tip-demo" aria-label="Example: Library quick links"><div>▤ Library</div><div class="tip-result">↳ Workplace Handbook<br />↳ My Files<br />↳ Favorites</div></div>
      <div class="tip-actions"><button type="button" @click="dismiss(false)">Dismiss for now</button><button type="button" class="tip-understand" @click="dismiss(true)">I understand</button></div>
    </aside>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { dashboardLearningTips, learningTipsEligible, learningWindowOpen } from '../../tutorial/dashboardLearningTips.js';

const props = defineProps({ user: Object, cards: { type: Array, default: () => [] }, enabled: Boolean });
const active = ref(null), bubble = ref(null), position = ref({}), understood = ref([]);
const portal = ref('body');
const temporary = new Set();
let target, hoverTimer, autoTimer, interval, firstSeen = 0, mounted = false;
const key = computed(() => `dashboard.learning.v1:${props.user?.id || 'anonymous'}`);
const tips = computed(() => [...dashboardLearningTips, ...props.cards.map(card => ({
  id: `section-${card.id}`, selector: `[data-tour="dash-rail-card-${card.id}"]`, title: card.label,
  description: card.description || `Open ${card.label} from your dashboard navigation.`
}))]);
const eligible = computed(() => props.enabled && learningTipsEligible(props.user));
function save() { try { localStorage.setItem(key.value, JSON.stringify({ firstSeen, understood: understood.value })); } catch { /* Optional preferences. */ } }
function reset() {
  dismiss(false); temporary.clear(); understood.value = []; firstSeen = Date.now();
  try { const saved = JSON.parse(localStorage.getItem(key.value) || '{}'); firstSeen = Number(saved.firstSeen) || firstSeen; understood.value = Array.isArray(saved.understood) ? saved.understood : []; } catch { /* Start this person's tips. */ }
  save();
}
function visible(el) {
  if (!el || el.closest('[inert], [aria-hidden="true"]') || el.disabled) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}
function locate(tip) { return [...document.querySelectorAll(tip.selector)].find(visible); }
function reposition() {
  portal.value = document.fullscreenElement || 'body';
  if (!active.value || !visible(target)) { if (active.value) dismiss(false); return; }
  const r = target.getBoundingClientRect(), h = bubble.value?.offsetHeight || 245;
  const width = Math.min(320, window.innerWidth - 24);
  const top = r.bottom + 10 + h <= window.innerHeight ? r.bottom + 10 : Math.max(12, r.top - h - 10);
  position.value = { width: `${width}px`, left: `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`, top: `${top}px` };
}
function show(tip, el) {
  if (!eligible.value || active.value || understood.value.includes(tip.id) || !visible(el)) return;
  target = el; active.value = tip; target.classList.add('dashboard-tip-target'); reposition(); void nextTick(reposition);
}
function dismiss(permanent) {
  clearTimeout(hoverTimer); clearTimeout(autoTimer);
  if (active.value) {
    temporary.add(active.value.id);
    if (permanent) { understood.value = [...new Set([...understood.value, active.value.id])]; save(); }
  }
  target?.classList.remove('dashboard-tip-target'); target = null; active.value = null;
}
function suggest(railOnly = false) {
  if (!eligible.value || active.value || !learningWindowOpen(props.user, firstSeen)) return;
  const options = tips.value.filter(t => !temporary.has(t.id) && !understood.value.includes(t.id))
    .map(tip => ({ tip, el: locate(tip) })).filter(row => row.el && (!railOnly || row.el.closest('.dashboard-rail-wrap, .dashboard-mobile-drawer')));
  const edit = railOnly && options.find(row => row.tip.id === 'edit-layout');
  const chosen = edit || options[Math.floor(Math.random() * options.length)];
  if (chosen) show(chosen.tip, chosen.el);
}
function over(event) {
  if (!eligible.value || active.value || !(event.target instanceof Element)) return;
  const tip = tips.value.find(t => event.target.closest(t.selector));
  if (tip && !understood.value.includes(tip.id)) {
    const el = event.target.closest(tip.selector);
    if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => show(tip, el), 2000);
  }
  const rail = event.target.closest('.dashboard-rail-wrap, .dashboard-mobile-drawer');
  if (rail && !(event.relatedTarget instanceof Node && rail.contains(event.relatedTarget))) {
    clearTimeout(autoTimer); autoTimer = setTimeout(() => suggest(true), 2500);
  }
}
function out(event) {
  const tip = tips.value.find(t => event.target instanceof Element && event.target.closest(t.selector));
  if (tip) { const el = event.target.closest(tip.selector); if (!(event.relatedTarget instanceof Node && el.contains(event.relatedTarget))) clearTimeout(hoverTimer); }
}
function outside(event) { if (!bubble.value?.contains(event.target)) dismiss(false); }
function keydown(event) { if (event.key === 'Escape') dismiss(false); }
watch(() => props.user?.id, reset);
watch(eligible, value => { if (!value) dismiss(false); else if (mounted) autoTimer = setTimeout(() => suggest(), 5000); });
onMounted(() => {
  mounted = true; reset(); autoTimer = setTimeout(() => suggest(), 5000); interval = setInterval(() => suggest(), 90000);
  document.addEventListener('pointerover', over); document.addEventListener('pointerout', out);
  document.addEventListener('focusin', over); document.addEventListener('focusout', out);
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keydown);
  window.addEventListener('resize', reposition); document.addEventListener('scroll', reposition, true);
  document.addEventListener('fullscreenchange', reposition);
});
onUnmounted(() => {
  mounted = false; dismiss(false); clearInterval(interval);
  document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out);
  document.removeEventListener('focusin', over); document.removeEventListener('focusout', out);
  document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keydown);
  window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true);
  document.removeEventListener('fullscreenchange', reposition);
});
</script>
<style>
.dashboard-learning-tip { position: fixed; z-index: 2200; box-sizing: border-box; padding: 16px; border: 1px solid var(--primary, #247252); border-radius: 14px; background: var(--bg-card, #fff); color: var(--text-primary, #1e293b); box-shadow: 0 10px 40px #0003; font-size: 14px; line-height: 1.5; max-height: calc(100dvh - 24px); overflow: auto; }
.dashboard-learning-tip p { margin: 8px 0 12px; }
.tip-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tip-actions button { cursor: pointer; border: 1px solid var(--border, #cbd5e1); border-radius: 8px; background: var(--bg-card, #fff); color: inherit; padding: 7px 9px; font: inherit; }
.tip-actions .tip-understand { background: var(--primary, #247252); color: #fff; }
.dashboard-tip-target { outline: 2px solid var(--primary, #247252); outline-offset: 3px; animation: dashboard-tip-pulse 1.5s ease-in-out 3; }
.tip-demo { background: var(--bg-alt, #f1f5f9); padding: 10px; border-radius: 8px; margin-bottom: 12px; overflow: hidden; font-size: 12px; }
.tip-demo > div { padding: 6px 8px; background: var(--bg-card, #fff); border: 1px solid var(--border, #cbd5e1); border-radius: 5px; margin: 3px 0; }
.tip-demo span { float: right; }
.tip-demo small { display: block; }
.tip-demo--move > div:first-child { animation: tip-move-down 4s ease-in-out infinite; }
.tip-demo--move > div:last-child { animation: tip-move-up 4s ease-in-out infinite; }
.tip-result { animation: tip-result 4s ease-in-out infinite; }
.tip-demo--collapse > div { animation: tip-collapse 4s ease-in-out infinite; }
.tip-switch { width:28px; height:15px; border-radius:12px; background:#94a3b8; animation:tip-switch-color 5s infinite; }
.tip-switch::before { content:''; display:block; width:11px; height:11px; border-radius:50%; background:#fff; margin:2px; animation:tip-switch-toggle 5s infinite; }
.tip-week b { animation:tip-result 5s infinite; }
.tip-demo--fullscreen > div { transform-origin:center; animation:tip-expand 5s ease-in-out infinite; }
@keyframes tip-switch-toggle { 40%,85% { transform:translateX(13px); } }
@keyframes tip-switch-color { 40%,85% { background:#247252; } }
@keyframes tip-expand { 0%,15%,100% { transform:scale(.8); } 40%,80% { transform:scale(1); padding-bottom:24px; } }
@keyframes dashboard-tip-pulse { 50% { box-shadow: 0 0 0 5px #22c55e33; } }
@keyframes tip-move-down { 35%, 70% { transform: translateY(35px); } }
@keyframes tip-move-up { 35%, 70% { transform: translateY(-35px); } }
@keyframes tip-result { 0%, 30% { opacity: 0; transform: translateY(6px); } 45%, 100% { opacity: 1; transform: none; } }
@keyframes tip-collapse { 0%, 20% { padding-bottom: 36px; } 50%, 85% { padding-bottom: 6px; } }
@media (prefers-reduced-motion: reduce) { .dashboard-tip-target, .tip-demo *, .tip-demo *::before { animation: none !important; } }
</style>
