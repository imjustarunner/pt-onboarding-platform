import { computed, ref } from 'vue';

/** Nesting depth so parent shells (OrganizationDashboard) + SchoolPortalView stay balanced. */
const depth = ref(0);

export const isSchoolPortalShellActive = computed(() => depth.value > 0);

export function enterSchoolPortalShell() {
  depth.value += 1;
}

export function leaveSchoolPortalShell() {
  depth.value = Math.max(0, depth.value - 1);
}
