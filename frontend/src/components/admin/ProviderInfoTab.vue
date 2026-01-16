<template>
  <div class="provider-info-tab">
    <div class="tab-header">
      <div>
        <h2 style="margin: 0;">Provider Info</h2>
        <p class="subtitle">Provider onboarding/profile fields captured directly into the user’s file.</p>
      </div>

      <div class="header-actions">
        <button class="btn btn-secondary" @click="refresh" :disabled="loading || installing">
          Refresh
        </button>
        <button class="btn btn-primary" @click="saveAll" :disabled="saving || loading || installing || providerFields.length === 0">
          {{ saving ? 'Saving...' : 'Save Provider Info' }}
        </button>
      </div>
    </div>

    <div v-if="installError" class="error" style="margin-bottom: 12px;">{{ installError }}</div>
    <div v-if="saveError" class="error" style="margin-bottom: 12px;">{{ saveError }}</div>
    <div v-if="saveSuccess" class="success" style="margin-bottom: 12px;">{{ saveSuccess }}</div>

    <div class="install-card" v-if="showInstallCard">
      <div class="install-card-header">
        <div>
          <h3 style="margin: 0;">Install Provider Onboarding Modules</h3>
          <p class="subtitle" style="margin-top: 6px;">
            This will create the Provider Info categories/fields and create the corresponding Form modules so they can be assigned like any other module.
          </p>
        </div>
        <button class="btn btn-primary" @click="installTemplate" :disabled="installing">
          {{ installing ? 'Installing...' : 'Install Template' }}
        </button>
      </div>
      <div v-if="installSuccess" class="success">{{ installSuccess }}</div>
      <div class="small-note">
        Target agency: <strong>{{ targetAgency?.name || 'Unknown' }}</strong>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading provider info…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else>
      <div v-if="providerFields.length === 0" class="empty-state">
        <p style="margin: 0;">No Provider Info fields found for this user yet.</p>
        <p style="margin: 8px 0 0 0; color: var(--text-secondary);">
          If you want these created automatically, click “Install Template” above.
        </p>
      </div>

      <div v-else class="sections">
        <div v-for="section in providerSections" :key="section.key" class="section">
          <div class="section-title">
            <h3 style="margin: 0;">{{ section.label }}</h3>
          </div>

          <div class="fields-grid">
            <div v-for="field in section.fields" :key="field.id" class="field-item">
              <label :for="`provider-field-${field.id}`">
                {{ field.field_label }}
                <span v-if="field.is_required" class="required-asterisk">*</span>
              </label>

              <input
                v-if="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
                :id="`provider-field-${field.id}`"
                :type="field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
              />

              <input
                v-else-if="field.field_type === 'number'"
                :id="`provider-field-${field.id}`"
                type="number"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
              />

              <input
                v-else-if="field.field_type === 'date'"
                :id="`provider-field-${field.id}`"
                type="date"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
              />

              <textarea
                v-else-if="field.field_type === 'textarea'"
                :id="`provider-field-${field.id}`"
                v-model="fieldValues[field.id]"
                rows="4"
                :required="field.is_required"
              ></textarea>

              <select
                v-else-if="field.field_type === 'select'"
                :id="`provider-field-${field.id}`"
                v-model="fieldValues[field.id]"
                :required="field.is_required"
              >
                <option value="">Select an option</option>
                <option v-for="option in (field.options || [])" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>

              <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
                <label v-for="option in (field.options || [])" :key="option" class="multi-select-option">
                  <input
                    type="checkbox"
                    :checked="Array.isArray(fieldValues[field.id]) ? fieldValues[field.id].includes(option) : false"
                    @change="toggleMultiSelect(field.id, option)"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>

              <div v-else-if="field.field_type === 'boolean'" class="checkbox-wrapper">
                <input
                  :id="`provider-field-${field.id}`"
                  type="checkbox"
                  :checked="fieldValues[field.id] === 'true' || fieldValues[field.id] === true"
                  @change="fieldValues[field.id] = $event.target.checked ? 'true' : 'false'"
                />
                <label :for="`provider-field-${field.id}`" class="checkbox-label">Yes</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: Number, required: true }
});

