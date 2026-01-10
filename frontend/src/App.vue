<template>
  <BrandingProvider>
    <div id="app">
      <nav v-if="isAuthenticated" class="navbar">
        <div class="container">
          <div class="nav-content">
            <div class="nav-brand">
              <BrandingLogo size="medium" class="nav-logo" />
              <h1 class="nav-title">{{ brandingStore.navigationTitle || (brandingStore.displayName + ' ' + (brandingStore.peopleOpsTerm || 'People Operations')) }}</h1>
            </div>
            <div class="nav-links">
            <!-- Approved employees only see On-Demand Training -->
            <template v-if="user?.type === 'approved_employee'">
              <router-link to="/on-demand-training">On-Demand Training</router-link>
            </template>
            <!-- Regular users and admins see normal navigation -->
            <template v-else>
              <router-link to="/dashboard" v-if="user?.role !== 'admin' && user?.role !== 'super_admin' && user?.role !== 'support' && !isSupervisor(user) && user?.role !== 'clinical_practice_assistant'">Dashboard</router-link>
              <router-link to="/dashboard" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'">My Training</router-link>
              <router-link to="/admin" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'">Admin Dashboard</router-link>
              <router-link to="/account-info" v-if="!isAdmin && !isSupervisor(user) && user?.role !== 'clinical_practice_assistant'">Account Info</router-link>
              <router-link to="/account-info" v-if="isSupervisor(user) || user?.role === 'clinical_practice_assistant'">Account Info</router-link>
              <router-link to="/admin/modules" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)">Training</router-link>
              <router-link to="/admin/documents" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)">Documents</router-link>
              <router-link to="/admin/users" v-if="isAdmin || isSupervisor(user) || user?.role === 'clinical_practice_assistant'">Users</router-link>
              <router-link to="/admin/notifications" v-if="isAdmin && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)">Notifications</router-link>
              <router-link to="/notifications" v-if="isSupervisor(user) || user?.role === 'clinical_practice_assistant'">Notifications</router-link>
              <router-link to="/admin/settings" v-if="(canCreateEdit || user?.role === 'support') && user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)">Settings</router-link>
            </template>
              <span class="user-info">{{ user?.firstName || user?.email }} {{ user?.lastName || '' }}</span>
              <button @click="handleLogout" class="btn btn-secondary">Logout</button>
            </div>
          </div>
        </div>
      </nav>
      <main>
        <AgencySelector v-if="isAuthenticated && !brandingStore.isSuperAdmin" />
        <router-view />
      </main>
      <PoweredByFooter v-if="isAuthenticated" />
    </div>
  </BrandingProvider>
</template>

<script setup>
import { computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from './store/auth';
import { useBrandingStore } from './store/branding';
import { useRouter } from 'vue-router';
import { startActivityTracking, stopActivityTracking } from './utils/activityTracker';
import { isSupervisor } from './utils/helpers.js';
import AgencySelector from './components/AgencySelector.vue';
import BrandingProvider from './components/BrandingProvider.vue';
import BrandingLogo from './components/BrandingLogo.vue';
import PoweredByFooter from './components/PoweredByFooter.vue';

const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const router = useRouter();

const isAuthenticated = computed(() => authStore.isAuthenticated);
const user = computed(() => authStore.user);
const isAdmin = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin' || role === 'support';
});

const canCreateEdit = computed(() => {
  const role = user.value?.role;
  return role === 'admin' || role === 'super_admin';
});

const handleLogout = async () => {
  stopActivityTracking();
  await authStore.logout();
  router.push('/login');
};

// Start/stop activity tracking based on authentication status
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    startActivityTracking();
  } else {
    stopActivityTracking();
  }
}, { immediate: true });

onMounted(async () => {
  // Initialize portal theme on app load (for subdomain detection)
  await brandingStore.initializePortalTheme();
  
  if (isAuthenticated.value) {
    startActivityTracking();
    
    // Check if user role needs to be refreshed (e.g., after role change in database)
    // This helps catch cases where the database role was updated but token still has old role
    try {
      const authStore = useAuthStore();
      if (authStore.user && authStore.refreshUser) {
        await authStore.refreshUser();
        // If role changed, the token is stale - force re-login
        const currentRole = authStore.user?.role;
        if (currentRole && currentRole !== 'super_admin' && authStore.user.email === 'superadmin@plottwistco.com') {
          console.warn('Role mismatch detected. Please log out and log back in to refresh your token.');
          // Optionally auto-logout: await authStore.logout();
        }
      }
    } catch (err) {
      console.error('Error checking user role:', err);
    }
  }
});

onUnmounted(() => {
  stopActivityTracking();
});
</script>

<style scoped>
.navbar {
  background-color: var(--primary);
  color: white;
  padding: 20px 0;
  box-shadow: var(--shadow-lg);
  border-bottom: 3px solid var(--accent);
}

.nav-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-logo {
  flex-shrink: 0;
}

.nav-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  margin: 0;
  white-space: nowrap;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 20px;
}

.nav-links a {
  color: white;
  text-decoration: none;
  padding: 8px 15px;
  border-radius: 5px;
  transition: background-color 0.3s;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  background-color: rgba(255,255,255,0.1);
}

.user-info {
  color: #ecf0f1;
  font-weight: 500;
}

main {
  min-height: calc(100vh - 70px);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
</style>

