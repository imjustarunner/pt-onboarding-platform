<template>
  <div class="wo-hub so-hub aw-hub" aria-labelledby="auricwell-management-title">
    <div class="hub-ambient" aria-hidden="true"><span v-for="dot in ambientDots" :key="dot.id" class="hub-ambient-dot" :style="dot.style" /></div>
    <header class="hub-header">
      <div class="hub-brand">
        <div class="hub-icon" aria-hidden="true"><img :src="AURICWELL_MARK_URL" alt="" /></div>
        <div>
          <h1 id="auricwell-management-title" class="hub-title">AuricWell</h1>
          <p class="hub-subtitle">Clients, care, scheduling, and your EHR transition — organized in one place.</p>
          <p v-if="agency" class="aw-practice-name">{{ agency.name }}</p>
        </div>
      </div>
      <div v-if="canManage" class="hub-header-actions">
        <nav class="hub-switcher" aria-label="Switch hub">
          <router-link v-for="item in switcherLinks" :key="item.key" class="hub-switcher-btn" :to="item.to"><AuricWellHubIcon :name="item.icon" :size="13" />{{ item.label }}</router-link>
          <span class="hub-switcher-btn is-active" aria-current="page"><img :src="AURICWELL_MARK_URL" alt="" />AuricWell</span>
        </nav>
        <router-link class="hub-calendar-btn aw-transition-link" :to="transitionHref">Open EHR Transition <span aria-hidden="true">→</span></router-link>
      </div>
    </header>
    <p v-if="!canManage" class="aw-context-message" role="status">Select an organization you administer to open its AuricWell operations.</p>
    <template v-else>
      <div class="hub-layout">
        <div class="hub-stage-wrap">
          <div class="hub-stage" :class="{ 'is-drilled': activeSection }" @mouseleave="hoveredId = null">
            <div class="hub-rings" aria-hidden="true"><span class="hub-ring hub-ring-1 hub-ring-spin-cw" /><span class="hub-ring hub-ring-2 hub-ring-spin-ccw" /><span class="hub-ring hub-ring-3 hub-ring-spin-cw" /><span class="hub-ring hub-ring-orbit hub-ring-spin-ccw" /></div>
            <div class="hub-center-wrap">
              <button type="button" class="hub-center" :class="[activeSection ? `tone-${activeSection.tone}` : 'tone-root', { 'is-clickable': activeSection }]" :aria-label="activeSection ? 'Return to all AuricWell areas' : 'AuricWell hub'" @click="goToRoot">
                <div class="hub-center-icon" aria-hidden="true"><AuricWellHubIcon v-if="activeSection" :name="activeSection.icon" /><img v-else :src="AURICWELL_MARK_URL" alt="" /></div>
                <span class="hub-center-title">{{ activeSection?.label || 'AuricWell' }}</span>
                <span class="hub-center-desc">{{ activeSection?.desc || 'Connected care. One practice workspace.' }}</span>
                <span v-if="activeSection" class="hub-center-back">↑ Return to all areas</span><span v-else class="hub-center-meta">{{ sections.length }} areas</span>
              </button>
            </div>
            <svg class="hub-connectors" aria-hidden="true" viewBox="0 0 600 600">
              <g class="hub-connector-ring-orbit"><circle cx="300" cy="300" r="195" class="hub-connector-ring" /></g>
              <line v-for="(node, index) in orbitNodes" :key="node.id" x1="300" y1="300" :x2="orbitPoint(index).x" :y2="orbitPoint(index).y" class="hub-connector-line" :class="[`tone-${node.tone}`, { active: hoveredId === node.id }]" />
            </svg>
            <div v-for="(node, index) in orbitNodes" :key="node.id" class="hub-orbit-node" :class="`tone-${node.tone}`" :style="orbitStyle(index)">
              <button v-if="!activeSection" type="button" class="hub-satellite hub-satellite--section" :class="[`tone-${node.tone}`, { hovered: hoveredId === node.id }]" :data-area="node.id" :aria-label="`Explore ${node.label}`" @mouseenter="hoveredId = node.id" @focus="hoveredId = node.id" @click="selectSection(node.id)">
                <span class="hub-satellite-icon" aria-hidden="true"><AuricWellHubIcon :name="node.icon" /></span>
                <span class="hub-satellite-title">{{ node.label }}</span><span class="hub-satellite-desc">{{ node.desc }}</span>
                <span class="hub-satellite-pill">{{ node.cards.length }} {{ node.cards.length === 1 ? 'tool' : 'tools' }} <span aria-hidden="true">→</span></span>
              </button>
              <router-link v-else class="hub-satellite hub-satellite-link hub-satellite--card" :class="[`tone-${node.tone}`, { hovered: hoveredId === node.id }]" :to="node.to" :data-operation="node.id" @mouseenter="hoveredId = node.id" @focus="hoveredId = node.id">
                <span class="hub-satellite-icon" aria-hidden="true"><AuricWellHubIcon :name="node.icon" /></span>
                <span class="hub-satellite-title">{{ node.title }}</span><span class="hub-satellite-desc">{{ node.shortDesc }}</span><span class="hub-satellite-pill">Open <span aria-hidden="true">→</span></span>
              </router-link>
              <Transition name="hub-preview">
                <div v-if="!activeSection && hoveredId === node.id" class="hub-preview" :class="[`tone-${node.tone}`, `pos-${previewPosition(index)}`]" @mouseenter="hoveredId = node.id">
                  <div class="hub-preview-title">{{ node.label }}</div>
                  <ul class="hub-preview-list"><li v-for="card in node.cards" :key="card.id"><router-link class="hub-preview-link" :to="card.to"><span class="hub-preview-dot" />{{ card.title }}</router-link></li></ul>
                </div>
              </Transition>
            </div>
          </div>
          <p class="hub-stage-tip"><span class="hub-stage-tip-icon" aria-hidden="true">💡</span><template v-if="activeSection">You’re viewing <strong>{{ activeSection.label }}</strong>. Pick a tool, or click the center to return.</template><template v-else>Hover an area to preview its tools. Click to explore clients, care, scheduling, and practice operations.</template></p>
        </div>
        <aside class="hub-sidebar">
          <section class="hub-sidebar-panel">
            <h2>Start your transition</h2><p class="aw-sidebar-copy">Choose a provider, bring over one client at a time, then review the week’s appointments.</p>
            <div class="hub-quick-links"><router-link v-for="operation in quickLinks" :key="operation.id" class="hub-quick-link" :to="operation.href">{{ operation.label }} <span aria-hidden="true">→</span></router-link></div>
          </section>
          <section class="hub-sidebar-panel"><h2>Your top 5</h2><HubTopCardsBar :cards="allCards" :limit="5" /></section>
        </aside>
      </div>
      <div class="hub-mobile-fallback">
        <section v-for="section in sections" :key="section.id" class="hub-mobile-section">
          <h2>{{ section.label }}</h2>
          <div class="hub-mobile-grid"><router-link v-for="card in section.cards" :key="card.id" class="hub-mobile-card" :class="`tone-${section.tone}`" :to="card.to" :data-operation="card.id"><span class="hub-mobile-icon" aria-hidden="true"><AuricWellHubIcon :name="section.icon" :size="18" /></span><div><h3 class="hub-mobile-title">{{ card.title }}</h3><p>{{ card.shortDesc }}</p></div></router-link></div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { auricwellAppBase } from '../../auricwell/paths';
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand';
import { buildAuricWellOperations, canManageAuricWell } from '../../navigation/auricwellManagement.js';
import { buildAuricWellOperationSections } from '../../navigation/auricwellOperationSections.js';
import { buildHubSwitcherLinks, workspaceNavContextFromStores } from '../../utils/workspaceNavAccess';
import AuricWellHubIcon from '../auricwell/AuricWellHubIcon.vue';
import HubTopCardsBar from './HubTopCardsBar.vue';

