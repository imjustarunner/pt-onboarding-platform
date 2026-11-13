import { toUploadsUrl } from '../utils/uploadsUrl.js';
import { isBookClubAgency as isBookClubPortalOrg } from '../utils/bookClubAgency.js';
import { CONVERSA_ICON_URL } from '../constants/conversa.js';
import { isSupervisor } from '../utils/helpers.js';
import { isNoteAidEmployeeRole, isNoteAidEnabledForAgencyFlags, workspaceNoteAidPath } from '../config/noteAidAccess.js';
import { serviceWorkspace, scopedWorkspacePath } from '../utils/nluWorkspace.js';

export function dashboardOnboardingComplete(user, { isClubContext = false, status = user?.status || 'active' } = {}) {
  if (isClubContext) return true;
  const role = String(user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'provider_plus', 'clinical_practice_assistant'].includes(role)) return true;
  if (user?.type === 'approved_employee') return true;
  return ['active_employee', 'active', 'completed', 'terminated_pending', 'terminated'].includes(String(status || '').toLowerCase());
}

export function dashboardBaseTabs({
  userStatus = 'active', isPending = false, isClubContext = false, isOnboardingComplete = false,
  momentumListEnabled = false, checklistCount = 0, trainingCount = 0, documentsCount = 0
} = {}) {
  if (isClubContext) return [];
  const tabs = [
    { id: 'checklist', label: momentumListEnabled ? 'My Work' : 'Checklist', badgeCount: checklistCount },
    { id: 'training', label: 'My Training', brandIconUrl: '/assets/plotline/icon.svg', badgeCount: trainingCount }
  ];
  if (!isOnboardingComplete) tabs.push({ id: 'documents', label: 'Documents', badgeCount: documentsCount });
  return isPending || ['PREHIRE_REVIEW', 'ONBOARDING', 'ready_for_review'].includes(userStatus)
    ? tabs.filter(tab => tab.id !== 'training') : tabs;
}

export function dashboardCanAccessToolsAids(user) {
  return ['admin', 'super_admin', 'support', 'provider', 'provider_plus', 'staff',
    'clinical_practice_assistant', 'supervisor', 'intern', 'intern_plus', 'facilitator', 'school_staff'
  ].includes(String(user?.role || '').toLowerCase());
}

