<template>
  <div class="doc-hub">
    <!-- Page header -->
    <header class="doc-hub__header">
      <div class="doc-hub__header-left">
        <div class="doc-hub__title-row">
          <span class="doc-hub__title-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <h2 class="doc-hub__title">{{ title }}</h2>
        </div>
        <p v-if="subtitle" class="doc-hub__subtitle">{{ subtitle }}</p>
        <div v-if="userDisplayName" class="doc-hub__user">
          <span class="doc-hub__user-avatar" aria-hidden="true">{{ userInitials }}</span>
          <span class="doc-hub__user-name">{{ userDisplayName }}</span>
          <span v-if="userRoleLabel" class="doc-hub__user-role">
            <span class="doc-hub__user-dot" aria-hidden="true" />
            {{ userRoleLabel }}
          </span>
        </div>
      </div>
      <div class="doc-hub__header-actions">
        <slot name="header-actions">
          <button type="button" class="doc-hub__btn doc-hub__btn--ghost" :disabled="loading" @click="$emit('refresh')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </slot>
      </div>
    </header>

    <!-- Stat cards -->
    <div v-if="!loading && tasks.length > 0" class="doc-hub__stats">
      <div class="doc-hub__stat">
        <div class="doc-hub__stat-icon doc-hub__stat-icon--green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div>
          <div class="doc-hub__stat-value">{{ hubStats.total }}</div>
          <div class="doc-hub__stat-label">Total Documents</div>
          <div class="doc-hub__stat-hint">All time</div>
        </div>
      </div>
      <div class="doc-hub__stat">
        <div class="doc-hub__stat-icon doc-hub__stat-icon--orange">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </div>
        <div>
          <div class="doc-hub__stat-value">{{ hubStats.pendingSignatures }}</div>
          <div class="doc-hub__stat-label">Pending Signatures</div>
          <div class="doc-hub__stat-hint">Action required</div>
        </div>
      </div>
      <div class="doc-hub__stat">
        <div class="doc-hub__stat-icon doc-hub__stat-icon--purple">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <div class="doc-hub__stat-value">{{ hubStats.required }}</div>
          <div class="doc-hub__stat-label">Required Documents</div>
          <div class="doc-hub__stat-hint">{{ hubStats.missing }} still missing</div>
        </div>
      </div>
      <div class="doc-hub__stat">
        <div class="doc-hub__stat-icon doc-hub__stat-icon--green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <div>
          <div class="doc-hub__stat-value">{{ hubStats.recentlyAdded }}</div>
          <div class="doc-hub__stat-label">Recently Added</div>
          <div class="doc-hub__stat-hint">In last 30 days</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div v-if="!loading && tasks.length > 0" class="doc-hub__filters">
      <div class="doc-hub__search">
        <svg class="doc-hub__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input v-model="searchQuery" type="search" placeholder="Search documents…" aria-label="Search documents" />
      </div>
      <select v-model="filterType" class="doc-hub__select" aria-label="Filter by type">
        <option value="all">All Types</option>
        <option value="signature">Signature</option>
        <option value="review">Review</option>
      </select>
      <select v-model="filterStatus" class="doc-hub__select" aria-label="Filter by status">
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="completed">Completed</option>
        <option value="overdue">Overdue</option>
      </select>
      <select v-model="filterSource" class="doc-hub__select" aria-label="Filter by source">
        <option value="all">All Modules</option>
        <option v-for="src in sourceOptions" :key="src" :value="src">{{ src }}</option>
      </select>
      <button v-if="hasActiveFilters" type="button" class="doc-hub__clear" @click="clearFilters">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Clear Filters
      </button>
    </div>

    <div v-if="allowCategoryReorder && !loading && tasks.length > 0" class="doc-hub__category-bar">
      <button
        type="button"
        class="doc-hub__btn"
        :class="categoryLayout.editMode.value ? 'doc-hub__btn--primary' : 'doc-hub__btn--ghost'"
        @click="categoryLayout.editMode.value = !categoryLayout.editMode.value"
      >
        {{ categoryLayout.editMode.value ? 'Done organizing' : 'Organize categories' }}
      </button>
      <p v-if="categoryLayout.editMode.value" class="doc-hub__category-hint">
        Use ▲ and ▼ to change the order categories appear on your documents page. Your order is saved automatically.
      </p>
      <span v-if="categoryLayout.saving.value" class="doc-hub__category-saving">Saving…</span>
      <button
        v-if="categoryLayout.editMode.value"
        type="button"
        class="doc-hub__clear"
        @click="categoryLayout.resetOrder()"
      >
        Reset order
      </button>
    </div>

    <!-- Action required -->
    <div
      v-if="!loading && actionRequiredTasks.length > 0"
      class="doc-hub__action-required"
    >
      <div class="doc-hub__action-required-head">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="8" y1="12" x2="12" y2="12" />
        </svg>
        <strong>Action required</strong>
        <span class="doc-hub__action-required-count">{{ actionRequiredTasks.length }} item{{ actionRequiredTasks.length === 1 ? '' : 's' }}</span>
      </div>
      <ul class="doc-hub__action-required-list">
        <li v-for="task in actionRequiredTasks" :key="task.id">
          <span class="doc-hub__action-required-name">{{ task.title }}</span>
          <span :class="['doc-pill', 'doc-pill--sm', getDocumentStatusBadgeClass(task)]">
            {{ getDocumentStatusLabel(task) }}
          </span>
          <button
            v-if="mode === 'self' && task.status !== 'completed'"
            type="button"
            class="doc-hub__btn doc-hub__btn--primary doc-hub__btn--sm"
            @click="emitAction('sign', task)"
          >
            {{ task.document_action_type === 'signature' ? 'Sign' : 'Review' }}
          </button>
        </li>
      </ul>
    </div>

    <!-- Info banner -->
    <div v-if="showInfoBanner && !loading && tasks.length > 0" class="doc-hub__banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <p>{{ infoBannerText }}</p>
      <button type="button" class="doc-hub__banner-close" aria-label="Dismiss" @click="showInfoBanner = false">×</button>
    </div>

    <!-- States -->
    <div v-if="loading" class="doc-hub__state">
      <div class="doc-hub__spinner" />
      <p>Loading documents…</p>
    </div>
    <div v-else-if="error" class="doc-hub__error">{{ error }}</div>
    <div v-else-if="tasks.length === 0" class="doc-hub__empty">
      <slot name="empty">
        <h3>No documents assigned</h3>
        <p>Documents assigned to {{ mode === 'admin' ? 'this user' : 'you' }} will appear here.</p>
      </slot>
    </div>

    <!-- Main + sidebar -->
    <div v-else class="doc-hub__body">
      <main class="doc-hub__main">
        <p v-if="filteredTasks.length === 0" class="doc-hub__no-match">No documents match your filters.</p>

        <div v-else class="doc-hub__sections">
          <section
            v-for="section in groupedFiltered"
            :key="section.id"
            class="doc-hub__section"
            :class="{ 'doc-hub__section--reorder': categoryLayout.editMode.value }"
            :style="categorySectionStyle(section.id)"
          >
            <button
              type="button"
              class="doc-hub__section-head"
              :aria-expanded="isOpen(section.id)"
              @click="toggleSection(section.id)"
            >
              <span class="doc-hub__chevron" :class="{ open: isOpen(section.id) }">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
              <span class="doc-hub__section-icon" v-html="sectionIconSvg(section.meta.icon)" />
              <span class="doc-hub__section-title">{{ section.meta.title }}</span>
              <span class="doc-hub__section-tag">{{ section.meta.tag }}</span>
              <span v-if="section.meta.tagSecondary" class="doc-hub__section-tag doc-hub__section-tag--muted">{{ section.meta.tagSecondary }}</span>
              <span
                v-if="section.progress && section.progress.total"
                class="doc-hub__section-progress"
                :title="`${section.progress.completed} of ${section.progress.total} complete`"
              >
                {{ section.progress.completed }}/{{ section.progress.total }} complete
              </span>
              <span class="doc-hub__section-count">{{ section.items.length }} documents</span>
              <div
                v-if="allowCategoryReorder && categoryLayout.editMode.value"
                class="doc-hub__section-reorder"
                @click.stop
              >
                <button
                  type="button"
                  class="doc-hub__reorder-btn"
                  :disabled="categoryLayout.isFirst(section.id)"
                  title="Move up"
                  @click="categoryLayout.moveUp(section.id)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  class="doc-hub__reorder-btn"
                  :disabled="categoryLayout.isLast(section.id)"
                  title="Move down"
                  @click="categoryLayout.moveDown(section.id)"
                >
                  ▼
                </button>
              </div>
            </button>

            <div v-show="isOpen(section.id)" class="doc-hub__table-wrap">
              <table class="doc-hub__table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Status</th>
                    <th>Source / Module</th>
                    <th>Uploaded / Due Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="task in section.items"
                    :key="task.id"
                    :class="{ 'doc-hub__row--highlight': highlightTaskId === task.id }"
                  >
                    <td class="doc-hub__cell-name">
                      <strong>{{ task.title }}</strong>
                    </td>
                    <td>
                      <span :class="['doc-pill', getDocumentStatusBadgeClass(task)]">
                        {{ getDocumentStatusLabel(task) }}
                      </span>
                    </td>
                    <td class="doc-hub__cell-muted">{{ getDocumentSourceLabel(task) }}</td>
                    <td class="doc-hub__cell-date">
                      <template v-if="task.status === 'completed'">
                        <span class="doc-hub__date-muted">Uploaded</span>
                        {{ formatDocumentDate(task.completed_at || task.updated_at) }}
                      </template>
                      <template v-else-if="task.due_date">
                        <span :class="isTaskOverdue(task) ? 'doc-hub__date-due' : 'doc-hub__date-muted'">
                          {{ isTaskOverdue(task) ? 'Due' : 'Due' }}
                        </span>
                        <span :class="{ 'doc-hub__date-due': isTaskOverdue(task) }">
                          {{ formatDocumentDate(task.due_date) }}
                        </span>
                      </template>
                      <span v-else class="doc-hub__cell-muted">—</span>
                    </td>
                    <td>
                      <div class="doc-hub__actions">
                        <template v-if="mode === 'self' && task.status !== 'completed'">
                          <button
                            type="button"
                            class="doc-hub__btn doc-hub__btn--primary doc-hub__btn--sm"
                            @click="emitAction('sign', task)"
                          >
                            {{ task.document_action_type === 'signature' ? 'Sign' : 'Review' }}
                          </button>
                        </template>
                        <template v-else>
                          <button
                            type="button"
                            class="doc-hub__icon-btn"
                            title="View"
                            @click="emitAction(task.status === 'completed' ? 'view' : 'sign', task)"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button
                            v-if="task.status === 'completed'"
                            type="button"
                            class="doc-hub__icon-btn"
                            title="Download"
                            @click="emitAction('download', task)"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </button>
                          <button
                            v-if="task.status === 'completed' && mode === 'self'"
                            type="button"
                            class="doc-hub__icon-btn"
                            title="Details"
                            @click="emitAction('details', task)"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                          </button>
                          <div v-if="mode === 'admin' && !viewOnly" class="doc-hub__menu-wrap">
                            <button
                              type="button"
                              class="doc-hub__icon-btn"
                              title="More"
                              @click.stop="toggleMenu(task.id)"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                            </button>
                            <div v-if="openMenuId === task.id" class="doc-hub__menu" @click.stop>
                              <button type="button" @click="emitMenu('edit-due', task)">Edit due date</button>
                              <button
                                v-if="task.status === 'completed' && task.document_action_type === 'signature'"
                                type="button"
                                @click="emitMenu('audit', task)"
                              >
                                Audit trail
                              </button>
                              <button v-if="task.status !== 'completed'" type="button" @click="emitMenu('mark-complete', task)">Mark complete</button>
                              <button type="button" @click="emitMenu('reset', task)">Reset</button>
                              <button type="button" class="danger" @click="emitMenu('remove', task)">Remove</button>
                            </div>
                          </div>
                        </template>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      <aside class="doc-hub__sidebar">
        <div class="doc-hub__widget">
          <h3>Document Completion</h3>
          <div class="doc-hub__ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" class="doc-hub__ring-bg" />
              <circle
                cx="60"
                cy="60"
                r="52"
                class="doc-hub__ring-fill"
                :stroke-dasharray="`${hubStats.completionPct * 3.27} 327`"
              />
            </svg>
            <span class="doc-hub__ring-pct">{{ hubStats.completionPct }}%</span>
          </div>
          <p class="doc-hub__widget-sub">You're making great progress!</p>
          <p class="doc-hub__widget-meta">{{ hubStats.completed }} of {{ hubStats.required }} required documents</p>
          <div class="doc-hub__bar">
            <div class="doc-hub__bar-fill" :style="{ width: `${hubStats.completionPct}%` }" />
          </div>
        </div>

        <div v-if="moduleProgress.length" class="doc-hub__widget">
          <h3>Required by Modules</h3>
          <ul class="doc-hub__module-list">
            <li v-for="mod in moduleProgress" :key="mod.name">
              <span class="doc-hub__module-name">{{ mod.name }}</span>
              <span :class="['doc-hub__module-count', mod.done >= mod.total ? 'done' : '']">
                {{ mod.done }} of {{ mod.total }}
              </span>
            </li>
          </ul>
        </div>

        <div v-if="recentUploads.length" class="doc-hub__widget">
          <h3>Recently Uploaded</h3>
          <ul class="doc-hub__list">
            <li v-for="item in recentUploads" :key="`r-${item.id}`">
              <span class="doc-hub__list-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
              </span>
              <div>
                <div class="doc-hub__list-title">{{ item.title }}</div>
                <div class="doc-hub__list-date">{{ formatDocumentDate(item.created_at) }}</div>
              </div>
            </li>
          </ul>
        </div>

        <div v-if="upcomingDue.length" class="doc-hub__widget">
          <h3>Upcoming Expirations</h3>
          <ul class="doc-hub__list">
            <li v-for="item in upcomingDue" :key="`d-${item.id}`">
              <span class="doc-hub__list-icon doc-hub__list-icon--warn" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              <div>
                <div class="doc-hub__list-title">{{ item.title }}</div>
                <div :class="['doc-hub__list-urgent', item.daysLeft <= 7 ? 'hot' : '']">
                  {{ item.daysLeft <= 0 ? 'Overdue' : `${item.daysLeft} days` }}
                </div>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useDocumentCategoryOrder } from '../../composables/useDocumentCategoryOrder';