const props = defineProps({ scopedAgencyId: { type: [String, Number], default: null } });
const agencyStore = useAgencyStore(), authStore = useAuthStore(), brandingStore = useBrandingStore();
const agency = computed(() => {
  const current = agencyStore.currentAgency;
  return current && (!props.scopedAgencyId || Number(current.id) === Number(props.scopedAgencyId)) ? current : null;
});
const canManage = computed(() => canManageAuricWell(authStore.user, agency.value));
const operations = computed(() => buildAuricWellOperations({ user: authStore.user, agency: agency.value, platformBranding: brandingStore.platformBranding || {}, appBase: auricwellAppBase() }));
const sections = computed(() => buildAuricWellOperationSections(operations.value));
const activeSectionId = ref(null), hoveredId = ref(null);
const activeSection = computed(() => sections.value.find(section => section.id === activeSectionId.value));
const orbitNodes = computed(() => activeSection.value?.cards || sections.value);
const allCards = computed(() => sections.value.flatMap(section => section.cards));
const transitionHref = computed(() => operations.value.find(operation => operation.id === 'transition')?.href || '');
const quickLinks = computed(() => ['transition', 'providers', 'clients', 'schedule'].map(id => operations.value.find(operation => operation.id === id)).filter(Boolean));
const switcherLinks = computed(() => buildHubSwitcherLinks(workspaceNavContextFromStores({ role: authStore.user?.role, user: authStore.user, slug: agency.value?.slug || agency.value?.portal_url, agency: agency.value, branding: brandingStore })));
function goToRoot() { activeSectionId.value = null; hoveredId.value = null; }
function selectSection(id) { activeSectionId.value = id; hoveredId.value = null; }
watch(() => agency.value?.id, goToRoot);
watch(sections, () => { if (activeSectionId.value && !activeSection.value) goToRoot(); });
function orbitPoint(index) { const angle = (-90 + 360 / orbitNodes.value.length * index) * Math.PI / 180; return { x: 300 + 195 * Math.cos(angle), y: 300 + 195 * Math.sin(angle) }; }
function orbitStyle(index) { const point = orbitPoint(index); return { left: `${point.x / 6}%`, top: `${point.y / 6}%`, transform: 'translate(-50%, -50%)' }; }
function previewPosition(index) { const { x, y } = orbitPoint(index); return y < 228 ? 'bottom' : y > 372 ? 'top' : x < 252 ? 'right' : 'left'; }
const ambientDots = Array.from({ length: 24 }, (_, id) => ({ id, style: { top: `${6 + (id * 37 % 88)}%`, left: `${3 + (id * 29 % 94)}%`, width: `${3 + id % 5}px`, height: `${3 + id % 5}px`, animationDelay: `${id % 16}s`, '--dot-duration': `${9 + id % 12}s`, '--drift-x': `${id % 2 ? 8 : -8}px`, '--drift-y': `${id % 3 ? -6 : 6}px` } }));
</script>