/** Shared rail/menu definitions; callers supply current permissions, tenant flags, and live counts. */
export function buildDashboardCards({
  user, brandingStore, orgSlug = '', agencyFlags = {}, cardIconOrgOverride = null,
  filteredTabs = [], isOnboardingComplete = false, isClubContext = false,
  isSchoolStaff = false, isBookClubContext = false, momentumListEnabled = false,
  portalsNestCard = null, clientActionItemCount = 0, swapClientsTabForFallUpdate = false,
  providerSurfacesEnabled = true, shiftProgramsEnabledForAgency = false,
  canAccessToolsAids = false, hasClinicalSupervision = false, noteWorkspaceLabel = 'Note Workspace', agency = {}
} = {}) {
  const u = user;
  const role = String(u?.role || '').toLowerCase();
  const caps = u?.capabilities || {};
  const isTrueAdmin = role === 'admin' || role === 'super_admin';
  // Supervisors / hiring / payroll caps should still see provider submission surfaces when they
  // are clinician-facing roles (provider_plus, CPA, interns)—not only literal `provider`.
  const isProviderLikeForSubmissions =
    role === 'provider' ||
    role === 'provider_plus' ||
    role === 'intern' ||
    role === 'intern_plus' ||
    role === 'clinical_practice_assistant';
  const isSup = isSupervisor(u);
  const isLimitedAccessNonProvider =
    !isTrueAdmin && !isProviderLikeForSubmissions && (isSup || !!caps?.canManageHiring || !!caps?.canManagePayroll);

  const iconOrg = cardIconOrgOverride;
  const tasksHubPath = orgSlug ? `/${orgSlug}/tasks` : '/tasks';
  const cards = filteredTabs.map((t) => ({
    ...t,
    kind: 'content',
    iconUrl: brandingStore.getDashboardCardIconUrl(
      t.id === 'checklist' && momentumListEnabled ? 'momentum_list' : t.id,
      iconOrg
    ),
    description:
      t.id === 'checklist'
        ? (momentumListEnabled ? 'Your focus digest, checklist, and actionable items.' : 'Training, documents, and custom checklist items.')
        : t.id === 'training'
          ? 'Assigned training modules and progress.'
          : 'Documents that need review or signature.'
  }));

  // Promote Checklist/My Work into a nest: Focus (panel) + Tasks (hub route).
  const checklistIdx = cards.findIndex((c) => String(c?.id) === 'checklist');
  if (checklistIdx >= 0) {
    const base = cards[checklistIdx];
    const momentumIcon =
      brandingStore.getDashboardCardIconUrl('momentum_list', iconOrg) || base.iconUrl;
    cards.splice(checklistIdx, 1, {
      id: 'momentum_nest',
      label: momentumListEnabled ? 'My Work' : 'Checklist',
      kind: 'nest',
      badgeCount: base.badgeCount || 0,
      iconUrl: momentumIcon,
      description: momentumListEnabled
        ? 'Focus digest and your Tasks hub.'
        : 'Checklist and your Tasks hub.',
      children: [
        {
          id: 'checklist',
          label: momentumListEnabled ? 'Focus' : 'Checklist',
          kind: 'content',
          badgeCount: base.badgeCount || 0,
          iconUrl: momentumIcon,
          description: base.description
        },
        {
          id: 'tasks_hub',
          label: 'Tasks',
          kind: 'link',
          to: tasksHubPath,
          badgeCount: 0,
          iconUrl: brandingStore.getDashboardCardIconUrl('checklist', iconOrg) || momentumIcon,
          description: 'Assigned tasks, shared lists, escalations, and meeting actions.'
        }
      ]
    });
  }

  // Post-onboarding cards
  if (isOnboardingComplete) {
    // Overview landing — agency HR dashboard only (not club / Summit surfaces)
    if (!isClubContext) {
      cards.unshift({
        id: 'overview',
        label: 'Overview',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('my', iconOrg),
        description: 'Your day at a glance: schedule, pay period, events, and quick actions.'
      });
    }
    // School staff should not see payroll/claims submission surfaces.
    if (!isSchoolStaff) {
      // My Schedule is personal and should be visible to everyone using the dashboard.
      cards.push({
        id: 'my_schedule',
        label: 'My Schedule',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('my_schedule', iconOrg),
        description: 'View weekly schedule and request availability from the grid.'
      });
      if (!isClubContext) cards.push({
        id: 'meetings', label: 'My Meetings', kind: 'content', badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('meetings', iconOrg) || brandingStore.getDashboardCardIconUrl('my_schedule', iconOrg),
        description: 'Attended meetings, participants, chat, transcripts, and personal notes.'
      });
      if (!isClubContext && portalsNestCard) cards.push(portalsNestCard);
      if (!isClubContext && ['provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant'].includes(String(user?.role||''))) cards.push({
        id:'schools_programs',label:'Schools & Programs',kind:'content',badgeCount:0,
        iconUrl:brandingStore.getDashboardCardIconUrl('clients',iconOrg),description:'Your assigned school portals, programs, and school hours requests.'
      });

      // Provider-only surfaces: hide these for limited-access non-provider users and club context.
      if (!isLimitedAccessNonProvider && !isClubContext) {
        cards.push({
          id: 'clients',
          label: 'My Clients',
          kind: 'content',
          badgeCount: clientActionItemCount || 0,
          iconUrl: brandingStore.getDashboardCardIconUrl('clients', iconOrg),
          description: swapClientsTabForFallUpdate
            ? 'Complete fall client confirmation and assigned-day actions here until the Provider Fall Update is done.'
            : 'Pending client action items — fall confirmation, new clients, and next steps.'
        });
        if (providerSurfacesEnabled && !isClubContext) {
          cards.push({
            id: 'submit',
            label: 'Submit',
            kind: 'content',
            badgeCount: 0,
            iconUrl: brandingStore.getDashboardCardIconUrl('submit', iconOrg),
            description: 'Submit mileage, in-school claims, and more.'
          });
        }
        if (shiftProgramsEnabledForAgency) {
          cards.push({
            id: 'program_shifts',
            label: 'My Shifts',
            kind: 'content',
            badgeCount: 0,
            iconUrl: brandingStore.getDashboardCardIconUrl('my_schedule', iconOrg),
            description: 'Program shift schedule, sign up, and call-off.'
          });
        }
      }
      // Tools hub for My Dashboard rail (Assessments, Games, AI Tools).
      // Top-nav Tools mega-menu is reserved for full portal roles; everyone else uses this nest.
      if (canAccessToolsAids) {
        const iconUrl = brandingStore.getDashboardCardIconUrl('tools_aids', iconOrg);
        const children = [
          {
            id: 'tools_assessments',
            label: 'Assessments & Evaluations',
            kind: 'content',
            toolsTab: 'assessments',
            badgeCount: 0,
            iconUrl,
            description: 'Guest and assigned assessments for discovery and progress.'
          },
          {
            id: 'tools_games',
            label: 'Games and Activities',
            kind: 'content',
            toolsTab: 'games',
            badgeCount: 0,
            iconUrl,
            description: 'Interactive games and session activities for practice and counseling.'
          },
          {
            id: 'tools_ai',
            label: 'AI Tools',
            kind: 'content',
            toolsTab: 'ai',
            badgeCount: 0,
            iconUrl,
            description: 'Note Workspace and other AI documentation aids.'
          }
        ];
        if (caps.canViewLibrary === true && !isSchoolStaff) {
          const libraryPath = orgSlug ? `/${orgSlug}/library` : '/library';
          children.unshift({
            id: 'tools_library',
            label: 'Library',
            kind: 'link',
            to: libraryPath,
            badgeCount: 0,
            iconUrl:
              brandingStore.getDashboardCardIconUrl('library', iconOrg) ||
              brandingStore.getDashboardCardIconUrl('documents', iconOrg) ||
              iconUrl,
            description: 'Guides, templates, care documents, forms, and shared links.'
          });
        }
        cards.push({
          id: 'tools_nest',
          label: 'Tools and Resources',
          kind: 'nest',
          badgeCount: children.reduce((acc, c) => acc + (Number(c.badgeCount) || 0), 0),
          iconUrl,
          description: 'Library, assessments & evaluations, games and activities, and AI tools.',
          children
        });
      }
      // My Shifts: also show for staff/facilitator/intern (shift program participants) when agency has flag
      if (shiftProgramsEnabledForAgency && ['staff', 'facilitator', 'intern'].includes(role)) {
        if (!cards.some((c) => c?.id === 'program_shifts')) {
          cards.push({
            id: 'program_shifts',
            label: 'My Shifts',
            kind: 'content',
            badgeCount: 0,
            iconUrl: brandingStore.getDashboardCardIconUrl('my_schedule', iconOrg),
            description: 'Program shift schedule, sign up, and call-off.'
          });
        }
      }
    } else if (canAccessToolsAids) {
      // School staff and other employees still get the Tools hub when payroll surfaces are hidden.
      const iconUrl = brandingStore.getDashboardCardIconUrl('tools_aids', iconOrg);
      const children = [
        {
          id: 'tools_assessments',
          label: 'Assessments & Evaluations',
          kind: 'content',
          toolsTab: 'assessments',
          badgeCount: 0,
          iconUrl,
          description: 'Guest and assigned assessments for discovery and progress.'
        },
        {
          id: 'tools_games',
          label: 'Games and Activities',
          kind: 'content',
          toolsTab: 'games',
          badgeCount: 0,
          iconUrl,
          description: 'Interactive games and session activities for practice and counseling.'
        },
        {
          id: 'tools_ai',
          label: 'AI Tools',
          kind: 'content',
          toolsTab: 'ai',
          badgeCount: 0,
          iconUrl,
          description: 'Note Workspace and other AI documentation aids.'
        }
      ];
      if (caps.canViewLibrary === true && !isSchoolStaff) {
        const libraryPath = orgSlug ? `/${orgSlug}/library` : '/library';
        children.unshift({
          id: 'tools_library',
          label: 'Library',
          kind: 'link',
          to: libraryPath,
          badgeCount: 0,
          iconUrl:
            brandingStore.getDashboardCardIconUrl('library', iconOrg) ||
            brandingStore.getDashboardCardIconUrl('documents', iconOrg) ||
            iconUrl,
          description: 'Guides, templates, care documents, forms, and shared links.'
        });
      }
      cards.push({
        id: 'tools_nest',
        label: 'Tools and Resources',
        kind: 'nest',
        badgeCount: children.reduce((acc, c) => acc + (Number(c.badgeCount) || 0), 0),
        iconUrl,
        description: 'Library, assessments & evaluations, games and activities, and AI tools.',
        children
      });
    }
    cards.push({
      id: 'my',
      label: 'My Account',
      kind: 'content',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('my', iconOrg),
      description: 'Account info, credentials, and personal preferences.'
    });

    // Club admin: Start new season card (SSTC clubs only)
    if (
      !isBookClubContext &&
      isClubContext &&
      (role === 'admin' || role === 'super_admin')
    ) {
      cards.push({
        id: 'start_new_season',
        label: 'Start New Season',
        kind: 'action',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('challenges', iconOrg),
        description: 'Create a new season for your club.'
      });
    }

    // Messages only on rail (Communications / Contacts / Feed / Seasons / My Learning removed).
    if (!isLimitedAccessNonProvider) {
      cards.push({
        id: 'chats',
        label: 'Messages',
        kind: 'content',
        badgeCount: 0,
        brandIconUrl: CONVERSA_ICON_URL,
        description: isClubContext ? 'Club members online.' : 'Direct messages, channels, threads, and mentions.'
      });
    }

    if (!isClubContext && !isSchoolStaff && ['super_admin','admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant','intern','intern_plus','facilitator','tutor','clinician','assistant_admin'].includes(role)) {
      cards.push({ id: 'staff', label: 'Staff', kind: 'content', badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('staff', iconOrg),
        description: 'Find staff, work numbers and extensions, assigned offices, and website profiles. Start a conversation directly.' });
    }

    // Notifications: embedded in dashboard
    cards.push({
      id: 'notifications',
      label: 'Notifications',
      kind: 'content',
      badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('notifications', iconOrg),
      description: 'Your recent notifications.'
    });
    // Supervision card (supervisors only) – hidden for clubs (no supervision)
    if (!isClubContext && isSupervisor(user)) {
      cards.push({
        id: 'supervision',
        label: 'Supervision',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('supervision', iconOrg),
        description: 'View and support your supervisees.'
      });
    }
    // My supervision card (supervisees – providers, interns, etc. who have supervision sessions) – hidden for clubs
    if (!isClubContext && !isSupervisor(user) && hasClinicalSupervision) {
      cards.push({
        id: 'my_supervision',
        label: 'My Supervision',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('supervision', iconOrg),
        description: 'Your supervision sessions, transcripts, and summaries.'
      });
    }
    // Providers card (provider_plus only) – view all providers as though supervising them
    if (String(u?.role || '').toLowerCase() === 'provider_plus') {
      cards.push({
        id: 'providers',
        label: 'Providers',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getDashboardCardIconUrl('clients', iconOrg)
          || brandingStore.getDashboardCardIconUrl('staff', iconOrg),
        description: 'View and support all providers in your organization.'
      });
    }

    // Program coordinator + Skill Builders admin hubs live under portalsNestCard children.
  }

  const tools = cards.find((card) => card.id === 'tools_nest');
  if (tools && isNoteAidEmployeeRole(role) && isNoteAidEnabledForAgencyFlags(agencyFlags)) {
    cards.push({
      id: 'documentation_hub', label: noteWorkspaceLabel, kind: 'link',
      to: workspaceNoteAidPath(orgSlug), badgeCount: 0,
      iconUrl: brandingStore.getDashboardCardIconUrl('clinical_note_generator', iconOrg)
        || brandingStore.getDashboardCardIconUrl('documents', iconOrg),
      description: `Open ${noteWorkspaceLabel.toLowerCase()} and documentation tools.`
    });
  }
  const workspace = serviceWorkspace(user, agency);
  if (workspace.canTutor) {
    cards.push({id:'tutoring_profile',label:'Tutoring profile',kind:'link',to:scopedWorkspacePath(orgSlug,'/tutoring-profile'),badgeCount:0,description:'Edit your subjects, grades and public introduction.'});
  }
  if (workspace.canChildcare) cards.push({id:'childcare',label:'Childcare',kind:'link',to:scopedWorkspacePath(orgSlug,'/childcare'),badgeCount:0,description:'Schedule childcare, record attendance and clock your work.'});
  if (workspace.learningOnly) {
    const students=cards.find(card=>card.id==='clients');
    if (students && workspace.canTutor) Object.assign(students,{label:'My students',kind:'link',to:scopedWorkspacePath(orgSlug,'/students'),description:'Your assigned tutoring students and learning plans.'});
    return cards.filter(card=>!['documentation_hub','supervision','my_supervision','schools_programs','staff'].includes(card.id) && (workspace.canTutor || card.id!=='clients'));
  }
  return cards;
}

