<template>
  <nav v-if="sections.length > 1" class="profile-section-nav" :aria-label="`${label} sections`">
    <div class="profile-section-nav__heading">
      <span>In {{ label }}</span>
      <span class="profile-section-nav__count">{{ sections.length }} sections</span>
    </div>
    <div class="profile-section-nav__links">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        :class="{ 'is-active': activeSection === section.id }"
        :aria-current="activeSection === section.id ? 'location' : undefined"
        @click="revealSection(section)"
      >{{ section.label }}</button>
    </div>
  </nav>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  root: { type: Object, default: null },
  tabId: { type: String, required: true },
  label: { type: String, required: true }
});

const sections = ref([]);
const activeSection = ref('');
let observer;
let timer;
let generation = 0;

// Use rendered cards so permissions, profile type, and asynchronously loaded
// sections are reflected in the navigation without another catalog to maintain.
function scan(content) {
  const counts = new Map();
  const seen = new Set();
  const next = [];
  for (const element of content.querySelectorAll('section[id], .acct-card, .ov-card, .tab-panel > h2, [data-profile-section]')) {
    if (element.closest('[hidden], [aria-hidden="true"], [role="dialog"], dialog')) continue;
    const heading = element.matches('h2') ? element : element.querySelector('.acct-card-title, .ov-card-title, h2, h3, h4, [data-profile-section-title]');
    const label = heading?.textContent?.trim();
    if (!label) continue;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    if (!element.id) element.id = `profile-section-${props.tabId}-${slug}-${count}`;
    if (seen.has(element.id)) continue;
    seen.add(element.id);
    next.push({ id: element.id, label });
  }
  if (JSON.stringify(next) !== JSON.stringify(sections.value)) sections.value = next;
}

function revealSection(section) {
  const element = props.root?.ownerDocument.getElementById(section.id);
  if (!element || !props.root.contains(element)) return;
  for (let parent = element.parentElement; parent && props.root.contains(parent); parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  activeSection.value = section.id;
  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
}

watch(() => [props.root, props.tabId], async () => {
  const current = ++generation;
  observer?.disconnect();
  clearTimeout(timer);
  sections.value = [];
  activeSection.value = '';
  await nextTick();
  if (current !== generation) return;
  const content = props.root?.querySelector('.tab-content');
  if (!content) return;
  scan(content);
  observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => scan(content), 80);
  });
  observer.observe(content, { subtree: true, childList: true, characterData: true });
}, { immediate: true, flush: 'post' });

onBeforeUnmount(() => {
  generation++;
  observer?.disconnect();
  clearTimeout(timer);
});
</script>

<style scoped>
.profile-section-nav {
  margin: 0 0 20px;
  padding: 14px 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--bg-alt, #f8fafc);
  color: var(--text-primary, #334155);
}
.profile-section-nav__heading { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 14px; font-weight: 650; }
.profile-section-nav__count { font-size: 12px; font-weight: 500; color: var(--text-secondary, #64748b); }
.profile-section-nav__links { display: flex; flex-wrap: wrap; gap: 7px; }
.profile-section-nav__links button {
  padding: 7px 11px;
  border: 1px solid var(--border, #dce4ec);
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.profile-section-nav__links button:hover, .profile-section-nav__links button.is-active { border-color: var(--primary, #2e5d50); color: var(--primary, #2e5d50); background: #f0fdf9; }
.profile-section-nav__links button:focus-visible { outline: 2px solid var(--primary, #2e5d50); outline-offset: 2px; }
</style>