import {
  computeHubStats,
  computeSectionProgress,
  getActionRequiredTasks,
  daysUntil,
  filterDocumentTasks,
  formatDocumentDate,
  getDocumentSourceLabel,
  getDocumentStatusBadgeClass,
  getDocumentStatusLabel,
  getRecentlyUploaded,
  getUniqueSourceOptions,
  groupTasksByDisplayCategory,
  groupTasksBySourceProgress,
  isTaskOverdue,
  sortDocumentTasks,
} from '../../utils/documentUiHelpers';
import {
  DEFAULT_DOCUMENT_CATEGORY_ORDER,
  getCategoryThemeStyle,
  getDisplayCategoryMeta,
} from '../../config/documentDisplayCategories';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  mode: { type: String, default: 'self' }, // 'self' | 'admin'
  tasks: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  viewOnly: { type: Boolean, default: false },
  highlightTaskId: { type: Number, default: null },
  userDisplayName: { type: String, default: '' },
  userRoleLabel: { type: String, default: '' },
  sortKey: { type: String, default: 'unfinished' },
  allowCategoryReorder: { type: Boolean, default: false },
  categoryOrder: { type: Array, default: null },
  infoBannerText: {
    type: String,
    default:
      'Documents are grouped by category (Onboarding, Payroll & Tax, Policies, and more). Use filters to find items, or organize categories to match how you work.',
  },
});