export function sortDashboardCards(items) {
  const cards = (items || []).slice();
  const hasMy = cards.some((c) => String(c?.id) === 'my');

  const orderIndex = (id) => {
    const k = String(id || '');
    if (k === 'portals_nest') return hasMy ? 10 : 4;
    if (hasMy && k.startsWith('portal_org_')) return 10.1;
    if (!hasMy && k.startsWith('portal_org_')) return 4.1;
    // Stable rail order:
    // - Overview first when present (post-onboarding agency dashboard).
    // - If My Account exists (post-onboarding), keep it near the top after Overview.
    // - If My Account doesn't exist yet (during onboarding), Checklist stays first.
    if (hasMy) {
      if (k.startsWith('sub_coord_program_')) return 20;
      // Core: Overview → My Account → My Schedule → Momentum → Messages → Submit → Tools →
      // Notifications → Supervision → Training; gated extras below.
      return ({
        overview: -1,
        my: 0,
        my_schedule: 1,
        meetings: 1.5,
        momentum_nest: 2,
        checklist: 2.1,
        tasks_hub: 2.2,
        documentation_hub: 2.3,
        chats: 3,
        submit: 4,
        tools_nest: 5,
        tools_assessments: 5.1,
        tools_games: 5.2,
        tools_ai: 5.3,
        tools_aids: 5.4,
        notifications: 6,
        supervision: 7,
        my_supervision: 7.5,
        training: 8,
        library: 8.5,
        // Gated extras below core
        portals_nest: 10,
        program_shifts: 11,
        clients: 12,
        staff: 12.5,
        providers: 13,
        documents: 14,
        skill_builders_provider_hub: 15,
        provider_program_portals: 15.1,
        skill_builders_availability: 15.2,
        sub_coordinator_school_portals: 15.3,
        sub_coordinator_program_overview: 15.4,
        payroll: 16
      })[k] ?? 999;
    }
    if (k.startsWith('sub_coord_program_')) return 6;
    return ({
      checklist: 0,
      documentation_hub: 0.5,
      documents: 1,
      training: 2,
      my_schedule: 3,
      schools_programs: 3.2,
      meetings: 3.5,
      skill_builders_provider_hub: 3.7,
      provider_program_portals: 3.8,
      program_shifts: 4,
      sub_coordinator_school_portals: 5,
      sub_coordinator_program_overview: 5.5,
      skill_builders_availability: 6,
      clients: 7,
      tools_nest: 7.1,
      tools_assessments: 7.2,
      tools_games: 7.3,
      tools_ai: 7.4,
      tools_aids: 7.5,
      submit: 8,
      payroll: 9,
      my: 10,
      on_demand_training: 11,
      social_feeds: 12,
      challenges: 12.5,
      communications: 13,
      chats: 14,
      notifications: 15,
      supervision: 16,
      my_supervision: 16.5,
      providers: 17
    })[k] ?? 999;
  };

  return cards.sort((a, b) => {
    const da = orderIndex(a?.id);
    const db = orderIndex(b?.id);
    if (da !== db) return da - db;
    return String(a?.label || '').localeCompare(String(b?.label || ''));
  });
}

