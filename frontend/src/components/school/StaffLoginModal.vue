<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>School Staff Login</h2>
        <button @click="$emit('close')" class="btn-close" aria-label="Close">×</button>
      </div>
      
      <div class="modal-body">
        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              placeholder="Enter your email"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              placeholder="Enter your password"
              class="form-input"
            />
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <div class="form-actions">
            <button type="button" @click="$emit('close')" class="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="loggingIn">
              <span v-if="loggingIn">Logging in...</span>
              <span v-else>Login</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'login-success']);

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const email = ref('');
const password = ref('');
const loggingIn = ref(false);
const error = ref('');

const handleLogin = async () => {
  if (!email.value || !password.value) {
    error.value = 'Please enter both email and password';
    return;
  }

  loggingIn.value = true;
  error.value = '';

  try {
    const response = await api.post('/auth/login', {
      username: String(email.value || '').trim(),
      password: password.value,
      organizationSlug: props.organizationSlug
    });

    // Token is in HttpOnly cookie; store user in auth store for UI state.
    if (response?.data?.user) {
      authStore.setAuth(null, response.data.user, response.data.sessionId || null);
    }

    // Fetch user's org memberships (source of truth for slug access + routing)
    const userOrgs = await agencyStore.fetchUserAgencies();

    // Verify user is associated with this organization
    const user = authStore.user;
    const isAssociated = userOrgs.some(org => 
      org.slug === props.organizationSlug || 
      org.portal_url === props.organizationSlug
    );

    if (!isAssociated && user?.role !== 'super_admin') {
      error.value = 'You are not authorized to access this organization';
      authStore.clearAuth();
      return;
    }

    // Check if this is a school organization and user should go to school portal
    const orgType = userOrgs.find(org => 
      org.slug === props.organizationSlug || org.portal_url === props.organizationSlug
    )?.organization_type || 'agency';

    // Success - emit event and redirect
    if (orgType === 'school') {
      emit('login-success');
    } else {
      // For non-school organizations, redirect to standard dashboard
      router.push('/dashboard');
      emit('close');
    }
  } catch (err) {
    console.error('Login error:', err);
    error.value = err.response?.data?.error?.message || 'Invalid email or password. Please try again.';
  } finally {
    loggingIn.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 0;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.modal-body {
  padding: 32px;
}

.login-form {
  width: 100%;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fcc;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, var(--primary));
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border);
}
</style>
