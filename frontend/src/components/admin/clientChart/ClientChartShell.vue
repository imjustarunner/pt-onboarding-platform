<template>
  <div
    :class="fullPage ? 'cdp-page-shell' : 'cdp-chart-overlay'"
    @click.self="fullPage ? undefined : $emit('close')"
  >
    <ClinicalWorkspaceFrame
      :enabled="clinicalBranding" :mode="workspaceMode" :tenant-id="tenantId" :tenant-name="tenantName"
      :immersive="fullPage" switchable context-label="Client record" :return-label="returnLabel"
      @back="$emit('close')" @update:mode="$emit('workspace-mode', $event)"
      class="client-chart"
      :class="fullPage ? 'cdp-page-body' : 'modal-content large'"
      @click.stop
    >
      <div class="cc-surface">
        <slot name="header" />

        <div class="cc-tab-rail">
          <div class="modal-tabs" role="tablist" aria-label="Client record hubs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.id"
              :class="['tab-button', { active: activeTab === tab.id }]"
              @click="$emit('update:activeTab', tab.id)"
            >
              <span class="cc-tab-title">{{ tab.label }}<svg v-if="tab.description" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></span>
              <span v-if="tab.description" class="cc-tab-description">{{ tab.description }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="subnav.length"
          class="cc-subnav"
          role="navigation"
          :aria-label="`${tabs.find(tab => tab.id === activeTab)?.label || 'Record'} pages`"
        >
          <span class="cc-subnav__label">{{ tabs.find(tab => tab.id === activeTab)?.label }} pages</span>
          <button
            v-for="item in subnav"
            :key="item.id"
            type="button"
            class="cc-subnav__btn"
            :class="{ 'cc-subnav__btn--active': activeSub === item.id }"
            :aria-current="activeSub === item.id ? 'page' : undefined"
            @click="$emit('update:activeSub', item.id)"
          >
            {{ item.label }}
          </button>
        </div>

        <slot name="quick-actions" />

        <div
          v-if="alertItems.length"
          class="cc-alert-bar cdp-alert-bar"
          role="status"
        >
          <button
            v-for="alert in alertItems"
            :key="alert.id"
            type="button"
            class="cc-alert-chip cdp-alert-chip"
            :class="alert.tone ? `cdp-alert-chip--${alert.tone}` : undefined"
            @click="$emit('alert-click', alert)"
          >
            {{ alert.label }}
          </button>
        </div>

        <div class="tab-content">
          <slot />
        </div>
      </div>

      <slot name="footer" />
      <slot name="modals" />
    </ClinicalWorkspaceFrame>
  </div>
</template>

<script setup>
import ClinicalWorkspaceFrame from '../../clinicalWorkspace/ClinicalWorkspaceFrame.vue';
defineProps({
  clinicalBranding: Boolean,
  workspaceMode: { type: String, default: 'clinical' },
  tenantId: { type: [Number, String], default: null }, tenantName: { type: String, default: '' },
  returnLabel: { type: String, default: '' },
  fullPage: { type: Boolean, default: false },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'overview' },
  subnav: { type: Array, default: () => [] },
  activeSub: { type: String, default: '' },
  alertItems: { type: Array, default: () => [] }
});

defineEmits(['close', 'update:activeTab', 'update:activeSub', 'alert-click', 'workspace-mode']);
</script>

<style scoped>
@import '../../../styles/client-chart.css';

.cc-subnav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
}
.cc-tab-title { display:flex; align-items:center; justify-content:center; gap:7px; }
.client-chart .tab-button { flex-direction:column; align-items:center; gap:0; }
.cc-tab-title svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.8; }
.cc-tab-description { display:block; margin-top:4px; font-size:12px; line-height:1.35; font-weight:500; opacity:.8; }
.cc-subnav__label { margin-right:8px; font-size:13px; font-weight:650; color:var(--text-secondary,#64748b); }
.cc-subnav__btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #64748b);
  font-size: 14px;
  font-weight: 650;
  padding: 8px 12px;
  border-radius: 9px;
  cursor: pointer;
}
.cc-subnav__btn:hover {
  color: var(--text-primary, #0f172a);
}
.cc-subnav__btn--active {
  background: var(--bg,#fff);
  border-color: color-mix(in srgb, var(--primary,#166534) 30%, var(--border,#e2e8f0));
  color: var(--primary, #166534);
  box-shadow: none;
}
.cc-subnav__btn:focus-visible { outline:2px solid var(--primary,#166534); outline-offset:2px; }
@media(max-width:600px) { .cc-subnav { padding:10px 12px; } .cc-subnav__label { width:100%; } .cc-tab-description { display:none; } }
</style>