function buildPortalHubChildren({
  user, brandingStore, orgSlug = '', agency = null, cardIconOrgOverride = null,
  isClubContext = false, isProviderLikeForSkillBuildersSchedule = false,
  isSkillBuilderCoordinator = false, isSkillBuilderEligible = false,
  canAccessSkillBuildersSchoolProgramTenantDashboard = false,
  canSeeSchoolPortalsForCoordinator = false, hasSkillBuilderCoordinatorToolsAccess = false,
  providerAssignedProgramOrgs = [], providerYearUpdateStatus = null,
  subCoordinatorProgramOrgs = [], programPortalRailIconUrl = () => null
} = {}) {
  if (isClubContext) return [];
  const u = user;
  const role = String(u?.role || '').toLowerCase();
  const caps = u?.capabilities || {};
  const isTrueAdmin = role === 'admin' || role === 'super_admin';
  const isProviderLikeForSubmissions =
    role === 'provider' ||
    role === 'provider_plus' ||
    role === 'intern' ||
    role === 'intern_plus' ||
    role === 'clinical_practice_assistant';
  const isSup = isSupervisor(u);
  const isLimitedAccessNonProvider =
    !isTrueAdmin && !isProviderLikeForSubmissions && (isSup || !!caps?.canManageHiring || !!caps?.canManagePayroll);
  const iconOrg = cardIconOrgOverride;
  const children = [];

  if (!isLimitedAccessNonProvider) {
    const pyu = providerYearUpdateStatus;
    if (pyu?.available) {
      children.push({
        id: 'provider_year_update',
        label: 'Provider Fall Update',
        kind: 'link',
        to: (() => {
          const slug = String(orgSlug || '').trim();
          return slug ? `/${slug}/provider/year-update/flow` : '/provider/year-update/flow';
        })(),
        badgeCount: pyu.showPulse ? 1 : 0,
        pulse: Boolean(pyu.showPulse),
        iconUrl: brandingStore.getAdminQuickActionIconUrl('school_overview', iconOrg),
        description: 'Fall reminders, school events, materials, and schedule review.',
        highlight: true,
      });
    }
    if (isSkillBuilderEligible) {
      children.push({
        id: 'skill_builders_provider_hub',
        label: 'Skill Builders',
        kind: 'modal',
        badgeCount: 0,
        iconUrl: brandingStore.getAdminQuickActionIconUrl('skill_builders_availability', iconOrg),
        description: 'Availability, events, and Skill Builders work schedule.'
      });
    }
    if (
      caps.canAccessOutreach &&
      !['admin', 'support', 'super_admin', 'provider_plus'].includes(role)
    ) {
      const slug = String(orgSlug || '').trim();
      children.push({
        id: 'outreach_hub',
        label: 'Outreach Hub',
        kind: 'link',
        to: slug ? `/${slug}/admin/outreach-hub` : '/admin/outreach-hub',
        badgeCount: 0,
        iconUrl: brandingStore.getAdminQuickActionIconUrl('school_overview', iconOrg),
        description: 'Track school contacts, visits, and partnership stages.'
      });
    }
    if (
      isProviderLikeForSkillBuildersSchedule &&
      providerAssignedProgramOrgs.length > 0
    ) {
      children.push({
        id: 'provider_program_portals',
        label: 'Program Portals',
        kind: 'content',
        badgeCount: 0,
        iconUrl: brandingStore.getAdminQuickActionIconUrl('program_overview', iconOrg),
        description: 'Programs you are assigned to — open one to access event portals.'
      });
    }
  }

  const sbSchoolProgramOn = canAccessSkillBuildersSchoolProgramTenantDashboard;
  if (
    !isSkillBuilderEligible &&
    (role === 'super_admin' || (sbSchoolProgramOn && (role === 'admin' || isSkillBuilderCoordinator)))
  ) {
    const sbIconOrg = agency;
    children.push({
      id: 'skill_builders_availability',
      label: 'Skill Builders',
      kind: 'link',
      to: '/admin/skill-builders-availability',
      badgeCount: 0,
      iconUrl: brandingStore.getAdminQuickActionIconUrl('skill_builders_availability', sbIconOrg),
      description: 'Manage Skill Builder provider availability and settings.'
    });
  }

  if (hasSkillBuilderCoordinatorToolsAccess) {
    const orgOverride = agency;
    if (canSeeSchoolPortalsForCoordinator) {
      children.push({
        id: 'sub_coordinator_school_portals',
        label: 'SchoolCareBridge',
        kind: 'link',
        to: '/admin/school-portals-hub',
        badgeCount: 0,
        iconUrl: brandingStore.getAdminQuickActionIconUrl('school_overview', orgOverride),
        description: 'School overview, all school portals, and add-school entry when enabled for this tenant.'
      });
    }
    children.push({
      id: 'sub_coordinator_program_overview',
      label: 'Program Portals',
      kind: 'link',
      to: '/admin/schools/overview?orgType=program',
      badgeCount: 0,
      iconUrl: brandingStore.getAdminQuickActionIconUrl('program_overview', orgOverride),
      description: 'Manage affiliated program + learning dashboards.'
    });
    for (const org of subCoordinatorProgramOrgs || []) {
      const oid = Number(org.id);
      if (!Number.isFinite(oid) || oid <= 0) continue;
      const name = String(org.name || '').trim() || `Program ${oid}`;
      children.push({
        id: `sub_coord_program_${oid}`,
        label: name,
        kind: 'modal',
        programOrganizationId: oid,
        badgeCount: 0,
        iconUrl: programPortalRailIconUrl(org),
        description: `Portal, availability, events, enrollments, and work schedule for ${name}.`
      });
    }
  }

  return children;
}

