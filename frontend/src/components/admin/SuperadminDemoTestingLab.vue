<template>
  <section class="demo-lab" aria-label="Demo Testing Lab">
    <header class="demo-lab__header">
      <div>
        <div class="demo-lab__eyebrow">Superadmin only</div>
        <h2 class="demo-lab__title">Demo Testing Lab</h2>
        <p class="demo-lab__sub">
          Launch isolated browser windows for demo tenants without leaving your Platform session.
          Each window uses a window-scoped token so your superadmin cookie stays intact.
        </p>
      </div>
      <button type="button" class="demo-lab__refresh" :disabled="loading" @click="loadTenants">
        {{ loading ? 'Refreshing…' : 'Refresh tenants' }}
      </button>
    </header>

    <p v-if="error" class="demo-lab__error">{{ error }}</p>

    <div class="demo-lab__grid">
      <article v-for="group in surfaceGroups" :key="group.id" class="demo-lab__card">
        <div class="demo-lab__card-top">
          <div class="demo-lab__badge" :data-kind="group.kind">{{ group.kindLabel }}</div>
          <h3>{{ group.title }}</h3>
          <p class="demo-lab__tenant">
            <template v-if="group.tenant">
              {{ group.tenant.name }}
              <span class="slug">{{ group.tenant.slug || group.tenant.portal_url }}</span>
            </template>
            <template v-else>
              <span class="missing">No matching tenant found</span>
              <span class="hint">{{ group.missingHint }}</span>
            </template>
          </p>
        </div>

        <div class="demo-lab__actions">
          <button
            v-for="action in group.actions"
            :key="action.id"
            type="button"
            class="demo-lab__btn"
            :class="action.variant"
            :disabled="!group.tenant || launchingId === action.id"
            @click="launch(group, action)"
          >
            <span class="btn-label">{{ action.label }}</span>
            <span class="btn-meta">{{ action.meta }}</span>
          </button>
        </div>

        <div class="demo-lab__footer-row">
          <button
            v-if="group.tenant"
            type="button"
            class="demo-lab__link"
            @click="openPreview(group, 'admin')"
          >
            Preview as Superadmin (same role) ↗
          </button>
          <button
            v-if="group.tenant && group.clientPreview"
            type="button"
            class="demo-lab__link"
            @click="openPreview(group, 'client')"
          >
            Client shell preview ↗
          </button>
        </div>

        <div v-if="group.tenant && group.publicPages?.length" class="demo-lab__public">
          <div class="demo-lab__public-label">Public booking pages</div>
          <div class="demo-lab__public-links">
            <button
              v-for="page in group.publicPages"
              :key="page.id"
              type="button"
              class="demo-lab__public-btn"
              @click="openPublicPage(group, page)"
            >
              {{ page.label }}
            </button>
          </div>
          <p class="demo-lab__public-hint">
            Opens in this browser session — use Edit on the page (superadmin) or Public Services settings.
          </p>
        </div>
      </article>
    </div>

    <p v-if="lastLaunch" class="demo-lab__toast">{{ lastLaunch }}</p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { encodeDemoLaunchHash } from '../../utils/demoWindowSession';
import { isPractitionerOrgType } from '../../utils/practitionerVertical.js';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const tenants = ref([]);
const launchingId = ref('');
const lastLaunch = ref('');

const isLikelyDemoTenant = (t) => {
  const hay = [t?.name, t?.official_name, t?.slug, t?.portal_url]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return ['demo', 'fake', 'sandbox', 'training', 'sample', 'test'].some((k) => hay.includes(k));
};

const findTenant = (predicate) => {
  const list = Array.isArray(tenants.value) ? tenants.value : [];
  return list.find(predicate) || null;
};

