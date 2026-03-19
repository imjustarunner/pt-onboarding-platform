<template>
  <div class="school-portal">
    <div class="portal-header">
      <div class="portal-header-row">
        <div class="portal-header-left">
          <div v-if="schoolLogoUrl" class="school-logo">
            <img :src="schoolLogoUrl" alt="" />
          </div>
          <div>
            <h1 data-tour="school-header-title">{{ organizationDisplayName }} Portal</h1>
            <p class="portal-subtitle">Schedule + roster (no PHI)</p>
          </div>
        </div>
        <div class="portal-header-right">
          <div v-if="showSchoolSelector" class="school-selector-wrap">
            <label for="school-selector" class="school-selector-label">School:</label>
            <select
              id="school-selector"
              v-model="selectedSchoolSlug"
              class="school-selector"
              aria-label="Switch school"
              @change="onSchoolSelect"
            >
              <option
                v-for="school in schoolStaffSchools"
                :key="school.slug"
                :value="school.slug"
              >
                {{ school.name }}
              </option>
            </select>
          </div>
          <button
            v-if="isSchoolStaff"
            type="button"
            class="btn btn-secondary btn-sm tutorial-toggle"
            :class="{ active: tutorialStore.enabled }"
            :aria-pressed="tutorialStore.enabled ? 'true' : 'false'"
            @click="tutorialStore.setEnabled(!tutorialStore.enabled)"
            title="Turn tutorials on/off"
          >
            Tutorial {{ tutorialStore.enabled ? 'On' : 'Off' }}
          </button>
        </div>
      </div>
      <div
        v-if="scrollingBannerItems.length > 0"
        class="portal-banner"
        role="button"
        tabindex="0"
        title="Open announcements"
        @click="openNotificationsPanel"
        @keydown.enter.prevent="openNotificationsPanel"
        @keydown.space.prevent="openNotificationsPanel"
      >
        <div class="portal-banner-inner">
          <div class="portal-banner-track" aria-label="School announcements banner">
            <span v-for="(t, idx) in bannerTexts" :key="`${idx}-${t.slice(0, 16)}`" class="portal-banner-item">
              {{ t }}
              <span class="sep" aria-hidden="true"> • </span>
            </span>
            <!-- Repeat once to ensure continuous scroll -->
            <span v-for="(t, idx) in bannerTexts" :key="`r-${idx}-${t.slice(0, 16)}`" class="portal-banner-item">
              {{ t }}
              <span class="sep" aria-hidden="true"> • </span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="portal-content">
      <div class="top-row">
        <div class="top-left">
          <div class="muted-small">
            {{
              portalMode === 'home'
                ? 'Choose a section'
                : portalMode === 'providers'
                  ? 'Providers'
                  : portalMode === 'roster'
                    ? 'Roster'
                    : portalMode === 'skills'
                      ? 'Skills Groups'
                      : portalMode === 'school_staff'
                        ? 'School staff'
                        : portalMode === 'messages'
                          ? 'Messages'
                          : 'School portal'
            }}
          </div>
        </div>
        <div class="top-actions" data-tour="school-top-actions">
          <button
            v-if="canShowSchoolSettingsButton"
            class="btn btn-secondary btn-sm settings-icon-btn"
            type="button"
            @click="openSchoolSettings"
            :title="'Organization settings'"
            aria-label="Organization settings"
          >
            <img v-if="settingsIconUrl" :src="settingsIconUrl" alt="" class="btn-icon-img" />
            <span v-else aria-hidden="true">⚙</span>
          </button>
          <router-link
            v-if="canBackToSchools"
            :to="backToSchoolsPath"
            class="btn btn-secondary btn-sm"
          >
            Back to show all schools
          </router-link>
          <label v-if="authStore.user?.id" class="school-portal-dark-mode-toggle" :title="isDarkMode ? 'Turn off dark mode' : 'Turn on dark mode'">
            <input type="checkbox" :checked="isDarkMode" @change="onDarkModeToggle" />
            <span class="school-portal-dark-mode-text">Dark mode</span>
          </label>
          <div class="codes-toggle" data-tour="school-codes-toggle">
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              @click="toggleClientLabelMode"
              :title="codesPrivacyHelp"
            >
              {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
            </button>
            <button
              class="btn btn-secondary btn-sm codes-info"
              type="button"
              :title="codesPrivacyHelp"
              @click="showCodesHelp = !showCodesHelp"
            >
              i
            </button>
            <div v-if="showCodesHelp" class="codes-help" role="note">
              {{ codesPrivacyHelp }}
            </div>
          </div>
          <button
            v-if="authStore.user?.id"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="openAnnouncementModal"
          >
            Create announcement
          </button>
          <button
            v-if="isSuperAdmin && organizationId"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="openAdminToolsModal"
          >
            Admin Tools
          </button>
          <button
            v-if="isFakeySchoolForSplashTest"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="openWeeklySplashPreview"
          >
            Display weekly splash
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="showHelpDesk = true">Contact admin</button>
          <button
            v-if="isSchoolStaff"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="authStore.logout()"
          >
            Logout
          </button>
        </div>
      </div>

      <div class="main-layout" :class="{ 'with-rail': portalMode !== 'home' }">
        <nav
          v-if="portalMode !== 'home'"
          class="nav-rail"
          :class="{ locked: waiverGateLocked }"
          aria-label="School portal navigation"
          data-tour="school-nav-rail"
        >
          <button data-tour="school-nav-home" class="nav-item" type="button" @click="setPortalMode('home')" :class="{ active: portalMode === 'home' }">
            <div class="nav-icon">
              <img v-if="homeIconUrl" :src="homeIconUrl" alt="" class="nav-icon-img" />
              <div v-else class="nav-icon-fallback" aria-hidden="true">⌂</div>
            </div>
            <div class="nav-label">Home</div>
          </button>

          <button
            data-tour="school-nav-providers"
            class="nav-item"
            type="button"
            :disabled="!canAccessSchedulingPanels"
            :title="!canAccessSchedulingPanels ? schedulingDisabledReason : ''"
            @click="openProvidersPanel"
            :class="{ active: portalMode === 'providers', disabled: !canAccessSchedulingPanels }"
          >
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('providers', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('providers', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">PR</div>
            </div>
            <div class="nav-label">Providers</div>
          </button>

          <button
            data-tour="school-nav-days"
            class="nav-item"
            type="button"
            :disabled="!canAccessSchedulingPanels"
            :title="!canAccessSchedulingPanels ? schedulingDisabledReason : ''"
            @click="openDaysPanel"
            :class="{ active: portalMode === 'days', disabled: !canAccessSchedulingPanels }"
          >
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('days', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('days', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">DY</div>
            </div>
            <div class="nav-label">Days</div>
          </button>

          <button data-tour="school-nav-roster" class="nav-item" type="button" @click="openRosterPanel()" :class="{ active: portalMode === 'roster' }">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('roster', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('roster', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">RS</div>
            </div>
            <div class="nav-label">{{ isProvider ? 'My roster' : 'Roster' }}</div>
          </button>

          <button data-tour="school-nav-skills" class="nav-item" type="button" @click="setPortalMode('skills')" :class="{ active: portalMode === 'skills' }">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('skills_groups', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('skills_groups', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">SG</div>
            </div>
            <div class="nav-label">Skills</div>
          </button>

          <button data-tour="school-nav-staff" class="nav-item" type="button" @click="setPortalMode('school_staff')" :class="{ active: portalMode === 'school_staff' }">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('school_staff', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('school_staff', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">SS</div>
            </div>
            <div class="nav-label">Staff</div>
          </button>

          <button data-tour="school-nav-docs" class="nav-item" type="button" @click="setPortalMode('documents')" :class="{ active: portalMode === 'documents' }">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('public_documents', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('public_documents', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">DO</div>
            </div>
            <div class="nav-label">Docs/Links</div>
          </button>

          <button
            data-tour="school-nav-notifications"
            class="nav-item"
            type="button"
            @click="openNotificationsPanel"
            :class="{ active: portalMode === 'notifications' }"
          >
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('announcements', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('announcements', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">AN</div>
              <span v-if="notificationsUnreadCount > 0" class="nav-badge" :class="{ pulse: notificationsUnreadCount > 0 }" :title="`${notificationsUnreadCount} unread`">
                {{ notificationsUnreadCount }}
              </span>
            </div>
            <div class="nav-label">Notifications</div>
          </button>

          <button data-tour="school-nav-messages" class="nav-item" type="button" @click="openMessages" :class="{ active: portalMode === 'messages' }">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('messages', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('messages', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">CH</div>
              <span v-if="messagesUnreadCount > 0" class="nav-badge" :class="{ pulse: messagesUnreadCount > 0 }" :title="`${messagesUnreadCount} unread`">
                {{ messagesUnreadCount }}
              </span>
            </div>
            <div class="nav-label">Messages</div>
          </button>

          <button data-tour="school-nav-faq" class="nav-item" type="button" @click="setPortalMode('faq')" :class="{ active: portalMode === 'faq' }">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('faq', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('faq', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">FQ</div>
            </div>
            <div class="nav-label">FAQ</div>
          </button>

          <button data-tour="school-nav-help" class="nav-item" type="button" @click="showHelpDesk = true">
            <div class="nav-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('contact_admin', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('contact_admin', cardIconOrg)"
                alt=""
                class="nav-icon-img"
              />
              <div v-else class="nav-icon-fallback" aria-hidden="true">CA</div>
            </div>
            <div class="nav-label">Help</div>
          </button>
        </nav>

        <div class="main-content">
          <div v-if="waiverGateLocked" class="waiver-lock-banner">
            <strong>School Staff Waiver required.</strong>
            <span>You can only access Docs/Links until it is signed.</span>
          </div>
          <div v-if="portalMode === 'days'" class="days-daybar-center">
            <div data-tour="school-days-daybar">
              <SchoolDayBar v-model="store.selectedWeekday" :days="store.days" />
            </div>
          </div>
          <div v-if="portalMode === 'home'" class="home">
        <div class="home-snapshot" data-tour="school-home-snapshot">
          <div class="home-snapshot-title">At a glance</div>
          <div class="home-snapshot-grid">
            <button class="home-pill home-pill-clickable home-pill-notifications" type="button" @click="openNotificationsPanel">
              <div class="home-pill-k">
                <span v-if="notificationsUnreadCount > 0" class="home-pill-badge" :class="{ pulse: notificationsUnreadCount > 0 }" :title="`${notificationsUnreadCount} unread`">
                  {{ notificationsUnreadCount }}
                </span>
                <span v-else class="home-pill-k-text">Notifications</span>
              </div>
              <div class="home-pill-v home-pill-v-notifications">
                <span v-if="notificationsNewestSnippet">{{ notificationsNewestSnippet }}</span>
                <span v-else>School-wide announcements + client updates</span>
              </div>
            </button>
            <button
              class="home-pill home-pill-clickable"
              type="button"
              :disabled="!canAccessSchedulingPanels"
              :title="!canAccessSchedulingPanels ? schedulingDisabledReason : ''"
              @click="openDaysPanel"
            >
              <div class="home-pill-k">{{ atGlance.days }}</div>
              <div class="home-pill-v">Days supported</div>
            </button>
            <button class="home-pill home-pill-clickable" type="button" @click="openRosterPanel()">
              <div class="home-pill-k">{{ atGlance.clients }}</div>
              <div class="home-pill-v">Clients being seen</div>
            </button>
            <button
              class="home-pill home-pill-clickable"
              type="button"
              :disabled="!canAccessSchedulingPanels"
              :title="!canAccessSchedulingPanels ? schedulingDisabledReason : ''"
              @click="openProvidersPanel"
            >
              <div class="home-pill-k">{{ atGlance.slots }}</div>
              <div class="home-pill-v">Slots available</div>
            </button>
            <button class="home-pill home-pill-clickable" type="button" @click="openRosterPanel('pending')">
              <div class="home-pill-k">{{ atGlance.pending }}</div>
              <div class="home-pill-v">Pending clients</div>
            </button>
            <button class="home-pill home-pill-clickable" type="button" @click="openRosterPanel('waitlist')">
              <div class="home-pill-k">{{ atGlance.waitlist }}</div>
              <div class="home-pill-v">Waitlist clients</div>
            </button>
            <button class="home-pill home-pill-clickable" type="button" @click="setPortalMode('school_staff')">
              <div class="home-pill-k">{{ atGlance.staff }}</div>
              <div class="home-pill-v">School staff users</div>
            </button>
          </div>
        </div>

        <div class="dashboard-card-grid" data-tour="school-home-cards">
          <button
            data-tour="school-home-card-providers"
            class="dash-card"
            type="button"
            :disabled="!canAccessSchedulingPanels"
            :title="!canAccessSchedulingPanels ? schedulingDisabledReason : ''"
            :class="{ disabled: !canAccessSchedulingPanels }"
            @click="openProvidersPanel"
          >
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('providers', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('providers', cardIconOrg)"
                alt="Providers icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">PR</div>
            </div>
            <div class="dash-card-title">Providers</div>
            <div class="dash-card-desc">View provider cards, profiles, and messages.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button
            data-tour="school-home-card-days"
            class="dash-card"
            type="button"
            :disabled="!canAccessSchedulingPanels"
            :title="!canAccessSchedulingPanels ? schedulingDisabledReason : ''"
            :class="{ disabled: !canAccessSchedulingPanels }"
            @click="openDaysPanel"
          >
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('days', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('days', cardIconOrg)"
                alt="Days icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">DY</div>
            </div>
            <div class="dash-card-title">Days</div>
            <div class="dash-card-desc">Choose a weekday and view schedules.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-roster" class="dash-card dash-card-default-roster" type="button" @click="scrollToHomeRoster">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('roster', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('roster', cardIconOrg)"
                alt="Roster icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">RS</div>
            </div>
            <div class="dash-card-title">Roster</div>
            <div class="dash-card-desc">View and sort the client roster.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-skills" class="dash-card" type="button" @click="setPortalMode('skills')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('skills_groups', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('skills_groups', cardIconOrg)"
                alt="Skills groups icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">SG</div>
            </div>
            <div class="dash-card-title">Skills Groups</div>
            <div class="dash-card-desc">Groups, meetings, providers, and participants.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-staff" class="dash-card" type="button" @click="setPortalMode('school_staff')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('school_staff', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('school_staff', cardIconOrg)"
                alt="School staff icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">SS</div>
            </div>
            <div class="dash-card-title">School staff</div>
            <div class="dash-card-desc">Manage linked school staff accounts and requests.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
              <span v-if="Number(store.portalStats?.school_staff_count) >= 0" class="dash-card-badge">
                {{ Number(store.portalStats?.school_staff_count || 0) }}
              </span>
            </div>
          </button>

          <button data-tour="school-home-card-docs" class="dash-card" type="button" @click="setPortalMode('documents')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('public_documents', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('public_documents', cardIconOrg)"
                alt="Public documents icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">DO</div>
            </div>
            <div class="dash-card-title">Docs / Links</div>
            <div class="dash-card-desc">Shared calendars and school-wide reference docs/links.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-faq" class="dash-card" type="button" @click="setPortalMode('faq')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('faq', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('faq', cardIconOrg)"
                alt="FAQ icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">FQ</div>
            </div>
            <div class="dash-card-title">FAQ</div>
            <div class="dash-card-desc">Common questions and answers.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-notifications" class="dash-card" type="button" @click="openNotificationsPanel">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('announcements', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('announcements', cardIconOrg)"
                alt="Announcements icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">AN</div>
            </div>
            <div class="dash-card-title">Notifications</div>
            <div class="dash-card-desc">
              {{ notificationsNewestSnippet || 'School-wide updates and notifications.' }}
            </div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
              <span v-if="notificationsUnreadCount > 0" class="dash-card-badge dash-card-badge-pulse" :title="`${notificationsUnreadCount} unread`">
                {{ notificationsUnreadCount }}
              </span>
            </div>
          </button>

          <button data-tour="school-home-card-help" class="dash-card" type="button" @click="showHelpDesk = true">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('contact_admin', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('contact_admin', cardIconOrg)"
                alt="Contact admin icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">CA</div>
            </div>
            <div class="dash-card-title">Contact admin</div>
            <div class="dash-card-desc">Send a message to agency staff.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-messages" class="dash-card" type="button" @click="openMessages">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('messages', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('messages', cardIconOrg)"
                alt="Messages icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">CH</div>
            </div>
            <div class="dash-card-title">Messages</div>
            <div class="dash-card-desc">Chat with providers and school staff. New messages appear here.</div>
            <div class="dash-card-meta">
              <span v-if="messagesUnreadCount > 0" class="dash-card-badge dash-card-badge-pulse" :title="`${messagesUnreadCount} unread`">
                {{ messagesUnreadCount }}
              </span>
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-digital-intake" class="dash-card" type="button" @click="openIntakeModal('qr')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('parent_qr', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('parent_qr', cardIconOrg)"
                alt="Digital intake icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">QR</div>
            </div>
            <div class="dash-card-title">Digital forms</div>
            <div class="dash-card-desc">Replaces the paper intake packet. Share QR code or link for parents to complete forms.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Open</span>
            </div>
          </button>

          <button data-tour="school-home-card-upload" class="dash-card" type="button" @click="showUploadModal = true">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('upload_packet', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('upload_packet', cardIconOrg)"
                alt="Upload packet icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">UP</div>
            </div>
            <div class="dash-card-title">Upload packet</div>
            <div class="dash-card-desc">Upload a referral packet (no PHI exposed on portal).</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Upload</span>
            </div>
          </button>
        </div>

        <div ref="homeRosterEl" class="home-roster" data-tour="school-home-roster">
          <div class="roster-header">
            <h2 style="margin: 0;">{{ isProvider ? 'My roster' : 'School roster' }}</h2>
            <div class="muted">{{ isProvider ? 'My assigned clients (restricted fields)' : 'Assigned + unassigned (restricted fields)' }}</div>
          </div>
          <ClientListGrid
            v-if="organizationId"
            :organization-slug="organizationSlug"
            :organization-id="organizationId"
            :organization-name="organizationDisplayName || organizationName"
            :roster-scope="isProvider ? 'provider' : 'school'"
            :client-label-mode="clientLabelMode"
            :waitlist-school-count="waitlistSchoolCount"
            edit-mode="inline"
            :show-search="true"
            search-placeholder="Search roster…"
            @edit-client="openAdminClientEditor"
            @open-availability-request="openAvailabilityRequest"
          />
          <div v-else class="empty-state">Organization not loaded.</div>
        </div>
          </div>

          <div v-else-if="portalMode === 'days'">
        <div data-tour="school-days-panel">
          <div v-if="!store.selectedWeekday" class="empty-state center">
            Select a weekday to view schedules.
          </div>
          <DayPanel
            v-else-if="organizationId"
            :weekday="store.selectedWeekday"
            :providers="store.dayProviders"
            :eligible-providers="store.eligibleProvidersForSelectedDay"
            :loading-providers="store.dayProvidersLoading"
            :providers-error="store.dayProvidersError"
            :panel-for="panelFor"
            :client-label-mode="clientLabelMode"
            :current-user-id="authStore.user?.id || null"
            :current-user-role="authStore.user?.role || ''"
            @add-day="handleAddDay"
            @add-provider="handleAddProvider"
            @open-client="openClient"
            @save-slots="handleSaveSlots"
            @move-slot="handleMoveSlot"
            @open-provider="goToProviderSchoolProfile"
            @request-availability="openAvailabilityRequest"
          />
          <div v-else class="empty-state">Organization not loaded.</div>
        </div>
          </div>

          <div v-else-if="portalMode === 'providers'">
        <div data-tour="school-providers-panel">
          <ProvidersDirectoryPanel
            v-if="organizationId"
            :providers="store.eligibleProviders"
            :loading="store.eligibleProvidersLoading"
            @open-provider="goToProviderSchoolProfile"
            @message-provider="messageProvider"
          />
        </div>
          </div>

      <SkillsGroupsPanel
        v-else-if="portalMode === 'skills' && organizationId"
        :organization-id="organizationId"
        :client-label-mode="clientLabelMode"
        :focus-unassigned="skillsUnassignedOnly"
      />

          <div v-else-if="portalMode === 'school_staff'">
        <div data-tour="school-staff-panel">
          <div v-if="!organizationId" class="empty-state">Organization not loaded.</div>
          <SchoolStaffPanel
            v-else
            :school-organization-id="organizationId"
            :school-name="organizationName"
          />
        </div>
          </div>

          <div v-else-if="portalMode === 'documents'">
        <div data-tour="school-docs-panel">
          <div v-if="!organizationId" class="empty-state">Organization not loaded.</div>
          <div v-else>
            <SchoolMyDocumentsPanel v-if="isSchoolStaff" :organization-id="organizationId" />
            <PublicDocumentsPanel :school-organization-id="organizationId" />
          </div>
        </div>
          </div>

          <div v-else-if="portalMode === 'faq'">
        <div data-tour="school-faq-panel">
          <div v-if="!organizationId" class="empty-state">Organization not loaded.</div>
          <FaqPanel v-else :school-organization-id="organizationId" />
        </div>
          </div>

          <div v-else-if="portalMode === 'roster'" class="roster">
        <div class="roster-header" data-tour="school-roster-header">
          <h2 style="margin: 0;">{{ isProvider ? 'My roster' : 'School roster' }}</h2>
          <div class="muted">{{ isProvider ? 'My assigned clients (restricted fields)' : 'Assigned + unassigned (restricted fields)' }}</div>
        </div>
        <div data-tour="school-roster-panel">
          <ClientListGrid
            v-if="organizationId"
            :organization-slug="organizationSlug"
            :organization-id="organizationId"
            :organization-name="organizationDisplayName || organizationName"
            :roster-scope="isProvider ? 'provider' : 'school'"
            :client-label-mode="clientLabelMode"
            :waitlist-school-count="waitlistSchoolCount"
            edit-mode="inline"
            v-model:statusFilterKey="rosterStatusFilterKey"
            @edit-client="openAdminClientEditor"
            @open-availability-request="openAvailabilityRequest"
          />
          <div v-else class="empty-state">Organization not loaded.</div>
        </div>
          </div>

          <div v-else-if="portalMode === 'messages'">
            <SchoolPortalMessagesPanel
              v-if="organizationId"
              :school-organization-id="organizationId"
              :providers="store.eligibleProviders"
              :providers-loading="store.eligibleProvidersLoading"
              @unread-update="messagesUnreadCount = $event"
            />
            <div v-else class="empty-state">Organization not loaded.</div>
          </div>

          <div v-else-if="portalMode === 'notifications'">
            <SchoolNotificationsPanel
              v-if="organizationId"
              :school-organization-id="organizationId"
              :client-label-mode="clientLabelMode"
              :initial-filter="notificationsFilter"
              :initial-create-open="notificationsCreateOpen"
              @close="portalMode = 'home'"
              @updated="onNotificationsUpdated"
              @open-ticket="openTicketFromNotification"
              @open-client="openClientFromNotification"
            />
            <div v-else class="empty-state">Organization not loaded.</div>
          </div>

          <div v-else class="empty-state">Organization not loaded.</div>
        </div>
      </div>
    </div>

    <ClientModal
      v-if="selectedClient && organizationId"
      :client="selectedClient"
      :school-organization-id="organizationId"
      :can-edit-action="canEditClientActions"
      :show-checklist-action="isProvider && !!selectedClient?.user_is_assigned_provider"
      @open-edit="openClientEditorFromModal"
      @open-checklist="openChecklistFromModal"
      @close="selectedClient = null"
    />

    <ClientDetailPanel
      v-if="adminSelectedClient"
      :client="adminSelectedClient"
      :initial-tab="adminClientActiveTab"
      :current-client-index="adminClientCurrentIndex"
      :navigation-count="adminClientNavigationIds.length"
      @navigate="navigateAdminClient"
      @tab-change="handleAdminClientTabChange"
      @close="closeAdminClientEditor"
      @updated="handleAdminClientUpdated"
    />

    <QuickChecklistModal
      v-if="quickChecklistClient"
      :client="quickChecklistClient"
      @close="quickChecklistClient = null"
      @saved="quickChecklistClient = null"
    />

    <SchoolHelpDeskModal
      v-if="showHelpDesk && organizationId"
      :schoolOrganizationId="organizationId"
      @close="showHelpDesk = false"
    />

    <div v-if="showAnnouncementModal" class="modal-overlay" @click.self="closeAnnouncementModal">
      <div class="modal school-announcement-modal" @click.stop>
        <div class="modal-header">
          <strong>Create announcement</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeAnnouncementModal" :disabled="announcementCreating">
            Close
          </button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom: 12px;">
            Post a scrolling school-wide banner without leaving this page.
          </div>
          <div class="announcement-form-grid">
            <label class="announcement-field">
              <span class="announcement-field-label">Title (optional)</span>
              <input
                v-model="announcementDraftTitle"
                class="school-selector"
                type="text"
                maxlength="255"
                placeholder="e.g., School closed Monday"
              />
            </label>
            <label class="announcement-field">
              <span class="announcement-field-label">Starts</span>
              <input v-model="announcementDraftStartsAt" class="school-selector" type="datetime-local" />
            </label>
            <label class="announcement-field">
              <span class="announcement-field-label">Ends (max 2 weeks)</span>
              <input v-model="announcementDraftEndsAt" class="school-selector" type="datetime-local" />
            </label>
            <label class="announcement-field announcement-field-wide">
              <span class="announcement-field-label">Message</span>
              <textarea
                v-model="announcementDraftMessage"
                class="announcement-textarea"
                rows="4"
                maxlength="1200"
                placeholder="Type announcement..."
              />
            </label>
          </div>
          <div v-if="announcementCreateError" class="error" style="margin-top: 12px;">{{ announcementCreateError }}</div>
          <div v-if="announcementCreateSuccess" class="muted" style="margin-top: 12px; color: #065f46;">{{ announcementCreateSuccess }}</div>
          <div class="actions" style="margin-top: 16px;">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="announcementCreating || !canSubmitAnnouncement"
              @click="submitAnnouncementModal"
            >
              {{ announcementCreating ? 'Posting…' : 'Post announcement' }}
            </button>
            <button class="btn btn-secondary btn-sm" type="button" @click="closeAnnouncementModal" :disabled="announcementCreating">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="currentSplashAnnouncement"
      class="blocking-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Announcement splash"
    >
      <div class="blocking-splash-card">
        <div class="blocking-splash-head">
          <img v-if="schoolLogoUrl" :src="schoolLogoUrl" alt="" class="blocking-splash-logo-img" />
          <div class="blocking-splash-brand">{{ schoolName || 'School Portal' }}</div>
        </div>
        <h3 class="blocking-splash-title">
          {{ splashTitleText }}
        </h3>
        <p class="blocking-splash-message">
          {{ currentSplashAnnouncement.message || '' }}
        </p>
        <div class="blocking-splash-meta" v-if="currentSplashAnnouncement.ends_at">
          Visible until {{ formatSplashEndsAt(currentSplashAnnouncement.ends_at) }}
        </div>
        <div class="blocking-splash-actions">
          <button type="button" class="btn btn-primary" @click="dismissCurrentSplash">
            Dismiss
          </button>
        </div>
      </div>
    </div>

    <ReviewPromptModal
      v-if="showReviewPrompt && reviewPromptConfig && !currentSplashAnnouncement"
      :config="reviewPromptConfig"
      @close="showReviewPrompt = false"
      @completed="onReviewPromptCompleted"
      @snooze="onReviewPromptSnooze"
      @dismiss="onReviewPromptDismiss"
    />

    <ClientTicketThreadModal
      v-if="showTicketModal && ticketModalClient && organizationId"
      :client="ticketModalClient"
      :school-organization-id="organizationId"
      :client-label-mode="clientLabelMode"
      :ticket-id="ticketModalTicketId"
      :initial-message-id="ticketModalMessageId"
      @close="closeTicketModal"
    />

    <ComplianceCornerModal
      v-if="showComplianceCorner && organizationId"
      :school-organization-id="organizationId"
      @close="showComplianceCorner = false"
    />

    <button
      v-if="canUseComplianceCorner"
      class="compliance-corner-btn"
      type="button"
      title="Compliance Corner"
      @click="showComplianceCorner = true"
    >
      CC
    </button>

    <ReferralUpload
      v-if="showUploadModal"
      :organization-slug="organizationSlug"
      @close="showUploadModal = false"
      @uploaded="handleUploadSuccess"
    />

    <div v-if="showWeeklyAvailabilityPrompt" class="modal-overlay" @click.self="dismissWeeklyAvailabilityPrompt">
      <div class="modal weekly-availability-modal" @click.stop>
        <div class="modal-header weekly-availability-header">
          <strong>Weekly availability check-in</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="dismissWeeklyAvailabilityPrompt">Close</button>
        </div>
        <div class="modal-body">
          <div class="weekly-availability-lead">
            Please confirm your school client availability this week.
          </div>
          <div class="weekly-availability-summary">
            You are assigned: <strong>{{ availabilityAssignedClientsTotal }}</strong> client{{ availabilityAssignedClientsTotal === 1 ? '' : 's' }}.
          </div>
          <div v-if="availabilityContextLoading" class="muted" style="margin-bottom: 8px;">Loading your availability…</div>
          <div v-if="availabilityContextError" class="error" style="margin-bottom: 8px;">{{ availabilityContextError }}</div>
          <ul v-else class="availability-weekly-list">
            <li v-for="d in availabilityDayOptions" :key="`weekly-${d.day_of_week}`">
              <strong>{{ d.day_of_week }}:</strong>
              {{ d.clients_assigned }} client{{ d.clients_assigned === 1 ? '' : 's' }} assigned,
              {{ d.slots_available }} slot{{ Number(d.slots_available) === 1 ? '' : 's' }} available,
              hours {{ formatSchoolPortalTimeRange(d.start_time, d.end_time) }}
            </li>
          </ul>
          <div class="muted" style="margin-top: 10px;">
            Please update your clients if needed. You may also update your availability.
          </div>
          <div v-if="availabilityConfirmSuccess" class="success" style="margin-top: 10px;">{{ availabilityConfirmSuccess }}</div>
          <div v-if="availabilityConfirmError" class="error" style="margin-top: 10px;">{{ availabilityConfirmError }}</div>
          <div class="weekly-availability-actions">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="availabilityConfirming || !isProviderRoleForAvailability"
              @click="confirmWeeklyAvailability"
            >
              {{ availabilityConfirming ? 'Confirming…' : 'Confirm current availability' }}
            </button>
            <button class="btn btn-primary" type="button" @click="openAvailabilityRequest({ source: 'weekly_prompt' })">
              Update my availability
            </button>
            <a class="btn btn-secondary btn-sm" :href="additionalAvailabilityHref">
              Submit for additional availability
            </a>
            <button class="btn btn-secondary btn-sm" type="button" @click="dismissWeeklyAvailabilityPrompt">Dismiss for now</button>
          </div>
          <div v-if="!isProviderRoleForAvailability" class="muted" style="margin-top: 8px;">
            Confirm action is provider-only.
          </div>
        </div>
      </div>
    </div>

    <div v-if="showAvailabilityRequest" class="modal-overlay" @click.self="closeAvailabilityRequest">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>Update my availability</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeAvailabilityRequest">Close</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom: 10px;">
            This sends a request to admin/staff for review and application.
            Requests show in Provider Availability under School Requests.
          </div>
          <div v-if="availabilityContextLoading" class="muted" style="margin-bottom: 8px;">Loading your availability…</div>
          <div v-if="availabilityContextError" class="error" style="margin-bottom: 10px;">
            {{ availabilityContextError }}
          </div>

          <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label>Day</label>
              <select v-model="availabilitySelectedDay">
                <option v-for="d in availabilityDayOptions" :key="`avail-day-${d.day_of_week}`" :value="d.day_of_week">
                  {{ d.day_of_week }} — {{ d.clients_assigned }} assigned / {{ d.slots_total }} slots
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Current slots</label>
              <div class="muted">
                {{ availabilityCurrentSlotsText }}
              </div>
            </div>
            <div class="form-group">
              <label>Change slots by (can be negative)</label>
              <input v-model.number="availabilityDeltaSlots" type="number" />
              <div class="muted" style="font-size: 12px; margin-top: 4px;">
                Requested total: <strong>{{ availabilityRequestedSlotsTotal }}</strong>
              </div>
              <div v-if="availabilityOverAssignedWarning" class="error" style="margin-top: 6px;">
                {{ availabilityOverAssignedWarning }}
              </div>
            </div>
            <div class="form-group">
              <label>Current hours</label>
              <div class="muted">
                {{ availabilityCurrentHoursText }}
              </div>
            </div>
            <div class="form-group">
              <label>Requested hours</label>
              <div style="display:flex; gap: 8px; align-items: center;">
                <input v-model="availabilityNewStart" type="time" style="width: 140px;" />
                <span class="muted">to</span>
                <input v-model="availabilityNewEnd" type="time" style="width: 140px;" />
              </div>
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>Note (optional)</label>
              <input v-model="availabilityNote" type="text" placeholder="e.g., 40min sessions; can see 10/day on Tuesdays" />
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>Change preview (from -> to)</label>
              <div class="muted">
                Slots: <strong>{{ availabilityFromToSummary.slots }}</strong>
              </div>
              <div class="muted">
                Hours: <strong>{{ availabilityFromToSummary.hours }}</strong>
              </div>
            </div>
          </div>

          <div style="display:flex; gap: 10px; align-items:center; margin-top: 12px;">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="availabilitySubmitting || !availabilitySelectedDay"
              @click="submitAvailabilityRequest"
            >
              {{ availabilitySubmitting ? 'Sending…' : 'Send request' }}
            </button>
            <a class="btn btn-secondary btn-sm" :href="additionalAvailabilityHref">
              Submit for additional availability
            </a>
            <div v-if="availabilityError" class="error" style="margin:0;">{{ availabilityError }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="comingSoonKey" class="modal-overlay" @click.self="comingSoonKey = ''">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>{{ comingSoonTitle }}</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="comingSoonKey = ''">Close</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom: 10px;">
            Coming soon.
          </div>
          <div class="muted">
            This feature isn’t available yet, but it’s planned for the School Portal. For now, please use your existing intake / packet workflows.
          </div>
        </div>
      </div>
    </div>

    <div v-if="showIntakeModal" class="modal-overlay" @click.self="closeIntakeModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>Digital forms</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeIntakeModal">Close</button>
        </div>
        <div class="modal-body">
          <div v-if="intakeLinkLoading" class="muted">Loading form…</div>
          <div v-else-if="intakeLinkError" class="error">{{ intakeLinkError }}</div>
          <div v-else-if="!intakePacketLinks.length" class="muted">No intake packet forms configured for this school yet.</div>
          <div v-else class="intake-link-body">
            <div v-for="link in intakePacketLinks" :key="link.id" class="intake-link-block">
              <div class="intake-link-meta">
                <span class="badge badge-outline">{{ getIntakeLanguageLabel(link.language_code) }}</span>
              </div>
              <div class="intake-link-row">
                <input class="intake-link-input" :value="getIntakeLinkUrl(link)" readonly />
                <button class="btn btn-secondary btn-sm" type="button" @click="copyIntakeLink(link)">Copy</button>
                <button class="btn btn-primary btn-sm" type="button" @click="openIntakeApproval(link)">Approve & Launch</button>
              </div>
              <div v-if="intakeModalMode === 'qr'" class="intake-qr">
                <img v-if="intakeQrByKey[link.public_key]" :src="intakeQrByKey[link.public_key]" alt="Intake QR code" />
                <div v-else class="muted">Generating QR…</div>
              </div>
              <div v-else class="muted">
                Share the link above or open it with the parent to complete the intake packet.
              </div>
            </div>
          </div>
          <div class="intake-modal-footer">
            <button class="btn btn-secondary btn-sm" type="button" @click="goToDocsPanel">
              View all docs &amp; links
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showSchoolSettings" class="settings-drawer-overlay" @click.self="showSchoolSettings = false">
      <div class="settings-drawer" @click.stop>
        <div class="settings-drawer-header">
          <strong>Organization settings</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="showSchoolSettings = false">Close</button>
        </div>
        <div class="settings-drawer-body">
          <OrganizationSettingsModal v-if="organizationId" :organization-id="organizationId" />
        </div>
      </div>
    </div>

    <div v-if="showIntakeApprovalModal" class="modal-overlay" @click.self="closeIntakeApproval">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>Confirm staff approval</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeIntakeApproval">Close</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom: 10px;">
            Approve &amp; Launch is for staff-assisted sessions where the parent/guardian completes the intake with you.
          </div>
          <div class="muted" style="margin-bottom: 10px;">
            We collect your last name to document who authorized the session and the client’s first name to note who the intake is for.
            This is recorded on a verification page in the final packet for auditing.
          </div>
          <div class="muted" style="margin-bottom: 10px;">
            Staff: {{ staffDisplayName }}
          </div>
          <div class="form-group">
            <label>Staff last name</label>
            <input v-model="intakeApprovalStaffLastName" type="text" placeholder="Enter your last name" />
          </div>
          <div class="form-group">
            <label>Client first name</label>
            <input v-model="intakeApprovalClientFirstName" type="text" placeholder="Enter client first name" />
          </div>
          <label class="checkbox" style="margin-bottom: 12px;">
            <input v-model="intakeApprovalChecked" type="checkbox" />
            I confirm I am approving this intake.
          </label>
          <div v-if="intakeApprovalError" class="error" style="margin-bottom: 10px;">
            {{ intakeApprovalError }}
          </div>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="closeIntakeApproval">Cancel</button>
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="!intakeApprovalChecked || intakeApprovalSubmitting"
              @click="approveAndLaunchIntake"
            >
              {{ intakeApprovalSubmitting ? 'Approving…' : 'Approve & Launch' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showAdminToolsModal" class="modal-overlay" @click.self="closeAdminToolsModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>Admin Tools</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeAdminToolsModal">Close</button>
        </div>
        <div class="modal-body">
          <p class="muted">
            Restore missing intake artifacts for this school portal. This rebuilds missing
            <strong>Intake Responses</strong> and <strong>Clinical Summary</strong> text documents
            from saved submission data.
          </p>
          <div v-if="adminToolsError" class="error">{{ adminToolsError }}</div>
          <div v-if="adminToolsResult" class="muted" style="margin-bottom: 10px;">
            Scanned {{ adminToolsResult.counters?.scannedSubmissions || 0 }} submissions ·
            Created {{ adminToolsResult.counters?.createdIntakeResponses || 0 }} intake response docs ·
            Created {{ adminToolsResult.counters?.createdClinicalSummaries || 0 }} clinical summaries
          </div>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="closeAdminToolsModal">
              Cancel
            </button>
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="adminToolsRunning || !organizationId"
              @click="runRestoreIntakeArtifacts"
            >
              {{ adminToolsRunning ? 'Restoring…' : 'Restore Intake Artifacts' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Providers are now shown in-page via ProvidersDirectoryPanel -->
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import { useTutorialStore } from '../../store/tutorial';
import ClientListGrid from '../../components/school/ClientListGrid.vue';
import SchoolHelpDeskModal from '../../components/school/SchoolHelpDeskModal.vue';
import ReviewPromptModal from '../../components/school/ReviewPromptModal.vue';
import ClientTicketThreadModal from '../../components/school/ClientTicketThreadModal.vue';
import ReferralUpload from '../../components/school/ReferralUpload.vue';
import SchoolDayBar from '../../components/school/redesign/SchoolDayBar.vue';
import DayPanel from '../../components/school/redesign/DayPanel.vue';
import ClientModal from '../../components/school/redesign/ClientModal.vue';
import SkillsGroupsPanel from '../../components/school/redesign/SkillsGroupsPanel.vue';
import ProvidersDirectoryPanel from '../../components/school/redesign/ProvidersDirectoryPanel.vue';
import SchoolStaffPanel from '../../components/school/redesign/SchoolStaffPanel.vue';
import SchoolPortalMessagesPanel from '../../components/school/redesign/SchoolPortalMessagesPanel.vue';
import PublicDocumentsPanel from '../../components/school/redesign/PublicDocumentsPanel.vue';
import SchoolMyDocumentsPanel from '../../components/school/redesign/SchoolMyDocumentsPanel.vue';
import SchoolNotificationsPanel from '../../components/school/redesign/SchoolNotificationsPanel.vue';
import ComplianceCornerModal from '../../components/school/redesign/ComplianceCornerModal.vue';
import FaqPanel from '../../components/school/redesign/FaqPanel.vue';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';
import OrganizationSettingsModal from '../../components/school/OrganizationSettingsModal.vue';
import QuickChecklistModal from '../../components/school/QuickChecklistModal.vue';
import { useSchoolPortalRedesignStore } from '../../store/schoolPortalRedesign';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { isSupervisor } from '../../utils/helpers';
import { setDarkMode, getStoredDarkMode } from '../../utils/darkMode';
import { getSchoolStaffWaiverStatus as getSchoolStaffWaiverStatusForGate } from '../../utils/schoolStaffWaiverGate';
import QRCode from 'qrcode';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const store = useSchoolPortalRedesignStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const tutorialStore = useTutorialStore();

const showHelpDesk = ref(false);
const showReviewPrompt = ref(false);
const showTicketModal = ref(false);
const ticketModalClient = ref(null);
const ticketModalTicketId = ref(null);
const ticketModalMessageId = ref(null);
const showComplianceCorner = ref(false);
const showUploadModal = ref(false);
const comingSoonKey = ref(''); // 'parent_qr' | 'parent_sign' | 'packet_upload'
const showSchoolSettings = ref(false);
const affiliatedAgencyId = ref(null);
const showIntakeModal = ref(false);
const intakeModalMode = ref('qr'); // 'qr' | 'sign'
const intakeLinkLoading = ref(false);
const intakeLinkError = ref('');
const intakeLink = ref(null);
const intakeLinks = ref([]);
const intakeQrDataUrl = ref('');
const intakeQrByKey = ref({});
const selectedIntakeLink = ref(null);
const showIntakeApprovalModal = ref(false);
const intakeApprovalChecked = ref(false);
const intakeApprovalSubmitting = ref(false);
const intakeApprovalError = ref('');
const intakeApprovalStaffLastName = ref('');
const intakeApprovalClientFirstName = ref('');
const showAdminToolsModal = ref(false);
const adminToolsRunning = ref(false);
const adminToolsError = ref('');
const adminToolsResult = ref(null);
const supervisorSuperviseeIds = ref([]);
const schedulingEligibilityResolved = ref(false);

// Provider availability modal (apply directly or send admin request)
const showAvailabilityRequest = ref(false);
const availabilityRequest = ref(null); // payload from ProviderPanel
const availabilityDayOptions = ref([]); // [{ day_of_week, slots_total, slots_available, start_time, end_time, clients_assigned }]
const availabilitySelectedDay = ref('');
const availabilityAssignedClientsTotal = ref(0);
const availabilityProviderName = ref('');
const availabilityContextLoading = ref(false);
const availabilityContextError = ref('');
const availabilityDeltaSlots = ref(0);
const availabilityNewStart = ref('');
const availabilityNewEnd = ref('');
const availabilityNote = ref('');
const availabilitySubmitting = ref(false);
const availabilityError = ref('');
const showWeeklyAvailabilityPrompt = ref(false);
const availabilityConfirming = ref(false);
const availabilityConfirmSuccess = ref('');
const availabilityConfirmError = ref('');

const openComingSoon = (key) => {
  comingSoonKey.value = String(key || '');
};

const handleUploadSuccess = () => {
  // Keep the modal open so OCR + initials can be completed.
};

const intakeLinkUrl = computed(() => {
  const key = intakeLink.value?.public_key || '';
  if (!key) return '';
  return buildPublicIntakeUrl(key);
});

const intakePacketLinks = computed(() =>
  (intakeLinks.value || []).filter((l) => {
    const ft = String(l?.form_type || '').trim().toLowerCase();
    return ft !== 'smart_school_roi';
  })
);

const getIntakeLinkUrl = (link) => {
  const key = link?.public_key || '';
  if (!key) return '';
  return buildPublicIntakeUrl(key);
};

const getIntakeLanguageLabel = (code) => {
  const lang = String(code || '').toLowerCase();
  if (lang === 'es' || lang.startsWith('es')) return 'Spanish';
  if (lang === 'en' || lang.startsWith('en')) return 'English';
  return lang ? lang.toUpperCase() : 'English';
};

const staffDisplayName = computed(() => {
  const user = authStore.user || {};
  const first = user.first_name || user.firstName || '';
  const last = user.last_name || user.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || user.email || 'Staff member';
});

const loadIntakeLink = async () => {
  if (!organizationId.value) return;
  try {
    intakeLinkLoading.value = true;
    intakeLinkError.value = '';
    const resp = await api.get(`/public-intake/school/${organizationId.value}`);
    const links = Array.isArray(resp.data?.links) && resp.data.links.length
      ? resp.data.links
      : (resp.data?.link ? [resp.data.link] : []);
    intakeLinks.value = links;
    intakeLink.value = links[0] || null;
    intakeQrByKey.value = {};
    if (links.length) {
      for (const link of links) {
        const url = getIntakeLinkUrl(link);
        if (!url) continue;
        intakeQrByKey.value[link.public_key] = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      }
      intakeQrDataUrl.value = links[0] ? intakeQrByKey.value[links[0].public_key] || '' : '';
    } else {
      intakeQrDataUrl.value = '';
    }
  } catch (e) {
    intakeLink.value = null;
    intakeLinks.value = [];
    intakeQrByKey.value = {};
    intakeQrDataUrl.value = '';
    intakeLinkError.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    intakeLinkLoading.value = false;
  }
};

const openIntakeModal = async (mode) => {
  intakeModalMode.value = mode === 'sign' ? 'sign' : 'qr';
  showIntakeModal.value = true;
  await loadIntakeLink();
};

const closeIntakeModal = () => {
  showIntakeModal.value = false;
};

const goToDocsPanel = () => {
  showIntakeModal.value = false;
  setPortalMode('documents');
};

const openIntakeApproval = (link) => {
  selectedIntakeLink.value = link || null;
  intakeApprovalChecked.value = false;
  intakeApprovalError.value = '';
  intakeApprovalStaffLastName.value = '';
  intakeApprovalClientFirstName.value = '';
  showIntakeApprovalModal.value = true;
};

const closeIntakeApproval = () => {
  showIntakeApprovalModal.value = false;
};

const approveAndLaunchIntake = async () => {
  const activeLink = selectedIntakeLink.value || intakeLink.value;
  if (!activeLink?.public_key) return;
  const activeUrl = getIntakeLinkUrl(activeLink);
  if (!activeUrl) return;
  try {
    intakeApprovalSubmitting.value = true;
    intakeApprovalError.value = '';
    if (!intakeApprovalStaffLastName.value.trim() || !intakeApprovalClientFirstName.value.trim()) {
      intakeApprovalError.value = 'Staff last name and client first name are required.';
      return;
    }
    await api.post(`/public-intake/${activeLink.public_key}/approve`, {
      organizationId: organizationId.value,
      mode: 'staff_assisted',
      staffLastName: intakeApprovalStaffLastName.value.trim(),
      clientFirstName: intakeApprovalClientFirstName.value.trim()
    });
    closeIntakeApproval();
    const launchUrl = new URL(activeUrl);
    launchUrl.searchParams.set('mode', 'staff_assisted');
    launchUrl.searchParams.set('staff_last_name', intakeApprovalStaffLastName.value.trim());
    launchUrl.searchParams.set('client_first_name', intakeApprovalClientFirstName.value.trim());
    launchUrl.searchParams.set('approved_at', new Date().toISOString());
    window.open(launchUrl.toString(), '_blank', 'noopener');
  } catch (e) {
    intakeApprovalError.value = e.response?.data?.error?.message || 'Failed to approve intake link';
  } finally {
    intakeApprovalSubmitting.value = false;
  }
};

const copyIntakeLink = async (link) => {
  const url = getIntakeLinkUrl(link || intakeLink.value);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // ignore
  }
};

const comingSoonTitle = computed(() => {
  const k = String(comingSoonKey.value || '');
  if (k === 'parent_qr') return 'Parent QR code (Coming soon)';
  if (k === 'parent_sign') return 'Parent fill + sign (Coming soon)';
  if (k === 'packet_upload') return 'Upload packet (Coming soon)';
  return 'Coming soon';
});
const selectedClient = ref(null);
const portalMode = ref('home'); // home | providers | days | roster | skills | school_staff | documents | faq | messages
const rosterStatusFilterKey = ref(''); // client_status_key filter for roster panel (pending/waitlist)
const adminSelectedClient = ref(null);
const adminClientLoading = ref(false);
const adminClientNavigationIds = ref([]);
const adminClientActiveTab = ref('');
const quickChecklistClient = ref(null);
const canEditClientActions = ref(false);
const cardIconOrg = ref(null); // affiliated agency record (for School Portal card icon overrides)
const showAnnouncementModal = ref(false);
const announcementDraftTitle = ref('');
const announcementDraftMessage = ref('');
const announcementDraftStartsAt = ref('');
const announcementDraftEndsAt = ref('');
const announcementCreating = ref(false);
const announcementCreateError = ref('');
const announcementCreateSuccess = ref('');

const requestedPortalMode = computed(() => String(route.query?.sp || '').trim().toLowerCase());
const notificationsFilter = computed(() => String(route.query?.notif || '').trim().toLowerCase());
const notificationsCreateOpen = computed(() => ['1', 'true', 'yes'].includes(String(route.query?.announcementCreate || '').trim().toLowerCase()));
const skillsUnassignedOnly = computed(() => {
  const raw = route.query?.skillsUnassigned ?? route.query?.skills_unassigned ?? '';
  return ['1', 'true', 'yes'].includes(String(raw || '').trim().toLowerCase());
});
const requestedClientId = computed(() => {
  const raw = route.query?.clientId ?? route.query?.client_id ?? '';
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const forceWaiverDocumentsMode = async () => {
  portalMode.value = 'documents';
  try {
    await router.replace({ query: { ...route.query, sp: 'documents' } });
  } catch {
    // ignore navigation failures
  }
};

const refreshWaiverGateStatus = async ({ force = false } = {}) => {
  if (!isSchoolStaff.value) {
    waiverGateStatus.value = null;
    return;
  }
  try {
    const status = await getSchoolStaffWaiverStatusForGate({
      api,
      authUser: authStore.user,
      organizationSlug: organizationSlug.value,
      forceRefresh: force
    });
    waiverGateStatus.value = status || null;
  } catch {
    waiverGateStatus.value = null;
  }
  if (waiverGateLocked.value && portalMode.value !== 'documents') {
    await forceWaiverDocumentsMode();
  }
};

const setPortalMode = async (mode) => {
  const next = String(mode || '').trim().toLowerCase();
  if (!next) return;
  if (waiverGateLocked.value && next !== 'documents') {
    await forceWaiverDocumentsMode();
    return;
  }
  portalMode.value = next;
};

const applyRequestedPortalMode = async (mode) => {
  const m = String(mode || '').trim().toLowerCase();
  if (!m) return;
  if (waiverGateLocked.value && m !== 'documents') {
    await forceWaiverDocumentsMode();
    return;
  }
  if (m === portalMode.value) return;

  if (m === 'providers') {
    await openProvidersPanel();
    return;
  }
  if (m === 'days') {
    await openDaysPanel();
    return;
  }
  if (m === 'notifications') {
    await openNotificationsPanel();
    return;
  }
  if (m === 'messages') {
    await openMessages();
    return;
  }
  if (m === 'home') {
    await setPortalMode('home');
    return;
  }
  // fall back to direct set for other known modes
  if (['roster', 'skills', 'school_staff', 'messages', 'documents'].includes(m)) {
    await setPortalMode(m);
  }
};

const openRosterPanel = (statusKey = '') => {
  if (waiverGateLocked.value) {
    forceWaiverDocumentsMode();
    return;
  }
  rosterStatusFilterKey.value = String(statusKey || '').trim().toLowerCase();
  portalMode.value = 'roster';
};

const atGlance = computed(() => {
  if (store.portalStatsLoading) return { days: '—', clients: '—', slots: '—', pending: '—', waitlist: '—', staff: '—' };
  const s = store.portalStats || {};
  const days = Number.isFinite(Number(s.assigned_weekdays_count)) ? String(Number(s.assigned_weekdays_count)) : '0';
  const clients = Number.isFinite(Number(s.clients_assigned)) ? String(Number(s.clients_assigned)) : '0';
  const slots = Number.isFinite(Number(s.slots_available)) ? String(Number(s.slots_available)) : '0';
  const pending = Number.isFinite(Number(s.clients_pending)) ? String(Number(s.clients_pending)) : '0';
  const waitlist = Number.isFinite(Number(s.clients_waitlist)) ? String(Number(s.clients_waitlist)) : '0';
  const staff = Number.isFinite(Number(s.school_staff_count)) ? String(Number(s.school_staff_count)) : '0';
  return { days, clients, slots, pending, waitlist, staff };
});
const waitlistSchoolCount = computed(() => {
  const n = Number(store.portalStats?.clients_waitlist ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
});

const isDarkMode = ref(document.documentElement.getAttribute('data-theme') === 'dark');
const darkModeObserver = typeof document !== 'undefined' ? new MutationObserver(() => {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark';
}) : null;
function onDarkModeToggle(e) {
  const enabled = !!e.target?.checked;
  const uid = authStore.user?.id;
  if (uid) setDarkMode(uid, enabled);
  isDarkMode.value = enabled;
}

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSuperAdmin = computed(() => roleNorm.value === 'super_admin');
const hasSupervisorCapability = computed(() => isSupervisor(authStore.user));
const isProvider = computed(() => roleNorm.value === 'provider' && !hasSupervisorCapability.value);
const isSupervisorProviderContext = computed(() => hasSupervisorCapability.value && roleNorm.value === 'provider');
const isSchoolStaff = computed(() => roleNorm.value === 'school_staff');
const waiverGateStatus = ref(null);
const waiverGateLocked = computed(() => (
  isSchoolStaff.value
  && Boolean(waiverGateStatus.value?.required)
  && !Boolean(waiverGateStatus.value?.isSigned)
));

// Schools available to school staff (for multi-school selector)
const schoolStaffSchools = computed(() => {
  if (!isSchoolStaff.value) return [];
  const fromStore = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  const agencies = Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : [];
  const isPortalOrg = (a) => {
    const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
    return t === 'school' || t === 'program' || t === 'learning';
  };
  const pickSlug = (a) => String(a?.portal_url || a?.portalUrl || a?.slug || '').trim() || null;
  const pickName = (a) => String(a?.name || a?.official_name || pickSlug(a) || 'School').trim() || 'School';
  return agencies
    .filter(isPortalOrg)
    .map((a) => ({ slug: pickSlug(a), name: pickName(a) }))
    .filter((s) => s.slug);
});
const showSchoolSelector = computed(() => isSchoolStaff.value && schoolStaffSchools.value.length > 1);
const selectedSchoolSlug = ref('');
const onSchoolSelect = () => {
  const slug = selectedSchoolSlug.value;
  if (!slug || slug === organizationSlug.value) return;
  router.push(`/${slug}/dashboard`);
};
const canBackToSchools = computed(() => ['super_admin', 'admin', 'staff'].includes(roleNorm.value));
const backToSchoolsPath = computed(() => {
  const orgType = String(organizationStore.organizationContext?.organizationType || organizationStore.currentOrganization?.organization_type || 'school').toLowerCase();
  const orgTypeParam = ['school', 'program', 'learning'].includes(orgType) ? orgType : 'school';
  const parentAgency = cardIconOrg.value;
  const parentSlug = parentAgency?.portal_url || parentAgency?.portalUrl || parentAgency?.slug;
  if (typeof parentSlug === 'string' && parentSlug.trim()) {
    return `/${parentSlug.trim()}/admin/schools/overview?orgType=${orgTypeParam}`;
  }
  return `/admin/schools/overview?orgType=${orgTypeParam}`;
});
const canUseComplianceCorner = computed(() => ['super_admin', 'admin'].includes(roleNorm.value));
const canAccessSchedulingPanels = computed(() => {
  if (!isSupervisorProviderContext.value) return true;
  if (!schedulingEligibilityResolved.value) return true;
  const superviseeIds = (supervisorSuperviseeIds.value || []).map((v) => Number(v)).filter(Boolean);
  if (superviseeIds.length === 0) return false;
  const eligibleProviderIds = new Set(
    (Array.isArray(store.eligibleProviders) ? store.eligibleProviders : [])
      .map((p) => Number(p?.provider_user_id || 0))
      .filter(Boolean)
  );
  return superviseeIds.some((id) => eligibleProviderIds.has(id));
});
const schedulingDisabledReason = computed(() => (
  'No assigned supervisee providers for this school yet.'
));

const settingsIconUrl = computed(() => {
  return brandingStore.getAdminQuickActionIconUrl('settings', cardIconOrg.value || null);
});

const notificationsUnreadCount = ref(0);
const notificationsNewestSnippet = ref('');
const bannerItems = ref([]);
const scrollingBannerItems = computed(() => {
  const list = Array.isArray(bannerItems.value) ? bannerItems.value : [];
  return list.filter((a) => String(a?.display_type || 'announcement').toLowerCase() !== 'splash');
});

const splashAnnouncementItems = computed(() => {
  const list = Array.isArray(bannerItems.value) ? bannerItems.value : [];
  return list
    .filter((a) => String(a?.display_type || 'announcement').toLowerCase() === 'splash')
    .sort((a, b) => new Date(a?.starts_at || 0).getTime() - new Date(b?.starts_at || 0).getTime());
});

const SCHOOL_SPLASH_PREFIX = 'schoolPortalSplash';
const splashDismissVersion = ref(0);

const splashDismissKey = (item) => {
  const userId = Number(authStore.user?.id || 0);
  const orgId = Number(organizationId.value || 0);
  const splashId = Number(item?.id || 0);
  if (!userId || !orgId || !splashId) return null;
  return `${SCHOOL_SPLASH_PREFIX}:${userId}:${orgId}:${splashId}`;
};

const isSplashDismissed = (item) => {
  const key = splashDismissKey(item);
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const untilTs = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(untilTs) || untilTs <= Date.now()) {
      localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const openSplashAnnouncements = computed(() => {
  void splashDismissVersion.value;
  return splashAnnouncementItems.value.filter((item) => !isSplashDismissed(item));
});

const currentSplashAnnouncement = computed(() => openSplashAnnouncements.value[0] || null);

const splashTitleText = computed(() => {
  const title = String(currentSplashAnnouncement.value?.title || '').trim();
  if (title && title.toLowerCase() !== 'announcement') return title;
  return 'Important announcement';
});

const formatSplashEndsAt = (dateLike) => {
  const dt = new Date(dateLike || 0);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const dismissCurrentSplash = () => {
  const item = currentSplashAnnouncement.value;
  if (!item) return;
  const key = splashDismissKey(item);
  if (!key) return;
  const endsAt = new Date(item.ends_at || 0).getTime();
  const expiry = Number.isFinite(endsAt) && endsAt > Date.now() ? endsAt : Date.now() + 14 * 24 * 60 * 60 * 1000;
  try { localStorage.setItem(key, String(expiry)); } catch {}
  splashDismissVersion.value++;
};

const bannerTexts = computed(() => {
  const list = scrollingBannerItems.value;
  return list
    .map((a) => {
      const title = String(a?.title || '').trim();
      const msg = String(a?.message || '').trim();
      const t = title && title.toLowerCase() !== 'announcement' ? `${title}: ${msg}` : msg;
      return String(t || '').trim();
    })
    .filter(Boolean)
    .slice(0, 10);
});

const clientLabelMode = ref('codes'); // 'codes' | 'initials'
const showCodesHelp = ref(false);
const codesPrivacyHelp =
  'To further protect the anonymity of the students, you can turn codes on and then hover over their codes to display their initials.';
const toggleClientLabelMode = () => {
  clientLabelMode.value = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  showCodesHelp.value = false;
  try {
    window.localStorage.setItem('schoolPortalClientLabelMode', clientLabelMode.value);
  } catch {
    // ignore
  }
};

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const loadNotificationsPreview = async () => {
  try {
    const orgId = Number(organizationId.value || 0);
    const uid = authStore.user?.id;
    if (!orgId || !uid) {
      notificationsUnreadCount.value = 0;
      notificationsNewestSnippet.value = '';
      return;
    }

    const [prefResp, feedResp] = await Promise.all([
      api.get(`/users/${uid}/preferences`),
      api.get(`/school-portal/${orgId}/notifications/feed`)
    ]);

    const pref = prefResp?.data || {};
    const raw = pref.school_portal_notifications_progress;
    const m = parseJsonMaybe(raw) || raw;
    const progress = m && typeof m === 'object' && m.by_org
      ? { ...m, dismissed_by_org: m.dismissed_by_org && typeof m.dismissed_by_org === 'object' ? m.dismissed_by_org : {} }
      : { by_org: m && typeof m === 'object' ? m : {}, by_org_kind: {}, by_org_client_kind: {}, dismissed_by_org: {} };
    const orgKey = String(orgId);
    const byOrg = progress?.by_org || {};
    const byOrgKind = progress?.by_org_kind?.[orgKey] || {};
    const byOrgClientKind = progress?.by_org_client_kind?.[orgKey] || {};

    const lastSeenForItem = (it) => {
      const kind = String(it?.kind || '').toLowerCase();
      const clientId = it?.client_id ? String(it.client_id) : '';
      if (clientId && byOrgClientKind[clientId]?.[kind]) {
        const t = new Date(byOrgClientKind[clientId][kind]).getTime();
        return Number.isFinite(t) ? t : 0;
      }
      if (byOrgKind[kind]) {
        const t = new Date(byOrgKind[kind]).getTime();
        return Number.isFinite(t) ? t : 0;
      }
      const iso = byOrg[orgKey] || '';
      return iso ? new Date(iso).getTime() : 0;
    };

    const dismissedList = progress?.dismissed_by_org?.[orgKey] || [];
    const dismissedSet = new Set(Array.isArray(dismissedList) ? dismissedList.map(String) : []);

    const feed = Array.isArray(feedResp?.data) ? feedResp.data : [];
    const unread = feed.filter((it) => {
      const id = String(it?.id ?? '');
      if (dismissedSet.has(id)) return false;
      const t = it?.created_at ? new Date(it.created_at).getTime() : 0;
      return Number.isFinite(t) && t > lastSeenForItem(it);
    });

    notificationsUnreadCount.value = unread.length;
    const newest = feed?.[0] || null;
    const formatClientLabel = (it) => {
      if (it?.client_access_locked) return 'NO ROI';
      const code = String(it?.client_identifier_code || '').trim();
      const initials = String(it?.client_initials || '').trim();
      if (it?.client_force_code_only) return code || initials || '';
      if (clientLabelMode.value === 'initials') return initials || code || '';
      return code || initials || '';
    };
    const formatNotificationMessage = (it) => {
      const raw = String(it?.message || '').trim();
      const kind = String(it?.kind || '').toLowerCase();
      if (kind === 'announcement') return raw;
      const label = formatClientLabel(it);
      if (!label) return raw;
      const idx = raw.indexOf(':');
      const suffix = idx >= 0 ? raw.slice(idx + 1).trim() : raw;
      return suffix ? `${label}: ${suffix}` : label;
    };
    const newestMsg = formatNotificationMessage(newest);
    notificationsNewestSnippet.value = newestMsg ? (newestMsg.length > 90 ? `${newestMsg.slice(0, 90)}…` : newestMsg) : '';
  } catch {
    notificationsUnreadCount.value = 0;
    notificationsNewestSnippet.value = '';
  }
};

const messagesUnreadCount = ref(0);
const fetchMessagesUnread = async () => {
  if (!authStore.user?.id) return;
  try {
    const resp = await api.get('/chat/threads', { skipGlobalLoading: true });
    const threads = Array.isArray(resp.data) ? resp.data : [];
    messagesUnreadCount.value = threads.reduce((s, t) => s + (Number(t.unread_count) || 0), 0);
  } catch {
    // ignore
  }
};
const openMessages = async () => {
  if (waiverGateLocked.value) {
    await forceWaiverDocumentsMode();
    return;
  }
  portalMode.value = 'messages';
  try {
    await router.replace({ query: { ...route.query, sp: 'messages' } });
  } catch {
    // ignore
  }
  if (!Array.isArray(store.eligibleProviders) || store.eligibleProviders.length === 0) {
    await store.fetchEligibleProviders();
  }
  await fetchMessagesUnread();
};

const openNotificationsPanel = async ({ createAnnouncement = false } = {}) => {
  if (waiverGateLocked.value) {
    await forceWaiverDocumentsMode();
    return;
  }
  portalMode.value = 'notifications';
  const nextQuery = { ...(route.query || {}), sp: 'notifications' };
  delete nextQuery.notif;
  if (createAnnouncement) nextQuery.announcementCreate = '1';
  else delete nextQuery.announcementCreate;
  try {
    await router.replace({ query: nextQuery });
  } catch {
    // ignore navigation failures
  }
  // Preview will be refreshed by the panel itself on open/mark seen, but keep badge responsive.
  await Promise.all([loadNotificationsPreview(), loadBannerAnnouncements()]);
};

const onNotificationsUpdated = async () => {
  await Promise.all([loadNotificationsPreview(), loadBannerAnnouncements()]);
};

watch(
  () => clientLabelMode.value,
  () => {
    // Refresh notification preview when label mode changes.
    loadNotificationsPreview();
  }
);

const loadBannerAnnouncements = async () => {
  try {
    const orgId = Number(organizationId.value || 0);
    if (!orgId) {
      bannerItems.value = [];
      return;
    }
    const r = await api.get(`/school-portal/${orgId}/announcements/banner`);
    bannerItems.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    bannerItems.value = [];
  }
};

const toAnnouncementLocalInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const initAnnouncementDefaults = () => {
  const now = new Date();
  const ends = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  announcementDraftStartsAt.value = toAnnouncementLocalInput(now);
  announcementDraftEndsAt.value = toAnnouncementLocalInput(ends);
};

const canSubmitAnnouncement = computed(() => {
  if (!authStore.user?.id) return false;
  if (!organizationId.value) return false;
  if (!announcementDraftMessage.value.trim()) return false;
  if (!announcementDraftStartsAt.value || !announcementDraftEndsAt.value) return false;
  return true;
});

const openAnnouncementModal = () => {
  announcementCreateError.value = '';
  announcementCreateSuccess.value = '';
  announcementDraftTitle.value = '';
  announcementDraftMessage.value = '';
  initAnnouncementDefaults();
  showAnnouncementModal.value = true;
};

const closeAnnouncementModal = () => {
  if (announcementCreating.value) return;
  showAnnouncementModal.value = false;
  announcementCreateError.value = '';
};

const openAdminToolsModal = () => {
  adminToolsError.value = '';
  adminToolsResult.value = null;
  showAdminToolsModal.value = true;
};

const closeAdminToolsModal = () => {
  if (adminToolsRunning.value) return;
  showAdminToolsModal.value = false;
};

const runRestoreIntakeArtifacts = async () => {
  if (!isSuperAdmin.value || !organizationId.value) return;
  adminToolsRunning.value = true;
  adminToolsError.value = '';
  adminToolsResult.value = null;
  try {
    const resp = await api.post(`/school-portal/${organizationId.value}/admin-tools/restore-intake-artifacts`);
    adminToolsResult.value = resp.data || null;
  } catch (e) {
    adminToolsError.value = e?.response?.data?.error?.message || 'Failed to restore intake artifacts';
  } finally {
    adminToolsRunning.value = false;
  }
};

const submitAnnouncementModal = async () => {
  if (!canSubmitAnnouncement.value) return;
  announcementCreating.value = true;
  announcementCreateError.value = '';
  announcementCreateSuccess.value = '';
  try {
    await api.post(`/school-portal/${organizationId.value}/announcements`, {
      title: announcementDraftTitle.value.trim() || null,
      message: announcementDraftMessage.value.trim(),
      starts_at: new Date(announcementDraftStartsAt.value),
      ends_at: new Date(announcementDraftEndsAt.value)
    });
    announcementCreateSuccess.value = 'Announcement posted.';
    showAnnouncementModal.value = false;
    await Promise.all([loadNotificationsPreview(), loadBannerAnnouncements()]);
  } catch (e) {
    announcementCreateError.value = e?.response?.data?.error?.message || 'Failed to post announcement';
  } finally {
    announcementCreating.value = false;
  }
};

const canShowSchoolSettingsButton = computed(() => {
  if (!['super_admin', 'admin', 'staff'].includes(roleNorm.value)) return false;
  const affId = affiliatedAgencyId.value ? Number(affiliatedAgencyId.value) : null;
  if (!affId) return false;
  if (roleNorm.value === 'super_admin') return true;
  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  return list.some((a) => Number(a?.id) === Number(affId));
});

const loadSupervisorScheduleEligibility = async () => {
  if (!isSupervisorProviderContext.value) {
    schedulingEligibilityResolved.value = true;
    supervisorSuperviseeIds.value = [];
    return;
  }
  const userId = Number(authStore.user?.id || 0);
  if (!userId) {
    schedulingEligibilityResolved.value = true;
    supervisorSuperviseeIds.value = [];
    return;
  }
  schedulingEligibilityResolved.value = false;
  try {
    const response = await api.get(`/supervisor-assignments/supervisor/${userId}`);
    const rows = Array.isArray(response.data) ? response.data : [];
    supervisorSuperviseeIds.value = rows
      .map((r) => Number(r?.supervisee_id || 0))
      .filter(Boolean);
  } catch {
    supervisorSuperviseeIds.value = [];
  } finally {
    schedulingEligibilityResolved.value = true;
  }
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const additionalAvailabilityHref = '/dashboard?tab=submit';
const WEEKLY_AVAILABILITY_PROMPT_KEY = 'schoolPortalWeeklyAvailabilityPrompt';

const parseServiceDays = (raw) => {
  const s = String(raw || '');
  if (!s.trim()) return [];
  return s
    .split(',')
    .map((d) => d.trim())
    .filter((d) => DAY_ORDER.includes(d));
};

const weekKeyForDate = (value = new Date()) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // monday=0
  d.setDate(d.getDate() - day + 3); // thursday-based ISO week anchor
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setHours(0, 0, 0, 0);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const weekNo = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const weeklyAvailabilityPromptStorageKey = computed(() => {
  const uid = Number(authStore.user?.id || 0);
  const orgId = Number(organizationId.value || 0);
  if (!uid || !orgId) return '';
  return `${WEEKLY_AVAILABILITY_PROMPT_KEY}:${uid}:${orgId}`;
});

const hasSeenWeeklyAvailabilityPrompt = () => {
  const k = weeklyAvailabilityPromptStorageKey.value;
  if (!k) return false;
  try {
    return localStorage.getItem(k) === weekKeyForDate(new Date());
  } catch {
    return false;
  }
};

const markWeeklyAvailabilityPromptSeen = () => {
  const k = weeklyAvailabilityPromptStorageKey.value;
  if (!k) return;
  try {
    localStorage.setItem(k, weekKeyForDate(new Date()));
  } catch {
    // ignore
  }
};

const isProviderRoleForAvailability = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(role);
});

const selectedAvailabilityAssignment = computed(() => {
  const day = String(availabilitySelectedDay.value || '');
  if (!day) return null;
  return (availabilityDayOptions.value || []).find((d) => String(d.day_of_week || '') === day) || null;
});

const resetAvailabilityDraftFromSelectedDay = () => {
  const day = selectedAvailabilityAssignment.value;
  availabilityDeltaSlots.value = 0;
  availabilityNote.value = '';
  availabilityError.value = '';
  availabilityNewStart.value = String(day?.start_time || '').slice(0, 5) || '';
  availabilityNewEnd.value = String(day?.end_time || '').slice(0, 5) || '';
};

const ensureAvailabilityContext = async ({ force = false } = {}) => {
  if (!organizationId.value || !isProviderRoleForAvailability.value) return;
  if (!force && availabilityDayOptions.value.length > 0) return;
  try {
    availabilityContextLoading.value = true;
    availabilityContextError.value = '';
    const orgKey = organizationId.value;
    const uid = Number(authStore.user?.id || 0);
    const [providerResp, rosterResp] = await Promise.all([
      api.get(`/school-portal/${orgKey}/providers/scheduling`, { skipGlobalLoading: true }),
      api.get(`/school-portal/${orgKey}/my-roster`, { skipGlobalLoading: true })
    ]);
    const providers = Array.isArray(providerResp.data) ? providerResp.data : [];
    const mine = providers.find((p) => Number(p?.provider_user_id || 0) === uid) || null;
    const assignments = Array.isArray(mine?.assignments) ? mine.assignments : [];
    const roster = Array.isArray(rosterResp.data) ? rosterResp.data : [];
    availabilityAssignedClientsTotal.value = roster.length;
    availabilityProviderName.value = mine
      ? `${mine.first_name || ''} ${mine.last_name || ''}`.trim()
      : `${authStore.user?.first_name || ''} ${authStore.user?.last_name || ''}`.trim();

    const clientsByDay = new Map();
    for (const day of DAY_ORDER) clientsByDay.set(day, 0);
    for (const c of roster) {
      const days = parseServiceDays(c?.service_day);
      const uniqueDays = Array.from(new Set(days));
      for (const d of uniqueDays) {
        clientsByDay.set(d, Number(clientsByDay.get(d) || 0) + 1);
      }
    }

    const next = assignments
      .filter((a) => DAY_ORDER.includes(String(a?.day_of_week || '')))
      .map((a) => {
        const day = String(a.day_of_week || '');
        const clientsAssigned = Number(clientsByDay.get(day) || 0);
        const slotsTotal = Number(a?.slots_total ?? 0);
        const rawAvailable = Number(a?.slots_available);
        const slotsAvailable = Number.isFinite(rawAvailable) ? rawAvailable : (slotsTotal - clientsAssigned);
        return {
          day_of_week: day,
          slots_total: Number.isFinite(slotsTotal) ? slotsTotal : 0,
          slots_available: Number.isFinite(slotsAvailable) ? slotsAvailable : 0,
          start_time: String(a?.start_time || '').slice(0, 5) || '',
          end_time: String(a?.end_time || '').slice(0, 5) || '',
          clients_assigned: clientsAssigned
        };
      })
      .sort((a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week));

    availabilityDayOptions.value = next;
    if (!availabilitySelectedDay.value || !next.some((d) => d.day_of_week === availabilitySelectedDay.value)) {
      availabilitySelectedDay.value = next[0]?.day_of_week || '';
    }
  } catch (e) {
    availabilityContextError.value = e?.response?.data?.error?.message || 'Failed to load your school availability context';
    availabilityDayOptions.value = [];
    availabilitySelectedDay.value = '';
    availabilityAssignedClientsTotal.value = 0;
  } finally {
    availabilityContextLoading.value = false;
  }
};

const maybeOpenWeeklyAvailabilityPrompt = async () => {
  if (!isProviderRoleForAvailability.value) return;
  if (!organizationId.value) return;
  if (hasSeenWeeklyAvailabilityPrompt()) return;
  await ensureAvailabilityContext();
  if ((availabilityDayOptions.value || []).length === 0) return;
  availabilityConfirmSuccess.value = '';
  availabilityConfirmError.value = '';
  showWeeklyAvailabilityPrompt.value = true;
};

const dismissWeeklyAvailabilityPrompt = () => {
  showWeeklyAvailabilityPrompt.value = false;
  markWeeklyAvailabilityPromptSeen();
};

const openWeeklySplashPreview = async () => {
  availabilityConfirmSuccess.value = '';
  availabilityConfirmError.value = '';
  if (isProviderRoleForAvailability.value) {
    await ensureAvailabilityContext({ force: true });
  }
  showWeeklyAvailabilityPrompt.value = true;
};

const confirmWeeklyAvailability = async () => {
  if (!organizationId.value || !isProviderRoleForAvailability.value) return;
  availabilityConfirming.value = true;
  availabilityConfirmSuccess.value = '';
  availabilityConfirmError.value = '';
  try {
    const res = await api.post(`/school-portal/${organizationId.value}/provider-availability/confirm`);
    const count = Number(res?.data?.notifiedCount || 0);
    availabilityConfirmSuccess.value = count > 0
      ? `Confirmed. ${count} admin notification${count === 1 ? '' : 's'} sent.`
      : 'Confirmed. Admin notification sent.';
    markWeeklyAvailabilityPromptSeen();
    window.setTimeout(() => {
      showWeeklyAvailabilityPrompt.value = false;
    }, 700);
  } catch (e) {
    availabilityConfirmError.value = e?.response?.data?.error?.message || 'Failed to confirm availability';
  } finally {
    availabilityConfirming.value = false;
  }
};

const openAvailabilityRequest = async (payload) => {
  await ensureAvailabilityContext();
  availabilityRequest.value = payload || null;
  if (showWeeklyAvailabilityPrompt.value) dismissWeeklyAvailabilityPrompt();
  const requestedDay = String(payload?.weekday || '').trim();
  if (requestedDay && availabilityDayOptions.value.some((d) => d.day_of_week === requestedDay)) {
    availabilitySelectedDay.value = requestedDay;
  } else if (!availabilitySelectedDay.value) {
    availabilitySelectedDay.value = availabilityDayOptions.value[0]?.day_of_week || '';
  }
  resetAvailabilityDraftFromSelectedDay();
  showAvailabilityRequest.value = true;
};

const closeAvailabilityRequest = () => {
  showAvailabilityRequest.value = false;
  availabilityRequest.value = null;
  availabilitySelectedDay.value = '';
  availabilityDayOptions.value = [];
  availabilityAssignedClientsTotal.value = 0;
  availabilityProviderName.value = '';
  availabilityDeltaSlots.value = 0;
  availabilityNewStart.value = '';
  availabilityNewEnd.value = '';
  availabilityNote.value = '';
  availabilityError.value = '';
  availabilityContextError.value = '';
};

const availabilityCurrentSlotsText = computed(() => {
  const d = selectedAvailabilityAssignment.value || {};
  const total = d.slots_total ?? null;
  const used = d.clients_assigned ?? null;
  if (total == null) return '—';
  if (used == null) return `${Number(total)} total`;
  return `${Number(used || 0)} assigned / ${Number(total)} total`;
});

const availabilityRequestedSlotsTotal = computed(() => {
  const d = selectedAvailabilityAssignment.value || {};
  const current = Number(d.slots_total ?? 0);
  const delta = Number(availabilityDeltaSlots.value || 0);
  const out = Number.isFinite(current) ? current + delta : delta;
  return Number.isFinite(out) ? out : '';
});

const availabilityOverAssignedWarning = computed(() => {
  const d = selectedAvailabilityAssignment.value || {};
  const assigned = Number(d.clients_assigned ?? 0);
  const requested = Number(availabilityRequestedSlotsTotal.value ?? NaN);
  if (!Number.isFinite(requested)) return '';
  if (requested < assigned) {
    return `Requested slots (${requested}) are below assigned clients (${assigned}) for this day.`;
  }
  return '';
});

const formatSchoolPortalTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw === '—') return '—';
  const hhmm = raw.length >= 5 ? raw.slice(0, 5) : raw;
  const [hRaw, mRaw] = hhmm.split(':');
  const hh = Number(hRaw);
  const mm = Number(mRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmm;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
};

const formatSchoolPortalTimeRange = (start, end) => {
  const st = formatSchoolPortalTime(start);
  const et = formatSchoolPortalTime(end);
  if (st === '—' && et === '—') return '—';
  return `${st} to ${et}`;
};

const availabilityCurrentHoursText = computed(() => {
  const d = selectedAvailabilityAssignment.value || {};
  const st = String(d.start_time || '').slice(0, 5);
  const et = String(d.end_time || '').slice(0, 5);
  return formatSchoolPortalTimeRange(st, et);
});

const availabilityFromToSummary = computed(() => {
  const d = selectedAvailabilityAssignment.value || {};
  const fromSlots = Number(d.slots_total ?? 0);
  const toSlots = Number(availabilityRequestedSlotsTotal.value ?? fromSlots);
  const fromStart = String(d.start_time || '').slice(0, 5) || '—';
  const fromEnd = String(d.end_time || '').slice(0, 5) || '—';
  const toStart = String(availabilityNewStart.value || '').slice(0, 5) || fromStart;
  const toEnd = String(availabilityNewEnd.value || '').slice(0, 5) || fromEnd;
  return {
    slots: `${fromSlots} -> ${toSlots}`,
    hours: `${formatSchoolPortalTimeRange(fromStart, fromEnd)} -> ${formatSchoolPortalTimeRange(toStart, toEnd)}`
  };
});

const submitAvailabilityRequest = async () => {
  if (!organizationId.value) return;
  const p = availabilityRequest.value || {};
  const selected = selectedAvailabilityAssignment.value || {};
  const providerUserId = Number(p.providerUserId || authStore.user?.id || 0);
  if (!providerUserId || !availabilitySelectedDay.value) return;
  try {
    availabilitySubmitting.value = true;
    availabilityError.value = '';

    const weekday = String(availabilitySelectedDay.value || '').trim();
    const providerName = String(availabilityProviderName.value || p.providerName || '').trim() || `Provider #${providerUserId}`;
    const currentSlots = selected.slots_total ?? null;
    const currentUsed = selected.clients_assigned ?? null;
    const delta = Number(availabilityDeltaSlots.value || 0);
    const requestedSlots = availabilityRequestedSlotsTotal.value;
    const currentHours = availabilityCurrentHoursText.value;
    const requestedHours =
      availabilityNewStart.value || availabilityNewEnd.value
        ? formatSchoolPortalTimeRange(availabilityNewStart.value || '—', availabilityNewEnd.value || '—')
        : '—';

    const requestNotes = [
      `School: ${organizationDisplayName.value || organizationName.value || ''}`.trim(),
      `Provider: ${providerName} (user_id=${providerUserId})`,
      weekday ? `Day: ${weekday}` : null,
      `Current slots: ${currentUsed != null && currentSlots != null ? `${Number(currentUsed || 0)} assigned / ${Number(currentSlots)} total` : (currentSlots != null ? `${Number(currentSlots)} total` : '—')}`,
      `Requested slots total: ${requestedSlots} (delta ${delta >= 0 ? '+' : ''}${delta})`,
      `Current hours: ${currentHours}`,
      `Requested hours: ${requestedHours}`,
      availabilityNote.value.trim() ? `Note: ${availabilityNote.value.trim()}` : null
    ].filter(Boolean).join(' | ');

    await api.post('/availability/school-requests', {
      agencyId: affiliatedAgencyId.value || undefined,
      notes: requestNotes,
      blocks: [
        {
          dayOfWeek: weekday,
          startTime: availabilityNewStart.value || String(selected.start_time || '').slice(0, 5),
          endTime: availabilityNewEnd.value || String(selected.end_time || '').slice(0, 5)
        }
      ]
    });

    const submittedDay = weekday || 'this day';
    const submitAnother = window.confirm(`Request sent for ${submittedDay}. Submit another day update now?`);
    if (submitAnother) {
      await ensureAvailabilityContext({ force: true });
      resetAvailabilityDraftFromSelectedDay();
    } else {
      closeAvailabilityRequest();
    }
  } catch (e) {
    availabilityError.value = e.response?.data?.error?.message || 'Failed to send request';
  } finally {
    availabilitySubmitting.value = false;
  }
};

watch(
  () => availabilitySelectedDay.value,
  () => {
    if (!showAvailabilityRequest.value) return;
    resetAvailabilityDraftFromSelectedDay();
  }
);

const ensureAffiliation = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/school-portal/${organizationId.value}/affiliation`);
    const active = r?.data?.active_agency_id ?? null;
    affiliatedAgencyId.value = active ? Number(active) : null;
    canEditClientActions.value = !!r?.data?.can_edit_clients;

    // Best-effort: load full affiliated agency record for icon overrides (cards + settings icon).
    if (affiliatedAgencyId.value) {
      const a = await api.get(`/agencies/${affiliatedAgencyId.value}`);
      cardIconOrg.value = a.data || null;
    } else {
      cardIconOrg.value = null;
    }
    await checkReviewPrompt();
  } catch {
    affiliatedAgencyId.value = null;
    cardIconOrg.value = null;
    canEditClientActions.value = false;
  }
};

const reviewPromptConfig = computed(() => {
  const cfg = cardIconOrg.value?.review_prompt_config;
  if (!cfg || !cfg.enabled) return null;
  const hasLink = (cfg.reviewLink && String(cfg.reviewLink).trim()) || (cfg.surveyLink && String(cfg.surveyLink).trim());
  if (!hasLink) return null;
  return cfg;
});

const userReviewPromptState = ref(null);

const checkReviewPrompt = async () => {
  if (!isSchoolStaff.value || !reviewPromptConfig.value || !affiliatedAgencyId.value) return;
  const uid = authStore.user?.id;
  if (!uid) return;
  try {
    const pref = (await api.get(`/users/${uid}/preferences`)).data || {};
    userReviewPromptState.value = pref.review_prompt_state || null;
    const state = typeof pref.review_prompt_state === 'object' ? pref.review_prompt_state : null;
    const byAgency = state?.byAgency || {};
    const agencyState = byAgency[String(affiliatedAgencyId.value)] || {};
    if (agencyState.completed) return;
    const now = new Date();
    const dismissedUntil = agencyState.dismissedUntil ? new Date(agencyState.dismissedUntil) : null;
    if (dismissedUntil && now < dismissedUntil) return;
    const snoozeUntil = agencyState.snoozeUntil ? new Date(agencyState.snoozeUntil) : null;
    if (snoozeUntil && now < snoozeUntil) return;
    showReviewPrompt.value = true;
  } catch {
    // Don't show on error; avoid blocking the portal
  }
};

const updateReviewPromptState = async (updates) => {
  const uid = authStore.user?.id;
  if (!uid || !affiliatedAgencyId.value) return;
  const agencyKey = String(affiliatedAgencyId.value);
  const existing = userReviewPromptState.value && typeof userReviewPromptState.value === 'object'
    ? userReviewPromptState.value
    : {};
  const byAgency = { ...(existing.byAgency || {}) };
  byAgency[agencyKey] = { ...(byAgency[agencyKey] || {}), ...updates };
  const next = { ...existing, byAgency };
  try {
    await api.put(`/users/${uid}/preferences`, { review_prompt_state: next });
    userReviewPromptState.value = next;
  } catch {
    // best effort
  }
};

const onReviewPromptCompleted = () => {
  updateReviewPromptState({ completed: true });
};

const onReviewPromptSnooze = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  updateReviewPromptState({ snoozeUntil: d.toISOString() });
};

const onReviewPromptDismiss = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  updateReviewPromptState({ dismissedUntil: d.toISOString() });
};

const openSchoolSettings = async () => {
  // Ensure agency list exists so the role+affiliation gate behaves deterministically.
  try {
    if (roleNorm.value !== 'super_admin' && (!Array.isArray(agencyStore.userAgencies) || agencyStore.userAgencies.length === 0)) {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // ignore
  }

  await ensureAffiliation();
  if (!canShowSchoolSettingsButton.value) {
    alert('You do not have access to this school’s affiliated agency settings.');
    return;
  }
  showSchoolSettings.value = true;
};

const openProvidersPanel = async () => {
  if (waiverGateLocked.value) {
    await forceWaiverDocumentsMode();
    return;
  }
  if (!canAccessSchedulingPanels.value) {
    portalMode.value = 'home';
    return;
  }
  portalMode.value = 'providers';
  if (!Array.isArray(store.eligibleProviders) || store.eligibleProviders.length === 0) {
    await store.fetchEligibleProviders();
  }
};

const openDaysPanel = async () => {
  if (waiverGateLocked.value) {
    await forceWaiverDocumentsMode();
    return;
  }
  if (!canAccessSchedulingPanels.value) {
    portalMode.value = 'home';
    return;
  }
  portalMode.value = 'days';
  if (!organizationId.value) return;
  try {
    await store.fetchDays();
  } catch {
    // ignore
  }
  if (!store.selectedWeekday) {
    const days = Array.isArray(store.days) ? store.days : [];
    const firstWithProviders = days.find((d) => d?.has_providers)?.weekday || null;
    const fallback = days?.[0]?.weekday || null;
    store.selectedWeekday = firstWithProviders || fallback || null;
  }
};

const homeRosterEl = ref(null);
const scrollToHomeRoster = () => {
  try {
    homeRosterEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // ignore
  }
};

const organizationSlug = computed(() => route.params.organizationSlug);
const isFakeySchoolForSplashTest = computed(() => {
  const slug = String(organizationSlug.value || '').trim().toLowerCase();
  return slug === 'fakey-school' || slug === 'fakeyschool' || slug.includes('fakey');
});

const organizationName = computed(() => {
  return organizationStore.organizationContext?.name || 
         organizationStore.currentOrganization?.name || 
         'School';
});

const organizationDisplayName = computed(() => {
  const org = organizationStore.currentOrganization;
  const official = String(org?.official_name || '').trim();
  return official || organizationName.value;
});

const schoolLogoUrl = computed(() => {
  const org = organizationStore.currentOrganization;
  const raw = org?.logo_path || org?.logo_url || null;
  return toUploadsUrl(raw);
});

const homeIconUrl = computed(() => {
  const a = cardIconOrg.value || null;
  const raw = a?.icon_file_path || a?.icon_path || null;
  return toUploadsUrl(raw);
});

const organizationId = computed(() => {
  return organizationStore.organizationContext?.id || 
         organizationStore.currentOrganization?.id || 
         null;
});

const panelFor = (providerUserId) => {
  const key = `${store.selectedWeekday}:${providerUserId}`;
  return store.providerPanels?.[key] || store.ensurePanel(store.selectedWeekday, providerUserId);
};

const loadForDay = async (weekday) => {
  if (!organizationId.value) return;
  if (portalMode.value !== 'days') return;
  if (!weekday) return;
  await store.fetchDays();
  await store.fetchPortalStats();
  await store.fetchEligibleProviders();
  await store.fetchDayProviders(weekday);
  const list = Array.isArray(store.dayProviders) ? store.dayProviders : [];
  await Promise.all(list.map((p) => store.loadProviderPanel(weekday, p.provider_user_id)));
};

const handleAddDay = async () => {
  await store.addDay(store.selectedWeekday);
  await loadForDay(store.selectedWeekday);
};

const handleAddProvider = async ({ providerUserId }) => {
  await store.addProviderToDay(store.selectedWeekday, providerUserId);
  await loadForDay(store.selectedWeekday);
};

const handleSaveSlots = async ({ providerUserId, slots }) => {
  await store.saveSoftSlots(store.selectedWeekday, providerUserId, slots);
};

const handleMoveSlot = async ({ providerUserId, slotId, direction }) => {
  await store.moveSoftSlot(store.selectedWeekday, providerUserId, slotId, direction);
};

const isClientPortalLocked = (client) => String(authStore.user?.role || '').toLowerCase() === 'school_staff' && client?.school_portal_can_open === false;

const resolveSelectedClientNavigationIds = (payload = null) => {
  const explicit = Array.isArray(payload?.navigationClientIds)
    ? payload.navigationClientIds.map((id) => Number(id || 0)).filter(Boolean)
    : [];
  if (explicit.length) return explicit;

  const fromClient = Array.isArray(payload?.client?.navigationClientIds)
    ? payload.client.navigationClientIds.map((id) => Number(id || 0)).filter(Boolean)
    : [];
  if (fromClient.length) return fromClient;

  const fromSelected = Array.isArray(selectedClient.value?.navigationClientIds)
    ? selectedClient.value.navigationClientIds.map((id) => Number(id || 0)).filter(Boolean)
    : [];
  if (fromSelected.length) return fromSelected;

  if (portalMode.value === 'days' && store.selectedWeekday) {
    const ids = [];
    for (const provider of store.dayProviders || []) {
      const panel = panelFor(provider?.provider_user_id);
      for (const client of panel?.caseloadClients || []) {
        const id = Number(client?.id || 0);
        if (id) ids.push(id);
      }
    }
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length) return uniqueIds;
  }

  return [];
};

const openClient = (payload) => {
  const client = payload?.client || payload;
  if (isClientPortalLocked(client)) return;
  const navigationClientIds = resolveSelectedClientNavigationIds(payload);
  selectedClient.value = navigationClientIds.length
    ? { ...client, navigationClientIds }
    : client;
};

const openClientEditorFromModal = async (client) => {
  const payload = client?.navigationClientIds
    ? client
    : (selectedClient.value?.navigationClientIds
        ? { ...client, navigationClientIds: selectedClient.value.navigationClientIds }
        : client);
  selectedClient.value = null;
  await openAdminClientEditor(payload);
};

const openChecklistFromModal = (client) => {
  selectedClient.value = null;
  quickChecklistClient.value = client;
};

const openClientFromQuery = async () => {
  if (!organizationId.value || !requestedClientId.value) return;
  try {
    const r = await api.get(`/school-portal/${organizationId.value}/clients`, {
      params: { clientId: requestedClientId.value }
    });
    const list = Array.isArray(r.data) ? r.data : [];
    const found = list.find((c) => Number(c?.id) === Number(requestedClientId.value));
    if (found && !isClientPortalLocked(found)) {
      selectedClient.value = found;
    }
  } catch {
    // ignore
  }
};

const loadNotificationClient = async (clientId) => {
  if (!organizationId.value || !clientId) return null;
  try {
    const r = await api.get(`/school-portal/${organizationId.value}/clients`, {
      params: { clientId }
    });
    const list = Array.isArray(r.data) ? r.data : [];
    return list.find((c) => Number(c?.id) === Number(clientId)) || null;
  } catch {
    return null;
  }
};

const openTicketFromNotification = async ({ ticketId, clientId, messageId } = {}) => {
  const cid = Number(clientId || 0);
  if (!cid) return;
  const client = await loadNotificationClient(cid);
  if (!client || isClientPortalLocked(client)) return;
  ticketModalClient.value = client;
  ticketModalTicketId.value = ticketId ? Number(ticketId) : null;
  ticketModalMessageId.value = messageId ? Number(messageId) : null;
  showTicketModal.value = true;
};

const openClientFromNotification = async ({ clientId } = {}) => {
  const cid = Number(clientId || 0);
  if (!cid) return;
  const client = await loadNotificationClient(cid);
  if (!client || isClientPortalLocked(client)) return;
  openClient(client);
};

const closeTicketModal = () => {
  showTicketModal.value = false;
  ticketModalClient.value = null;
  ticketModalTicketId.value = null;
  ticketModalMessageId.value = null;
};

const adminClientCurrentIndex = computed(() => {
  const currentId = Number(adminSelectedClient.value?.id || 0);
  if (!currentId) return -1;
  return adminClientNavigationIds.value.findIndex((id) => Number(id) === currentId);
});

const fetchAdminClientById = async (clientId) => {
  const r = await api.get(`/clients/${clientId}`);
  return r.data || null;
};

const openAdminClientEditor = async (payload) => {
  const client = payload?.client || payload;
  if (!client?.id) return;
  const navigationIds = resolveSelectedClientNavigationIds(payload);
  if (!adminSelectedClient.value) {
    adminClientActiveTab.value = isProvider.value ? 'checklist' : '';
  }
  adminClientNavigationIds.value = navigationIds.length > 0 ? navigationIds : [Number(client.id)];
  adminClientLoading.value = true;
  try {
    adminSelectedClient.value = await fetchAdminClientById(client.id);
  } catch (e) {
    console.error('Failed to open client editor:', e);
    alert(e.response?.data?.error?.message || e.message || 'Failed to open client editor');
    adminSelectedClient.value = null;
  } finally {
    adminClientLoading.value = false;
  }
};

const closeAdminClientEditor = () => {
  adminSelectedClient.value = null;
  adminClientNavigationIds.value = [];
  adminClientActiveTab.value = isProvider.value ? 'checklist' : '';
};

const handleAdminClientUpdated = (payload) => {
  if (payload?.client) {
    adminSelectedClient.value = payload.client;
  }
};

const handleAdminClientTabChange = (tab) => {
  adminClientActiveTab.value = String(tab || '');
};

const navigateAdminClient = async ({ direction }) => {
  const idx = adminClientCurrentIndex.value;
  if (idx < 0) return;
  const nextIdx = String(direction || '').toLowerCase() === 'previous' ? idx - 1 : idx + 1;
  const nextId = Number(adminClientNavigationIds.value[nextIdx] || 0);
  if (!nextId) return;
  adminClientLoading.value = true;
  try {
    adminSelectedClient.value = await fetchAdminClientById(nextId);
  } catch (e) {
    console.error('Failed to navigate client editor:', e);
    alert(e.response?.data?.error?.message || e.message || 'Failed to load next client');
  } finally {
    adminClientLoading.value = false;
  }
};

const goToProviderSchoolProfile = (providerUserId) => {
  const slug = organizationSlug.value;
  if (!slug || !providerUserId) return;
  router.push(`/${slug}/providers/${providerUserId}`);
};

const messageProvider = (providerUserId) => {
  const slug = organizationSlug.value;
  if (!slug || !providerUserId) return;
  router.push({ path: `/${slug}/providers/${providerUserId}`, query: { chat: '1' } });
};

onMounted(async () => {
  try {
    const saved = window.localStorage.getItem('schoolPortalClientLabelMode');
    if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
  } catch {
    // ignore
  }
  // Ensure school staff have their agencies loaded for multi-school selector
  if (isSchoolStaff.value && (!Array.isArray(agencyStore.userAgencies) || agencyStore.userAgencies.length === 0)) {
    try {
      await agencyStore.fetchUserAgencies();
    } catch {
      // ignore
    }
  }
  // Load organization context if not already loaded
  if (organizationSlug.value && !organizationStore.currentOrganization) {
    await organizationStore.fetchBySlug(organizationSlug.value);
  }
  if (organizationId.value) {
    store.reset();
    store.setSchoolId(organizationId.value);
    // Default portal mode (query param overrides provider default).
    if (requestedPortalMode.value) {
      await applyRequestedPortalMode(requestedPortalMode.value);
    } else if (isSchoolStaff.value) {
      portalMode.value = 'home';
    }
    await store.fetchDays();
    await store.fetchPortalStats();
    // Preload provider list so home has useful info immediately.
    await store.fetchEligibleProviders();
    await loadSupervisorScheduleEligibility();
    // Preload announcements preview so the card badge/snippet is populated.
    await loadNotificationsPreview();
    await loadBannerAnnouncements();
    await refreshWaiverGateStatus({ force: true });
    if (portalMode.value === 'days' && store.selectedWeekday) await loadForDay(store.selectedWeekday);
    await openClientFromQuery();
  }

  // Best-effort: resolve active affiliated agency for icon overrides + settings button.
  await ensureAffiliation();
  await maybeOpenWeeklyAvailabilityPrompt();

  const stored = authStore.user?.id ? getStoredDarkMode(authStore.user.id) : null;
  if (stored !== null) isDarkMode.value = stored;
  else isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark';
  if (darkModeObserver) {
    darkModeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
});

onBeforeUnmount(() => {
  if (darkModeObserver) darkModeObserver.disconnect();
});

watch(organizationId, async (id) => {
  if (!id) return;
  store.reset();
  store.setSchoolId(id);
  if (requestedPortalMode.value) {
    await applyRequestedPortalMode(requestedPortalMode.value);
  } else if (isSchoolStaff.value) {
    portalMode.value = 'home';
  }
  await store.fetchDays();
  await store.fetchPortalStats();
  await store.fetchEligibleProviders();
  await loadSupervisorScheduleEligibility();
  await loadNotificationsPreview();
  await loadBannerAnnouncements();
  await refreshWaiverGateStatus({ force: true });
  if (portalMode.value === 'days' && store.selectedWeekday) await loadForDay(store.selectedWeekday);
  await openClientFromQuery();

  await ensureAffiliation();
  await maybeOpenWeeklyAvailabilityPrompt();
});

watch(
  () => requestedPortalMode.value,
  async (mode) => {
    if (!mode) return;
    await applyRequestedPortalMode(mode);
  }
);

watch(
  () => portalMode.value,
  async (mode) => {
    if (waiverGateLocked.value && mode !== 'documents') {
      await forceWaiverDocumentsMode();
    }
  }
);

watch(canAccessSchedulingPanels, (allowed) => {
  if (allowed) return;
  if (portalMode.value === 'days' || portalMode.value === 'providers') {
    portalMode.value = 'home';
  }
});

// Keep school selector in sync with current route
watch(
  () => [organizationSlug.value, schoolStaffSchools.value],
  () => {
    const slug = String(organizationSlug.value || '').trim().toLowerCase();
    const schools = schoolStaffSchools.value || [];
    const match = schools.find((s) => String(s.slug || '').trim().toLowerCase() === slug);
    if (match) selectedSchoolSlug.value = match.slug;
    else if (schools.length > 0 && !selectedSchoolSlug.value) selectedSchoolSlug.value = schools[0].slug;
  },
  { immediate: true }
);

watch(() => store.selectedWeekday, async (weekday) => {
  if (!organizationId.value) return;
  await loadForDay(weekday);
});
</script>

<style scoped>
.school-portal {
  min-height: 100vh;
  background: var(--bg-alt);
  padding: 32px;
}

.portal-header {
  margin-bottom: 32px;
  background: var(--primary);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 18px 20px;
}

.compliance-corner-btn {
  position: fixed;
  right: 22px;
  bottom: 22px;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: none;
  background: #0f172a;
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.35);
  cursor: pointer;
  z-index: 1150;
}
.compliance-corner-btn:hover {
  background: #111827;
}

.portal-banner {
  margin-top: 12px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.10);
  overflow: hidden;
  cursor: pointer;
}

.portal-banner-inner {
  position: relative;
  overflow: hidden;
  white-space: nowrap;
}

.portal-banner-track {
  display: inline-block;
  padding: 10px 12px;
  color: var(--header-text-color, #fff);
  font-weight: 800;
  animation: bannerMarquee 28s linear infinite;
  will-change: transform;
}

.portal-banner-item .sep {
  opacity: 0.75;
}

.portal-banner:hover {
  background: rgba(255, 255, 255, 0.14);
}

@keyframes bannerMarquee {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}

.portal-header h1 {
  font-size: 32px;
  font-weight: 700;
  color: var(--header-text-color, #fff);
  margin: 0 0 8px 0;
}

.portal-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.portal-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.school-selector-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.school-selector-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--header-text-color, rgba(255, 255, 255, 0.9));
  white-space: nowrap;
}
.school-selector {
  padding: 6px 10px;
  font-size: 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
  color: var(--header-text-color, #fff);
  min-width: 160px;
  cursor: pointer;
}
.school-selector:hover {
  background: rgba(255, 255, 255, 0.22);
}
.school-selector:focus {
  outline: 2px solid rgba(255, 255, 255, 0.5);
  outline-offset: 2px;
}

.portal-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}
.school-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.20);
  background: rgba(255, 255, 255, 0.10);
  overflow: hidden;
  flex: 0 0 auto;
}
.school-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.portal-subtitle {
  font-size: 16px;
  color: var(--header-text-muted, rgba(255,255,255,0.85));
  margin: 0;
}

.dash-card-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
}

.dash-card-default-roster {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.08);
}

.home-roster {
  margin-top: 18px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.portal-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.top-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.top-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.muted-small {
  color: var(--text-secondary);
  font-size: 13px;
}

.top-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}
.school-portal-dark-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}
.school-portal-dark-mode-toggle input {
  cursor: pointer;
}
.school-portal-dark-mode-toggle:hover .school-portal-dark-mode-text {
  color: var(--text-primary);
}

/* Keep School Portal header/action buttons compact and stable. */
.school-portal .btn {
  width: auto;
  min-width: 0;
  padding: 7px 12px;
  font-size: 12px;
  line-height: 1.2;
}

.school-portal .btn.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}

.settings-icon-btn {
  width: 34px;
  padding-left: 0;
  padding-right: 0;
  display: grid;
  place-items: center;
}
.btn-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
}

.codes-toggle {
  position: relative;
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.codes-info {
  width: 30px;
  padding-left: 0;
  padding-right: 0;
  font-weight: 900;
}
.codes-help {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(420px, 92vw);
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
  z-index: 50;
}

.main-layout {
  display: block;
}
.main-layout.with-rail {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 18px;
  align-items: start;
}
.nav-rail {
  position: sticky;
  top: 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 4px 0;
  display: grid;
  justify-items: center;
  gap: 12px;
}
.nav-item {
  border: none;
  border-radius: 16px;
  background: transparent;
  padding: 0;
  display: grid;
  gap: 6px;
  place-items: center;
  cursor: pointer;
}
.nav-item:hover {
  transform: translateY(-1px);
}
.nav-item.disabled,
.nav-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
.nav-item.disabled .nav-icon,
.nav-item:disabled .nav-icon {
  filter: grayscale(0.95);
}
.nav-item.active {
  transform: none;
}
.nav-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: white;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 900;
  color: var(--text-primary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
}
.nav-item:hover .nav-icon {
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.10);
}
.nav-item.active .nav-icon {
  border-color: rgba(79, 70, 229, 0.55);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.14);
}
.nav-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.nav-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-secondary);
  line-height: 1;
  letter-spacing: 0.02em;
}
.main-content {
  min-width: 0;
}

.waiver-lock-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.12);
  color: #7c2d12;
}

.nav-rail.locked .nav-item {
  pointer-events: none;
  opacity: 0.45;
}

.nav-rail.locked .nav-item[data-tour="school-nav-docs"] {
  pointer-events: auto;
  opacity: 1;
}

.days-daybar-center :deep(.day-bar) {
  max-width: 760px;
  margin-left: auto;
  margin-right: auto;
}

.empty-state.center {
  text-align: center;
  padding: 24px 12px;
}

.home {
  padding: 6px 0;
}

.home-snapshot {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 14px;
}
.home-snapshot-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.home-snapshot-grid {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: nowrap;
  overflow: auto;
  padding-bottom: 2px;
}
.home-pill {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  white-space: nowrap;
  flex: 0 0 auto;
}

.home-pill-clickable {
  cursor: pointer;
  appearance: none;
  font: inherit;
  text-align: left;
}

.home-pill-clickable:hover {
  border-color: var(--primary);
}
.home-pill-clickable:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.home-pill-k {
  font-weight: 900;
  color: var(--text-primary);
  font-size: 13px;
}
.home-pill-k-text {
  font-weight: 1000;
}
.home-pill-v {
  margin-top: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.home-pill-notifications {
  border-color: rgba(47, 143, 131, 0.45);
  background: rgba(47, 143, 131, 0.08);
  align-items: center;
  gap: 12px;
  min-width: 320px;
  max-width: 680px;
}
.home-pill-v-notifications {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 520px;
}
.home-pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(47, 143, 131, 0.16);
  color: #0f3f39;
  font-weight: 1000;
  border: 1px solid rgba(47, 143, 131, 0.35);
}
.home-pill-badge.pulse {
  animation: homePillPulse 1.35s ease-in-out infinite;
}
@keyframes homePillPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(47, 143, 131, 0.0); }
  55% { transform: scale(1.05); box-shadow: 0 0 0 6px rgba(47, 143, 131, 0.12); }
  100% { transform: scale(1); box-shadow: 0 0 0 rgba(47, 143, 131, 0.0); }
}

.dashboard-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.dash-card {
  text-align: left;
  background: white;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px 18px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  display: grid;
  grid-template-columns: 92px 1fr;
  grid-template-rows: auto auto 1fr;
  gap: 8px 16px;
  align-items: start;
}
.dash-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}
.dash-card.disabled,
.dash-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  border-color: var(--border);
  box-shadow: none;
}
.dash-card-icon {
  width: 92px;
  height: 92px;
  border-radius: 22px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  grid-row: 1 / span 3;
  grid-column: 1;
}
.dash-card-icon-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
.dash-card-icon-fallback {
  width: 64px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 18px;
  color: var(--text-secondary);
}
.dash-card-title {
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 6px;
  grid-column: 2;
}
.dash-card-desc {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 10px;
  grid-column: 2;
}
.dash-card-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  grid-column: 2;
}
.dash-card-cta {
  font-size: 12px;
  color: var(--text-secondary);
}

.dash-card-coming-soon {
  opacity: 0.92;
}
.dash-card-coming-soon:hover {
  border-color: rgba(245, 158, 11, 0.55);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 560px;
  max-width: 95vw;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 14px 16px;
}
.availability-weekly-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--text-primary);
}

.weekly-availability-modal {
  border-color: rgba(14, 116, 76, 0.22);
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.2);
}

.weekly-availability-header {
  background: linear-gradient(
    135deg,
    var(--primary, var(--primary-color, #0f766e)) 0%,
    var(--secondary, #0b6b63) 100%
  );
  color: var(--header-text-color, #fff);
  border-bottom: none;
}

.weekly-availability-lead {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}

.weekly-availability-summary {
  margin-bottom: 8px;
  color: #374151;
}

.weekly-availability-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
  flex-wrap: wrap;
}

.school-announcement-modal {
  width: min(720px, 95vw);
}

.announcement-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.announcement-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.announcement-field-wide {
  grid-column: 1 / -1;
}

.announcement-field-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.announcement-textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: white;
  color: var(--text-primary);
  font: inherit;
}

@media (max-width: 720px) {
  .announcement-form-grid {
    grid-template-columns: 1fr;
  }

  .announcement-field-wide {
    grid-column: auto;
  }
}

.intake-link-body {
  display: grid;
  gap: 12px;
}

.intake-modal-footer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e5e7eb);
  text-align: center;
}

.intake-link-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.intake-link-block {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}

.intake-link-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
  font-size: 13px;
}

.intake-qr {
  display: flex;
  justify-content: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}

.settings-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 14px;
  z-index: 2500;
}
.settings-drawer {
  height: min(96vh, 980px);
  width: min(1400px, 98vw);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
}
.settings-drawer-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.settings-drawer-body {
  padding: 8px 10px 14px;
  overflow: auto;
  flex: 1;
}

.roster {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}
.roster-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

@media (max-width: 1100px) {
  .dashboard-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .home-snapshot-grid { flex-wrap: wrap; }
}
@media (max-width: 760px) {
  .dashboard-card-grid {
    grid-template-columns: 1fr;
  }
  .home-snapshot-grid { flex-wrap: wrap; }
  .main-layout.with-rail {
    grid-template-columns: 1fr;
  }
  .nav-rail {
    position: static;
    padding: 0;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-flow: column;
    overflow: auto;
  }
  .nav-label {
    display: none;
  }
}

.blocking-splash {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.blocking-splash-card {
  width: min(700px, 96vw);
  border-radius: 16px;
  background: var(--card-bg, #fff);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
  padding: 40px 36px 32px;
}

.blocking-splash-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.blocking-splash-logo-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 6px;
}

.blocking-splash-brand {
  font-weight: 800;
  color: var(--text-secondary);
}

.blocking-splash-title {
  margin: 0 0 8px 0;
  color: var(--primary, #4338ca);
  font-size: 1.4rem;
}

.blocking-splash-message {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.08rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.blocking-splash-meta {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.blocking-splash-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}
</style>