const authStore = useAuthStore();
const allowCategoryReorder = computed(
  () => props.allowCategoryReorder || props.mode === 'self'
);

const categoryLayout = useDocumentCategoryOrder(
  computed(() => (allowCategoryReorder.value ? authStore.user?.id : null))
);

const effectiveCategoryOrder = computed(() => {
  if (props.categoryOrder?.length) return props.categoryOrder;
  if (allowCategoryReorder.value) return categoryLayout.orderedCategoryIds.value;
  return DEFAULT_DOCUMENT_CATEGORY_ORDER;
});

const emit = defineEmits(['refresh', 'action', 'menu-action']);

const searchQuery = ref('');
const filterStatus = ref('all');
const filterType = ref('all');
const filterSource = ref('all');
const showInfoBanner = ref(true);
const openSections = ref({});
const openMenuId = ref(null);

const hubStats = computed(() => computeHubStats(props.tasks));
const actionRequiredTasks = computed(() => getActionRequiredTasks(filteredTasks.value));
const sourceOptions = computed(() => getUniqueSourceOptions(props.tasks));

const categorySectionStyle = (categoryId) => getCategoryThemeStyle(categoryId);

const filteredTasks = computed(() => {
  let list = filterDocumentTasks(props.tasks, {
    search: searchQuery.value,
    status: filterStatus.value,
    type: filterType.value,
    source: filterSource.value === 'all' ? 'all' : filterSource.value,
  });
  return sortDocumentTasks(list, props.sortKey);
});