const surfaceGroups = computed(() => {
  const demoItsco = findTenant((t) => {
    const s = String(t.slug || t.portal_url || '').toLowerCase();
    const n = String(t.name || '').toLowerCase();
    return (s.includes('itsco') && isLikelyDemoTenant(t)) || n.includes('demo itsco');
  }) || findTenant((t) => String(t.slug || '').toLowerCase().includes('itsco-demo'));

  const demoTutor = findTenant((t) => {
    const org = String(t.organization_type || '').toLowerCase();
    const hay = `${t.name || ''} ${t.slug || ''} ${t.portal_url || ''}`.toLowerCase();
    return (org === 'learning' && isLikelyDemoTenant(t)) || /demo.*tutor|tutor.*demo|demo.*learning/.test(hay);
  });

  const demoConsultant = findTenant((t) => {
    const s = String(t.slug || t.portal_url || '').toLowerCase();
    return s === 'demo-consulting' || s.includes('demo-consult');
  }) || findTenant((t) => {
    const org = String(t.organization_type || '').toLowerCase();
    const hay = `${t.name || ''} ${t.slug || ''}`.toLowerCase();
    return org === 'consultant' && isLikelyDemoTenant(t) && /consult/.test(hay);
  });

  const demoLifeCoach = findTenant((t) => {
    const s = String(t.slug || t.portal_url || '').toLowerCase();
    return s === 'demo-life-coach' || s.includes('demo-life-coach');
  }) || findTenant((t) => {
    const org = String(t.organization_type || '').toLowerCase();
    const hay = `${t.name || ''} ${t.slug || ''}`.toLowerCase();
    return org === 'life_coach' && isLikelyDemoTenant(t);
  });

  return [
    {
      id: 'demo_itsco',
      kind: 'agency',
      kindLabel: 'Healthcare demo',
      title: 'Demo ITSCO',
      tenant: demoItsco,
      missingHint: 'Seed with seed-demo-tenant --source-slug itsco',
      actions: [
        { id: 'itsco_employee', label: 'Employee / Provider', meta: 'New window · provider', role: 'provider', pathSuffix: 'dashboard', variant: 'primary' },
        { id: 'itsco_provider_plus', label: 'Provider+', meta: 'New window · provider_plus', role: 'provider_plus', pathSuffix: 'dashboard', variant: 'ghost' },
        { id: 'itsco_staff', label: 'Staff', meta: 'New window · staff', role: 'staff', pathSuffix: 'dashboard', variant: 'ghost' },
        { id: 'itsco_admin', label: 'Admin', meta: 'New window · admin', role: 'admin', pathSuffix: 'admin', variant: 'ghost' }
      ],
      publicPages: [
        { id: 'hub', label: 'Services hub', pathSuffix: 'services' },
        { id: 'counselor', label: 'Find counselor (team)', pathSuffix: 'find-counselor' },
        { id: 'settings', label: 'Public Services settings', pathSuffix: 'admin/public-services' }
      ]
    },
    {
      id: 'demo_tutoring',
      kind: 'learning',
      kindLabel: 'Tutoring demo',
      title: 'DEMO Tutoring',
      tenant: demoTutor,
      missingHint: 'Create a demo learning tenant (name/slug includes demo + tutor/learning)',
      actions: [
        { id: 'tutor_provider', label: 'Tutor', meta: 'New window · provider', role: 'provider', pathSuffix: 'dashboard', variant: 'primary' },
        { id: 'tutor_admin', label: 'Learning Admin', meta: 'New window · admin', role: 'admin', pathSuffix: 'admin', variant: 'ghost' }
      ],
      publicPages: [
        { id: 'hub', label: 'Services hub', pathSuffix: 'services' },
        { id: 'tutor', label: 'Find tutor (team)', pathSuffix: 'find-tutor' },
        { id: 'settings', label: 'Public Services settings', pathSuffix: 'admin/public-services' }
      ]
    },
    {
      id: 'demo_consulting',
      kind: 'consultant',
      kindLabel: 'Consultant',
      title: 'DEMO Consulting',
      tenant: demoConsultant,
      missingHint: 'Run migration 904 (demo-consulting) or create consultant org in Organization Management',
      clientPreview: true,
      actions: [
        { id: 'consultant_owner', label: 'Consultant', meta: 'New window · admin shell', role: 'admin', pathSuffix: 'dashboard', variant: 'primary' },
        { id: 'consultant_provider', label: 'Practitioner', meta: 'New window · provider', role: 'provider', pathSuffix: 'dashboard', variant: 'ghost' }
      ],
      publicPages: [
        { id: 'book', label: 'Book consulting (solo)', pathSuffix: 'find-consultant' },
        { id: 'settings', label: 'Public Services settings', pathSuffix: 'admin/public-services' }
      ]
    },
    {
      id: 'demo_life_coach',
      kind: 'life_coach',
      kindLabel: 'Life Coach',
      title: 'DEMO Life Coach',
      tenant: demoLifeCoach,
      missingHint: 'Run migration 904 (demo-life-coach) or create life_coach org in Organization Management',
      clientPreview: true,
      actions: [
        { id: 'coach_owner', label: 'Life Coach', meta: 'New window · admin shell', role: 'admin', pathSuffix: 'dashboard', variant: 'primary' },
        { id: 'coach_provider', label: 'Practitioner', meta: 'New window · provider', role: 'provider', pathSuffix: 'dashboard', variant: 'ghost' }
      ],
      publicPages: [
        { id: 'book', label: 'Book coaching (solo)', pathSuffix: 'find-coach' },
        { id: 'settings', label: 'Public Services settings', pathSuffix: 'admin/public-services' },
        { id: 'lbw', label: 'Life Balance (public)', pathSuffix: 'life-balance', absolute: true },
        { id: 'values', label: 'Values Alignment (public)', pathSuffix: 'values-alignment', absolute: true },
        { id: 'readiness', label: 'Athlete Readiness (public)', pathSuffix: 'athlete-readiness', absolute: true },
        { id: 'student', label: 'Student Success (public)', pathSuffix: 'student-success', absolute: true },
        { id: 'college', label: 'College Readiness (public)', pathSuffix: 'college-readiness', absolute: true },
        { id: 'relationship', label: 'Relationship Health (public)', pathSuffix: 'relationship-health', absolute: true }
      ]
    }
  ];
});

