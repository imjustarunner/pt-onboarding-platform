<template>
  <div class="dashboard-layout" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <!-- Left Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-menu">
        <div class="sidebar-item" :title="isSidebarCollapsed ? 'Overview' : ''">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
          <span v-if="!isSidebarCollapsed">Overview</span>
        </div>
        <div class="sidebar-item active" :title="isSidebarCollapsed ? 'Schools' : ''">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
          <span v-if="!isSidebarCollapsed">Schools</span>
        </div>
        <div class="sidebar-item" :title="isSidebarCollapsed ? 'Events' : ''">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span v-if="!isSidebarCollapsed">Events</span>
        </div>
        <div class="sidebar-item" :title="isSidebarCollapsed ? 'Announcements' : ''">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
          <span v-if="!isSidebarCollapsed">Announcements</span>
        </div>
        <div class="sidebar-item" :title="isSidebarCollapsed ? 'Reports' : ''">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          <span v-if="!isSidebarCollapsed">Reports</span>
        </div>
        <div class="sidebar-item" :title="isSidebarCollapsed ? 'Settings' : ''">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span v-if="!isSidebarCollapsed">Settings</span>
        </div>
      </div>
      <div class="sidebar-bottom">
        <div class="sidebar-item" @click="isSidebarCollapsed = !isSidebarCollapsed" :title="isSidebarCollapsed ? 'Expand' : 'Collapse'">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path v-if="isSidebarCollapsed" d="M13 5l7 7-7 7M4 5l7 7-7 7"></path>
            <path v-else d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>
          </svg>
          <span v-if="!isSidebarCollapsed">Collapse</span>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <div class="container">
    <div class="page-header" data-tour="schools-overview-header">
      <div class="header-left">
        <h1 data-tour="schools-overview-title">{{ pageTitle }}</h1>
        <span class="badge badge-info">Admin</span>
      </div>
      <div class="header-actions" data-tour="schools-overview-actions">
        <router-link class="btn btn-secondary" to="/admin/clients">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back to Client Management
        </router-link>
        <router-link class="btn btn-secondary" :to="hubTo">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          School Portals Hub
        </router-link>
        <router-link
          v-if="!isAllPortalsPage && orgType === 'school'"
          class="btn btn-secondary"
          :to="showAllPortalsTo"
        >All school portals</router-link>
        <router-link v-if="isAllPortalsPage" class="btn btn-secondary" :to="schoolOverviewTo">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          School overview
        </router-link>
        <button
          v-if="canManageSchoolsHere"
          class="btn btn-primary"
          type="button"
          @click="showAddSchoolModal = true"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4"></path></svg>
          Add school
        </button>
        <router-link
          v-if="canManageMarketingCampaigns"
          to="/admin/marketing-campaigns"
          class="btn btn-secondary"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path></svg>
          School Marketing Campaign
        </router-link>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="loading || schools.length === 0"
          @click="openBulkAnnouncementModal"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
          Post announcement
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="loading || !selectedAgencyId"
          @click="openSchoolEventRequestModal"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Request school events
        </button>
        <button class="btn btn-secondary" type="button" :disabled="loading" @click="refresh">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="controls" data-tour="schools-overview-controls">
      <div v-if="isSuperAdmin" class="control" data-tour="schools-overview-agency">
        <label class="control-label">Agency</label>
        <select v-model="selectedAgencyId" class="control-select">
          <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">
            {{ a.name }}
          </option>
        </select>
      </div>

      <div class="control control-search">
        <label class="control-label">Search</label>
        <div class="search-row">
          <input
            v-model="searchQuery"
            class="control-input-search"
            type="text"
            :placeholder="searchPlaceholder"
            data-tour="schools-overview-search"
          />
          <svg style="width:16px;height:16px;color:#9ca3af;margin-right:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <div v-if="districtOptions.length > 1" class="district-buttons" role="group" aria-label="District filter">
            <button
              v-for="d in districtOptions"
              :key="`district-${d.value}`"
              type="button"
              class="district-btn"
              :class="{ active: selectedDistrict === d.value }"
              @click="selectedDistrict = d.value"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="control">
        <label class="control-label">Sort</label>
        <select v-model="sortBy" class="control-select">
          <option value="school_name-asc">Name (A - Z)</option>
          <option value="school_name-desc">Name (Z - A)</option>
          <option value="district_name-asc">District (A - Z)</option>
          <option value="district_name-desc">District (Z - A)</option>
        </select>
      </div>
    </div>

    <div v-if="announcementFlash" class="success-banner">{{ announcementFlash }}</div>
    <div v-if="schoolEventRequestFlash" class="success-banner">{{ schoolEventRequestFlash }}</div>

    <div v-if="!isAllPortalsPage && schoolEventsOverview.events?.length" class="school-events-section">
      <div class="school-events-header">
        <strong>School events ({{ schoolEventsOverview.year }})</strong>
        <span class="school-events-count">{{ schoolEventsOverview.events.length }} posted</span>
      </div>
      <div class="school-events-list">
        <div v-for="ev in schoolEventsOverview.events.slice(0, 12)" :key="`se-${ev.id}`" class="school-event-row">
          <div>
            <strong>{{ ev.title }}</strong>
            <span class="muted"> · {{ ev.schoolName || 'School' }}</span>
          </div>
          <div class="muted small">
            {{ formatAnnouncementDate(ev.startsAt) }}
            <span v-if="ev.outreachTableInvited"> · Outreach table</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!isAllPortalsPage && schoolEventsMissingCount > 0" class="school-events-missing-banner">
      {{ schoolEventsMissingCount }} {{ schoolEventsMissingCount === 1 ? 'school has' : 'schools have' }} not yet posted a Back to School or Spring event this year.
    </div>

    <div v-if="bulkAnnouncements.length > 0" class="bulk-announcements-section">
      <div class="bulk-announcements-header">
        <strong>Posted school portal announcements</strong>
        <span class="bulk-count">{{ bulkAnnouncements.length }}</span>
      </div>
      <div class="bulk-announcements-list">
        <div
          v-for="a in bulkAnnouncements"
          :key="a.bulk_group_id"
          class="bulk-announcement-card"
          :class="{ active: a.is_active, expired: !a.is_active && new Date(a.ends_at) < new Date() }"
        >
          <div class="ba-main">
            <div class="ba-status">
              <span v-if="a.is_active" class="ba-badge ba-badge-active">Active</span>
              <span v-else-if="new Date(a.starts_at) > new Date()" class="ba-badge ba-badge-scheduled">Scheduled</span>
              <span v-else class="ba-badge ba-badge-expired">Expired</span>
              <span class="ba-badge" :class="a.display_type === 'splash' ? 'ba-badge-splash' : 'ba-badge-banner'">{{ a.display_type === 'splash' ? 'Splash' : 'Banner' }}</span>
              <span v-if="a.audience && a.audience !== 'everyone'" class="ba-badge ba-badge-audience">{{ bulkAudienceLabel(a.audience) }}</span>
              <span class="ba-portals">{{ a.portal_count }} {{ a.portal_count === 1 ? 'portal' : 'portals' }}</span>
            </div>
            <div v-if="a.title" class="ba-title">{{ a.title }}</div>
            <div class="ba-message">{{ a.message }}</div>
            <div class="ba-meta">
              <span>{{ formatAnnouncementDate(a.starts_at) }} — {{ formatAnnouncementDate(a.ends_at) }}</span>
              <span v-if="a.created_by_name" class="ba-creator">by {{ a.created_by_name }}</span>
            </div>
          </div>
          <div class="ba-actions">
            <button type="button" class="btn btn-secondary btn-xs" @click="openEditBulkAnnouncement(a)">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" @click="confirmDeleteBulkAnnouncement(a)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading school overview…</div>

    <div v-else class="cards-wrap">
      <div class="total-schools-count">
        Total schools: {{ filteredSchools.length }}
      </div>

      <div v-if="filteredSchools.length === 0" class="empty-state">
        {{ emptyStateText }}
      </div>

      <!-- Show All School Portals: small cards -->
      <div
        v-else-if="isAllPortalsPage"
        class="portal-cards-grid"
        data-tour="schools-overview-cards"
      >
        <div
          v-for="s in filteredSchools"
          :key="s.school_id"
          class="portal-card"
          data-tour="schools-overview-card"
          @click="openSchool(s)"
        >
          <div class="portal-card-logo">
            <img
              v-if="schoolLogoUrl(s) && !failedCardLogoIds.has(String(s.school_id))"
              :src="schoolLogoUrl(s)"
              :alt="`${s.school_name} logo`"
              class="portal-card-logo-img"
              @error="onCardLogoError(s.school_id)"
            />
            <div v-else class="portal-card-logo-fallback" aria-hidden="true">
              {{ schoolInitials(s) }}
            </div>
          </div>
          <div class="portal-card-body">
            <div class="portal-card-name">{{ s.school_name }}</div>
          </div>
          <div class="portal-card-actions">
            <div class="portal-card-cta">Open portal</div>
            <div
              v-if="canOpenSchoolInternalNotes"
              class="portal-card-cta-secondary"
              role="link"
              tabindex="0"
              @click.stop="openSchoolNotes(s)"
              @keydown.enter.prevent.stop="openSchoolNotes(s)"
              @keydown.space.prevent.stop="openSchoolNotes(s)"
            >
              Open notes
            </div>
          </div>
        </div>
      </div>

      <!-- School Overview: full stats cards -->
      <div v-else class="cards-grid" data-tour="schools-overview-cards">
        <div
          v-for="s in filteredSchools"
          :key="s.school_id"
          class="school-card"
          data-tour="schools-overview-card"
          role="button"
          tabindex="0"
          :class="{ 'skills-active': canSeeSkillBuildersSchoolOverviewUi && s.skills_group_occurring_now }"
          @click="openSchool(s)"
          @keydown.enter.prevent="openSchool(s)"
          @keydown.space.prevent="openSchool(s)"
        >
          <div class="card-head">
            <div class="card-head-left">
              <div class="card-logo">
                <img
                  v-if="schoolLogoUrl(s) && !failedCardLogoIds.has(String(s.school_id))"
                  :src="schoolLogoUrl(s)"
                  :alt="`${s.school_name} logo`"
                  class="card-logo-img"
                  @error="onCardLogoError(s.school_id)"
                />
                <div v-else class="card-logo-fallback" aria-hidden="true">
                  {{ schoolInitials(s) }}
                </div>
              </div>
              <div class="card-title">
                <div class="school-name">{{ s.school_name }}</div>
                <div class="school-meta">
                  <span class="pill">{{ formatOrgType(s.organization_type) }}</span>
                  <span v-if="s.district_name" class="pill pill-muted">{{ s.district_name }}</span>
                  <button
                    v-if="canSeeSkillBuildersSchoolOverviewUi && Number(s.skills_groups_count || 0) > 0"
                    type="button"
                    class="sg-icon-btn"
                    title="Open Skills Groups in School Portal"
                    @click.stop="goToSchoolSkillsGroups(s)"
                  >
                    <img v-if="skillBuildersIconUrl" :src="skillBuildersIconUrl" alt="" class="sg-icon-img" />
                    <span v-else aria-hidden="true" class="sg-icon-fallback">SB</span>
                  </button>
                  <template v-if="canSeeSkillBuildersSchoolOverviewUi">
                    <span
                      v-for="g in (Array.isArray(s.active_skills_groups) ? s.active_skills_groups : [])"
                      :key="`asg-${s.school_id}-${g.skills_group_id}`"
                      class="pill pill-sg-badge"
                      title="Active Skills Group participants"
                    >
                      SG
                      <span class="sg-count">{{ Number(g.participants_count || 0) }}</span>
                    </span>
                  </template>
                  <span v-if="!s.is_active" class="pill pill-warn">Inactive</span>
                  <span v-if="s.is_archived" class="pill pill-warn">Archived</span>
                  <span v-if="canSeeSkillBuildersSchoolOverviewUi && s.skills_group_occurring_now" class="pill pill-accent">Skills Group Live</span>
                </div>
              </div>
            </div>
            <div class="card-cta">Open</div>
          </div>

          <div class="stats-grid">
            <div
              class="stat stat-clickable"
              role="button"
              tabindex="0"
              @click.stop="cycleStudentStatus(s)"
              @keydown.enter.prevent="cycleStudentStatus(s)"
              @keydown.space.prevent="cycleStudentStatus(s)"
            >
              <div class="stat-label">{{ studentStatusLabel(s) }}</div>
              <div class="stat-value">{{ studentStatusValue(s) }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Providers</div>
              <div class="stat-value">{{ s.providers_count }}</div>
            </div>
            <div
              class="stat stat-notifications"
              :class="{ active: Number(s.notifications_count || 0) > 0 }"
              role="button"
              tabindex="0"
              @click.stop="openSchoolNotifications(s)"
              @keydown.enter.prevent="openSchoolNotifications(s)"
              @keydown.space.prevent="openSchoolNotifications(s)"
            >
              <div class="stat-label">Notifications</div>
              <div class="stat-value" :class="{ attention: Number(s.notifications_count || 0) > 0 }">
                {{ s.notifications_count }}
              </div>
            </div>
            <div
              class="stat stat-comments"
              :class="{ active: Number(s.notifications_comments_count || 0) > 0 }"
              role="button"
              tabindex="0"
              @click.stop="openSchoolNotificationsFiltered(s, 'comments')"
              @keydown.enter.prevent="openSchoolNotificationsFiltered(s, 'comments')"
              @keydown.space.prevent="openSchoolNotificationsFiltered(s, 'comments')"
            >
              <div class="stat-label">New Comments</div>
              <div class="stat-value" :class="{ attention: Number(s.notifications_comments_count || 0) > 0 }">
                {{ s.notifications_comments_count }}
              </div>
            </div>
            <div
              class="stat stat-messages"
              :class="{ active: Number(s.notifications_messages_count || 0) > 0 }"
              role="button"
              tabindex="0"
              @click.stop="openSchoolNotificationsFiltered(s, 'messages')"
              @keydown.enter.prevent="openSchoolNotificationsFiltered(s, 'messages')"
              @keydown.space.prevent="openSchoolNotificationsFiltered(s, 'messages')"
            >
              <div class="stat-label">New Messages</div>
              <div class="stat-value" :class="{ attention: Number(s.notifications_messages_count || 0) > 0 }">
                {{ s.notifications_messages_count }}
              </div>
            </div>
            <div class="stat">
              <div class="stat-label">Slots Available</div>
              <div class="stat-value">{{ s.slots_available }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Waitlist</div>
              <div class="stat-value">{{ s.waitlist_count }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Docs / Needs</div>
              <div class="stat-value" :class="{ danger: s.docs_needs_count > 0 }">{{ s.docs_needs_count }}</div>
            </div>
            <div
              v-if="canSeeSkillBuildersSchoolOverviewUi"
              class="stat stat-clickable"
              role="button"
              tabindex="0"
              @click.stop="openSkillsUnassigned(s)"
              @keydown.enter.prevent="openSkillsUnassigned(s)"
              @keydown.space.prevent="openSkillsUnassigned(s)"
            >
              <div class="stat-label">Skills Groups</div>
              <div class="stat-value">{{ Number(s.skills_clients_unassigned_count || 0) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showBulkAnnouncementModal" class="modal-overlay" @click.self="closeBulkAnnouncementModal">
      <div class="modal announcement-modal" @click.stop>
        <div class="modal-header">
          <div>
            <strong>Post announcement to school portals</strong>
            <div class="modal-subtitle">This will post to each selected school portal.</div>
          </div>
          <button class="close" type="button" aria-label="Close" @click="closeBulkAnnouncementModal">×</button>
        </div>
        <div class="modal-body announcement-modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Scope</label>
              <select v-model="announcementScope" class="control-select">
                <option value="all">{{ allAnnouncementScopeLabel }}</option>
                <option v-for="d in announcementDistrictScopeOptions" :key="`announce-${d.value}`" :value="d.value">
                  District: {{ d.label }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Targets</label>
              <div class="scope-preview">
                {{ announcementTargetSummary }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Type</label>
              <select v-model="announcementDisplayType" class="control-select">
                <option value="announcement">Scrolling banner</option>
                <option value="splash">Splash page</option>
              </select>
            </div>
            <div class="form-group">
              <label>Audience</label>
              <select v-model="announcementAudience" class="control-select">
                <option value="everyone">Everyone</option>
                <option value="school_staff_only">School staff only</option>
                <option value="providers_only">Providers only</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Title (optional)</label>
            <input
              v-model="announcementTitle"
              class="control-input"
              type="text"
              maxlength="255"
              placeholder="Announcement"
            />
          </div>

          <div class="form-group">
            <label>Message</label>
            <textarea
              v-model="announcementMessage"
              class="announcement-textarea"
              rows="5"
              maxlength="1200"
              :placeholder="announcementDisplayType === 'splash' ? 'Type the splash page message.' : 'Type the scrolling message that should appear across the selected school portals.'"
            />
            <div class="hint-row">
              <span>{{ announcementMessage.length }}/1200</span>
              <span>Announcements are time-limited to 2 weeks max.</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Starts</label>
              <input v-model="announcementStartsAt" class="control-input" type="datetime-local" />
            </div>
            <div class="form-group">
              <label>Ends</label>
              <input v-model="announcementEndsAt" class="control-input" type="datetime-local" />
            </div>
          </div>

          <div v-if="announcementError" class="error">{{ announcementError }}</div>

          <div class="announcement-actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="announcementSaving || announcementTargetOrganizations.length === 0 || !announcementMessage.trim() || !announcementStartsAt || !announcementEndsAt"
              @click="submitBulkAnnouncement"
            >
              {{ announcementSaving ? 'Posting…' : 'Post announcement' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="announcementSaving" @click="closeBulkAnnouncementModal">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showEditAnnouncementModal" class="modal-overlay" @click.self="closeEditAnnouncementModal">
      <div class="modal announcement-modal" @click.stop>
        <div class="modal-header">
          <div>
            <strong>Edit announcement</strong>
            <div class="modal-subtitle">
              Changes apply to all {{ editAnnouncement.portal_count }} {{ editAnnouncement.portal_count === 1 ? 'portal' : 'portals' }} in this group.
            </div>
          </div>
          <button class="close" type="button" aria-label="Close" @click="closeEditAnnouncementModal">×</button>
        </div>
        <div class="modal-body announcement-modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Type</label>
              <select v-model="editDisplayType" class="control-select">
                <option value="announcement">Scrolling banner</option>
                <option value="splash">Splash page</option>
              </select>
            </div>
            <div class="form-group">
              <label>Audience</label>
              <select v-model="editAudience" class="control-select">
                <option value="everyone">Everyone</option>
                <option value="school_staff_only">School staff only</option>
                <option value="providers_only">Providers only</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Title (optional)</label>
            <input
              v-model="editTitle"
              class="control-input"
              type="text"
              maxlength="255"
              placeholder="Announcement"
            />
          </div>

          <div class="form-group">
            <label>Message</label>
            <textarea
              v-model="editMessage"
              class="announcement-textarea"
              rows="5"
              maxlength="1200"
              :placeholder="editDisplayType === 'splash' ? 'Type the splash page message.' : 'Type the scrolling message.'"
            />
            <div class="hint-row">
              <span>{{ editMessage.length }}/1200</span>
              <span>Announcements are time-limited to 2 weeks max.</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Starts</label>
              <input v-model="editStartsAt" class="control-input" type="datetime-local" />
            </div>
            <div class="form-group">
              <label>Ends</label>
              <input v-model="editEndsAt" class="control-input" type="datetime-local" />
            </div>
          </div>

          <div v-if="editError" class="error">{{ editError }}</div>

          <div class="announcement-actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="editSaving || !editMessage.trim() || !editStartsAt || !editEndsAt"
              @click="submitEditAnnouncement"
            >
              {{ editSaving ? 'Saving…' : 'Save changes' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="editSaving" @click="closeEditAnnouncementModal">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showSchoolEventRequestModal" class="modal-overlay" @click.self="closeSchoolEventRequestModal">
      <div class="modal announcement-modal" @click.stop>
        <div class="modal-header">
          <div>
            <strong>Request school event submissions</strong>
            <div class="modal-subtitle">
              Email school staff at schools that have not yet posted the selected event type this year.
            </div>
          </div>
          <button class="close" type="button" aria-label="Close" @click="closeSchoolEventRequestModal">×</button>
        </div>
        <div class="modal-body announcement-modal-body">
          <div class="form-group">
            <label>Event type</label>
            <select v-model="schoolEventRequestCategory" class="control-select">
              <option value="back_to_school">Back to School</option>
              <option value="fall_check_in">Fall School Check-in</option>
              <option value="spring">Spring School Check-in</option>
            </select>
          </div>
          <div class="form-group">
            <label>Custom message (optional)</label>
            <textarea
              v-model="schoolEventRequestMessage"
              class="announcement-textarea"
              rows="4"
              maxlength="1200"
              placeholder="Please input your school's back to school event info"
            />
          </div>
          <div class="hint-row">
            <span>{{ schoolEventRequestTargetCount }} schools missing this event · {{ schoolEventsOverview.year || new Date().getFullYear() }}</span>
          </div>
          <div v-if="schoolEventRequestError" class="error">{{ schoolEventRequestError }}</div>
          <div class="announcement-actions">
            <button type="button" class="btn btn-secondary" :disabled="schoolEventRequestSaving" @click="closeSchoolEventRequestModal">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="schoolEventRequestSaving || schoolEventRequestTargetCount === 0"
              @click="submitSchoolEventRequest"
            >
              {{ schoolEventRequestSaving ? 'Sending…' : 'Send emails' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <AddSchoolScopedModal
      v-model="showAddSchoolModal"
      :affiliated-agency-id="affiliatedAgencyIdForModal"
      @created="onSchoolCreated"
    />

    <div v-if="showDeleteConfirmModal" class="modal-overlay" @click.self="closeDeleteConfirmModal">
      <div class="modal delete-confirm-modal" @click.stop>
        <div class="modal-header">
          <div>
            <strong>Delete scrolling announcement</strong>
          </div>
          <button class="close" type="button" aria-label="Close" @click="closeDeleteConfirmModal">×</button>
        </div>
        <div class="modal-body">
          <p>
            This will remove the scrolling banner from
            <strong>{{ deleteTarget?.portal_count || 0 }} {{ (deleteTarget?.portal_count || 0) === 1 ? 'portal' : 'portals' }}</strong>.
            This action cannot be undone.
          </p>
          <div v-if="deleteTarget?.message" class="delete-preview">
            <div v-if="deleteTarget.title" class="delete-preview-title">{{ deleteTarget.title }}</div>
            {{ deleteTarget.message }}
          </div>
          <div v-if="deleteError" class="error">{{ deleteError }}</div>
          <div class="announcement-actions">
            <button
              type="button"
              class="btn btn-danger"
              :disabled="deleteSaving"
              @click="submitDeleteAnnouncement"
            >
              {{ deleteSaving ? 'Deleting…' : 'Delete announcement' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="deleteSaving" @click="closeDeleteConfirmModal">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showSchoolNotesModal" class="modal-overlay" @click.self="closeSchoolNotesModal">
      <div class="modal school-notes-modal" @click.stop>
        <div class="modal-header">
          <div>
            <strong>Internal notes</strong>
            <div class="modal-subtitle">
              {{ schoolNotesTarget?.school_name || 'School' }} — admin team only
            </div>
          </div>
          <button class="close" type="button" aria-label="Close" @click="closeSchoolNotesModal">×</button>
        </div>
        <div class="modal-body school-notes-modal-body">
          <div v-if="schoolNotesError" class="error">{{ schoolNotesError }}</div>
          <div v-if="schoolNotesLoading" class="loading">Loading notes…</div>
          <div v-else-if="schoolNotes.length === 0" class="empty-state school-notes-empty">
            No internal notes yet for this school.
          </div>
          <div v-else class="school-notes-list">
            <div v-for="n in schoolNotes" :key="n.id" class="school-note-item">
              <div class="school-note-meta">
                <strong>{{ schoolNoteAuthorLabel(n) }}</strong>
                <span class="muted">{{ formatAnnouncementDate(n.created_at) }}</span>
              </div>
              <div class="school-note-message">{{ n.message }}</div>
            </div>
          </div>

          <div class="form-group school-notes-compose">
            <label>Add note</label>
            <textarea
              v-model="schoolNotesDraft"
              class="announcement-textarea"
              rows="3"
              maxlength="8000"
              placeholder="Internal note visible only to admin, super admin, and CPA…"
            />
          </div>
          <div class="announcement-actions">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="schoolNotesSaving || !String(schoolNotesDraft || '').trim()"
              @click="submitSchoolNote"
            >
              {{ schoolNotesSaving ? 'Saving…' : 'Save note' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="schoolNotesSaving" @click="closeSchoolNotesModal">
              Close
            </button>
          </div>
        </div>
      </div>
      
      <div class="dashboard-footer">
        <div class="footer-links">
          <a href="#">Privacy Policy</a> | <a href="#">Terms</a> | <a href="#">Public Proof</a>
        </div>
        <div class="footer-copy">
          © {{ new Date().getFullYear() }} ITSCO. All rights reserved.
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { canAccessSchoolPortalsSurfaces } from '../../utils/schoolPortalsAccess.js';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../../utils/skillBuildersSchoolProgramAccess.js';
import AddSchoolScopedModal from '../../components/admin/AddSchoolScopedModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();

const isSidebarCollapsed = ref(false);
const loading = ref(false);
const error = ref('');
const schools = ref([]);
const searchQuery = ref('');
const sortBy = ref('school_name-asc');
const selectedDistrict = ref('all');
const failedCardLogoIds = ref(new Set());
const showBulkAnnouncementModal = ref(false);
const announcementSaving = ref(false);
const announcementFlash = ref('');
const announcementError = ref('');
const announcementScope = ref('all');
const announcementTitle = ref('');
const announcementMessage = ref('');
const announcementDisplayType = ref('announcement');
const announcementAudience = ref('everyone');
const announcementStartsAt = ref('');
const announcementEndsAt = ref('');

const bulkAnnouncements = ref([]);
const showEditAnnouncementModal = ref(false);
const editAnnouncement = ref(null);
const editTitle = ref('');
const editMessage = ref('');
const editDisplayType = ref('announcement');
const editAudience = ref('everyone');
const editStartsAt = ref('');
const editEndsAt = ref('');
const editSaving = ref(false);
const editError = ref('');

const showDeleteConfirmModal = ref(false);
const deleteTarget = ref(null);
const deleteSaving = ref(false);
const deleteError = ref('');
const showAddSchoolModal = ref(false);

const showSchoolNotesModal = ref(false);
const schoolNotesTarget = ref(null);
const schoolNotes = ref([]);
const schoolNotesDraft = ref('');
const schoolNotesLoading = ref(false);
const schoolNotesSaving = ref(false);
const schoolNotesError = ref('');

const schoolEventsOverview = ref({ year: new Date().getFullYear(), schools: [], events: [], missingBySchool: {} });
const showSchoolEventRequestModal = ref(false);
const schoolEventRequestCategory = ref('back_to_school');
const schoolEventRequestMessage = ref('');
const schoolEventRequestSaving = ref(false);
const schoolEventRequestError = ref('');
const schoolEventRequestFlash = ref('');

const schoolEventsMissingCount = computed(() => {
  const missing = schoolEventsOverview.value?.missingBySchool || {};
  return Object.values(missing).filter((cats) => Array.isArray(cats) && cats.length > 0).length;
});

const schoolEventRequestTargetCount = computed(() => {
  const missing = schoolEventsOverview.value?.missingBySchool || {};
  const cat = schoolEventRequestCategory.value;
  return Object.values(missing).filter((cats) => Array.isArray(cats) && cats.includes(cat)).length;
});

const orgSlug = computed(() => (typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug : ''));
const hubTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/admin/school-portals-hub` : '/admin/school-portals-hub'));
const schoolOverviewTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/schools/overview?orgType=school` : '/admin/schools/overview?orgType=school'
);

const toLocalDatetimeInputValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join('T');
};

const buildAnnouncementDefaults = () => {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 5);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 48 * 60 * 60 * 1000);
  announcementStartsAt.value = toLocalDatetimeInputValue(start);
  announcementEndsAt.value = toLocalDatetimeInputValue(end);
};

function schoolLogoUrl(school) {
  const candidates = [
    school?.logo_path,
    school?.icon_file_path,
    school?.icon_path,
    school?.logo_url,
    school?.icon_url
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return toUploadsUrl(s);
}

function schoolInitials(school) {
  const parts = String(school?.school_name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function onCardLogoError(schoolId) {
  failedCardLogoIds.value = new Set([...failedCardLogoIds.value, String(schoolId)]);
}

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const canManageMarketingCampaigns = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['admin', 'support', 'super_admin'].includes(r);
});

const orgType = computed(() => {
  const t = String(route.query?.orgType || '').trim().toLowerCase();
  if (t === 'school' || t === 'program' || t === 'learning') return t;
  return 'school';
});
const isAllPortalsPage = computed(() => String(route.name || '') === 'SchoolPortals' || String(route.name || '') === 'OrganizationSchoolPortals');
const showAllPortalsTo = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug : '';
  return slug ? `/${slug}/admin/school-portals` : '/admin/school-portals';
});

const pageTitle = computed(() => {
  if (isAllPortalsPage.value) return 'Show All School Portals';
  if (orgType.value === 'program') return 'Program Overview';
  if (orgType.value === 'learning') return 'Learning Overview';
  return 'School Overview';
});

const searchPlaceholder = computed(() => {
  if (isAllPortalsPage.value) return 'Search by school/program/learning portal name…';
  if (orgType.value === 'program') return 'Search by program name…';
  if (orgType.value === 'learning') return 'Search by learning org name…';
  return 'Search by school name…';
});

const emptyStateText = computed(() => {
  if (isAllPortalsPage.value) return 'No affiliated school/program/learning portals found for this agency.';
  if (orgType.value === 'program') return 'No affiliated programs or learning orgs found for this agency.';
  if (orgType.value === 'learning') return 'No affiliated learning orgs found for this agency.';
  return 'No affiliated schools found for this agency.';
});

const districtOptions = computed(() => {
  const values = new Set();
  for (const s of schools.value || []) {
    const name = String(s?.district_name || '').trim();
    if (name) values.add(name);
  }
  const sorted = Array.from(values).sort((a, b) => a.localeCompare(b));
  return [{ label: 'All', value: 'all' }, ...sorted.map((d) => ({ label: d, value: d }))];
});

const announcementDistrictScopeOptions = computed(() => districtOptions.value.filter((item) => item.value !== 'all'));

const agencyOptions = ref([]);
const selectedAgencyId = ref('');

const overviewAgencyRowForGate = computed(() => {
  if (isSuperAdmin.value) {
    const id = parseInt(String(selectedAgencyId.value || ''), 10);
    if (!Number.isFinite(id) || id < 1) return null;
    return (agencyOptions.value || []).find((a) => Number(a?.id) === id) || null;
  }
  return agencyStore.currentAgency?.value || agencyStore.currentAgency || null;
});

const isBackofficeManager = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'super_admin';
});

const canManageSchoolsHere = computed(() => {
  if (!isBackofficeManager.value) return false;
  if (orgType.value === 'program' || orgType.value === 'learning') return false;
  if (isSuperAdmin.value) return true;
  const row = overviewAgencyRowForGate.value;
  if (!row) return false;
  const pb = brandingStore.platformBranding || {};
  return canAccessSchoolPortalsSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: row.feature_flags ?? row.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      row.tenant_available_agency_features_json ?? row.tenantAvailableAgencyFeaturesJson
  });
});

/** Open notes: admin + super_admin always; CPA only when School Portals surfaces are enabled. */
const canOpenSchoolInternalNotes = computed(() => {
  if (!isAllPortalsPage.value) return false;
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'super_admin') return true;
  if (role !== 'clinical_practice_assistant') return false;
  if (isSuperAdmin.value) return true;
  const row = overviewAgencyRowForGate.value;
  if (!row) return false;
  const pb = brandingStore.platformBranding || {};
  return canAccessSchoolPortalsSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: row.feature_flags ?? row.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      row.tenant_available_agency_features_json ?? row.tenantAvailableAgencyFeaturesJson
  });
});

const canSeeSkillBuildersSchoolOverviewUi = computed(() => {
  if (orgType.value === 'program' || orgType.value === 'learning') return false;
  if (isSuperAdmin.value) return true;
  const row = overviewAgencyRowForGate.value;
  if (!row) return false;
  const pb = brandingStore.platformBranding || {};
  return canAccessSkillBuildersSchoolProgramSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: row.feature_flags ?? row.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      row.tenant_available_agency_features_json ?? row.tenantAvailableAgencyFeaturesJson
  });
});

const affiliatedAgencyIdForModal = computed(() => {
  const fromPicker = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (Number.isFinite(fromPicker) && fromPicker > 0) return fromPicker;
  const cur = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (cur?.id && String(cur.organization_type || 'agency').toLowerCase() === 'agency') {
    return Number(cur.id);
  }
  const fromStore = isSuperAdmin.value ? (agencyStore.agencies?.value || agencyStore.agencies) : (agencyStore.userAgencies?.value || agencyStore.userAgencies);
  const first = (fromStore || []).find((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
  return first?.id ? Number(first.id) : null;
});

const onSchoolCreated = async () => {
  await refresh();
};

const studentStatusBySchool = ref({});
const studentStatusOrder = ['current', 'packet', 'screener', 'waitlist'];

const selectedAgencyName = computed(() => {
  const agencyId = Number(selectedAgencyId.value || 0);
  const fromPicker = (agencyOptions.value || []).find((item) => Number(item?.id || 0) === agencyId);
  if (fromPicker?.name) return String(fromPicker.name).trim();
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return String(current?.name || '').trim() || 'this agency';
});

const announcementEntityLabelPlural = computed(() => {
  if (isAllPortalsPage.value) return 'portals';
  if (orgType.value === 'program') return 'programs';
  if (orgType.value === 'learning') return 'learning orgs';
  return 'schools';
});

const allAnnouncementScopeLabel = computed(() => `All ${announcementEntityLabelPlural.value} in ${selectedAgencyName.value}`);

const studentStatusKeyFor = (school) => {
  const sid = String(school?.school_id || '');
  if (!sid) return 'current';
  return studentStatusBySchool.value?.[sid] || 'current';
};

const studentStatusLabel = (school) => {
  const key = studentStatusKeyFor(school);
  if (key === 'packet') return 'Students (Packet)';
  if (key === 'screener') return 'Students (Screener)';
  if (key === 'waitlist') return 'Students (Waitlist)';
  return 'Students (Current)';
};

const studentStatusValue = (school) => {
  const key = studentStatusKeyFor(school);
  if (key === 'packet') return Number(school?.clients_packet || 0);
  if (key === 'screener') return Number(school?.clients_screener || 0);
  if (key === 'waitlist') return Number(school?.waitlist_count || 0);
  return Number(school?.clients_current || 0);
};

const resolveDefaultAgencyId = () => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const currentType = String(current?.organization_type || 'agency').toLowerCase();
  if (current?.id && currentType === 'agency') return String(current.id);

  const fromStore = isSuperAdmin.value ? (agencyStore.agencies?.value || agencyStore.agencies) : (agencyStore.userAgencies?.value || agencyStore.userAgencies);
  const firstAgency = (fromStore || []).find((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
  return firstAgency?.id ? String(firstAgency.id) : '';
};

const fetchAgenciesForPicker = async () => {
  if (!isSuperAdmin.value) return;
  try {
    const res = await api.get('/agencies');
    const raw = Array.isArray(res.data) ? res.data : [];
    agencyOptions.value = raw
      .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  } catch {
    agencyOptions.value = [];
  }
};

const fetchOverview = async () => {
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (!agencyId) {
    schools.value = [];
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    failedCardLogoIds.value = new Set();
    const res = await api.get('/dashboard/school-overview', { params: { agencyId, orgType: orgType.value || undefined } });
    schools.value = res.data?.schools || [];
  } catch (e) {
    schools.value = [];
    error.value = e?.response?.data?.error?.message || 'Failed to load school overview';
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  await Promise.all([fetchOverview(), fetchBulkAnnouncements(), fetchSchoolEventsOverview()]);
};

const fetchSchoolEventsOverview = async () => {
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (!agencyId) {
    schoolEventsOverview.value = { year: new Date().getFullYear(), schools: [], events: [], missingBySchool: {} };
    return;
  }
  try {
    const res = await api.get('/school-portal/school-events/overview', { params: { agencyId } });
    schoolEventsOverview.value = res.data || { year: new Date().getFullYear(), schools: [], events: [], missingBySchool: {} };
  } catch {
    schoolEventsOverview.value = { year: new Date().getFullYear(), schools: [], events: [], missingBySchool: {} };
  }
};

const openSchoolEventRequestModal = () => {
  schoolEventRequestError.value = '';
  schoolEventRequestMessage.value = '';
  schoolEventRequestCategory.value = 'back_to_school';
  showSchoolEventRequestModal.value = true;
};

const closeSchoolEventRequestModal = () => {
  showSchoolEventRequestModal.value = false;
  schoolEventRequestError.value = '';
};

const submitSchoolEventRequest = async () => {
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (!agencyId) return;
  try {
    schoolEventRequestSaving.value = true;
    schoolEventRequestError.value = '';
    const res = await api.post('/school-portal/school-events/request-submissions', {
      agencyId,
      category: schoolEventRequestCategory.value,
      message: schoolEventRequestMessage.value.trim() || null,
      year: schoolEventsOverview.value?.year || new Date().getFullYear()
    });
    schoolEventRequestFlash.value = `Requested event info from ${res.data?.emailedSchools || 0} schools (${res.data?.emailedRecipients || 0} recipients).`;
    closeSchoolEventRequestModal();
    await fetchSchoolEventsOverview();
  } catch (e) {
    schoolEventRequestError.value = e?.response?.data?.error?.message || 'Failed to send request emails';
  } finally {
    schoolEventRequestSaving.value = false;
  }
};

const openBulkAnnouncementModal = () => {
  announcementFlash.value = '';
  announcementError.value = '';
  announcementScope.value = selectedDistrict.value && selectedDistrict.value !== 'all' ? selectedDistrict.value : 'all';
  announcementTitle.value = '';
  announcementMessage.value = '';
  announcementDisplayType.value = 'announcement';
  announcementAudience.value = 'everyone';
  buildAnnouncementDefaults();
  showBulkAnnouncementModal.value = true;
};

const closeBulkAnnouncementModal = () => {
  if (announcementSaving.value) return;
  showBulkAnnouncementModal.value = false;
  announcementError.value = '';
};

const filteredSchools = computed(() => {
  const q = String(searchQuery.value || '').trim().toLowerCase();
  const district = String(selectedDistrict.value || 'all');
  const withDistrict = district && district !== 'all'
    ? (schools.value || []).filter((s) => String(s?.district_name || '').trim() === district)
    : (schools.value || []);
  const base = q
    ? withDistrict.filter((s) => String(s?.school_name || '').toLowerCase().includes(q))
    : withDistrict;

  const [field, dirRaw] = String(sortBy.value || 'school_name-asc').split('-');
  const dir = dirRaw === 'desc' ? -1 : 1;
  const norm = (v) => String(v || '').trim().toLowerCase();
  const getVal = (s) => {
    if (field === 'district_name') return norm(s?.district_name || '');
    if (field === 'school_name') return norm(s?.school_name || '');
    return norm(s?.[field]);
  };

  return base.slice().sort((a, b) => {
    const av = getVal(a);
    const bv = getVal(b);
    const cmp = av.localeCompare(bv);
    if (cmp !== 0) return cmp * dir;
    return Number(a?.school_id || 0) - Number(b?.school_id || 0);
  });
});

const announcementTargetOrganizations = computed(() => {
  const scope = String(announcementScope.value || 'all');
  if (scope === 'all') return schools.value || [];
  return (schools.value || []).filter((item) => String(item?.district_name || '').trim() === scope);
});

const announcementTargetSummary = computed(() => {
  const count = announcementTargetOrganizations.value.length;
  const label = announcementEntityLabelPlural.value;
  if (String(announcementScope.value || 'all') === 'all') {
    return `${count} ${label} in ${selectedAgencyName.value}`;
  }
  return `${count} ${label} in district ${announcementScope.value}`;
});

const submitBulkAnnouncement = async () => {
  try {
    announcementSaving.value = true;
    announcementError.value = '';
    announcementFlash.value = '';
    await api.post('/school-portal/bulk-announcements', {
      organizationIds: announcementTargetOrganizations.value.map((item) => Number(item?.school_id || 0)).filter(Boolean),
      title: String(announcementTitle.value || '').trim() || null,
      message: String(announcementMessage.value || '').trim(),
      display_type: announcementDisplayType.value || 'announcement',
      audience: announcementAudience.value || 'everyone',
      starts_at: announcementStartsAt.value,
      ends_at: announcementEndsAt.value
    });
    const typeLabel = announcementDisplayType.value === 'splash' ? 'Splash page' : 'Scrolling announcement';
    announcementFlash.value = `${typeLabel} posted to ${announcementTargetSummary.value}.`;
    showBulkAnnouncementModal.value = false;
    await fetchBulkAnnouncements();
  } catch (e) {
    announcementError.value = e?.response?.data?.error?.message || 'Failed to post scrolling announcement';
  } finally {
    announcementSaving.value = false;
  }
};

const fetchBulkAnnouncements = async () => {
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (!agencyId) {
    bulkAnnouncements.value = [];
    return;
  }
  try {
    const res = await api.get('/school-portal/bulk-announcements', { params: { agencyId } });
    bulkAnnouncements.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    bulkAnnouncements.value = [];
  }
};

const bulkAudienceLabel = (aud) => {
  const map = { everyone: 'Everyone', school_staff_only: 'School staff only', providers_only: 'Providers only' };
  return map[aud] || 'Everyone';
};

const formatAnnouncementDate = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const openEditBulkAnnouncement = (a) => {
  editAnnouncement.value = a;
  editTitle.value = a.title || '';
  editMessage.value = a.message || '';
  editDisplayType.value = a.display_type || 'announcement';
  editAudience.value = a.audience || 'everyone';
  editStartsAt.value = toLocalDatetimeInputValue(a.starts_at);
  editEndsAt.value = toLocalDatetimeInputValue(a.ends_at);
  editError.value = '';
  editSaving.value = false;
  showEditAnnouncementModal.value = true;
};

const closeEditAnnouncementModal = () => {
  if (editSaving.value) return;
  showEditAnnouncementModal.value = false;
  editAnnouncement.value = null;
  editError.value = '';
};

const submitEditAnnouncement = async () => {
  const groupId = editAnnouncement.value?.bulk_group_id;
  if (!groupId) return;
  try {
    editSaving.value = true;
    editError.value = '';
    await api.put(`/school-portal/bulk-announcements/${groupId}`, {
      title: String(editTitle.value || '').trim() || null,
      message: String(editMessage.value || '').trim(),
      display_type: editDisplayType.value || 'announcement',
      audience: editAudience.value || 'everyone',
      starts_at: editStartsAt.value,
      ends_at: editEndsAt.value
    });
    announcementFlash.value = 'Announcement updated successfully.';
    showEditAnnouncementModal.value = false;
    editAnnouncement.value = null;
    await fetchBulkAnnouncements();
  } catch (e) {
    editError.value = e?.response?.data?.error?.message || 'Failed to update announcement';
  } finally {
    editSaving.value = false;
  }
};

const confirmDeleteBulkAnnouncement = (a) => {
  deleteTarget.value = a;
  deleteError.value = '';
  deleteSaving.value = false;
  showDeleteConfirmModal.value = true;
};

const closeDeleteConfirmModal = () => {
  if (deleteSaving.value) return;
  showDeleteConfirmModal.value = false;
  deleteTarget.value = null;
  deleteError.value = '';
};

const submitDeleteAnnouncement = async () => {
  const groupId = deleteTarget.value?.bulk_group_id;
  if (!groupId) return;
  try {
    deleteSaving.value = true;
    deleteError.value = '';
    await api.delete(`/school-portal/bulk-announcements/${groupId}`);
    announcementFlash.value = 'Scrolling announcement deleted.';
    showDeleteConfirmModal.value = false;
    deleteTarget.value = null;
    await fetchBulkAnnouncements();
  } catch (e) {
    deleteError.value = e?.response?.data?.error?.message || 'Failed to delete announcement';
  } finally {
    deleteSaving.value = false;
  }
};

const formatOrgType = (t) => {
  const k = String(t || '').toLowerCase();
  if (!k) return 'Org';
  if (k === 'school') return 'School';
  if (k === 'program') return 'Program';
  if (k === 'learning') return 'Learning';
  return k;
};

const openSchool = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard`);
};

const schoolNoteAuthorLabel = (note) => {
  const first = String(note?.author_first_name || '').trim();
  const last = String(note?.author_last_name || '').trim();
  const name = `${first} ${last}`.trim();
  if (name) return name;
  return String(note?.author_email || 'Admin').trim() || 'Admin';
};

const closeSchoolNotesModal = () => {
  showSchoolNotesModal.value = false;
  schoolNotesTarget.value = null;
  schoolNotes.value = [];
  schoolNotesDraft.value = '';
  schoolNotesError.value = '';
  schoolNotesLoading.value = false;
  schoolNotesSaving.value = false;
};

const openSchoolNotes = async (school) => {
  if (!canOpenSchoolInternalNotes.value) return;
  const schoolId = parseInt(String(school?.school_id || ''), 10);
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (!Number.isFinite(schoolId) || schoolId < 1 || !Number.isFinite(agencyId) || agencyId < 1) return;

  schoolNotesTarget.value = school;
  schoolNotesDraft.value = '';
  schoolNotesError.value = '';
  schoolNotes.value = [];
  showSchoolNotesModal.value = true;
  schoolNotesLoading.value = true;
  try {
    const res = await api.get(`/dashboard/school-overview/${schoolId}/internal-notes`, {
      params: { agencyId }
    });
    schoolNotes.value = Array.isArray(res.data?.notes) ? res.data.notes : [];
  } catch (e) {
    schoolNotesError.value = e?.response?.data?.error?.message || 'Failed to load notes';
  } finally {
    schoolNotesLoading.value = false;
  }
};

const submitSchoolNote = async () => {
  const schoolId = parseInt(String(schoolNotesTarget.value?.school_id || ''), 10);
  const agencyId = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  const message = String(schoolNotesDraft.value || '').trim();
  if (!Number.isFinite(schoolId) || schoolId < 1 || !Number.isFinite(agencyId) || agencyId < 1 || !message) return;

  schoolNotesSaving.value = true;
  schoolNotesError.value = '';
  try {
    const res = await api.post(`/dashboard/school-overview/${schoolId}/internal-notes`, {
      agencyId,
      message
    });
    const created = res.data?.note;
    if (created) {
      schoolNotes.value = [created, ...(schoolNotes.value || [])];
    } else {
      await openSchoolNotes(schoolNotesTarget.value);
    }
    schoolNotesDraft.value = '';
  } catch (e) {
    schoolNotesError.value = e?.response?.data?.error?.message || 'Failed to save note';
  } finally {
    schoolNotesSaving.value = false;
  }
};

const skillBuildersIconUrl = computed(() => {
  try {
    return brandingStore.getAdminQuickActionIconUrl('skill_builders_availability', agencyStore.currentAgency || null);
  } catch {
    return null;
  }
});

const goToSchoolSkillsGroups = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard?sp=skills`);
};

const openSchoolNotifications = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard?sp=notifications`);
};

const openSchoolNotificationsFiltered = (school, filter) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  const key = filter === 'messages' ? 'messages' : 'comments';
  router.push(`/${slug}/dashboard?sp=notifications&notif=${key}`);
};

const cycleStudentStatus = (school) => {
  const sid = String(school?.school_id || '');
  if (!sid) return;
  const current = studentStatusKeyFor(school);
  const idx = studentStatusOrder.indexOf(current);
  const next = studentStatusOrder[(idx + 1) % studentStatusOrder.length] || 'current';
  studentStatusBySchool.value = { ...studentStatusBySchool.value, [sid]: next };
};

const sumSkillsParticipants = (school) => {
  const groups = Array.isArray(school?.active_skills_groups) ? school.active_skills_groups : [];
  return groups.reduce((acc, g) => acc + Number(g?.participants_count || 0), 0);
};

const openSkillsUnassigned = (school) => {
  const slug = String(school?.school_slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}/dashboard?sp=skills&skillsUnassigned=1`);
};

watch(
  () => selectedAgencyId.value,
  async () => {
    await Promise.all([fetchOverview(), fetchBulkAnnouncements(), fetchSchoolEventsOverview()]);
  }
);

watch(
  () => districtOptions.value.map((item) => item.value).join('|'),
  () => {
    const scope = String(announcementScope.value || 'all');
    if (scope === 'all') return;
    const stillExists = districtOptions.value.some((item) => item.value === scope);
    if (!stillExists) announcementScope.value = 'all';
  }
);

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  await fetchAgenciesForPicker();
  selectedAgencyId.value = resolveDefaultAgencyId();
  await Promise.all([fetchOverview(), fetchBulkAnnouncements(), fetchSchoolEventsOverview()]);
});
</script>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-body, #f8fafc);
  margin: -24px; /* override default container padding if any */
}