const groupedFiltered = computed(() => {
  if (categoryLayout.editMode.value && allowCategoryReorder.value) {
    const grouped = groupTasksByDisplayCategory(filteredTasks.value, effectiveCategoryOrder.value);
    const byId = Object.fromEntries(grouped.map((s) => [s.id, s]));
    return effectiveCategoryOrder.value.map((id) => {
      const items = byId[id]?.items || [];
      return {
        id,
        name: id,
        meta: byId[id]?.meta || getDisplayCategoryMeta(id),
        items,
        progress: computeSectionProgress(items),
      };
    });
  }
  return groupTasksByDisplayCategory(filteredTasks.value, effectiveCategoryOrder.value);
});

const moduleProgress = computed(() => groupTasksBySourceProgress(props.tasks));
const recentUploads = computed(() => getRecentlyUploaded(props.tasks));
const upcomingDue = computed(() =>
  [...props.tasks]
    .filter((t) => t.status !== 'completed' && t.due_date)
    .map((t) => ({ ...t, daysLeft: daysUntil(t.due_date) }))
    .filter((t) => t.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5)
);

const userInitials = computed(() => {
  const parts = String(props.userDisplayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
});

const hasActiveFilters = computed(
  () =>
    searchQuery.value.trim() !== '' ||
    filterStatus.value !== 'all' ||
    filterType.value !== 'all' ||
    filterSource.value !== 'all'
);

const clearFilters = () => {
  searchQuery.value = '';
  filterStatus.value = 'all';
  filterType.value = 'all';
  filterSource.value = 'all';
};

const isOpen = (name) => openSections.value[name] !== false;
const toggleSection = (name) => {
  openSections.value = { ...openSections.value, [name]: !isOpen(name) };
};

const toggleMenu = (id) => {
  openMenuId.value = openMenuId.value === id ? null : id;
};

const emitAction = (type, task) => {
  openMenuId.value = null;
  emit('action', { type, task });
};

const emitMenu = (type, task) => {
  openMenuId.value = null;
  emit('menu-action', { type, task });
};

const closeMenu = () => {
  openMenuId.value = null;
};

const SECTION_ICONS = {
  folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  wallet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
  heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  award: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  hardhat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a2 2 0 0 1 4 0v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>',
  graduation: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  briefcase: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
};

const sectionIconSvg = (icon) => SECTION_ICONS[icon] || SECTION_ICONS.file;

watch(
  groupedFiltered,
  (sections) => {
    const next = { ...openSections.value };
    for (const s of sections) {
      const key = s.id || s.name;
      if (next[key] === undefined) next[key] = true;
    }
    openSections.value = next;
  },
  { immediate: true }
);

onMounted(() => document.addEventListener('click', closeMenu));
onUnmounted(() => document.removeEventListener('click', closeMenu));
</script>

<style scoped>
.doc-hub {
  --dh-green: #166534;
  --dh-green-dark: #14532d;
  --dh-green-soft: #dcfce7;
  --dh-border: #e5e7eb;
  --dh-muted: #6b7280;
  --dh-bg: #ffffff;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  color: #111827;
}

.doc-hub__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}