const slugOf = (tenant) => String(tenant?.slug || tenant?.portal_url || '').trim();

const loadTenants = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get('/agencies');
    const list = Array.isArray(response.data) ? response.data : (response.data?.agencies || []);
    // Prefer root-ish tenants for demos (agency / practitioner / learning)
    tenants.value = list.filter((t) => {
      const org = String(t.organization_type || 'agency').toLowerCase();
      return (
        org === 'agency' ||
        org === 'learning' ||
        isPractitionerOrgType(org) ||
        isLikelyDemoTenant(t)
      );
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load tenants for demo lab';
  } finally {
    loading.value = false;
  }
};

const buildTargetPath = (tenant, pathSuffix) => {
  const slug = slugOf(tenant);
  if (!slug) return `/${pathSuffix}`;
  return `/${slug}/${pathSuffix}`.replace(/\/+/g, '/');
};

const launch = async (group, action) => {
  if (!group?.tenant || !action) return;
  launchingId.value = action.id;
  lastLaunch.value = '';
  error.value = '';
  try {
    const targetPath = buildTargetPath(group.tenant, action.pathSuffix);
    const { data } = await api.post('/auth/demo/launch-window', {
      role: action.role,
      agencyId: Number(group.tenant.id),
      surface: action.id,
      targetPath
    });
    const hash = encodeDemoLaunchHash({
      token: data.token,
      user: data.user,
      selectedAgency: data.selectedAgency,
      targetPath: data.targetPath || targetPath
    });
    const href = `${window.location.origin}/demo-launch${hash}`;
    const win = window.open(href, `pt-demo-${action.id}-${group.tenant.id}`, 'noopener,noreferrer');
    if (!win) {
      error.value = 'Popup blocked — allow popups for this site to open demo windows.';
      return;
    }
    lastLaunch.value = `Opened ${action.label} for ${group.tenant.name} in a new window.`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to launch demo window';
  } finally {
    launchingId.value = '';
  }
};

const openPreview = (group, mode) => {
  const tenant = group?.tenant;
  if (!tenant) return;
  const slug = slugOf(tenant);
  if (!slug) return;
  const path = mode === 'client' ? `/${slug}/client-dashboard` : `/${slug}/dashboard`;
  const href = router.resolve({
    path,
    query: {
      previewMode: 'superadmin',
      previewAgencyId: String(tenant.id)
    }
  }).href;
  window.open(href, `pt-preview-${mode}-${tenant.id}`, 'noopener,noreferrer');
  lastLaunch.value = `Opened superadmin preview (${mode}) for ${tenant.name}.`;
};

