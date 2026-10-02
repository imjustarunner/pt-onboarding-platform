import { PROFILE_SEARCH_TARGETS } from './profileSearchCatalog.js';
import { CLINICAL_SUB_TABS, isClinicalProfileField } from '../constants/clinicalProfileLayout.js';
import { SPECIALTIES, POPULATIONS, CLIENT_AGES, THERAPY_APPROACHES } from '../constants/providerClinicalTaxonomy.js';
import { ACCOUNT_SECTIONS } from '../config/accountDisplaySections.js';

export const searchText = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_–—-]/g, ' ').replace(/\s+/g, ' ').trim();
const sensitive = /password|secret|token|social.?security|\bssn\b|tax.?id|bank.?account|routing.?number|api.?key|direct.?login|login.?link|reset.?link|invitation.?link/i;
const textValue = value => {
  if (Array.isArray(value)) return value.map(textValue).join(' · ');
  if (value && typeof value === 'object') return textValue(value.label ?? value.text ?? value.value ?? '');
  if (typeof value === 'string' && /^[\[{]/.test(value)) { try { return textValue(JSON.parse(value)); } catch { /* plain text */ } }
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, '').trim();
};
export const destinationKey = t => [t.tabId, t.mySection, t.clinicalSubTab, t.sectionId, t.fieldId, t.categoryKey].map(v => v || '').join('|');
const pageContent = {
  tasks:'Tasks assigned work due date completion overdue onboarding checklist', benefits:'Benefits PTO paid time off medical dental vision health insurance retirement 401k eligibility enrollment employee contribution employer contribution',
  billing:'Billing self pay rates service code fee packages cancellation policy', lifecycle:'Onboarding issued gear equipment offboarding exit interview separation employment history', credentialing:'Credentialing NPI CAQH insurance payer Medicaid Medicare taxonomy license expiration federal background fingerprints revalidation enrollment',
  assignments:'School program learning group agency tenant affiliations office supervisor assignments relationships', schedule_availability:'Schedule availability openings appointments weekly recurring virtual in person telehealth waitlist times room assigned office',
  training:'Training courses modules certifications due dates completion assignments learning paths', documents:'Documents forms files signatures signed pending acknowledgments uploaded PDF', evaluations:'Evaluations assessment performance feedback review rubric goals',
  communications:'Communications messages SMS texting emails phone calls call log email history', preferences:'Preferences notifications reminders calendar theme timezone dashboard privacy email SMS digest daily weekly summary',
  payroll:'Payroll pay stubs wages hours mileage reimbursement bonuses deductions pay period direct deposit PTO claims history', supervision:'Supervision supervisor supervisee individual group hours sessions meeting notes', departments:'Departments teams organizational assignment',
  activity:'Activity log audit history login edits changes', admin_docs:'Admin documentation personnel files internal records', clients:'Clients caseload assigned office school counseling therapy tutoring'
};
const taxonomy = { 'clinical-approaches': THERAPY_APPROACHES, 'clinical-specialties': SPECIALTIES, 'clinical-populations': [...POPULATIONS, ...CLIENT_AGES] };
const accountContent = {
  'account-info': 'first name last name preferred name login email personal email work email phone work number extension title role service focus languages employee ID',
  'professional-details': 'primary modality population focus age range session length typical caseload clinical snapshot',
  'payroll-hcbs-classification': 'Payroll HCBS classification bachelors BA masters licensed prelicensed hourly worker credential',
  'workspace-security': 'password login security Google Workspace calendar sharing access recovery multi factor authentication MFA 2FA',
  'service-availability': 'sees clients open closed accepting new clients waitlist in person virtual telehealth school schedule office hours',
  'public-profile': 'public profile biography bio directory specialties approaches insurance accepted self pay rates language gender ethnicity website',
  'employment-dates': 'hire date termination date employment status start date manager job title department position',
  'access-permissions': 'staff provider supervisor privileges administrative permissions billing hiring outreach medical records games',
  'agency-assignments': 'tenant agency affiliation organization relationship role title position client services business cards Avery 35702 QR code print',
  'building-offices': 'assigned office location building address room',
};
export function adminSearchTargets(tabs, { fields = [], canPrintCards = false, categories = [] } = {}) {
  const labels = new Map(tabs.map(t => [t.id, t.label]));
  const targets = PROFILE_SEARCH_TARGETS.filter(t => labels.has(t.tabId) && (t.id !== 'business-cards' || canPrintCards)).map(t => ({ ...t, kind: t.sectionId || t.clinicalSubTab ? 'Section' : 'Page', breadcrumb: labels.get(t.tabId), content: [accountContent[t.id], pageContent[t.id], ...(taxonomy[t.id] || [])].filter(Boolean).join(' · ') }));
  for (const tab of tabs) if (!targets.some(t => t.tabId === tab.id && !t.sectionId && !t.clinicalSubTab)) targets.push({ id: `page-${tab.id}`, tabId: tab.id, label: tab.label, kind: 'Page', breadcrumb: tab.label, content: tab.description || '' });
  for (const tab of CLINICAL_SUB_TABS) if (labels.has('provider_info')) {
    for (const group of tab.fieldGroups || []) targets.push({ id: `clinical-group-${group.id}`, tabId: 'provider_info', clinicalSubTab: tab.id, label: group.label, kind: 'Category', breadcrumb: `Clinical Information › ${tab.label}`, content: group.fieldKeys.join(' ') });
  }
  return [...targets, ...(labels.has('provider_info') ? fieldSearchTargets(fields, { mode: 'admin', categories }) : [])];
}
export function accountSearchTargets({ isClub = false, canSeeKudos = false, canManageAvailability = false, canPrintCards = false, publicProfile = false } = {}) {
  const flags = { workforce: !isClub, kudos: canSeeKudos, availability: !isClub && canManageAvailability };
  const sections = ACCOUNT_SECTIONS.filter(s => !s.visibleKey || flags[s.visibleKey]);
  const targets = sections.map(s => ({ id: `my-${s.id}`, tabId: 'my', mySection: s.id, label: s.navLabel, kind: 'Page', breadcrumb: `My Account › ${s.navLabel}`, content: [s.description, s.title, s.statHint, s.tag].join(' ') }));
  if (canPrintCards) targets.push({ id: 'my-business-cards', tabId: 'my', mySection: 'account', sectionId: 'my-business-cards', label: 'My business cards', kind: 'Section', breadcrumb: 'My Account › Account Info', content: 'Print Avery 35702 square cards 2.5 x 2.5 QR code agency logo nine cards per sheet' });
  const details = [
    ['my-profile-photo', 'Profile photo', 'avatar picture upload'], ['my-contact-info', 'Contact information', accountContent['account-info']],
    ['my-home-address', 'Home address', 'street mailing city state zip postal'], ['my-account-security', 'Account security', 'password login authentication biometric security'],
    ...(!isClub ? [['my-email-signature', 'Email signature', 'HTML signature branding credentials extension'], ['my-profile-information', 'Profile information', 'categories onboarding forms profile fields CBT cognitive behavioral therapy specialties modalities approaches'], ['my-assigned-offices', 'Assigned offices', 'office building room address location'], ['my-public-profile', 'Public profile', accountContent['public-profile']]] : [])
  ];
  for (const [sectionId, label, content] of details.filter(d=>d[0]!=='my-public-profile'||publicProfile)) targets.push({ id: sectionId, sectionId, tabId: 'my', mySection: 'account', label, content, kind: 'Section', breadcrumb: 'My Account › Account Info' });
  return targets;
}
export function fieldSearchTargets(fields, { mode = 'admin', categories = [], hideNpiId = false } = {}) {
  const targets = [], seenCategories = new Set();
  for (const field of fields || []) {
    if (mode === 'admin' && !isClinicalProfileField(field)) continue;
    const key = field.field_key || field.fieldKey || '';
    const label = field.field_label || field.label || key;
    if (hideNpiId && (key === 'npi_id' || searchText(label).replace(/ /g, '') === 'npiid')) continue;
    const categoryKey = field.category_key || '__uncategorized';
    const category = categories.find(c => c.category_key === categoryKey)?.category_label || field.category_label || categoryKey.replace(/_/g, ' ');
    const clinical = CLINICAL_SUB_TABS.find(t => t.fieldKeys?.includes(key));
    const clinicalSubTab = clinical && !clinical.customPanel ? clinical.id : 'all_fields';
    const route = mode === 'admin' ? { tabId: 'provider_info', clinicalSubTab } : { tabId: 'my', mySection: 'account', categoryKey };
    targets.push({ ...route, id: `field-${field.id}`, fieldId: Number(field.id), sectionId: `${mode === 'admin' ? 'provider' : 'my'}-profile-field-${field.id}`, label, kind: 'Profile field', breadcrumb: mode === 'admin' ? `Clinical Information › ${clinical?.label || category || 'All Profile Fields'}` : `My Account › Profile Information › ${category}`, content: sensitive.test(`${key} ${label}`) || ['password', 'file'].includes(field.field_type) ? '' : [textValue(field.value) && `Saved answer: ${textValue(field.value)}`, textValue(field.options) && `Choices: ${textValue(field.options)}`, field.description, field.help_text].filter(Boolean).join(' · ') });
    if (!seenCategories.has(categoryKey)) {
      seenCategories.add(categoryKey);
      targets.push({ ...route, id: `category-${categoryKey}`, label: category, kind: 'Category', breadcrumb: mode === 'admin' ? 'Clinical Information › All Profile Fields' : 'My Account › Profile Information', ...(mode === 'admin' ? { clinicalSubTab: 'all_fields', sectionId: `provider-profile-field-${field.id}`, fieldId: Number(field.id) } : { sectionId: 'my-profile-information' }) });
    }
  }
  return targets;
}
export function searchProfileContent(query, targets, limit = 16) {
  const q = searchText(query), parts = q.split(' ').filter(Boolean);
  if (!q) return [];
  const hits = new Map();
  for (const target of targets) {
    const label = searchText(target.label), aliases = searchText((target.aliases || []).join(' '));
    const content = searchText(target.content), breadcrumb = searchText(target.breadcrumb);
    const hay = `${label} ${aliases} ${content} ${breadcrumb}`;
    if (!parts.every(p => hay.includes(p))) continue;
    const titleMatch = parts.every(p => `${label} ${aliases}`.includes(p));
    const score = (label === q ? 200 : label.startsWith(q) ? 150 : label.replace(/^my /, '').startsWith(q) ? 145 : titleMatch ? 110 : 50) + (target.fieldId ? 70 : target.sectionId ? 8 : 0);
    const raw = String(target.content || '');
    const index = searchText(raw).indexOf(parts.find(p => content.includes(p)) || q);
    const start = Math.max(0, index - 45);
    const snippet = !titleMatch && raw ? `${start ? '…' : ''}${raw.slice(start, start + 160)}${raw.length > start + 160 ? '…' : ''}` : '';
    const hit = { ...target, score, snippet, matchedQuery:q, matchKind: titleMatch ? target.kind || 'Section' : 'Content match' };
    const key = destinationKey(target);
    if (!hits.has(key) || hits.get(key).score < score) hits.set(key, hit);
  }
  return [...hits.values()].sort((a,b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}
export function collectRenderedSearchTargets(root, route = {}) {
  if (!root) return [];
  const targets = [], counts = new Map();
  for (const el of root.querySelectorAll('.info-section, .acct-card, .field-item, .form-group, section[id], [data-search-section], h2, h3, h4, label, dt')) {
    if (el.closest('[data-profile-search], nav, .profile-tabs, .ci-subtabs, .category-tabs, [role="dialog"], [data-search-private]')) continue;
    // A section and its own heading are one destination, not two search results.
    const parentSection = el.parentElement?.closest('.info-section, .acct-card, .field-item, .form-group, section[id], [data-search-section]');
    if (el.matches('h2,h3,h4,label') && parentSection && root.contains(parentSection) && parentSection.querySelector('h2,h3,h4,label,legend') === el) continue;
    const label = el.querySelector('h2,h3,h4,label,legend')?.textContent || (el.matches('label,dt,h2,h3,h4') ? el.textContent : el.getAttribute('aria-label'));
    if (!label?.trim() || sensitive.test(label)) continue;
    const mySection = el.closest('[data-profile-my-section]')?.dataset.profileMySection;
    const clinicalSubTab = el.closest('[data-profile-clinical-subtab]')?.dataset.profileClinicalSubtab;
    const dest = { ...route, ...(mySection ? { tabId: 'my', mySection } : {}), ...(clinicalSubTab ? { clinicalSubTab } : {}) };
    const slug = searchText(label).replace(/[^a-z0-9]+/g, '-').slice(0, 75);
    const base = `search-${dest.tabId}-${dest.mySection || ''}-${dest.clinicalSubTab || ''}-${slug}`;
    const n = counts.get(base) || 0; counts.set(base, n + 1);
    if (!el.id) el.id = `${base}-${n}`;
    let content = el.textContent || '';
    for (const input of el.querySelectorAll('input:not([type="password"]):not([type="hidden"]), textarea, select')) {
      if (!sensitive.test(`${input.id} ${input.name}`) && !['checkbox','radio','file'].includes(input.type)) content += ` ${input.value || ''}`;
    }
    targets.push({ ...dest, id: el.id, sectionId: el.id, label: label.trim().slice(0, 120), content: sensitive.test(content) ? label : content.slice(0, 12000), breadcrumb: [route.breadcrumb, mySection, clinicalSubTab].filter(Boolean).join(' › '), kind: 'Section' });
  }
  return targets;
}

export function recordSearchTargets(record = {}, mode = 'admin') {
  const groups = [
    ['account-info','Account information',['first_name','last_name','firstName','lastName','preferred_name','preferredName','email','personal_email','personalEmail','work_email','workEmail','phoneNumber','phone_number','work_phone','workPhone','work_phone_extension','workPhoneExtension','title','service_focus','serviceFocus','languages_spoken','languagesSpoken']],
    ['employment-dates','Employment dates',['department','employment_type','employmentType','work_location','workLocation','provider_start_date','providerStartDate','hire_date','hireDate']],
    ['home-address','Home address',['home_street_address','home_address_line2','home_city','home_state','home_postal_code']]
  ];
  return groups.map(([sectionId,label,keys]) => ({ id:`record-${sectionId}`, label, kind:'Profile field', ...(mode==='admin'?{tabId:'account',sectionId}:{tabId:'my',mySection:'account',sectionId:sectionId==='home-address'?'my-home-address':'my-contact-info'}), breadcrumb:mode==='admin'?'Account': 'My Account › Account Info', content:keys.map(k=>textValue(record[k])).filter(Boolean).join(' · ') })).filter(t=>t.content);
}
