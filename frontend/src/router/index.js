import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { getDashboardRoute } from '../utils/router';
import { getLoginUrl } from '../utils/loginRedirect';

const routes = [
  {
    path: '/:agencySlug/login',
    name: 'AgencyLogin',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true, agencySlug: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/initial-setup/:token',
    name: 'InitialSetup',
    component: () => import('../views/InitialSetupView.vue'),
    meta: { requiresGuest: false } // Allow authenticated users to complete setup
  },
  {
    path: '/:agencySlug/initial-setup/:token',
    name: 'AgencyInitialSetup',
    component: () => import('../views/InitialSetupView.vue'),
    meta: { requiresGuest: false, agencySlug: true } // Allow authenticated users to complete setup
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true, blockApprovedEmployees: true }
  },
  {
    path: '/module/:id',
    name: 'Module',
    component: () => import('../views/ModuleView.vue'),
    meta: { requiresAuth: true, blockPendingUsers: true }
  },
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: () => import('../views/admin/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/modules',
    name: 'ModuleManager',
    component: () => import('../views/admin/ModuleManager.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/modules/:id/content-editor',
    name: 'ModuleContentEditor',
    component: () => import('../views/admin/ModuleContentEditor.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/users/:userId',
    name: 'UserProfile',
    component: () => import('../views/admin/UserProfileView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/users',
    name: 'UserManager',
    component: () => import('../views/admin/UserManager.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/settings',
    name: 'Settings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/documents',
    name: 'DocumentsLibrary',
    component: () => import('../views/admin/DocumentsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/agency-progress',
    name: 'AgencyProgress',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/agencies/:agencyId/progress',
    name: 'AgencyProgressById',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/admin/agencies',
    name: 'Agencies',
    redirect: '/admin/settings?tab=agencies'
  },
  {
    path: '/admin/notifications',
    name: 'Notifications',
    component: () => import('../views/admin/NotificationsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'admin' }
  },
  {
    path: '/notifications',
    name: 'SupervisorNotifications',
    component: () => import('../views/SupervisorNotificationsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'supervisor_or_cpa' }
  },
  {
    path: '/tracks',
    name: 'Tracks',
    component: () => import('../views/TracksView.vue'),
    meta: { requiresAuth: true, blockPendingUsers: true }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('../views/TasksView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/tasks/documents/:taskId/sign',
    name: 'DocumentSigning',
    component: () => import('../views/DocumentSigningView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/onboarding',
    name: 'OnboardingChecklist',
    component: () => import('../views/OnboardingChecklistView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/account-info',
    name: 'AccountInfo',
    component: () => import('../views/AccountInfoView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/passwordless-login',
    name: 'PasswordlessLogin',
    component: () => import('../views/PasswordlessLoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/passwordless-login/:token',
    name: 'PasswordlessTokenLogin',
    component: () => import('../views/PasswordlessTokenLoginView.vue'),
    meta: { requiresGuest: false } // Allow authenticated users (they might be redirected here)
  },
  {
    path: '/:agencySlug/passwordless-login/:token',
    name: 'AgencyPasswordlessTokenLogin',
    component: () => import('../views/PasswordlessTokenLoginView.vue'),
    meta: { requiresGuest: false, agencySlug: true }
  },
  {
    path: '/pending-completion',
    name: 'PendingCompletion',
    component: () => import('../views/PendingCompletionView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/on-demand-training',
    name: 'OnDemandTrainingLibrary',
    component: () => import('../views/OnDemandTrainingLibraryView.vue'),
    meta: { requiresAuth: true, requiresApprovedEmployee: true }
  },
  {
    path: '/on-demand-training/modules/:id',
    name: 'OnDemandModuleView',
    component: () => import('../components/on-demand/OnDemandModuleViewer.vue'),
    meta: { requiresAuth: true, requiresApprovedEmployee: true }
  },
  {
    path: '/',
    redirect: '/dashboard' // Will be overridden by beforeEach guard if user is authenticated
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const userStatus = authStore.user?.status;
  const isPending = userStatus === 'pending';
  const isReadyForReview = userStatus === 'ready_for_review';
  
  // Handle root path redirect based on user role
  if (to.path === '/' && authStore.isAuthenticated) {
    next(getDashboardRoute());
    return;
  }
  
  // Block pending users from accessing training modules and certain routes
  if (to.meta.blockPendingUsers && isPending) {
    next('/dashboard');
    return;
  }
  
  // Block ready_for_review users from accessing most routes (access is locked)
  if (isReadyForReview && to.path !== '/pending-completion' && to.path !== '/dashboard') {
    next('/pending-completion');
    return;
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Redirect to appropriate login page based on user's agency
    const loginUrl = getLoginUrl(authStore.user);
    next(loginUrl);
  } else if (to.meta.requiresGuest && authStore.isAuthenticated) {
    // Allow access to initial-setup and passwordless-login even if authenticated
    // (user might be completing setup flow)
    if (to.path.includes('/initial-setup/') || to.path.includes('/passwordless-login/')) {
      next();
    } else {
      // Redirect to appropriate dashboard based on user role
      next(getDashboardRoute());
    }
  } else if (to.meta.requiresApprovedEmployee) {
    // ACTIVE_EMPLOYEE/TERMINATED_PENDING users can access on-demand training
    const canAccessOnDemand = authStore.user?.status === 'ACTIVE_EMPLOYEE' || 
                              authStore.user?.status === 'TERMINATED_PENDING' ||
                              authStore.user?.status === 'active' ||
                              authStore.user?.status === 'completed';
    if (canAccessOnDemand) {
      next();
    } else {
      // Redirect to appropriate dashboard
      next(getDashboardRoute());
    }
  } else if (to.meta.requiresRole) {
    const userRole = authStore.user?.role;
    const requiredRole = to.meta.requiresRole;
    
    // Block CPAs and supervisors from accessing restricted routes
    const restrictedRoutes = ['/admin/modules', '/admin/documents', '/admin/settings'];
    if ((userRole === 'clinical_practice_assistant' || userRole === 'supervisor') && 
        restrictedRoutes.some(route => to.path.startsWith(route))) {
      next('/admin'); // Redirect to admin dashboard
      return;
    }
    
    // Super admin, admin, support, supervisors, and CPAs can access admin routes
    if (requiredRole === 'admin' && (userRole === 'admin' || userRole === 'super_admin' || userRole === 'support' || userRole === 'supervisor' || userRole === 'clinical_practice_assistant')) {
      next();
    } else if (requiredRole === 'supervisor_or_cpa' && (userRole === 'supervisor' || userRole === 'clinical_practice_assistant')) {
      next();
    } else if (userRole === requiredRole) {
      next();
    } else {
      // Redirect to appropriate dashboard
      next(getDashboardRoute());
    }
  } else if (to.meta.blockApprovedEmployees) {
    // This meta tag is no longer needed but kept for backward compatibility
    next();
  } else {
    // Block ARCHIVED users from all routes
    if (authStore.user?.status === 'ARCHIVED') {
      next('/login');
      return;
    }
    
    next();
  }
});

export default router;

