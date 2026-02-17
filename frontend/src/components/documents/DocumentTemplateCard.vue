<template>
  <div 
    class="template-card" 
    :class="getAgencyClass(template.agency_id)"
    :style="getCardStyle(template)"
  >
    <div class="card-header">
      <div class="card-header-content">
        <img 
          v-if="getDisplayIconUrl()" 
          :src="getDisplayIconUrl()" 
          :alt="getDisplayIconAlt()"
          class="document-icon"
          @error="handleIconError"
          @load="handleIconLoad"
        />
        <h3>{{ template.name }}</h3>
      </div>
    </div>
    <div class="badges">
      <span :class="['badge', template.is_active !== false && template.is_active !== 0 ? 'badge-success' : 'badge-secondary']">
        {{ template.is_active !== false && template.is_active !== 0 ? 'Active' : 'Inactive' }}
      </span>
      <span :class="['badge', getActionBadgeClass(template.document_action_type)]">
        {{ formatActionType(template.document_action_type) }}
      </span>
      <span :class="['badge', template.template_type === 'pdf' ? 'badge-info' : 'badge-secondary']">
        {{ template.template_type.toUpperCase() }}
      </span>
      <span v-if="template.document_type" :class="['badge', 'badge-primary']">
        {{ formatDocumentType(template.document_type) }}
      </span>
      <span v-if="template.is_user_specific" class="badge badge-warning">User-Specific</span>
      <span v-else-if="template.agency_id === null" class="badge badge-secondary">Platform</span>
      <span v-else class="badge badge-success">Agency</span>
    </div>
    
    <p :class="['description', { collapsed: !descriptionExpanded && canExpandDescription }]">
      {{ descriptionText }}
    </p>
    <button
      v-if="canExpandDescription"
      type="button"
      class="description-toggle"
      @click="descriptionExpanded = !descriptionExpanded"
    >
      {{ descriptionExpanded ? 'Show less' : 'Show more' }}
    </button>
    
    <div class="card-meta">
      <span class="version">Version {{ template.version }}</span>
      <span v-if="template.created_at" class="created">
        Created {{ formatDate(template.created_at) }}
      </span>
    </div>

    <div class="card-actions">
      <button @click="$emit('assign', template)" class="btn btn-sm btn-primary assign-button">
        📋 Assign to Users
      </button>
      <button @click="handlePreview" class="btn btn-sm btn-secondary">Preview</button>
      <button @click="$emit('duplicate', template)" class="btn btn-sm btn-info">Duplicate</button>
      <button v-if="canEdit" @click="$emit('edit', template)" class="btn btn-sm btn-secondary">Edit</button>
      <button
        v-if="canEdit && template.template_type === 'pdf' && template.document_action_type !== 'review'"
        @click="$emit('upload-version', template)"
        class="btn btn-sm btn-secondary"
      >
        Upload New Version
      </button>
      <button v-if="canEdit" @click="$emit('view-versions', template)" class="btn btn-sm btn-secondary">Versions</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { getBackendBaseUrl, toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  template: {
    type: Object,
    required: true
  },
  filterAgencyId: {
    type: String,
    default: 'all'
  },
  availableAgencies: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['assign', 'edit', 'delete', 'view-versions', 'preview', 'toggle-status', 'upload-version', 'duplicate']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const canEdit = computed(() => {
  if (authStore.user?.role === 'super_admin') return true;
  if (authStore.user?.role === 'support') {
    // Support can only edit documents they created
    return props.template.created_by_user_id === authStore.user?.id;
  }
  if (authStore.user?.role === 'admin') {
    // Agency Admin can edit their agency's templates or platform templates
    if (props.template.agency_id === null) return true;
    const userAgencies = agencyStore.userAgencies || [];
    return userAgencies.some(a => a.id === props.template.agency_id);
  }
  return false;
});

const canDelete = computed(() => {
  if (authStore.user?.role === 'super_admin') return true;
  if (authStore.user?.role === 'support') {
    // Support can only delete documents they created
    return props.template.created_by_user_id === authStore.user?.id;
  }
  if (authStore.user?.role === 'admin') {
    // Agency Admin can delete their agency's templates or platform templates
    if (props.template.agency_id === null) return true;
    const userAgencies = agencyStore.userAgencies || [];
    return userAgencies.some(a => a.id === props.template.agency_id);
  }
  return false;
});

const descriptionExpanded = ref(false);
const descriptionText = computed(() => {
  const text = String(props.template?.description || '').trim();
  return text || 'No description';
});
const canExpandDescription = computed(() => descriptionText.value.length > 180);

const handlePreview = () => {
  if (props.template.template_type === 'pdf') {
    // For PDFs, we'd need to download or show in iframe
    // For now, emit preview event
    emit('preview', props.template);
  } else {
    // For HTML, show in modal
    emit('preview', props.template);
  }
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString();
};

const formatDocumentType = (type) => {
  const types = {
    acknowledgment: 'Acknowledgment',
    authorization: 'Authorization',
    agreement: 'Agreement',
    audio_recording_consent: 'Audio Recording Consent',
    hipaa_security: 'HIPAA Security',
    compliance: 'Compliance',
    disclosure: 'Disclosure',
    consent: 'Consent',
    administrative: 'Administrative'
  };
  return types[type] || type;
};

const formatActionType = (actionType) => {
  const t = String(actionType || '').toLowerCase();
  if (t === 'signature') return 'Signature';
  if (t === 'review') return 'Review';
  return 'Unknown';
};

const getActionBadgeClass = (actionType) => {
  const t = String(actionType || '').toLowerCase();
  if (t === 'signature') return 'badge-info';
  if (t === 'review') return 'badge-secondary';
  return 'badge-secondary';
};

const getIconUrl = (template) => {
  // Check if template has icon data
  if (!template) {
    return null;
  }
  
  // Check if icon_id exists
  if (!template.icon_id) {
    return null;
  }
  
  // Use icon_file_path if available (from join)
  let iconPath = template.icon_file_path;
  
  // Debug: Log what we have
  console.log('DocumentTemplateCard - Template:', template.name, {
    icon_id: template.icon_id,
    icon_file_path: iconPath,
    icon_name: template.icon_name,
    fullTemplate: template
  });
  
  // If no icon_file_path but icon_id exists, the join didn't work
  if (!iconPath && template.icon_id) {
    console.warn('⚠️ Template has icon_id but no icon_file_path. Join may have failed:', {
      template_id: template.id,
      template_name: template.name,
      icon_id: template.icon_id
    });
    return null;
  }
  
  // If no icon_file_path, return null
  if (!iconPath) {
    return null;
  }
  
  const fullUrl = toUploadsUrl(iconPath);
  console.log('✅ Constructed icon URL:', fullUrl, 'from path:', iconPath);
  return fullUrl;
};

const handleIconError = (event) => {
  console.error('❌ Failed to load icon image:', {
    src: event.target.src,
    template: props.template.name,
    icon_id: props.template.icon_id,
    icon_file_path: props.template.icon_file_path
  });
  event.target.style.display = 'none';
};

const handleIconLoad = (event) => {
  console.log('✅ Icon loaded successfully:', {
    src: event.target.src,
    template: props.template.name
  });
};

// Check if we should show master brand icon (for platform documents) or agency logo (for agency documents)
const shouldShowBrandingIcon = computed(() => {
  // Show branding icons when filter is set to "all" (All Agencies view)
  return props.filterAgencyId === 'all';
});

// Check if this is a platform document (no agency_id)
const isPlatformDocument = computed(() => {
  return props.template.agency_id === null || props.template.agency_id === undefined;
});

// Get the icon URL to display based on context
const getDisplayIconUrl = () => {
  // When viewing "All Agencies"
  if (shouldShowBrandingIcon.value) {
    // Platform documents: show master brand icon
    if (isPlatformDocument.value) {
      return getMasterBrandIconUrl();
    }
    // Agency documents: show agency logo/icon
    else {
      return getAgencyLogoUrl();
    }
  }
  // Otherwise: show document's assigned icon
  if (props.template.icon_id) {
    return getIconUrl(props.template);
  }
  return null;
};

// Get alt text for the displayed icon
const getDisplayIconAlt = () => {
  if (shouldShowBrandingIcon.value) {
    if (isPlatformDocument.value) {
      return 'Master brand icon';
    } else {
      const agencyName = getAgencyName();
      return agencyName ? `${agencyName} logo` : 'Agency logo';
    }
  }
  return props.template.icon_name || 'Document icon';
};

// Get agency name for alt text
const getAgencyName = () => {
  if (!shouldShowBrandingIcon.value || isPlatformDocument.value) return null;
  const agency = props.availableAgencies.find(a => a.id === props.template.agency_id);
  return agency ? agency.name : null;
};

// Get master brand icon URL from platform branding
const getMasterBrandIconUrl = () => {
  const platformBranding = brandingStore.platformBranding;
  
  console.log('getMasterBrandIconUrl: platformBranding:', platformBranding);
  console.log('getMasterBrandIconUrl: master_brand_icon_id:', platformBranding?.master_brand_icon_id);
  console.log('getMasterBrandIconUrl: master_brand_icon_path:', platformBranding?.master_brand_icon_path);
  
  if (!platformBranding) {
    console.log('getMasterBrandIconUrl: No platform branding in store');
    return null;
  }
  
  if (!platformBranding.master_brand_icon_id || !platformBranding.master_brand_icon_path) {
    console.log('getMasterBrandIconUrl: Missing master brand icon ID or path');
    return null;
  }
  
  const fullUrl = toUploadsUrl(platformBranding.master_brand_icon_path);
  console.log('getMasterBrandIconUrl: Returning URL:', fullUrl);
  return fullUrl;
};

// Get agency master icon URL (used when viewing "All Agencies" for agency documents)
const getAgencyLogoUrl = () => {
  // Only show agency master icon when viewing "All Agencies" and document belongs to an agency
  if (!shouldShowBrandingIcon.value || isPlatformDocument.value) return null;
  
  const agency = props.availableAgencies.find(a => a.id === props.template.agency_id);
  if (!agency) return null;
  
  // Priority 1: Use agency master icon (icon_id) - this is the unified master icon
  if (agency.icon_id && agency.icon_file_path) {
    return toUploadsUrl(agency.icon_file_path);
  }
  
  // Priority 2: Fall back to logo_url if master icon is not available
  if (agency.logo_url) {
    // logo_url might be a full URL or a relative path
    if (agency.logo_url.startsWith('http://') || agency.logo_url.startsWith('https://')) {
      return agency.logo_url;
    }
    // If it's a relative path, construct the full URL
    const apiBase = getBackendBaseUrl();
    return `${apiBase}${agency.logo_url.startsWith('/') ? '' : '/'}${agency.logo_url}`;
  }
  
  // No master icon or logo available
  return null;
};

// Get CSS class based on agency_id for visual distinction
const getAgencyClass = (agencyId) => {
  if (agencyId === null || agencyId === undefined) {
    return 'agency-platform';
  }
  return `agency-${agencyId}`;
};

// Get inline style for agency color distinction
const getAgencyStyle = (agencyId) => {
  if (agencyId === null || agencyId === undefined) {
    // Platform - light gray
    return {
      '--agency-color': '#6c757d',
      '--agency-bg': '#f8f9fa'
    };
  }
  
  // Generate a consistent color based on agency ID using a simple hash
  const colors = [
    '#007bff', // Blue
    '#28a745', // Green
    '#ffc107', // Yellow/Amber
    '#dc3545', // Red
    '#17a2b8', // Cyan
    '#6f42c1', // Purple
    '#fd7e14', // Orange
    '#20c997', // Teal
    '#e83e8c', // Pink
    '#6610f2', // Indigo
  ];
  
  // Use modulo to cycle through colors
  const colorIndex = agencyId % colors.length;
  const borderColor = colors[colorIndex];
  
  // Create a very light background tint of the same color
  const bgColor = `${borderColor}08`; // Add 08 for ~3% opacity
  
  return {
    '--agency-color': borderColor,
    '--agency-bg': bgColor
  };
};

const getDocumentTypeStyle = (documentType) => {
  const palette = {
    acknowledgment: '#0ea5e9',
    authorization: '#8b5cf6',
    agreement: '#14b8a6',
    audio_recording_consent: '#f97316',
    hipaa_security: '#334155',
    compliance: '#ef4444',
    disclosure: '#06b6d4',
    consent: '#10b981',
    administrative: '#6b7280'
  };
  const key = String(documentType || '').trim().toLowerCase();
  const chosen = palette[key] || palette.administrative;
  return {
    '--template-color': chosen,
    '--template-bg': `${chosen}10`
  };
};

const getCardStyle = (template) => ({
  ...getAgencyStyle(template?.agency_id),
  ...getDocumentTypeStyle(template?.document_type)
});
</script>

<style scoped>
.template-card {
  background: var(--template-bg, var(--agency-bg, white));
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  border-left: 4px solid var(--template-color, var(--agency-color, var(--border)));
  transition: all 0.2s;
}

.template-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.card-header {
  margin-bottom: 8px;
}

.card-header-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.document-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
}

.card-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  flex: 1;
}

.badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.description {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0 0 6px 0;
  line-height: 1.35;
}

.description.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.description-toggle {
  border: none;
  background: transparent;
  color: var(--primary-color, #2563eb);
  padding: 0;
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.card-actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.card-actions .btn {
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}

.assign-button {
  font-weight: 600;
  order: -1; /* Move to the front */
  flex: 0 0 auto;
}

.btn-danger {
  background-color: #dc3545;
  color: white;
  border: none;
}

.btn-danger:hover {
  background-color: #c82333;
}
</style>