const loading = ref(true);
const error = ref('');
const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref('');

const installing = ref(false);
const installError = ref('');
const installSuccess = ref('');

const categories = ref([]);
const allFields = ref([]);
const fieldValues = ref({});
const userAgencies = ref([]);

const PROVIDER_CATEGORY_ORDER = [
  { key: 'provider_identity_npi', label: 'Identity & NPI Setup' },
  { key: 'provider_position_role', label: 'Position & Role' },
  { key: 'provider_work_schedule', label: 'Work Schedule' },
  { key: 'provider_counseling_profile_general', label: 'Counseling Profile (General)' },
  { key: 'provider_clinical_credentialing', label: 'Clinical Credentialing' },
  { key: 'provider_external_marketing_profile', label: 'External Marketing Profile (Psychology Today)' },
  { key: 'provider_culture_bio', label: 'Culture & Bio (Getting to Know You)' }
];

const normalizeMultiSelectValue = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

const toggleMultiSelect = (fieldId, option) => {
  const current = normalizeMultiSelectValue(fieldValues.value[fieldId]);
  const exists = current.includes(option);
  const next = exists ? current.filter((x) => x !== option) : [...current, option];
  fieldValues.value[fieldId] = next;
};

const targetAgency = computed(() => {
  // Prefer a real agency org if present; otherwise use first org.
  const agencies = (userAgencies.value || []).filter((o) => (o.organization_type || '').toLowerCase() === 'agency');
  return agencies[0] || userAgencies.value?.[0] || null;
});

const providerFields = computed(() => {
  return (allFields.value || []).filter((f) => (f.category_key || '').startsWith('provider_') || (f.field_key || '').startsWith('provider_'));
});

const providerSections = computed(() => {
  const byCat = new Map();
  (providerFields.value || []).forEach((f) => {
    const key = f.category_key || '__uncategorized';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(f);
  });

  // Stable order: our known order first, then leftovers.
  const catLabelByKey = new Map((categories.value || []).map((c) => [c.category_key, c.category_label]));

  const sections = [];
  for (const c of PROVIDER_CATEGORY_ORDER) {
    const fields = byCat.get(c.key) || [];
    if (fields.length === 0) continue;
    sections.push({
      key: c.key,
      label: catLabelByKey.get(c.key) || c.label,
      fields: fields.slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    });
  }

  // Add any provider_* category not in the hard-coded list
  const used = new Set(sections.map((s) => s.key));
  for (const [key, fields] of byCat.entries()) {
    if (!key.startsWith('provider_')) continue;
    if (used.has(key)) continue;
    sections.push({
      key,
      label: catLabelByKey.get(key) || key,
      fields: fields.slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    });
  }
  return sections;
});

const showInstallCard = computed(() => {
  return providerFields.value.length === 0 || (providerSections.value.length > 0 && providerFields.value.length < 5);
});

const refresh = async () => {
  try {
    loading.value = true;
    error.value = '';
    saveError.value = '';
    saveSuccess.value = '';
    installError.value = '';
    installSuccess.value = '';

    const [infoRes, catsRes, agenciesRes] = await Promise.all([
      api.get(`/users/${props.userId}/user-info`),
      api.get('/user-info-categories'),
      api.get(`/users/${props.userId}/agencies`)
    ]);

    allFields.value = infoRes.data || [];
    categories.value = catsRes.data || [];
    userAgencies.value = agenciesRes.data || [];

    const values = {};
    (allFields.value || []).forEach((f) => {
      if (f.field_type === 'multi_select') {
        values[f.id] = normalizeMultiSelectValue(f.value);
      } else {
        values[f.id] = f.value ?? '';
      }
    });
    fieldValues.value = values;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider info';
  } finally {
    loading.value = false;
  }
};