.doc-hub__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.doc-hub__title-icon {
  display: flex;
  color: var(--dh-green);
}

.doc-hub__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #111827;
}

.doc-hub__subtitle {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--dh-muted);
  max-width: 560px;
  line-height: 1.5;
}

.doc-hub__user {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.doc-hub__user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--dh-green-soft);
  color: var(--dh-green);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.doc-hub__user-name {
  font-weight: 600;
  color: #111827;
}

.doc-hub__user-role {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dh-muted);
  font-size: 13px;
}

.doc-hub__user-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.doc-hub__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.doc-hub__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  white-space: nowrap;
}

.doc-hub__btn--primary {
  background: var(--dh-green);
  color: #fff;
}

.doc-hub__btn--primary:hover {
  background: var(--dh-green-dark);
}

.doc-hub__btn--ghost {
  background: #fff;
  color: #374151;
  border: 1px solid var(--dh-border);
}

.doc-hub__btn--ghost:hover {
  background: #f9fafb;
}

.doc-hub__btn--sm {
  padding: 6px 14px;
  font-size: 13px;
}

/* Stats */
.doc-hub__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.doc-hub__stat {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 20px;
  background: var(--dh-bg);
  border: 1px solid var(--dh-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.doc-hub__stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-hub__stat-icon--green {
  background: #dcfce7;
  color: var(--dh-green);
}

.doc-hub__stat-icon--orange {
  background: #ffedd5;
  color: #c2410c;
}

.doc-hub__stat-icon--purple {
  background: #f3e8ff;
  color: #7c3aed;
}

.doc-hub__stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  color: #111827;
}

.doc-hub__stat-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-top: 2px;
}

