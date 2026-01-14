<template>
  <span :class="['client-status-badge', `status-${statusClass}`]">
    {{ displayText }}
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: {
    type: String,
    required: true,
    validator: (value) => ['PENDING_REVIEW', 'ACTIVE', 'ON_HOLD', 'DECLINED', 'ARCHIVED'].includes(value)
  }
});

const statusClass = computed(() => {
  const statusMap = {
    'PENDING_REVIEW': 'pending-review',
    'ACTIVE': 'active',
    'ON_HOLD': 'on-hold',
    'DECLINED': 'declined',
    'ARCHIVED': 'archived'
  };
  return statusMap[props.status] || 'pending-review';
});

const displayText = computed(() => {
  const textMap = {
    'PENDING_REVIEW': 'Pending Review',
    'ACTIVE': 'Active',
    'ON_HOLD': 'On Hold',
    'DECLINED': 'Declined',
    'ARCHIVED': 'Archived'
  };
  return textMap[props.status] || props.status;
});
</script>

<style scoped>
.client-status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-pending-review {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffc107;
}

.status-active {
  background: #d4edda;
  color: #155724;
  border: 1px solid #28a745;
}

.status-on-hold {
  background: #ffeaa7;
  color: #856404;
  border: 1px solid #fdcb6e;
}

.status-declined {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #dc3545;
}

.status-archived {
  background: #e2e3e5;
  color: #383d41;
  border: 1px solid #6c757d;
}
</style>