const saveAll = async () => {
  try {
    saving.value = true;
    saveError.value = '';
    saveSuccess.value = '';

    const values = Object.keys(fieldValues.value).map((fieldId) => ({
      fieldDefinitionId: parseInt(fieldId),
      value: Array.isArray(fieldValues.value[fieldId]) ? JSON.stringify(fieldValues.value[fieldId]) : (fieldValues.value[fieldId] || null)
    }));

    await api.post(`/users/${props.userId}/user-info`, { values });
    saveSuccess.value = 'Saved Provider Info.';
    setTimeout(() => (saveSuccess.value = ''), 2500);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save Provider Info';
  } finally {
    saving.value = false;
  }
};

// ---- Template provisioning (agency-scoped) ----

const TEMPLATE = {
  categories: PROVIDER_CATEGORY_ORDER.map((c, idx) => ({
    categoryKey: c.key,
    categoryLabel: c.label,
    orderIndex: idx
  })),
  modules: [
    {
      title: 'Identity & NPI Setup',
      description: 'Collects location, research interests, and federal provider identification.',
      categoryKey: 'provider_identity_npi',
      introText:
        'Taxonomy codes (only if “No” for NPI): LPC/LPCC: 101YP2500X, MFT/MFTC: 106H00000X, LSW/LCSW: 104100000X.',
      fields: [
        { fieldKey: 'provider_identity_location', fieldLabel: 'Location Selection', fieldType: 'select' },
        { fieldKey: 'provider_identity_research_topics', fieldLabel: 'Have you conducted research? If so, what topics?', fieldType: 'textarea' },
        { fieldKey: 'provider_identity_research_interest', fieldLabel: 'Are you interested in conducting research?', fieldType: 'boolean' },
        {
          fieldKey: 'provider_identity_npi_status',
          fieldLabel: 'Do you have an NPI?',
          fieldType: 'select',
          isRequired: true,
          options: [
            'Yes',
            'No, but I have registered and will list the number below and have added ITSCO as a surrogate.',
            'Yes, I will list the number below and have added ITSCO as a surrogate.',
            'No, and ITSCO can make me one (please contact me).'
          ]
        },
        { fieldKey: 'provider_identity_npi_number', fieldLabel: 'NPI Number', fieldType: 'text' }
      ]
    },
    {
      title: 'Position & Role',
      description: 'Determines the logic flow for the rest of the profile.',
      categoryKey: 'provider_position_role',
      fields: [
        {
          fieldKey: 'provider_position_role',
          fieldLabel: 'Select your position with ITSCO',
          fieldType: 'select',
          isRequired: true,
          options: [
            "Mental Health Provider (Master's or Doctorate Level)",
            "Intern Mental Health Provider (Enrolled in Master's Level Program)",
            "Mental Health Facilitator (Primarily Skill Builders | QBHA or Bachelors Level)",
            "Mental Health Provider (Bachelor's Level with Approval for Counseling/Therapeutic Services)"
          ]
        }
      ]
    },
    {
      title: 'Work Schedule',
      description: 'Work schedule availability for onboarding and scheduling setup.',
      categoryKey: 'provider_work_schedule',
      fields: [
        {
          fieldKey: 'provider_work_schedule_notes',
          fieldLabel: 'Work Schedule (days/times available)',
          fieldType: 'textarea'
        }
      ]
    },
    {
      title: 'Counseling Profile (General)',
      description: 'General counseling approach and specialty identification.',
      categoryKey: 'provider_counseling_profile_general',
      fields: [
        { fieldKey: 'provider_counseling_ideal_client', fieldLabel: 'Imagine your ideal client. What are their issues, needs, and goals? What do they want and why?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_how_help', fieldLabel: 'How can you help your client/s? What can you offer?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_build_empathy', fieldLabel: 'How can you build empathy and invite the potential client to reach out to you?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_certifications', fieldLabel: 'Do you have any certifications?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_work_experience', fieldLabel: 'Work experience to share?', fieldType: 'textarea' },
        { fieldKey: 'provider_counseling_clients_avoid', fieldLabel: 'Are there any clients we should absolutely avoid scheduling with you?', fieldType: 'textarea' },
        {
          fieldKey: 'provider_counseling_specialties',
          fieldLabel: 'Specialties',
          fieldType: 'multi_select',
          options: [
            'ADHD',
            'Adoption',
            'Anger Management',
            'Anxiety',
            "Asperger's Syndrome",
            'Autism',
            'Behavioral Issues',
            'Bipolar Disorder',
            'Eating Disorders',
            'Education and Learning Disabilities',
            'Family Conflict',
            'Mood Disorders',
            'LGBTQ+',
            'Obesity',
            'Obsessive-Compulsive (OCD)',
            'Peer Relationships',
            'Racial Identity',
            'School Issues',
            'Self Esteem',
            'Self-Harming',
            'Sports Performance',
            'Stress',
            'Teen Violence',
            'Transgender',
            'Trauma and PTSD',
            'Traumatic Brain Injury (TBI)',
            'Video Game Addiction'
          ]
        },
        { fieldKey: 'provider_counseling_top3_specialties', fieldLabel: 'Top 3 Specialties', fieldType: 'text' }
      ]
    },
    {
      title: 'Clinical Credentialing',
      description: 'License and insurance registration details.',
      categoryKey: 'provider_clinical_credentialing',
      fields: [
        { fieldKey: 'provider_credential_license_type_number', fieldLabel: 'License Type and Number (e.g., LPCC #00154326). List states if multiple.', fieldType: 'text' },
        { fieldKey: 'provider_credential_license_issued_date', fieldLabel: 'Date License Issued', fieldType: 'date' },
        { fieldKey: 'provider_credential_license_expiration_date', fieldLabel: 'Date License Expires', fieldType: 'date' },
        { fieldKey: 'provider_credential_license_document_link', fieldLabel: 'License Document (link or note)', fieldType: 'text' },
        { fieldKey: 'provider_credential_caqh_has_account', fieldLabel: 'Do you have a CAQH account?', fieldType: 'boolean' },
        { fieldKey: 'provider_credential_caqh_provider_id', fieldLabel: 'CAQH Provider ID', fieldType: 'text' },
        { fieldKey: 'provider_credential_medicaid_location_id', fieldLabel: 'Medicaid Location ID Number (or "I don’t have a medicaid account")', fieldType: 'text' },
        { fieldKey: 'provider_credential_medicaid_revalidation_date', fieldLabel: 'Revalidation Date (if applicable)', fieldType: 'date' }
      ]
    },
    {
      title: 'External Marketing Profile (Psychology Today)',
      description: 'Data for the website bio and Psychology Today profile.',
      categoryKey: 'provider_external_marketing_profile',
      fields: [
        {
          fieldKey: 'provider_marketing_psych_today_status',
          fieldLabel: 'Psychology Today Status',
          fieldType: 'select',
          options: [
            'Yes and I have a profile already.',
            'Yes and I do not yet have a profile.',
            'No and I would prefer not to have a profile or will manage my own.'
          ]
        },
        { fieldKey: 'provider_marketing_gender', fieldLabel: 'Gender (for profile display)', fieldType: 'text' },
        { fieldKey: 'provider_marketing_ethnicity', fieldLabel: 'Ethnicity (for profile display)', fieldType: 'text' },
        { fieldKey: 'provider_marketing_ideal_client', fieldLabel: 'Ideal Client (Clinical Focus)', fieldType: 'textarea' },
        { fieldKey: 'provider_marketing_how_help', fieldLabel: 'How you help / Specialty offer', fieldType: 'textarea' },
        { fieldKey: 'provider_marketing_build_empathy', fieldLabel: 'Building Empathy (Clinical Focus)', fieldType: 'textarea' },
        { fieldKey: 'provider_marketing_top3_specialties', fieldLabel: 'Top 3 Specialties (re-confirm for this profile)', fieldType: 'text' },
        { fieldKey: 'provider_marketing_group_therapy', fieldLabel: 'Interested in leading groups? (Text/List types)', fieldType: 'textarea' },
        {
          fieldKey: 'provider_marketing_issues_specialties',
          fieldLabel: 'Issues / Specialties (Max 25)',
          fieldType: 'multi_select',
          options: [
            'Addiction','ADHD','Adoption','Alcohol Use',"Alzheimer's",'Anger Management','Antisocial Personality','Anxiety',"Asperger's Syndrome",'Autism','Behavioral Issues','Bipolar Disorder','Borderline Personality (BPD)','Career Counseling','Child','Chronic Illness','Chronic Impulsivity','Chronic Pain','Codependency','Coping Skills','Depression','Developmental Disorders','Divorce','Domestic Violence/Abuse','Drug Abuse','Eating Disorders','Education/Learning Disabilities','Family Conflict','Gambling','Grief','Hoarding','Infertility','Infidelity','Mood Disorders','LGBTQ+','Life Coaching','Life Transitions',"Men's Issues",'Narcissistic Personality (NPD)','Obesity','OCD','ODD','Parenting','Peer Relationships','Pregnancy/Prenatal/Postpartum','Racial Identity','Relationship Issues','School Issues','Self Esteem','Self-Harming','Sex Therapy','Sexual Abuse','Sexual Addiction','Sleep/Insomnia','Spirituality','Sports Performance','Stress','Substance Use','Teen Violence','Transgender','Trauma and PTSD','TBI','Video Game Addiction','Weight Loss',"Women's Issues"
          ]
        },
        {
          fieldKey: 'provider_marketing_mental_health_categories',
          fieldLabel: 'Mental Health Categories',
          fieldType: 'multi_select',
          options: ['Dissociative Disorders (DID)', 'Elderly Persons Disorders', 'Impulse Control Disorders', 'Mood Disorders', 'Personality Disorders', 'Psychosis', 'Thinking Disorders']
        },
        { fieldKey: 'provider_marketing_sexuality', fieldLabel: 'Sexuality', fieldType: 'multi_select', options: ['Bisexual', 'Lesbian', 'LGBTQ+'] },
        { fieldKey: 'provider_marketing_focus', fieldLabel: 'Focus', fieldType: 'multi_select', options: ['Couples', 'Families', 'Groups', 'Individuals'] },
        { fieldKey: 'provider_marketing_age_specialty', fieldLabel: 'Age Specialty', fieldType: 'multi_select', options: ['Toddler (0-5)', 'Children (6-10)', 'Preteen (11-13)', 'Teen (14-18)', 'Adults (18+)', 'Seniors (65+)'] },
        {
          fieldKey: 'provider_marketing_communities_allied',
          fieldLabel: 'Communities / Allied',
          fieldType: 'multi_select',
          options: [
            'Aviation Professionals','Bisexual Allied','Blind Allied','Body Positivity','Cancer','Deaf Allied','Gay Allied','HIV/AIDS Allied','Immuno-disorders','Intersex Allied','Lesbian Allied','Little Person Allied','Non-Binary Allied','Open Relationships Non-Monogamy','Queer Allied','Racial Justice Allied','Sex Worker Allied','Sex-Positive/Kink Allied','Single Mother','Transgender Allied','Veterans'
          ]
        },
        {
          fieldKey: 'provider_marketing_treatment_modalities',
          fieldLabel: 'Treatment Modalities (Max 15)',
          fieldType: 'multi_select',
          options: [
            'Acceptance and Commitment (ACT)','Adlerian','AEDP','Applied Behavioral Analysis (ABA)','Art Therapy','Attachment-Based','Biofeedback','Brainspotting','Christian Counseling','Clinical Supervision','Coaching','CBT','CPT','Compassion Focused','Culturally Sensitive','Dance Movement Therapy','DBT','Eclectic','EMDR','Emotionally Focused','Energy Psychology','Existential','Experiential Therapy','Exposure Response Prevention (ERP)','Family/Marital','Family Systems','Feminist','Forensic Psychology','Gestalt','Gottman Method','Humanistic','Hypnotherapy','Integrative','IFS','Interpersonal','Intervention','Jungian','Mindfulness-Based (MBCT)','Motivational Interviewing','Multicultural','Music Therapy','Narrative','Neuro-Linguistic (NLP)','Neurofeedback','Parent-Child Interaction (PCIT)','Person-Centered','Play Therapy','Positive Psychology','Prolonged Exposure Therapy','Psychoanalytic','Psychobiological Approach Couple Therapy','Psychodynamic','Psychological Testing and Evaluation','REBT','Reality Therapy','Relational','Sandplay','Schema Therapy','Solution Focused Brief (SFBT)','Somatic','Strength-Based','Structural Family Therapy','Transpersonal','Trauma Focused','Synergetic Play Therapy'
          ]
        }
      ]
    },
    {
      title: 'Culture & Bio (Getting to Know You)',
      description: 'Personal questions for company culture and internal bios.',
      categoryKey: 'provider_culture_bio',
      fields: [
        { fieldKey: 'provider_culture_clients_expect', fieldLabel: 'One thing you wish all clients knew / What can clients expect?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_inspires_concerns', fieldLabel: 'What inspires you? What concerns you?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_challenges_finished', fieldLabel: 'Challenges you help with / Definition of "finished" with counseling.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_fun_questions', fieldLabel: '"Fun" Questions (grow up to be / can’t live without / first time / what makes you feel alive).', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_philosophies', fieldLabel: 'Philosophies to share.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_why', fieldLabel: 'Why become a counselor? Why ITSCO?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_personal_public', fieldLabel: 'Personal info to share with the world.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_goals_admin', fieldLabel: 'Goals/Aspirations to share with Admin.', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_passions', fieldLabel: 'What are your passions?', fieldType: 'textarea' },
        { fieldKey: 'provider_culture_favorite_quotes', fieldLabel: 'Favorite quotes?', fieldType: 'textarea' },
        {
          fieldKey: 'provider_culture_team_activities',
          fieldLabel: 'Team Activities',
          fieldType: 'multi_select',
          options: [
            'Top Golf',
            'Hiking',
            'Road Trips',
            'Camping',
            'Paddle Boarding',
            'UFC nights (Saturdays)',
            'Switchbacks (Soccer)',
            'Dinners/Evening events',
            'Running',
            'Fitness',
            'Aerobic activities (swimming/cycling)'
          ]
        }
      ]
    }
  ]
};