.doc-hub__stat-hint {
  font-size: 12px;
  color: var(--dh-muted);
  margin-top: 2px;
}

/* Filters */
.doc-hub__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
  background: var(--dh-bg);
  border: 1px solid var(--dh-border);
  border-radius: 10px;
  margin-bottom: 14px;
}

.doc-hub__search {
  flex: 1;
  min-width: 200px;
  position: relative;
}

.doc-hub__search input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  border: 1px solid var(--dh-border);
  border-radius: 8px;
  font-size: 14px;
}

.doc-hub__search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}

.doc-hub__select {
  padding: 10px 32px 10px 12px;
  border: 1px solid var(--dh-border);
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  min-width: 130px;
  color: #374151;
}

.doc-hub__clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: none;
  border: none;
  color: var(--dh-green);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

/* Banner */
.doc-hub__banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
  font-size: 14px;
  line-height: 1.45;
}

.doc-hub__banner p {
  margin: 0;
  flex: 1;
}

.doc-hub__banner-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
}

/* Body layout */
.doc-hub__body {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 24px;
  align-items: start;
}

.doc-hub__section {
  background: var(--dh-bg);
  border: 1px solid var(--dh-border);
  border-radius: 10px;
  margin-bottom: 14px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.doc-hub__section-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: #fafafa;
  border: none;
  border-bottom: 1px solid var(--dh-border);
  cursor: pointer;
  text-align: left;
}

.doc-hub__chevron {
  display: flex;
  color: var(--dh-muted);
  transition: transform 0.2s;
}

.doc-hub__chevron.open {
  transform: rotate(90deg);
}

.doc-hub__section-icon {
  display: flex;
  color: var(--dh-green);
}

.doc-hub__section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.doc-hub__section-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  background: #ecfdf5;
  color: #166534;
  letter-spacing: 0.02em;
}

.doc-hub__section-tag--muted {
  background: #eff6ff;
  color: #1d4ed8;
}

.doc-hub__category-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid var(--dh-border);
  border-radius: 10px;
}

.doc-hub__category-hint {
  margin: 0;
  flex: 1;
  min-width: 200px;
  font-size: 13px;
  color: var(--dh-muted);
}

.doc-hub__category-saving {
  font-size: 12px;
  color: var(--dh-muted);
  font-style: italic;
}

.doc-hub__section-reorder {
  display: flex;
  gap: 4px;
  margin-left: 8px;
}

.doc-hub__reorder-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--dh-border);
  border-radius: 6px;
  background: #fff;
  font-size: 11px;
  cursor: pointer;
  color: #374151;
}

.doc-hub__reorder-btn:hover:not(:disabled) {
  background: #f0fdf4;
  border-color: #86efac;
}

.doc-hub__reorder-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.doc-hub__section--reorder .doc-hub__section-head {
  background: color-mix(in srgb, var(--cat-icon-bg, #f0fdf4) 70%, #fff);
}

.doc-hub__section-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--dh-muted);
  font-weight: 500;
}

.doc-hub__table-wrap {
  overflow-x: auto;
}

.doc-hub__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.doc-hub__table th {
  padding: 10px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dh-muted);
  background: #fafafa;
  border-bottom: 1px solid var(--dh-border);
}

.doc-hub__table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.doc-hub__table tbody tr:last-child td {
  border-bottom: none;
}

.doc-hub__row--highlight {
  background: #fffbeb;
  box-shadow: inset 3px 0 0 #f59e0b;
}

.doc-hub__cell-name strong {
  font-weight: 600;
  color: #111827;
}

.doc-hub__cell-muted {
  color: var(--dh-muted);
  font-size: 13px;
}

.doc-hub__cell-date {
  font-size: 13px;
}