export function buildDashboardPortals(options = {}) {
  const { isClubContext = false, providerPortalCards = [], portalsNestLabel = 'Portals', brandingStore, cardIconOrgOverride = null } = options;
  if (isClubContext) return null;
  const hub = buildPortalHubChildren(options);
  const pyuFirst = hub.filter((c) => c.id === 'provider_year_update');
  const hubRest = hub.filter((c) => c.id !== 'provider_year_update');
  // Provider Fall Update always tops the nest when present; school/program portals follow.
  const children = [...pyuFirst, ...providerPortalCards, ...hubRest];
  if (!children.length) return null;
  const totalBadgeCount = children.reduce((sum, child) => sum + (Number(child.badgeCount) || 0), 0);

  return {
    id: 'portals_nest',
    label: portalsNestLabel || 'Portals',
    kind: 'nest',
    badgeCount: totalBadgeCount,
    children,
    iconUrl:
      brandingStore.getAdminQuickActionIconUrl('school_overview', cardIconOrgOverride) ||
      brandingStore.getDashboardCardIconUrl('my_schedule', cardIconOrgOverride) ||
      brandingStore.getDashboardCardIconUrl('my', cardIconOrgOverride),
    description: 'Assigned portals plus school/program hubs and Skill Builders.'
  };
}