const ensureCategory = async (agencyId, cat) => {
  const existing = (categories.value || []).find((c) => c.category_key === cat.categoryKey && (c.agency_id === agencyId || c.agency_id === null));
  if (existing) return existing;
  const res = await api.post('/user-info-categories', {
    categoryKey: cat.categoryKey,
    categoryLabel: cat.categoryLabel,
    orderIndex: cat.orderIndex,
    agencyId
  });
  return res.data;
};

const fetchFieldDefinitions = async () => {
  const res = await api.get('/user-info-fields');
  return res.data || [];
};

const createFieldDefinition = async (agencyId, field, orderIndex, categoryKey) => {
  const payload = {
    fieldLabel: field.fieldLabel,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    isRequired: !!field.isRequired,
    options: field.options || null,
    orderIndex,
    agencyId,
    categoryKey
  };
  const res = await api.post('/user-info-fields', payload);
  return res.data;
};

const ensureModule = async (agencyId, modTitle, description) => {
  const res = await api.get('/modules');
  const existing = (res.data || []).find((m) => (m.title || '').trim() === modTitle && (m.agency_id === agencyId || m.agencyId === agencyId));
  if (existing) return existing;
  const created = await api.post('/modules', {
    title: modTitle,
    description: description || '',
    agencyId
  });
  return created.data;
};

