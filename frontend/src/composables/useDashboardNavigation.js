import { computed, onScopeDispose, ref, unref, watch } from 'vue';
import api from '../services/api';
import {
  buildAssignedPortalCards, buildDashboardCards, buildDashboardPortals,
  dashboardBaseTabs, dashboardCanAccessToolsAids, dashboardOnboardingComplete,
  dashboardPortalsLabel, programPortalIconUrl, sortDashboardCards
} from '../navigation/dashboardCards.js';
import {
  dashboardMobileNavItems as registeredItems, dashboardNavContext, dashboardNavigationContextKey, clearDashboardMobileNavItems
} from '../navigation/dashboardMobileNav.js';
import { libraryQuickLinks } from '../utils/dashboardLibraryLinks.js';
import { isBookClubAgency } from '../utils/bookClubAgency.js';
import { isSupervisor } from '../utils/helpers.js';
import { canAccessSchoolPortalsSurfaces } from '../utils/schoolPortalsAccess.js';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../utils/skillBuildersSchoolProgramAccess.js';
import { serviceWorkspace, canLoadClinicalSupervision } from '../utils/nluWorkspace.js';
import { noteAidWorkspaceLabel } from '../config/noteAidAccess.js';

const flag = value => value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const orderIds = value => { const ids = parse(value); return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []; };

