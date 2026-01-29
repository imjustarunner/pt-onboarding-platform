<template>
  <div class="school-portal">
    <div class="portal-header">
      <div class="portal-header-row">
        <div class="portal-header-left">
          <div v-if="schoolLogoUrl" class="school-logo">
            <img :src="schoolLogoUrl" alt="" />
          </div>
          <div>
            <h1>{{ organizationDisplayName }} Portal</h1>
            <p class="portal-subtitle">Schedule + roster (no PHI)</p>
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
                        : 'School portal'
            }}
          </div>
        </div>
        <div class="top-actions">
          <button
            v-if="canShowSchoolSettingsButton"
            class="btn btn-secondary btn-sm settings-icon-btn"
            type="button"
            @click="openSchoolSettings"
            :title="'School settings'"
            aria-label="School settings"
          >
            <img v-if="settingsIconUrl" :src="settingsIconUrl" alt="" class="btn-icon-img" />
            <span v-else aria-hidden="true">⚙</span>
          </button>
          <router-link
            v-if="canBackToSchools"
            to="/admin/schools/overview"
            class="btn btn-secondary btn-sm"
          >
            Back to show all schools
          </router-link>
          <div class="codes-toggle">
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
        <nav v-if="portalMode !== 'home'" class="nav-rail" aria-label="School portal navigation">
          <button class="nav-item" type="button" @click="portalMode = 'home'" :class="{ active: portalMode === 'home' }">
            <div class="nav-icon">
              <img v-if="homeIconUrl" :src="homeIconUrl" alt="" class="nav-icon-img" />
              <div v-else class="nav-icon-fallback" aria-hidden="true">⌂</div>
            </div>
            <div class="nav-label">Home</div>
          </button>

          <button class="nav-item" type="button" @click="openProvidersPanel" :class="{ active: portalMode === 'providers' }">
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

          <button class="nav-item" type="button" @click="openDaysPanel" :class="{ active: portalMode === 'days' }">
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

          <button class="nav-item" type="button" @click="portalMode = 'roster'" :class="{ active: portalMode === 'roster' }">
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

          <button class="nav-item" type="button" @click="portalMode = 'skills'" :class="{ active: portalMode === 'skills' }">
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

          <button class="nav-item" type="button" @click="portalMode = 'school_staff'" :class="{ active: portalMode === 'school_staff' }">
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

          <button class="nav-item" type="button" @click="showHelpDesk = true">
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
          <div v-if="portalMode === 'days'" class="days-daybar-center">
            <SchoolDayBar
              v-model="store.selectedWeekday"
              :days="store.days"
            />
          </div>
          <div v-if="portalMode === 'home'" class="home">
        <div class="home-snapshot">
          <div class="home-snapshot-title">At a glance</div>
          <div class="home-snapshot-grid">
            <div class="home-pill">
              <div class="home-pill-k">{{ atGlance.days }}</div>
              <div class="home-pill-v">Days supported</div>
            </div>
            <div class="home-pill">
              <div class="home-pill-k">{{ atGlance.clients }}</div>
              <div class="home-pill-v">Clients being seen</div>
            </div>
            <div class="home-pill">
              <div class="home-pill-k">{{ atGlance.slots }}</div>
              <div class="home-pill-v">Slots available</div>
            </div>
            <div class="home-pill">
              <div class="home-pill-k">{{ atGlance.pending }}</div>
              <div class="home-pill-v">Pending clients</div>
            </div>
            <div class="home-pill">
              <div class="home-pill-k">{{ atGlance.waitlist }}</div>
              <div class="home-pill-v">Waitlist clients</div>
            </div>
            <div class="home-pill">
              <div class="home-pill-k">{{ atGlance.staff }}</div>
              <div class="home-pill-v">School staff users</div>
            </div>
          </div>
        </div>

        <div class="dashboard-card-grid">
          <button class="dash-card" type="button" @click="openProvidersPanel">
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

          <button class="dash-card" type="button" @click="openDaysPanel">
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

          <button class="dash-card dash-card-default-roster" type="button" @click="scrollToHomeRoster">
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

          <button class="dash-card" type="button" @click="portalMode = 'skills'">
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

          <button class="dash-card" type="button" @click="portalMode = 'school_staff'">
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

          <button class="dash-card" type="button" @click="showHelpDesk = true">
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

          <button class="dash-card dash-card-coming-soon" type="button" @click="openComingSoon('parent_qr')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('parent_qr', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('parent_qr', cardIconOrg)"
                alt="Parent QR code icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">QR</div>
            </div>
            <div class="dash-card-title">Parent QR code</div>
            <div class="dash-card-desc">Share a QR code for parent intake / forms.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Coming soon</span>
            </div>
          </button>

          <button class="dash-card dash-card-coming-soon" type="button" @click="openComingSoon('parent_sign')">
            <div class="dash-card-icon">
              <img
                v-if="brandingStore.getSchoolPortalCardIconUrl('parent_sign', cardIconOrg)"
                :src="brandingStore.getSchoolPortalCardIconUrl('parent_sign', cardIconOrg)"
                alt="Parent fill and sign icon"
                class="dash-card-icon-img"
              />
              <div v-else class="dash-card-icon-fallback" aria-hidden="true">SGN</div>
            </div>
            <div class="dash-card-title">Parent fill + sign</div>
            <div class="dash-card-desc">Have a parent complete and sign required packets.</div>
            <div class="dash-card-meta">
              <span class="dash-card-cta">Coming soon</span>
            </div>
          </button>

          <button class="dash-card dash-card-coming-soon" type="button" @click="openComingSoon('packet_upload')">
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
              <span class="dash-card-cta">Coming soon</span>
            </div>
          </button>
        </div>

        <div ref="homeRosterEl" class="home-roster">
          <div class="roster-header">
            <h2 style="margin: 0;">{{ isProvider ? 'My roster' : 'School roster' }}</h2>
            <div class="muted">{{ isProvider ? 'My assigned clients (restricted fields)' : 'Assigned + unassigned (restricted fields)' }}</div>
          </div>
          <ClientListGrid
            v-if="organizationId"
            :organization-slug="organizationSlug"
            :organization-id="organizationId"
            :roster-scope="isProvider ? 'provider' : 'school'"
            :client-label-mode="clientLabelMode"
            edit-mode="inline"
            :show-search="true"
            search-placeholder="Search roster…"
            @edit-client="openAdminClientEditor"
          />
          <div v-else class="empty-state">Organization not loaded.</div>
        </div>
          </div>

          <div v-else-if="portalMode === 'days'">
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
          @add-day="handleAddDay"
          @add-provider="handleAddProvider"
          @open-client="openClient"
          @save-slots="handleSaveSlots"
          @move-slot="handleMoveSlot"
          @open-provider="goToProviderSchoolProfile"
        />
        <div v-else class="empty-state">Organization not loaded.</div>
          </div>

          <div v-else-if="portalMode === 'providers'">
        <ProvidersDirectoryPanel
          v-if="organizationId"
          :providers="store.eligibleProviders"
          :loading="store.eligibleProvidersLoading"
          @open-provider="goToProviderSchoolProfile"
          @message-provider="messageProvider"
        />
          </div>

      <SkillsGroupsPanel
        v-else-if="portalMode === 'skills' && organizationId"
        :organization-id="organizationId"
        :client-label-mode="clientLabelMode"
      />

          <div v-else-if="portalMode === 'school_staff'">
        <div v-if="!organizationId" class="empty-state">Organization not loaded.</div>
        <SchoolStaffPanel
          v-else
          :school-organization-id="organizationId"
          :school-name="organizationName"
        />
          </div>

          <div v-else-if="portalMode === 'roster'" class="roster">
        <div class="roster-header">
          <h2 style="margin: 0;">{{ isProvider ? 'My roster' : 'School roster' }}</h2>
          <div class="muted">{{ isProvider ? 'My assigned clients (restricted fields)' : 'Assigned + unassigned (restricted fields)' }}</div>
        </div>
        <ClientListGrid
          v-if="organizationId"
          :organization-slug="organizationSlug"
          :organization-id="organizationId"
          :roster-scope="isProvider ? 'provider' : 'school'"
          :client-label-mode="clientLabelMode"
          edit-mode="inline"
          @edit-client="openAdminClientEditor"
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
      @close="selectedClient = null"
    />

    <ClientDetailPanel
      v-if="adminSelectedClient"
      :client="adminSelectedClient"
      @close="closeAdminClientEditor"
      @updated="handleAdminClientUpdated"
    />

    <SchoolHelpDeskModal
      v-if="showHelpDesk && organizationId"
      :schoolOrganizationId="organizationId"
      @close="showHelpDesk = false"
    />

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

    <div v-if="showSchoolSettings" class="settings-drawer-overlay" @click.self="showSchoolSettings = false">
      <div class="settings-drawer" @click.stop>
        <div class="settings-drawer-header">
          <strong>School settings</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="showSchoolSettings = false">Close</button>
        </div>
        <div class="settings-drawer-body">
          <SettingsModal
            embedded
            :disable-route-sync="true"
            :lock-agency-context="true"
            :initial-agency-id="affiliatedAgencyId"
            initial-category-id="workflow"
            initial-item-id="school-settings"
            :initial-school-id="organizationId"
          />
        </div>
      </div>
    </div>

    <!-- Providers are now shown in-page via ProvidersDirectoryPanel -->
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import ClientListGrid from '../../components/school/ClientListGrid.vue';
import SchoolHelpDeskModal from '../../components/school/SchoolHelpDeskModal.vue';
import SchoolDayBar from '../../components/school/redesign/SchoolDayBar.vue';
import DayPanel from '../../components/school/redesign/DayPanel.vue';
import ClientModal from '../../components/school/redesign/ClientModal.vue';
import SkillsGroupsPanel from '../../components/school/redesign/SkillsGroupsPanel.vue';
import ProvidersDirectoryPanel from '../../components/school/redesign/ProvidersDirectoryPanel.vue';
import SchoolStaffPanel from '../../components/school/redesign/SchoolStaffPanel.vue';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';
import SettingsModal from '../../components/admin/SettingsModal.vue';
import { useSchoolPortalRedesignStore } from '../../store/schoolPortalRedesign';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const store = useSchoolPortalRedesignStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();