const isAgencyOrgType = (org) => String(org?.organization_type || org?.organizationType || 'agency').toLowerCase() === 'agency';
/** School portal rail cards only: matches DB enum `agencies.organization_type = 'school'`. Program, learning, clinical, etc. are not schools. */
const isSchoolPortalOrganization = (org) =>
  String(org?.organization_type || org?.organizationType || '').toLowerCase() === 'school';

/** Book Club lives in the top portals strip — never duplicate it on the left rail. */

const portalOrgType = (org) =>
  String(org?.organization_type || org?.organizationType || '').toLowerCase().trim();
const portalShortTitle = (org) => {
  return String(
    org?.portal_short_title ||
      org?.portalShortTitle ||
      org?.short_title ||
      org?.shortTitle ||
      org?.portal_url ||
      org?.portalUrl ||
      org?.slug ||
      org?.name ||
      'Portal'
  ).trim();
};
const portalLogoUrl = (org) => {
  const candidates = [
    org?.logo_path,
    org?.logoPath,
    org?.icon_file_path,
    org?.iconFilePath,
    org?.logo_url,
    org?.logoUrl,
    org?.icon_url,
    org?.iconUrl
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const value = String(raw).trim();
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/uploads/') || value.startsWith('uploads/')) return toUploadsUrl(value);
  return value;
};

/** Program/school portal pills: prefer uploaded logo URL, then Program overview icon (Icons tab), then master org icon. */
export function programPortalIconUrl(org, brandingStore) {
  const explicitBrand = [
    org?.logo_path,
    org?.logoPath,
    org?.logo_url,
    org?.logoUrl,
    org?.icon_url,
    org?.iconUrl
  ].find((v) => String(v || '').trim());
  if (explicitBrand) {
    const value = String(explicitBrand).trim();
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    if (value.startsWith('/uploads/') || value.startsWith('uploads/')) return toUploadsUrl(value);
    return value;
  }
  const programOverview = brandingStore.getAdminQuickActionIconUrl('program_overview', org);
  if (programOverview) return programOverview;
  const fromPortalLogo = portalLogoUrl(org);
  if (fromPortalLogo) return fromPortalLogo;
  return (
    brandingStore.getDashboardCardIconUrl('my_schedule', org) ||
    brandingStore.getDashboardCardIconUrl('my', org) ||
    brandingStore.getDashboardCardIconUrl('my_schedule')
  );
}

export function buildAssignedPortalCards(organizations, programPortalRailIconUrl) {
  const list = Array.isArray(organizations) ? organizations : [];
  return list
    .filter((org) => !isAgencyOrgType(org) && !isBookClubPortalOrg(org))
    .map((org) => {
      const slug = String(org?.slug || org?.portal_url || org?.portalUrl || '').trim();
      if (!slug) return null;
      const label = portalShortTitle(org);
      const orgType = portalOrgType(org);
      return {
        id: `portal_org_${String(org?.id || slug)}`,
        label,
        kind: 'link',
        to: `/${slug}/dashboard`,
        badgeCount: 0,
        iconUrl: programPortalRailIconUrl(org),
        isSchoolPortal: isSchoolPortalOrganization(org),
        orgType,
        description: `Open ${String(org?.name || label)} portal.`
      };
    })
    .filter(Boolean);
}

export function dashboardPortalsLabel(cards = []) {
  const types = new Set(cards.map((c) => String(c.orgType || '')));
  const parts = [];
  if (types.has('school')) parts.push('Schools');
  if (types.has('program')) parts.push('Programs');
  if (types.has('learning')) parts.push('Learning');
  if (!parts.length) return cards.length ? 'Portals' : '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}