/** Build the complete menu without mounting the dashboard or loading its panels. */
export function useDashboardNavigation({ user, agency, organizations, brandingStore, dashboardTo, momentumListEnabled, enabled, auricwell }) {
  const dashboardPath = computed(() => {
    const target = unref(dashboardTo);
    return typeof target === 'string' ? target : target?.path || '/dashboard';
  });
  const contextKey = computed(() => dashboardNavigationContextKey(unref(user), unref(agency)?.id, dashboardPath.value, unref(agency), brandingStore.platformBranding));
  const hasRegisteredItems = computed(() => dashboardNavContext.value === contextKey.value && registeredItems.value.length > 0);
  const extra = ref({});
  const savedOrder = ref([]);
  const metadataContext = ref('');
  const role = computed(() => String(unref(user)?.role || '').toLowerCase());
  const club = computed(() => ['affiliation', 'clubwebapp'].includes(String(unref(agency)?.organization_type || unref(agency)?.organizationType || '').toLowerCase()));
  const complete = computed(() => dashboardOnboardingComplete(unref(user), { isClubContext: club.value }));
  const access = computed(() => {
    const org = unref(agency) || {};
    const platform = brandingStore.platformBranding || {};
    const gates = {
      userRole: role.value,
      agencyFeatureFlags: org.feature_flags ?? org.featureFlags,
      platformAvailableAgencyFeaturesJson: platform.available_agency_features_json ?? platform.availableAgencyFeaturesJson,
      tenantAvailableAgencyFeaturesOverrideJson: org.tenant_available_agency_features_json ?? org.tenantAvailableAgencyFeaturesJson
    };
    const coordinator = flag(unref(user)?.has_skill_builder_coordinator_access);
    const skillBuilders = canAccessSkillBuildersSchoolProgramSurfaces(gates);
    return {
      skillBuilders, coordinator,
      eligible: skillBuilders && flag(unref(user)?.skill_builder_eligible),
      coordinatorTools: ['super_admin', 'admin', 'staff', 'support'].includes(role.value) || coordinator,
      provider: ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(role.value),
      schools: canAccessSchoolPortalsSurfaces(gates)
    };
  });

  // Cold entry to Schedule/Profile still needs the selected tenant's service
  // context. Menu visibility never substitutes for server authorization.
  let workspaceGeneration=0;
  watch([()=>unref(user),()=>unref(user)?.status,()=>unref(agency)?.id,()=>!!unref(enabled)],async()=>{
    const run=++workspaceGeneration,person=unref(user),agencyId=Number(unref(agency)?.id);
    if(!person?.id||!agencyId||!unref(enabled)||['client','client_guardian','guardian','school_staff'].includes(person.role))return;
    if(Number(person.workspaceServiceContext?.agencyId)!==agencyId)person.workspaceServiceContext=null;
    const results=await Promise.allSettled([
      api.get('/tutoring-workspace/context',{params:{agencyId},skipGlobalLoading:true}),
      api.get('/childcare/context',{params:{agencyId},skipGlobalLoading:true})
    ]);
    if(run!==workspaceGeneration||unref(user)!==person||Number(unref(agency)?.id)!==agencyId)return;
    const learning=results[0].status==='fulfilled'?results[0].value.data:{};
    const care=results[1].status==='fulfilled'?results[1].value.data:{};
    if(Number(learning.agencyId)!==agencyId&&Number(care.agencyId)!==agencyId)return;
    person.workspaceServiceContext={...learning,agencyId,canChildcare:care.enabled===true&&(care.canWork===true||care.canManage===true),learningOnly:learning.learningOnly===true||(!learning.canClinical&&care.canWork===true&&!care.canManage)};
  },{immediate:true});
  onScopeDispose(()=>{workspaceGeneration++;});

  // Only menu-specific metadata is needed off the dashboard. Discard late replies
  // after a user/tenant change or after the dashboard supplies its live rail.
  let generation = 0;
  watch([contextKey, hasRegisteredItems, () => !!unref(enabled), access, complete], async (_, __, onCleanup) => {
    const run = ++generation;
    onCleanup(() => { generation++; });
    extra.value = {};
    savedOrder.value = [];
    metadataContext.value = contextKey.value;
    const person = unref(user);
    if (!person?.id) { clearDashboardMobileNavItems(); return; }
    if (!unref(enabled) || hasRegisteredItems.value) return;
    try { savedOrder.value = orderIds(localStorage.getItem(`dashboard.railOrder.v1:${person.id}`)); } catch { /* optional cache */ }
    const agencyId = Number(unref(agency)?.id || 0);
    const load = async (key, url, options, transform = data => data) => {
      try {
        const response = await api.get(url, { ...options, skipGlobalLoading: true });
        if (run !== generation) return;
        if (key === 'order') {
          if (response.data?.dashboard_rail_order_json != null) savedOrder.value = orderIds(response.data.dashboard_rail_order_json);
        } else extra.value = { ...extra.value, [key]: transform(response.data) };
      } catch { /* Keep the usable menu if optional metadata is unavailable. */ }
    };
    const requests = [load('order', `/users/${person.id}/preferences`)];
    if (!club.value && ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant', 'admin', 'super_admin', 'support', 'supervisor'].includes(role.value)) {
      if (agencyId) requests.push(load('yearUpdate', '/provider-year-update/me/status', { params: { agencyId } }));
    }
    if (!club.value && canLoadClinicalSupervision(person,unref(agency)) && !isSupervisor(person)) requests.push(load('supervision', '/supervision/my-history-status', undefined, data => !!data?.hasClinicalSupervision));
    if (!club.value && agencyId && complete.value) {
      if (access.value.coordinatorTools) requests.push(load('coordinatorPrograms', '/availability/admin/skill-builders/options', { params: { agencyId } }, data =>
        (Array.isArray(data?.organizations) ? data.organizations : []).filter(org => String(org.organizationType || '').toLowerCase() !== 'school')));
      if (access.value.provider && access.value.skillBuilders) requests.push(load('assignedPrograms', '/skill-builders/me/assigned-program-orgs', { params: { agencyId } }, data =>
        Array.isArray(data?.organizations) ? data.organizations : []));
    }
    await Promise.all(requests);
  }, { immediate: true, flush: 'post' });
  onScopeDispose(() => { generation++; });

  const items = computed(() => {
    if (!unref(enabled) || !unref(user)) return [];
    if (hasRegisteredItems.value) return registeredItems.value;
    const person = unref(user);
    const org = unref(agency);
    const metadata = metadataContext.value === contextKey.value ? extra.value : {};
    const order = metadataContext.value === contextKey.value ? savedOrder.value : [];
    const iconOrg = brandingStore.dashboardIconOrganization;
    const orgSlug = dashboardPath.value.replace(/\/dashboard\/?$/, '').replace(/^\//, '');
    const flags = parse(org?.feature_flags ?? org?.featureFlags);
    const portalCards = buildAssignedPortalCards(unref(organizations) || [], item => programPortalIconUrl(item, brandingStore));
    const portals = buildDashboardPortals({
      user: person, agency: org, brandingStore, orgSlug, cardIconOrgOverride: iconOrg,
      isClubContext: club.value,
      isProviderLikeForSkillBuildersSchedule: access.value.provider,
      isSkillBuilderCoordinator: access.value.coordinator,
      isSkillBuilderEligible: access.value.eligible,
      canAccessSkillBuildersSchoolProgramTenantDashboard: access.value.skillBuilders,
      canSeeSchoolPortalsForCoordinator: access.value.schools,
      hasSkillBuilderCoordinatorToolsAccess: access.value.coordinatorTools,
      providerAssignedProgramOrgs: metadata.assignedPrograms || [],
      subCoordinatorProgramOrgs: metadata.coordinatorPrograms || [],
      providerYearUpdateStatus: metadata.yearUpdate,
      providerPortalCards: portalCards, portalsNestLabel: dashboardPortalsLabel(portalCards),
      programPortalRailIconUrl: item => programPortalIconUrl(item, brandingStore)
    });
    const cards = sortDashboardCards(buildDashboardCards({
      user: person, agency: org, brandingStore, orgSlug, agencyFlags: flags, cardIconOrgOverride: iconOrg,
      filteredTabs: dashboardBaseTabs({
        userStatus: person.status || 'active',
        isPending: ['PREHIRE_OPEN', 'PENDING_SETUP', 'pending'].includes(person.status),
        isClubContext: club.value, isOnboardingComplete: complete.value,
        momentumListEnabled: unref(momentumListEnabled)
      }),
      isOnboardingComplete: complete.value, isClubContext: club.value,
      isSchoolStaff: role.value === 'school_staff', isBookClubContext: isBookClubAgency(org),
      momentumListEnabled: unref(momentumListEnabled), portalsNestCard: portals,
      providerSurfacesEnabled: flags.portalVariant !== 'employee' || flag(flags.submitEnabledForEmployeePortal),
      shiftProgramsEnabledForAgency: flag(flags.shiftProgramsEnabled),
      canAccessToolsAids: !serviceWorkspace(person,org).learningOnly && dashboardCanAccessToolsAids(person),
      hasClinicalSupervision: !!((metadata.supervision ?? person.has_clinical_supervision) || person.capabilities?.hasClinicalSupervision),
      noteWorkspaceLabel: noteAidWorkspaceLabel({ role: person.role, tenant: iconOrg || org, auricwell: !!unref(auricwell) })
    }));
    const decorate = list => {
      const byId = new Map(list.map(card => [card.id, card]));
      const sorted = [];
      for (const id of order) { if (byId.has(id)) { sorted.push(byId.get(id)); byId.delete(id); } }
      return [...sorted, ...byId.values()].map(card => {
        const children = card.id === 'tools_library' ? libraryQuickLinks(card) : card.children;
        return { ...card,
          iconUrl: card.brandIconUrl || brandingStore.getDashboardIconOverrideUrl('dashboard', card.id) || card.iconUrl,
          ...(children ? { children: decorate(children) } : {})
        };
      });
    };
    return decorate(cards);
  });
  return { items, contextKey };
}
