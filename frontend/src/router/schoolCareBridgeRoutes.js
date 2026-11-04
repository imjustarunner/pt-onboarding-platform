// Register shared SchoolCareBridge workspaces explicitly: the school slug route
// cannot match /app/partners/:slug or distinguish /app/operations from a school.
export const schoolCareBridgeRoutes = [
  { path: '/schoolcarebridge/session-ended', name: 'SchoolCareBridgeSessionEnded', component: () => import('../views/school/SchoolCareBridgeSessionEnded.vue'), meta: { requiresGuest: false } },
  { path: '/schoolcarebridge/app', name: 'SchoolCareBridgeLogin', component: () => import('../views/school/SchoolCareBridgeEntryView.vue'), meta: { schoolCareBridgeEntry: true } },
  { path: '/schoolcarebridge/app/operations', name: 'SchoolCareBridgeOperations', component: () => import('../views/school/SchoolCareBridgeOperationsView.vue'), meta: { schoolCareBridgeEntry: true, requiresAuth: true, hideNav: true } },
  { path: '/schoolcarebridge/app/partners/:partnerSlug/:partnerSection(schools|clients|providers|settings|agreement)?', name: 'SchoolCareBridgePartner', component: () => import('../views/school/SchoolCareBridgePartnerView.vue'), meta: { schoolCareBridgeEntry: true, hideNav: true } },
  { path: '/schoolcarebridge/app/partners/:partnerSlug/tasks/documents/:taskId/sign', name: 'SchoolCareBridgePartnerDocumentSigning', component: () => import('../views/DocumentSigningView.vue'), meta: { requiresAuth: true, requiresCapability: 'canSignDocuments', hideNav: true } },
  { path: '/schoolcarebridge/app/:organizationSlug', name: 'SchoolCareBridgeSchool', component: () => import('../views/school/SchoolCareBridgeEntryView.vue'), meta: { schoolCareBridgeEntry: true, organizationSlug: true } }
];

// Aliases retain each workflow's identity, role guards and component.
const workflowAliases = new Set(['OrganizationResetPassword', 'OrganizationChangePassword', 'OrganizationSchoolProviderProfile', 'OrganizationDocumentSigning', 'OrganizationDocumentReview', 'OrganizationDocumentPrint', 'OrganizationSchoolReinitPublic', 'OrganizationSchoolOverviewDashboard']);
export function addSchoolCareBridgeWorkflowAliases(routes) {
  for (const route of routes) {
    if (!workflowAliases.has(route.name)) continue;
    route.alias = [...(Array.isArray(route.alias) ? route.alias : route.alias ? [route.alias] : []), route.path.replace('/:organizationSlug', '/schoolcarebridge/app/:organizationSlug')];
  }
}