.doc-hub__date-muted {
  display: block;
  font-size: 11px;
  color: var(--dh-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.doc-hub__date-due {
  color: #dc2626;
  font-weight: 600;
}

.doc-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.doc-pill--success {
  background: #dcfce7;
  color: #166534;
}

.doc-pill--warning {
  background: #fef3c7;
  color: #92400e;
}

.doc-pill--danger {
  background: #fee2e2;
  color: #991b1b;
}

.doc-pill--muted {
  background: #f3f4f6;
  color: #6b7280;
}

.doc-hub__actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.doc-hub__icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dh-border);
  border-radius: 8px;
  background: #fff;
  color: #374151;
  cursor: pointer;
}

.doc-hub__icon-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
  color: var(--dh-green);
}

.doc-hub__menu-wrap {
  position: relative;
}

.doc-hub__menu {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 30;
  min-width: 170px;
  margin-top: 4px;
  padding: 6px 0;
  background: #fff;
  border: 1px solid var(--dh-border);
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.doc-hub__menu button {
  display: block;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  border: none;
  background: none;
  font-size: 13px;
  cursor: pointer;
}

.doc-hub__menu button:hover {
  background: #f9fafb;
}

.doc-hub__menu button.danger {
  color: #dc2626;
}

/* Sidebar */
.doc-hub__sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.doc-hub__widget {
  padding: 20px;
  background: var(--dh-bg);
  border: 1px solid var(--dh-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.doc-hub__widget h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.doc-hub__ring {
  position: relative;
  width: 140px;
  height: 140px;
  margin: 0 auto 12px;
}

.doc-hub__ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.doc-hub__ring-bg {
  fill: none;
  stroke: #e5e7eb;
  stroke-width: 10;
}

.doc-hub__ring-fill {
  fill: none;
  stroke: var(--dh-green);
  stroke-width: 10;
  stroke-linecap: round;
}

.doc-hub__ring-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  color: var(--dh-green);
}

.doc-hub__widget-sub {
  text-align: center;
  font-size: 13px;
  color: var(--dh-muted);
  margin: 0 0 4px;
}

.doc-hub__widget-meta {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px;
}

.doc-hub__bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.doc-hub__bar-fill {
  height: 100%;
  background: var(--dh-green);
  border-radius: 999px;
  transition: width 0.3s;
}

.doc-hub__module-list,
.doc-hub__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.doc-hub__module-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}

.doc-hub__module-list li:last-child {
  border-bottom: none;
}

.doc-hub__module-name {
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-hub__module-count {
  font-weight: 600;
  color: #d97706;
  flex-shrink: 0;
}

.doc-hub__module-count.done {
  color: var(--dh-green);
}

.doc-hub__list li {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}

.doc-hub__list li:last-child {
  border-bottom: none;
}

.doc-hub__list-icon {
  color: var(--dh-green);
  flex-shrink: 0;
  margin-top: 2px;
}

.doc-hub__list-icon--warn {
  color: #d97706;
}

.doc-hub__list-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.doc-hub__list-date {
  font-size: 12px;
  color: var(--dh-muted);
}

.doc-hub__list-urgent {
  font-size: 12px;
  font-weight: 600;
  color: #d97706;
}

.doc-hub__list-urgent.hot {
  color: #dc2626;
}

.doc-hub__state,
.doc-hub__empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--dh-muted);
}

.doc-hub__spinner {
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--dh-green);
  border-radius: 50%;
  animation: dh-spin 0.7s linear infinite;
}

@keyframes dh-spin {
  to {
    transform: rotate(360deg);
  }
}

.doc-hub__error {
  padding: 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #991b1b;
}

.doc-hub__no-match {
  padding: 24px;
  text-align: center;
  color: var(--dh-muted);
}

@media (max-width: 1100px) {
  .doc-hub__stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .doc-hub__body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .doc-hub__stats {
    grid-template-columns: 1fr;
  }
  .doc-hub__filters {
    flex-direction: column;
    align-items: stretch;
  }
  .doc-hub__select {
    width: 100%;
  }
}
</style>

<!-- Shared button classes for #header-actions / #empty slots rendered in parent components -->
<style>
.doc-hub__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  white-space: nowrap;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
}
.doc-hub__btn--primary {
  background: #166534;
  color: #fff;
}
.doc-hub__btn--primary:hover {
  background: #14532d;
}
.doc-hub__btn--ghost {
  background: #fff;
  color: #374151;
  border: 1px solid #e5e7eb;
}
.doc-hub__btn--ghost:hover {
  background: #f9fafb;
}
.doc-hub__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