const showHelpDesk = ref(false);
const comingSoonKey = ref(''); // 'parent_qr' | 'parent_sign' | 'packet_upload'
const showSchoolSettings = ref(false);
const affiliatedAgencyId = ref(null);

const openComingSoon = (key) => {
  comingSoonKey.value = String(key || '');
};

const comingSoonTitle = computed(() => {
  const k = String(comingSoonKey.value || '');
  if (k === 'parent_qr') return 'Parent QR code (Coming soon)';
  if (k === 'parent_sign') return 'Parent fill + sign (Coming soon)';
  if (k === 'packet_upload') return 'Upload packet (Coming soon)';
  return 'Coming soon';
});
const selectedClient = ref(null);
const portalMode = ref('home'); // home | providers | days | roster | skills | school_staff
const adminSelectedClient = ref(null);
const adminClientLoading = ref(false);
const cardIconOrg = ref(null); // affiliated agency record (for School Portal card icon overrides)

const requestedPortalMode = computed(() => String(route.query?.sp || '').trim().toLowerCase());

const applyRequestedPortalMode = async (mode) => {
  const m = String(mode || '').trim().toLowerCase();
  if (!m) return;
  if (m === portalMode.value) return;

  if (m === 'providers') {
    await openProvidersPanel();
    return;
  }
  if (m === 'days') {
    await openDaysPanel();
    return;
  }
  if (m === 'home') {
    portalMode.value = 'home';
    return;
  }
  // fall back to direct set for other known modes
  if (['roster', 'skills', 'school_staff'].includes(m)) {
    portalMode.value = m;
  }
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

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isProvider = computed(() => roleNorm.value === 'provider');
const isSchoolStaff = computed(() => roleNorm.value === 'school_staff');
const canBackToSchools = computed(() => ['super_admin', 'admin', 'staff'].includes(roleNorm.value));

const settingsIconUrl = computed(() => {
  return brandingStore.getAdminQuickActionIconUrl('settings', cardIconOrg.value || null);
});

const canShowSchoolSettingsButton = computed(() => {
  if (!['super_admin', 'admin', 'staff'].includes(roleNorm.value)) return false;
  const affId = affiliatedAgencyId.value ? Number(affiliatedAgencyId.value) : null;
  if (!affId) return false;
  if (roleNorm.value === 'super_admin') return true;
  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  return list.some((a) => Number(a?.id) === Number(affId));
});

const ensureAffiliation = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/school-portal/${organizationId.value}/affiliation`);
    const active = r?.data?.active_agency_id ?? null;
    affiliatedAgencyId.value = active ? Number(active) : null;

    // Best-effort: load full affiliated agency record for icon overrides (cards + settings icon).
    if (affiliatedAgencyId.value) {
      const a = await api.get(`/agencies/${affiliatedAgencyId.value}`);
      cardIconOrg.value = a.data || null;
    } else {
      cardIconOrg.value = null;
    }
  } catch {
    affiliatedAgencyId.value = null;
    cardIconOrg.value = null;
  }
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

const openProvidersPanel = async () => {
  portalMode.value = 'providers';
  if (!Array.isArray(store.eligibleProviders) || store.eligibleProviders.length === 0) {
    await store.fetchEligibleProviders();
  }
};

const openDaysPanel = async () => {
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

const openClient = (client) => {
  selectedClient.value = client;
};

const openAdminClientEditor = async (client) => {
  if (!client?.id) return;
  adminClientLoading.value = true;
  try {
    const r = await api.get(`/clients/${client.id}`);
    adminSelectedClient.value = r.data || null;
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
};

const handleAdminClientUpdated = (payload) => {
  if (payload?.client) {
    adminSelectedClient.value = payload.client;
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
  // Load organization context if not already loaded
  if (organizationSlug.value && !organizationStore.currentOrganization) {
    await organizationStore.fetchBySlug(organizationSlug.value);
  }
  if (organizationId.value) {
    store.reset();
    store.setSchoolId(organizationId.value);
    // Default portal mode (query param overrides provider default).
    if (isSchoolStaff.value) {
      portalMode.value = 'home';
    } else if (requestedPortalMode.value) {
      await applyRequestedPortalMode(requestedPortalMode.value);
    }
    await store.fetchDays();
    await store.fetchPortalStats();
    // Preload provider list so home has useful info immediately.
    await store.fetchEligibleProviders();
    if (portalMode.value === 'days' && store.selectedWeekday) await loadForDay(store.selectedWeekday);
  }

  // Best-effort: resolve active affiliated agency for icon overrides + settings button.
  await ensureAffiliation();
});

watch(organizationId, async (id) => {
  if (!id) return;
  store.reset();
  store.setSchoolId(id);
  if (isSchoolStaff.value) {
    portalMode.value = 'home';
  } else if (requestedPortalMode.value) {
    await applyRequestedPortalMode(requestedPortalMode.value);
  }
  await store.fetchDays();
  await store.fetchPortalStats();
  await store.fetchEligibleProviders();
  if (portalMode.value === 'days' && store.selectedWeekday) await loadForDay(store.selectedWeekday);

  await ensureAffiliation();
});

watch(
  () => requestedPortalMode.value,
  async (mode) => {
    if (!mode) return;
    if (isSchoolStaff.value) return;
    await applyRequestedPortalMode(mode);
  }
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
.home-pill-k {
  font-weight: 900;
  color: var(--text-primary);
  font-size: 13px;
}
.home-pill-v {
  margin-top: 0;
  color: var(--text-secondary);
  font-size: 12px;
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

.settings-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.55);
  display: flex;
  justify-content: flex-end;
  z-index: 2500;
}
.settings-drawer {
  height: 100%;
  width: min(1100px, 96vw);
  background: var(--bg);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.25);
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
</style>