.sidebar {
  width: 240px;
  background: #115e59;
  color: white;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
}
.sidebar-collapsed .sidebar {
  width: 68px;
}
.sidebar-collapsed .sidebar-item {
  justify-content: center;
  padding: 12px;
}
.sidebar-collapsed .sidebar-icon {
  margin: 0;
}

.sidebar-menu {
  flex: 1;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-bottom {
  padding: 16px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.sidebar-item.active {
  background: #064e3b;
  color: white;
}

.sidebar-icon {
  width: 18px;
  height: 18px;
}

.main-content {
  flex: 1;
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
}

.btn-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
  vertical-align: text-bottom;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 0;
  border-bottom: none;
  gap: 12px;
}
@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-left h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.header-actions .btn {
  display: inline-flex;
  align-items: center;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 13px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.header-actions .btn-secondary {
  background: white;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.header-actions .btn-primary {
  background: #065f46;
  border-color: #065f46;
  color: white;
}

.controls {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: end;
  margin-bottom: 16px;
}
.control {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.control-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.control-input,
.control-select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  background: white;
  font-size: 13px;
}
.control-search {
  flex: 1;
  min-width: 320px;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
}
.control-input-search {
  flex: 1;
  border: none;
  background: transparent;
  padding: 6px 12px;
  box-shadow: none;
  outline: none;
}
.district-buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-right: 4px;
}
.district-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.district-btn:hover {
  background: var(--bg-alt);
}
.district-btn.active {
  background: #f0fdf4;
  color: #166534;
}

.total-schools-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.cards-wrap {
  margin-top: 24px;
}

/* Small portal cards (Show All School Portals) */
.portal-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 1200px) {
  .portal-cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 900px) {
  .portal-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .portal-cards-grid {
    grid-template-columns: 1fr;
  }
}

.portal-card {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 12px;
  align-items: start;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.portal-card:hover {
  border-color: #10b981;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  transform: translateY(-2px);
}
.portal-card-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  grid-row: span 2;
}
.portal-card-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.portal-card-logo-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}
.portal-card-body {
  min-width: 0;
}
.portal-card-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.3;
  margin-bottom: 4px;
}
.portal-card-type {
  display: none; /* Hidden in mockup */
}
.portal-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  grid-column: 2;
}
.portal-card-cta, .portal-card-cta-secondary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
}
.portal-card-cta::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'%3E%3C/path%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cline x1='10' y1='14' x2='21' y2='3'%3E%3C/line%3E%3C/svg%3E");
  background-size: cover;
}
.portal-card-cta-secondary::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'%3E%3C/path%3E%3Cpolyline points='14 2 14 8 20 8'%3E%3C/polyline%3E%3Cline x1='16' y1='13' x2='8' y2='13'%3E%3C/line%3E%3Cline x1='16' y1='17' x2='8' y2='17'%3E%3C/line%3E%3Cpolyline points='10 9 9 9 8 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-size: cover;
}
.portal-card-cta:hover, .portal-card-cta-secondary:hover {
  color: var(--primary);
}

