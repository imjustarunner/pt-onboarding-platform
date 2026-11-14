import { computed } from 'vue';
import { getActivePinia } from 'pinia';
import { useAgencyStore } from '../store/agency';
import { documentBrandStyle } from '../utils/documentBranding.js';
export function useDocumentBranding(metadata, agencyId) {
  const store = getActivePinia() ? useAgencyStore() : null;
  return computed(() => {
    const id = Number(agencyId?.() || metadata()?.presentation?.agencyBrand?.agencyId || 0);
    const agency = [...(store?.agencies || []), ...(store?.userAgencies || []), ...(store?.currentAgency ? [store.currentAgency] : [])].find(item => Number(item.id) === id);
    return documentBrandStyle(metadata?.() || {}, { agency });
  });
}