const setModuleContent = async (moduleId, introText, categoryKey, fieldDefinitionIds) => {
  // Make installation idempotent: remove existing content then re-create.
  const existing = await api.get(`/modules/${moduleId}/content`);
  for (const page of (existing.data || [])) {
    if (page?.id) {
      // ignore delete failures (ex: already removed)
      try {
        await api.delete(`/modules/${moduleId}/content/${page.id}`);
      } catch {
        // noop
      }
    }
  }

  let orderIndex = 0;
  if (introText) {
    await api.post(`/modules/${moduleId}/content`, {
      contentType: 'text',
      contentData: { title: 'Notes', description: introText },
      orderIndex
    });
    orderIndex++;
  }

  await api.post(`/modules/${moduleId}/content`, {
    contentType: 'form',
    contentData: { categoryKey, fieldDefinitionIds, requireAll: false },
    orderIndex
  });
};

const installTemplate = async () => {
  try {
    installing.value = true;
    installError.value = '';
    installSuccess.value = '';

    const agencyId = targetAgency.value?.id;
    if (!agencyId) {
      installError.value = 'Could not determine target agency for template installation.';
      return;
    }

    // Ensure categories exist
    for (const cat of TEMPLATE.categories) {
      await ensureCategory(agencyId, cat);
    }

    // Ensure fields exist
    const defs = await fetchFieldDefinitions();
    const byKey = new Map(defs.filter((d) => (d.agency_id === agencyId || d.agency_id === null)).map((d) => [d.field_key, d]));

    // For location field, hydrate options from office schedule locations if available.
    let locationOptions = [];
    try {
      const locRes = await api.get('/office-schedule/locations');
      locationOptions = (locRes.data || [])
        .filter((l) => l.agency_id === agencyId)
        .map((l) => l.name)
        .filter(Boolean);
    } catch {
      // ok to fall back to empty options
    }

    const createdFieldIdsByKey = new Map();
    for (const mod of TEMPLATE.modules) {
      let idx = 0;
      for (const f of mod.fields) {
        const existing = byKey.get(f.fieldKey);
        if (existing) {
          createdFieldIdsByKey.set(f.fieldKey, existing.id);
          idx++;
          continue;
        }
        const categoryKey = mod.categoryKey;
        const field = { ...f };
        if (field.fieldKey === 'provider_identity_location' && field.fieldType === 'select') {
          field.options = locationOptions;
        }
        const created = await createFieldDefinition(agencyId, field, idx, categoryKey);
        createdFieldIdsByKey.set(field.fieldKey, created.id);
        byKey.set(field.fieldKey, created);
        idx++;
      }
    }

    // Create modules + content
    for (const mod of TEMPLATE.modules) {
      const module = await ensureModule(agencyId, mod.title, mod.description);
      const ids = mod.fields.map((f) => createdFieldIdsByKey.get(f.fieldKey)).filter(Boolean);
      await setModuleContent(module.id, mod.introText || '', mod.categoryKey, ids);
    }

    installSuccess.value = 'Installed Provider Onboarding Modules. Refreshing…';
    await refresh();
  } catch (e) {
    installError.value = e.response?.data?.error?.message || 'Failed to install provider onboarding template';
  } finally {
    installing.value = false;
    setTimeout(() => (installSuccess.value = ''), 3500);
  }
};

onMounted(refresh);
</script>

<style scoped>
.provider-info-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.subtitle {
  margin: 6px 0 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.install-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}

.install-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.small-note {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}

.section-title {
  margin-bottom: 12px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.required-asterisk {
  color: #dc3545;
  margin-left: 4px;
}

.field-item input,
.field-item select,
.field-item textarea {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.checkbox-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: #fafbfc;
}

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 10px;
}

.empty-state {
  padding: 20px;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #fafafa;
}

.success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 10px 12px;
  border-radius: 10px;
  font-weight: 600;
}
</style>