const openPublicPage = (group, page) => {
  const tenant = group?.tenant;
  if (!page?.pathSuffix) return;
  // Platform-level absolute paths (guest assessments) do not need a tenant slug
  if (page.absolute || !tenant) {
    const href = router.resolve({ path: `/${page.pathSuffix}`.replace(/\/+/g, '/') }).href;
    window.open(href, `pt-public-${page.id}`, 'noopener,noreferrer');
    lastLaunch.value = `Opened ${page.label}.`;
    return;
  }
  const slug = slugOf(tenant);
  if (!slug) return;
  const path = `/${slug}/${page.pathSuffix}`.replace(/\/+/g, '/');
  const href = router.resolve({ path }).href;
  window.open(href, `pt-public-${page.id}-${tenant.id}`, 'noopener,noreferrer');
  lastLaunch.value = `Opened ${page.label} for ${tenant.name}.`;
};

onMounted(loadTenants);
</script>

<style scoped>
.demo-lab {
  margin: 0 0 1.75rem;
  padding: 1.25rem 1.35rem 1.4rem;
  border-radius: 18px;
  background:
    radial-gradient(900px 280px at 0% 0%, rgba(56, 189, 248, 0.18), transparent 55%),
    radial-gradient(700px 260px at 100% 0%, rgba(168, 85, 247, 0.16), transparent 50%),
    linear-gradient(180deg, #0b1220, #111827);
  color: #e5e7eb;
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.35);
}
.demo-lab__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.1rem;
}
.demo-lab__eyebrow {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7dd3fc;
  font-weight: 700;
}
.demo-lab__title {
  margin: 0.2rem 0 0.35rem;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}
.demo-lab__sub {
  margin: 0;
  max-width: 62ch;
  color: #94a3b8;
  font-size: 0.88rem;
  line-height: 1.45;
}
.demo-lab__refresh {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.55);
  color: #e2e8f0;
  border-radius: 999px;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  white-space: nowrap;
}
.demo-lab__refresh:disabled {
  opacity: 0.6;
  cursor: wait;
}
.demo-lab__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}
.demo-lab__card {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.demo-lab__badge {
  display: inline-flex;
  width: fit-content;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
  margin-bottom: 0.35rem;
}
.demo-lab__badge[data-kind='consultant'] {
  background: rgba(167, 139, 250, 0.18);
  color: #c4b5fd;
}
.demo-lab__badge[data-kind='life_coach'] {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}
.demo-lab__badge[data-kind='learning'] {
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}
.demo-lab__card h3 {
  margin: 0;
  font-size: 1.05rem;
}
.demo-lab__tenant {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.demo-lab__tenant .slug {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #64748b;
}
.demo-lab__tenant .missing {
  color: #fca5a5;
}
.demo-lab__tenant .hint {
  color: #64748b;
  font-size: 0.75rem;
}
.demo-lab__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.demo-lab__btn {
  text-align: left;
  border: 0;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  background: rgba(30, 41, 59, 0.95);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.demo-lab__btn.primary {
  background: linear-gradient(135deg, #0284c7, #7c3aed);
  border-color: transparent;
}
.demo-lab__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-label {
  font-weight: 700;
  font-size: 0.86rem;
}
.btn-meta {
  font-size: 0.7rem;
  opacity: 0.8;
}
.demo-lab__footer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}
.demo-lab__public {
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  padding-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.demo-lab__public-label {
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: #94a3b8;
}
.demo-lab__public-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.demo-lab__public-btn {
  border: 1px solid rgba(125, 211, 252, 0.35);
  background: rgba(14, 165, 233, 0.12);
  color: #bae6fd;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
}
.demo-lab__public-btn:hover {
  background: rgba(14, 165, 233, 0.22);
}
.demo-lab__public-hint {
  margin: 0;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.35;
}
.demo-lab__link {
  background: transparent;
  border: 0;
  color: #7dd3fc;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.demo-lab__error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 10px;
  padding: 0.65rem 0.8rem;
  margin: 0 0 0.85rem;
  font-size: 0.85rem;
}
.demo-lab__toast {
  margin: 0.85rem 0 0;
  color: #86efac;
  font-size: 0.82rem;
}
@media (max-width: 960px) {
  .demo-lab__grid,
  .demo-lab__actions {
    grid-template-columns: 1fr;
  }
  .demo-lab__header {
    flex-direction: column;
  }
}
</style>
