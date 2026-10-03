import { onUnmounted, shallowRef, toValue, watch } from 'vue';

export const schoolCareBridgeBrowserBrand = shallowRef(null);

// Browser identity follows the mounted school workspace, without changing tenant branding.
export function useSchoolCareBridgeBranding(context, enabled = true) {
  const owner = Symbol('school-workspace');
  let previousTitle;
  let previousIcon;
  let appliedTitle;
  let icon;
  const brandIcon = '/assets/schoolcarebridge/logo.png';
  function restore() {
    if (appliedTitle === undefined) return;
    if (document.title === appliedTitle) document.title = previousTitle;
    if (icon?.getAttribute('href') === brandIcon) {
      if (previousIcon === null) icon.removeAttribute('href');
      else icon.setAttribute('href', previousIcon);
    }
    if (schoolCareBridgeBrowserBrand.value?.owner === owner) schoolCareBridgeBrowserBrand.value = null;
    appliedTitle = undefined;
  }
  watch(() => [toValue(context), toValue(enabled)], ([label, on]) => {
    if (!on) return restore();
    if (appliedTitle === undefined) {
      previousTitle = document.title;
      icon = document.querySelector('link[rel="icon"]');
      previousIcon = icon?.getAttribute('href');
    }
    appliedTitle = `${label || 'School workspace'} | SchoolCareBridge`;
    schoolCareBridgeBrowserBrand.value = { owner, title: appliedTitle, favicon: brandIcon };
    document.title = appliedTitle;
    icon?.setAttribute('href', brandIcon);
  }, { immediate: true, flush: 'post' });
  onUnmounted(restore);
}