.dashboard-footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-secondary);
}
.footer-links a {
  color: inherit;
  text-decoration: none;
  margin: 0 4px;
}
.footer-links a:hover {
  text-decoration: underline;
}

.school-notes-modal {
  max-width: 560px;
  width: min(560px, 94vw);
}
.school-notes-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.school-notes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(360px, 45vh);
  overflow: auto;
  padding-right: 2px;
}
.school-note-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-alt, #f8fafc);
}
.school-note-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  margin-bottom: 6px;
}
.school-note-message {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-primary);
}
.school-notes-empty {
  margin: 0;
  padding: 12px 0;
}
.school-notes-compose {
  margin-top: 4px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1200px) {
  .cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 780px) {
  .cards-grid {
    grid-template-columns: 1fr;
  }
}
.school-card {
  text-align: left;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.school-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.school-card.skills-active {
  border-color: var(--accent);
  box-shadow: var(--shadow);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 10px;
  margin-bottom: 12px;
}
.card-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-logo {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.card-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card-logo-fallback {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}
.school-name {
  font-weight: 900;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.2;
}
.school-meta {
  margin-top: 6px;
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.pill-icon {
  padding: 3px 8px;
  cursor: pointer;
  gap: 6px;
}
.pill-icon:hover {
  background: rgba(255, 255, 255, 0.08);
}
.pill-icon-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  display: block;
}

/* Skills icon should not be nested in a "pill" bubble */
.sg-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
}
.sg-icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.sg-icon-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}
.sg-icon-fallback {
  font-size: 12px;
  font-weight: 900;
  color: var(--text-secondary);
}
.pill-warn {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #92400e;
}
.pill-accent {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.35);
  color: #9a3412;
}
.pill-sg-badge {
  background: rgba(16, 185, 129, 0.10);
  border-color: rgba(16, 185, 129, 0.28);
  color: #065f46;
  gap: 6px;
}
.sg-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.35);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}
.card-cta {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  white-space: nowrap;
  padding-top: 2px;
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-xs {
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.1;
}

.btn-danger {
  background: #dc2626;
  border-color: #dc2626;
  color: white;
}
.btn-danger:hover {
  background: #b91c1c;
  border-color: #b91c1c;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 980px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.stat {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}
.stat-notifications {
  cursor: pointer;
  border-color: #bae6fd;
  background: #e0f2fe;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-clickable {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-clickable:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-comments {
  cursor: pointer;
  border-color: #99f6e4;
  background: #ccfbf1;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-comments:hover {
  border-color: #5eead4;
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-comments .stat-label {
  color: #0f766e;
}
.stat-comments .stat-value {
  color: #115e59;
}
.stat-messages {
  cursor: pointer;
  border-color: #e9d5ff;
  background: #f3e8ff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.stat-messages:hover {
  border-color: #d8b4fe;
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-messages .stat-label {
  color: #6b21a8;
}
.stat-messages .stat-value {
  color: #581c87;
}
.stat-notifications:hover {
  border-color: #7dd3fc;
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.stat-notifications.active {
  border-color: #38bdf8;
  background: #bae6fd;
}
.stat-notifications .stat-label {
  color: #0284c7;
}
.stat-notifications .stat-value {
  color: #0369a1;
}
.stat-value.attention {
  color: inherit;
}
.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 2px;
}
.stat-value {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 900;
  color: var(--text-primary);
}
.stat-value.danger {
  color: #dc2626;
}

.empty-state {
  text-align: center;
  padding: 28px;
  color: var(--text-secondary);
  background: white;
  border: 1px dashed var(--border);
  border-radius: 12px;
}

.success-banner {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
  font-weight: 700;
}

.bulk-announcements-section {
  margin-bottom: 16px;
}
.bulk-announcements-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.bulk-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.35);
  font-size: 12px;
  font-weight: 900;
  color: #065f46;
}
.bulk-announcements-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bulk-announcement-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  transition: border-color 0.18s ease;
}
.bulk-announcement-card.active {
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.04);
}
.bulk-announcement-card.expired {
  opacity: 0.6;
}
.ba-main {
  flex: 1;
  min-width: 0;
}
.ba-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.ba-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ba-badge-active {
  background: rgba(16, 185, 129, 0.18);
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.35);
}
.ba-badge-scheduled {
  background: rgba(14, 165, 233, 0.12);
  color: #0c4a6e;
  border: 1px solid rgba(14, 165, 233, 0.3);
}
.ba-badge-expired {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.ba-badge-splash {
  background: rgba(168, 85, 247, 0.12);
  color: #6b21a8;
  border: 1px solid rgba(168, 85, 247, 0.3);
}
.ba-badge-banner {
  background: rgba(59, 130, 246, 0.12);
  color: #1e40af;
  border: 1px solid rgba(59, 130, 246, 0.3);
}
.ba-badge-audience {
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.ba-portals {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}
.ba-title {
  font-weight: 800;
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.ba-message {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ba-meta {
  margin-top: 6px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.ba-creator {
  font-style: italic;
}
.ba-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.delete-confirm-modal {
  width: min(480px, calc(100vw - 32px));
}
.delete-preview {
  margin: 12px 0;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  font-size: 13px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 100px;
  overflow: auto;
}
.delete-preview-title {
  font-weight: 800;
  margin-bottom: 4px;
}

.announcement-modal {
  width: min(720px, calc(100vw - 32px));
}

.announcement-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.scope-preview {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  font-weight: 700;
}

.announcement-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
  font: inherit;
}

.hint-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.announcement-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .hint-row,
  .announcement-actions {
    flex-direction: column;
    align-items: stretch;
  }
}

.school-events-section {
  margin: 16px 0;
  padding: 14px 16px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  background: var(--surface-elevated, #fff);
}
.school-events-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.school-events-count {
  font-size: 0.85rem;
  color: var(--text-muted, #6b7280);
}
.school-events-list {
  display: grid;
  gap: 8px;
}
.school-event-row {
  padding: 8px 0;
  border-top: 1px solid var(--border-color, #f3f4f6);
}
.school-event-row:first-child {
  border-top: none;
  padding-top: 0;
}
.school-events-missing-banner {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.92rem;
}
</style>