<style scoped src="../../styles/operationsHub.css"></style>
<style scoped>
.hub-icon { flex-shrink: 0; }
.hub-icon img { width: 32px; height: 32px; object-fit: contain; }
.hub-center-icon img { width: 36px; height: 36px; object-fit: contain; }
.hub-switcher { flex-wrap: wrap; }
.hub-switcher-btn img { width: 15px; height: 15px; object-fit: contain; }
.hub-header-actions { max-width: 100%; }
.aw-practice-name { margin: 6px 0 0; color: var(--hub-muted); font-size: 12px; font-weight: 600; }
.aw-transition-link { border-color: color-mix(in srgb, var(--primary, #1f6b4a) 35%, var(--hub-line)); }
.aw-sidebar-copy { color: var(--hub-muted); font-size: 13px; line-height: 1.6; }
.aw-context-message { position: relative; padding: 24px; background: var(--hub-panel); border: 1px solid var(--hub-line); border-radius: 14px; }
.hub-satellite-desc { display: block; }
.hub-satellite:focus-visible, .hub-center:focus-visible { outline: 3px solid var(--primary, #1f6b4a); outline-offset: 5px; }
@media (max-width: 820px) { .aw-hub { padding: 20px 16px 32px; } .hub-header-actions { justify-content: flex-start; } .hub-switcher { gap: 2px; } .hub-switcher-btn { padding: 7px 9px; font-size: 12px; } }
</style>
<style src="../../styles/hubSectionTones.css"></style>
