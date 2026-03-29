<template>
  <div v-if="showFooter" class="powered-by-footer" :class="{ 'powered-by-footer--embedded': variant === 'embedded' }">
    <div v-if="includePoweredBy && showPoweredBy && (platformOrgName || platformLogoUrl)" class="powered-by-content">
      <span class="powered-by-text">Platform powered by</span>
      <img
        v-if="platformLogoUrl"
        :src="platformLogoUrl"
        :alt="platformOrgName || 'Platform'"
        class="powered-by-logo"
        @error="handleLogoError"
      />
      <span v-if="platformOrgName" class="powered-by-name">{{ platformOrgName }}</span>
    </div>
    <div v-if="includeLegal && legalLinksToRender.length" class="legal-links">
      <template v-for="(item, i) in legalLinksToRender" :key="'legal-' + i">
        <a
          v-if="isExternalLegalHref(item.href)"
          :href="item.href"
          class="legal-link"
          target="_blank"
          rel="noopener noreferrer"
        >{{ item.label }}</a>
        <router-link v-else :to="item.href" class="legal-link">{{ item.label }}</router-link>
        <span v-if="i < legalLinksToRender.length - 1" class="legal-sep">|</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBrandingStore } from '../store/branding';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { useSummitStatsChallengeChrome } from '../composables/useSummitStatsChallengeChrome';

const props = defineProps({
  /** Compact layout for public marketing hub / embedded footers */
  variant: {
    type: String,
    default: 'default',
    validator: (v) => v === 'default' || v === 'embedded'
  },
  /** When false, omit “Platform powered by” (e.g. hub footer shows legal separately). */
  includePoweredBy: {
    type: Boolean,
    default: true
  },
  /** When false, omit Privacy / Terms / HIPAA row. */
  includeLegal: {
    type: Boolean,
    default: true
  }
});

const brandingStore = useBrandingStore();
const showPoweredBy = computed(() => brandingStore.showPoweredBy);
const isSummitStatsChrome = useSummitStatsChallengeChrome();

function parseSscFooterLinksJson(raw) {
  if (raw == null) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => ({
      label: String(x?.label || '').trim(),
      href: String(x?.href || x?.url || '').trim()
    }))
    .filter((x) => x.label && x.href)
    .slice(0, 8);
}

const parsedSscFooterLinks = computed(() =>
  parseSscFooterLinksJson(brandingStore.platformBranding?.summit_stats_footer_links_json)
);

const platformHipaaRoute = computed(() => {
  const raw = String(brandingStore.platformBranding?.platform_hipaa_url || '').trim();
  return raw ? '/platformhipaa' : null;
});

const defaultLegalLinks = computed(() => {
  const rows = [
    { label: 'Privacy Policy', href: '/privacypolicy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Public Proof', href: '/publicproof' }
  ];
  if (platformHipaaRoute.value) {
    rows.push({ label: 'Platform HIPAA', href: '/platformhipaa' });
  }
  return rows;
});

const legalLinksToRender = computed(() => {
  if (isSummitStatsChrome.value && parsedSscFooterLinks.value.length) {
    return parsedSscFooterLinks.value;
  }
  return defaultLegalLinks.value;
});

function isExternalLegalHref(href) {
  return /^https?:\/\//i.test(String(href || '').trim());
}

const showFooter = computed(() => {
  const powered =
    props.includePoweredBy && showPoweredBy.value && (platformOrgName.value || platformLogoUrl.value);
  const legal = props.includeLegal && legalLinksToRender.value.length > 0;
  return Boolean(powered || legal);
});

// Get platform organization name and logo from branding store
const platformOrgName = computed(() => {
  return brandingStore.platformBranding?.organization_name?.trim() || '';
});

const platformLogoUrl = computed(() => {
  // Priority 1: Platform organization_logo_url (if set)
  if (brandingStore.platformBranding?.organization_logo_url) {
    return brandingStore.platformBranding.organization_logo_url;
  }
  // Priority 2: Platform organization_logo_path (from icon library)
  if (brandingStore.platformBranding?.organization_logo_path) {
    let iconPath = brandingStore.platformBranding.organization_logo_path;
    if (iconPath.startsWith('/uploads/')) {
      iconPath = iconPath.substring('/uploads/'.length);
    } else if (iconPath.startsWith('/')) {
      iconPath = iconPath.substring(1);
    }
    return toUploadsUrl(iconPath);
  }
  // Priority 3: Fallback to PlotTwistCo logo (only if organization name is set)
  if (platformOrgName.value) {
    return brandingStore.plotTwistCoLogoUrl;
  }
  return null;
});

const handleLogoError = (event) => {
  // Hide logo if it fails to load, show text only
  event.target.style.display = 'none';
};
</script>

<style scoped>
.powered-by-footer {
  padding: 16px 24px;
  text-align: center;
  border-top: 1px solid var(--border);
  background: var(--bg-alt, #f8fafc);
  margin-top: auto;
}

.powered-by-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
  font-weight: 500;
}

.powered-by-text {
  color: var(--text-secondary, #64748b);
}

.powered-by-logo {
  height: 16px;
  width: auto;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.powered-by-logo:hover {
  opacity: 1;
}

.powered-by-name {
  color: var(--text-secondary, #64748b);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.legal-links {
  margin-top: 8px;
  font-size: 12px;
}

.legal-links:first-child {
  margin-top: 0;
}

.legal-link {
  color: var(--text-secondary, #64748b);
  text-decoration: none;
}

.legal-link:hover {
  text-decoration: underline;
  color: var(--text-primary, #334155);
}

.legal-sep {
  margin: 0 8px;
  color: var(--text-secondary, #94a3b8);
}

.powered-by-footer--embedded {
  margin-top: 0;
  padding: 10px 8px 4px;
  border-top: none;
  background: transparent;
}

.powered-by-footer--embedded .powered-by-content {
  font-size: 11px;
}

.powered-by-footer--embedded .legal-links {
  margin-top: 6px;
  font-size: 11px;
}
</style>

