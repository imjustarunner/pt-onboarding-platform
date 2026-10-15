<template>
  <Teleport to="body">
    <dialog ref="dialog" class="business-cards-dialog" :class="{ 'self-service-dialog': singlePerson }" aria-labelledby="business-cards-title" @close="$emit('close')">
      <header>
        <div><h2 id="business-cards-title">{{ selfOnly ? 'My business cards' : 'Business cards' }}</h2><p>Avery {{ layout.id }} · {{ layout.dimensions }} · {{ layout.count }} matching cards per selection</p></div>
        <HowToVideoButton video-id="my-account-business-cards" />
        <button class="btn btn-secondary" aria-label="Close business cards" @click="dialog.close()">Close</button>
      </header>
      <fieldset class="card-format-toggle" aria-label="Card shape">
        <legend>Choose your card stock</legend>
        <button v-for="option in layouts" :key="option.id" type="button" :disabled="busy" :aria-pressed="format === option.id" @click="format = option.id">
          <strong>{{ option.label }}</strong><span>Avery {{ option.id }} · {{ option.dimensions }} · {{ option.count }} per sheet</span>
        </button>
      </fieldset>
      <p v-if="format === '8870'" class="card-stock-note">Avery 8870 cards share cut lines. This design uses a small white border so neighboring colors stay separate. Alignment is saved separately from square cards.</p>
      <div class="card-toolbar">
        <label v-if="agencies.length > 1">Organization<select v-model="agencyId" aria-label="Organization" :disabled="busy"><option value="">Choose an organization</option><option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option></select></label>
        <p v-else class="card-organization"><strong>{{ agencies[0]?.name || 'No affiliated agency' }}</strong></p>
        <button class="btn btn-secondary" :disabled="!people.length || busy" @click="saveDraft">Save editable draft</button>
        <button class="btn btn-secondary" :disabled="!agencyId || busy" @click="loadOrganization(agencyId)">Reload from records</button>
        <label class="file-label">Load draft<input type="file" accept="application/json,.json" :disabled="!agencyId || busy" @change="loadDraft" /></label>
      </div>
      <div v-if="selfOnly && agencyId && !loading && people.length" class="shared-card-picker">
        <label>Print cards for<select :value="editingId" aria-label="Print cards for" :disabled="busy" @change="selectSelfServiceCard($event.target.value)">
          <option v-for="person in people.filter(p => !p.kind)" :key="person.id" :value="person.id" :disabled="Boolean(person.loadError)">My business cards — {{ person.name }}</option>
          <optgroup label="Agency, groups &amp; departments">
            <option v-for="person in people.filter(p => p.kind)" :key="person.id" :value="person.id">{{ person.kind === 'organization' ? `General agency card — ${person.name}` : person.name }}</option>
          </optgroup>
        </select></label>
        <p>Print your own cards or shared cards for this agency. Each selection fills one sheet.</p>
      </div>
      <p v-if="error" class="card-error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="loading" role="status">Loading card details…</p>
      <div v-else-if="agencyId" class="card-workspace" :class="{ 'self-service': singlePerson }">
        <section class="card-settings" aria-label="Organization card settings">
          <h3>Organization template</h3><p>{{ canManage ? 'Save the design and print defaults once for everyone in this organization.' : 'Your organization’s saved card design and QR back.' }}</p><fieldset :disabled="!canManage || busy">
          <label>Organization name<input v-model="organization.organization" maxlength="100" /></label>
          <div class="colors"><label>Name panel<input v-model="organization.primary" type="color" /></label><label>Address panel<input v-model="organization.accent" type="color" /></label></div>
          <div class="colors"><label>Name-panel text<select v-model="organization.primaryText" aria-label="Name-panel text"><option value="auto">Automatic</option><option value="#ffffff">White</option><option value="#163638">Dark</option></select></label><label>Address-panel text<select v-model="organization.accentText" aria-label="Address-panel text"><option value="auto">Automatic</option><option value="#ffffff">White</option><option value="#163638">Dark</option></select></label></div>
          <label>Organization logo<input type="file" accept="image/png,image/jpeg,image/webp" @change="uploadLogo" /></label>
          <button v-if="organization.logo" class="btn btn-secondary btn-sm" @click="organization.logo = ''">Use organization name instead</button>
          <label>Public website<input v-model="organization.website" maxlength="100" /></label>
          <label>Office phone<input v-model="organization.phone" maxlength="50" /></label>
          <label>Default extension<input v-model="organization.extension" maxlength="12" /></label>
          <label>Office address<textarea v-model="organization.address" rows="3" maxlength="160" /></label>
          <label>QR destination<input v-model="organization.qrUrl" :placeholder="organization.website || 'https://your-website.org'" maxlength="300" /></label><label>Back caption<input v-model="organization.backCaption" maxlength="80" /></label></fieldset>
          <details><summary>Printer alignment</summary><p>Offsets in inches. Positive values move right / down. Print at 100% on Letter paper. <template v-if="format === '35702'">Bleed extends colors beyond the cut edges.</template></p>
            <label>Horizontal offset<input v-model.number="printSettings.offsetX" type="number" min="-0.125" max="0.125" step="0.005" /></label>
            <label>Vertical offset<input v-model.number="printSettings.offsetY" type="number" min="-0.125" max="0.125" step="0.005" /></label>
            <label v-if="format === '35702'">Top row vertical adjustment<input v-model.number="printSettings.topRowOffsetY" type="number" min="-0.125" max="0.125" step="0.005" /></label>
            <label v-if="format === '35702'">Bleed (top and sides)<input v-model.number="printSettings.bleed" type="number" min="0" max="0.125" step="0.005" /></label>
            <label v-if="format === '35702'">Bottom bleed<input v-model.number="printSettings.bottomBleed" type="number" min="0" max="0.125" step="0.005" /></label>
            <label>Back horizontal adjustment<input v-model.number="printSettings.backOffsetX" type="number" min="-0.125" max="0.125" step="0.005" /></label>
            <label>Back vertical adjustment<input v-model.number="printSettings.backOffsetY" type="number" min="-0.125" max="0.125" step="0.005" /></label>
            <label class="check"><input v-model="guides" type="checkbox" /> Show card outlines for a test print</label>
          </details>
          <button v-if="canManage" class="btn btn-primary" :disabled="busy" @click="saveTemplate">{{ saving ? 'Saving…' : 'Save organization template' }}</button>
        </section>
        <section v-if="!singlePerson" class="card-people" aria-label="Card selection">
          <h3>Choose cards</h3><p>{{ selected.length }} selected · {{ selected.length * layout.count }} cards</p>
          <label>Card type<select v-model="cardType" aria-label="Card type"><option value="people">Employees &amp; providers</option><option value="groups">Groups &amp; departments</option></select></label>
          <p v-if="cardType === 'groups'">Choose a general organization card or a configured group email or department. Review the contact details before printing.</p>
          <label>{{ cardType === 'groups' ? 'Find a group or department' : 'Find an employee' }}<input v-model="search" type="search" :placeholder="cardType === 'groups' ? 'Name or group email' : 'Name or credentials'" /></label>
          <div class="selection-actions"><button class="btn btn-secondary btn-sm" @click="visiblePeople.forEach(p => { if (!p.loadError) p.selected = true; })">Select shown</button><button class="btn btn-secondary btn-sm" @click="people.forEach(p => p.selected = false)">Clear selection</button></div>
          <p v-if="!visiblePeople.length">{{ cardType === 'groups' ? 'No matching groups or departments.' : 'No matching employees or providers.' }}</p>
          <div v-for="person in visiblePeople" :key="person.id" class="person-row" :class="{ current: editingId === person.id }">
            <input v-model="person.selected" type="checkbox" :disabled="Boolean(person.loadError)" :aria-label="`Include ${person.name}`" />
            <button @click="editingId = person.id"><strong>{{ person.name }}</strong><small>{{ person.loadError || (person.kind ? person.email || (person.kind === 'organization' ? 'General organization card' : 'Add a public email before printing') : person.credentials || person.title) || 'Edit card details' }}</small></button>
          </div>
        </section>
        <section v-if="editing" class="card-editor" aria-label="Individual card editor">
          <h3>Edit once, print {{ layout.count }}</h3>
          <p>{{ editing.kind ? 'Filled from the organization’s group or department settings. Edits apply to this card draft.' : 'Filled from this employee’s profile, organization contact settings, and primary office assignment.' }}</p>
          <p class="phone-source">Office: <strong>{{ resolvedPreview.phone || 'Not configured for this agency' }}{{ resolvedPreview.phone && resolvedPreview.extension ? ` ext. ${resolvedPreview.extension}` : '' }}</strong></p>
          <p class="phone-source" v-if="editing.workLine">Work number: <strong>{{ editing.workLine.number }}</strong> · {{ editing.workLine.canCall ? (editing.workLine.canText ? 'Call / Text' : 'Call') : 'Text' }}</p>
          <p class="card-data-note" v-else-if="!editing.kind">No enabled work number assigned. Only the office number will print.</p>
          <label v-if="!editing.kind">QR code on the back<select v-model="editing.qrTarget" aria-label="QR code destination"><option value="website">Agency main website (default)</option><option v-if="editing.profileUrl" value="profile">My public provider profile</option></select></label>
          <p v-if="!editing.kind">Choose your QR destination before printing the back. Stock with an agency QR already printed keeps that destination; use blank backs for your profile QR.</p>
          <div class="selection-actions"><button class="btn btn-secondary btn-sm" @click="previewSide = 'front'">Front preview</button><button class="btn btn-secondary btn-sm" @click="previewSide = 'back'">QR back preview</button></div>
          <p v-if="previewError" class="card-error">{{ previewError }}</p>
          <img v-if="preview" class="card-preview" :style="{ aspectRatio: `${layout.cardWidth} / ${layout.cardHeight}` }" :src="preview" :alt="`Card preview for ${editing.name}`" />
          <p class="preview-note">Preview is enlarged. Printed cards are {{ layout.dimensions }}.</p>
          <p v-if="editing.loadError" class="card-error">{{ editing.loadError }} Reopen the generator to retry loading this employee.</p>
          <p v-if="missingProfileFields.length" class="card-data-note">Missing details: {{ missingProfileFields.join(', ') }}. Review before printing.</p>
          <label>Office to print<select v-model="editing.officeId" aria-label="Office to print">
            <option v-if="editing.kind && editing.offices.some(o => o.address)" value="__all">All agency office addresses</option>
            <option value="">{{ editing.kind ? 'No office address' : editing.offices.length ? 'Choose an assigned office' : 'No assigned office — address omitted' }}</option>
            <option v-for="office in editing.offices" :key="office.id" :value="office.id">{{ office.name }}{{ office.primary ? ' (primary)' : '' }}</option>
            <option value="__organization">Use organization address</option>
          </select></label>
          <p v-if="!editing.kind && !editing.offices.length" class="card-data-note">No active office assignment for this organization. Choose the organization address or enter an address override if needed.</p>
          <label v-for="field in fields.filter(f => !editing.kind || f.key !== 'credentials')" :key="field.key">{{ field.label }}
            <textarea v-if="field.key === 'address'" v-model="editing[field.key]" :maxlength="editing.kind ? 500 : field.max" :placeholder="assignedAddress || 'Office address override (optional)'" :rows="editing.kind ? 6 : 3" />
            <input v-else v-model="editing[field.key]" :maxlength="field.max" :placeholder="field.shared ? organization[field.key] || 'Optional' : 'Optional'" />
          </label>
          <p>Blank office phone and website fields use organization defaults. The address comes from the selected office unless overridden. Changes apply to this card draft.</p>
        </section>
      </div>
      <footer>
        <div><label>Print sides<select v-model="printSide" aria-label="Print sides"><option value="front">Front only</option><option value="back">QR back only</option><option value="both">Front + back (two-sided)</option></select></label><p>Print at <strong>Actual size / 100%</strong>.<template v-if="printSide === 'both'"> Front and back pages alternate; use <strong>flip on long edge</strong>.</template> Test both sides on plain paper first.</p></div>
        <div><button class="btn btn-secondary" :disabled="!selected.length || busy" @click="exportCards('html')">Download printable template</button><button class="btn btn-primary" :disabled="!selected.length || busy" @click="exportCards('pdf')">{{ exporting ? 'Preparing cards…' : `Download PDF (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})` }}</button></div>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { svgDataUrl, employeeCardDefaults, groupCardDefaults, assignedCardOffices, organizationCardDefaults, isCardEmployee, resolveCard, readCardDraft, CARD_FIELDS } from '../../utils/businessCards';
import { providerProfileUrl } from '../../utils/providerProfileLinks';
import { cardQrUrl } from '../../utils/businessCardBack';
import { BUSINESS_CARD_LAYOUTS, businessCardLayout } from '../../utils/businessCardLayouts';
import { renderCardFace, printSettingsDefaults, normalizePrintSettings, printableCardsHtml } from '../../utils/businessCardPrint';
import { businessCardsPdf, downloadCardFile, embedCardLogo } from '../../utils/businessCardsExport';
import { loadBusinessCardFonts } from '../../utils/businessCardFonts';
import HowToVideoButton from '../HowToVideoButton.vue';
import { useHowToVideo } from '../../composables/useHowToVideo';

const props = defineProps({ agencies: { type: Array, default: () => [] }, initialAgencyId: { type: [String, Number], default: '' }, selfOnly: { type: Boolean, default: false }, targetUserId: { type: [String, Number], default: null } });
defineEmits(['close']);
const singlePerson = computed(() => props.selfOnly || Boolean(props.targetUserId));
const initialAgency = props.agencies.find(a => String(a.id) === String(props.initialAgencyId))?.id || (props.agencies.length === 1 ? props.agencies[0].id : '');
const dialog = ref(null), agencyId = ref(String(initialAgency)), people = ref([]), editingId = ref('');
const { modalHost } = useHowToVideo();
onBeforeUnmount(() => { if (modalHost.value === dialog.value) modalHost.value = null; });
const organization = reactive(organizationCardDefaults());
const loading = ref(false), exporting = ref(false), error = ref(''), notice = ref(''), search = ref('');
const cardType = ref('people');
const format = ref('35702'), layouts = Object.values(BUSINESS_CARD_LAYOUTS);
const layout = computed(() => businessCardLayout(format.value));
const printFormats = reactive({ '35702': printSettingsDefaults(), '8870': printSettingsDefaults({}, '8870') });
const printSettings = computed(() => printFormats[format.value]);
const guides = ref(false), canManage = ref(false), saving = ref(false);
const previewSide = ref('front'), printSide = ref('front');
const pageCount = computed(() => selected.value.length * (printSide.value === 'both' ? 2 : 1));
const busy = computed(() => loading.value || exporting.value || saving.value);
const selected = computed(() => people.value.filter(p => p.selected && !p.loadError));
const editing = computed(() => people.value.find(p => p.id === editingId.value));
const assignedAddress = computed(() => resolveCard({ ...editing.value, address: '' }, organization).address);
const missingProfileFields = computed(() => editing.value ? [
  ...(editing.value.kind ? [['email', 'public email']] : [['title', 'title'], ['credentials', 'credentials'], ['email', 'work email']]).filter(([key]) => !editing.value[key]).map(([, label]) => label),
  ...(!resolvedPreview.value.phone ? ['agency office phone (omitted from card)'] : []),
  ...(!resolvedPreview.value.address ? [editing.value.kind ? 'office address (omitted from card)' : 'assigned office address'] : [])
] : []);
const fonts = ref({});
const resolvedPreview = computed(() => resolveCard(editing.value || {}, organization));
const previewResult = computed(() => { try { return { url: svgDataUrl(renderCardFace(resolvedPreview.value, previewSide.value, format.value, fonts.value)), error: '' }; } catch (err) { return { url: '', error: err.message }; } });
const preview = computed(() => previewResult.value.url), previewError = computed(() => previewResult.value.error);
const visiblePeople = computed(() => people.value.filter(p => (cardType.value === 'groups' ? Boolean(p.kind) : !p.kind) && `${p.name} ${p.credentials} ${p.email}`.toLowerCase().includes(search.value.toLowerCase())));
watch(cardType, () => {
  search.value = '';
  if (!props.selfOnly) editingId.value = visiblePeople.value[0]?.id || '';
});
function selectSelfServiceCard(id) {
  const card = people.value.find(p => p.id === id && !p.loadError);
  people.value.forEach(p => { p.selected = p === card; });
  editingId.value = card?.id || '';
  cardType.value = card?.kind ? 'groups' : 'people';
}
const fields = [
  { key: 'name', label: 'Display name', max: 90 }, { key: 'title', label: 'Title', max: 90 },
  { key: 'credentials', label: 'Credentials', max: 70 }, { key: 'email', label: 'Public work email', max: 100 },
  { key: 'phone', label: 'Office phone override', max: 50, shared: true }, { key: 'extension', label: 'Extension', max: 12, shared: true },
  { key: 'website', label: 'Website override', max: 100, shared: true }, { key: 'address', label: 'Office address override', max: 160, shared: true }
];
let generation = 0;
onBeforeUnmount(() => { generation++; });
onMounted(async () => {
  dialog.value.showModal();
  // Keep the floating player interactive within the native dialog's top layer.
  modalHost.value = dialog.value;
  try { fonts.value = await loadBusinessCardFonts(); }
  catch (err) { error.value = err.message; }
});

async function loadOrganization(id) {
  const version = ++generation;
  people.value = []; editingId.value = ''; error.value = ''; notice.value = ''; search.value = '';
  cardType.value = 'people';
  canManage.value = false;
  Object.assign(organization, organizationCardDefaults());
  Object.assign(printFormats['35702'], printSettingsDefaults());
  Object.assign(printFormats['8870'], printSettingsDefaults({}, '8870'));
  if (!id) { loading.value = false; return; }
  loading.value = true;
  try {
    const response = await api.get(`/agencies/${id}/business-cards`, { params: { self: props.selfOnly, ...(props.targetUserId ? {userId:props.targetUserId} : {}) }, skipGlobalLoading: true });
    if (version !== generation) return;
    const { agency, template } = response.data;
    canManage.value = Boolean(response.data.canManage);
    Object.assign(organization, organizationCardDefaults(agency), template?.organization || {});
    if (template?.organization && !Object.hasOwn(template.organization, 'logoCrop')) organization.logoCrop = '';
    Object.assign(printFormats['35702'], printSettingsDefaults(agency), template?.print || {});
    Object.assign(printFormats['8870'], printSettingsDefaults(agency, '8870'), template?.printFormats?.['8870'] || {});
    const rawLogo = template?.organization ? organization.logo : organization.logo || (agency.logo_path ? toUploadsUrl(agency.logo_path) : agency.logo_url || '');
    try { const logo = await embedCardLogo(rawLogo); if (version === generation) organization.logo = logo; }
    catch { if (version === generation) notice.value = 'The organization logo could not be embedded. Upload a PNG or JPEG logo, or use the organization name.'; }
    const watermark = await embedCardLogo(organization.watermarkLogo);
    if (version !== generation) return;
    organization.watermarkLogo = watermark;
    const eligible = (Array.isArray(response.data.people) ? response.data.people : []).filter(u => isCardEmployee(u, id));
    // Bound concurrent profile requests for large organizations.
    const results = [];
    for (let start = 0; start < eligible.length; start += 6) {
      if (version !== generation) return;
      const batch = await Promise.allSettled(eligible.slice(start, start + 6).map(async user => {
        const { data } = await api.get(`/agencies/${id}/business-cards/people/${user.id}`, { skipGlobalLoading: true });
        const offices = assignedCardOffices(data.offices || [], data.offices || [], id);
        const profile = String(agency.slug).toLowerCase() === 'itsco' ? providerProfileUrl(data.user) : String(agency.slug).toLowerCase() === 'nlu' ? `https://nextleveluplcc.com/nlu/provider/${Number(user.id)}?serviceType=counseling` : '';
        return { ...employeeCardDefaults({ ...user, ...data.user, publicProfileUrl: profile }, offices, data.contact), selected: singlePerson.value, organizationContact: data.contact };

      }));
      batch.forEach((result, i) => results.push(result.status === 'fulfilled' ? result.value : { ...employeeCardDefaults(eligible[start + i]), loadError: 'Work details, organization contacts, or office assignments failed to load.' }));
    }
    if (version !== generation) return;
    const contactDefaults = organizationCardDefaults(agency, results.find(p => p.organizationContact)?.organizationContact);
    if (!template?.organization) organization.phone = contactDefaults.phone;
    if (!template?.organization) organization.website = contactDefaults.website;
    if (!organization.logo && !template?.organization) {
      const contactLogo = results.find(p => p.organizationContact?.logoUrl)?.organizationContact.logoUrl;
      if (contactLogo) {
        try {
          const logo = await embedCardLogo(contactLogo);
          if (version !== generation) return;
          organization.logo = logo;
        } catch { notice.value = 'The organization logo could not be embedded. Upload a PNG or JPEG logo, or use the organization name.'; }
      }
    }
    if (version !== generation) return;
    if (props.selfOnly || !singlePerson.value) {
      const offices = assignedCardOffices(response.data.offices || [], response.data.offices || [], id);
      const agencyCard = groupCardDefaults({ id: 'organization', kind: 'organization', name: organization.organization }, offices, agency);
      if (String(agency.slug || '').toLowerCase() === 'itsco') {
        agencyCard.email = 'support@itsco.health';
        agencyCard.extension = '0';
      }
      results.push(agencyCard);
      results.push(...(response.data.groups || []).map(group => groupCardDefaults(group, offices, agency)));
    }
    people.value = results.sort((a, b) => a.name.localeCompare(b.name));
    if (!people.value.some(p => !p.kind) && people.value.some(p => p.kind)) cardType.value = 'groups';
    editingId.value = visiblePeople.value[0]?.id || '';
    if (props.selfOnly) selectSelfServiceCard(people.value.find(p => !p.kind && !p.loadError)?.id || people.value.find(p => p.kind)?.id);
  } catch (err) { if (version === generation) error.value = err.response?.data?.error?.message || 'Could not load this organization’s employees.'; }
  finally { if (version === generation) loading.value = false; }
}
watch(agencyId, loadOrganization, { immediate: true });

async function uploadLogo(event) {
  const file = event.target.files?.[0]; if (!file) return;
  error.value = '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4000000) { error.value = 'Choose a PNG, JPEG, or WebP logo smaller than 4 MB.'; return; }
  const version = generation;
  try { const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    const img = new Image(); img.src = data; await img.decode();
    if (version === generation) { organization.logo = data; organization.logoCrop = ''; }
  } catch { error.value = 'This image could not be opened. Try another logo file.'; }
  event.target.value = '';
}

function saveDraft() {
  downloadCardFile(JSON.stringify({ version: 1, organizationId: agencyId.value, organization: { ...organization }, format: format.value, print: { ...printFormats['35702'] }, printFormats: { '8870': { ...printFormats['8870'] } }, people: people.value.map(p => ({ id: p.id, officeId: p.officeId, selected: p.selected, ...Object.fromEntries(CARD_FIELDS.map(k => [k, p[k]])) })) }, null, 2), 'application/json', `business-cards-${agencyId.value}-draft.json`);
}

async function loadDraft(event) {
  const file = event.target.files?.[0]; if (!file) return;
  error.value = ''; const version = generation;
  try {
    if (file.size > 8000000) throw new Error('This draft is too large. Choose a saved business-card draft under 8 MB.');
    const draft = readCardDraft(await file.text(), agencyId.value);
    if (version !== generation) return;
    for (const person of draft.people) for (const field of fields) {
      const limit = field.key === 'address' && people.value.find(p => p.id === person.id)?.kind ? 500 : field.max;
      if (person[field.key].length > limit) throw new Error(`The saved ${field.label.toLowerCase()} is too long.`);
    }
    if (canManage.value) Object.assign(organization, draft.organization);
    const draftFormat = businessCardLayout(draft.format).id;
    const square = normalizePrintSettings({ ...draft.print, format: '35702' });
    const rectangle = normalizePrintSettings({ ...draft.printFormats?.['8870'], format: '8870' });
    Object.assign(printFormats['35702'], square);
    Object.assign(printFormats['8870'], rectangle);
    format.value = draftFormat;
    const byId = new Map(draft.people.map(p => [p.id, p]));
    people.value.forEach(p => {
      if (!byId.has(p.id)) { p.selected = false; return; }
      const saved = { ...byId.get(p.id) };
      if (saved.officeId && saved.officeId !== '__organization' && !(p.kind && saved.officeId === '__all') && !p.offices.some(o => o.id === saved.officeId)) delete saved.officeId;
      Object.assign(p, saved);
    });
    const firstSelected = selected.value[0];
    if (props.selfOnly) selectSelfServiceCard(firstSelected?.id || editingId.value);
    else if (firstSelected) { cardType.value = firstSelected.kind ? 'groups' : 'people'; await nextTick(); editingId.value = firstSelected.id; }
    notice.value = 'Draft loaded for cards currently available in this organization. Use Reload from records to replace draft edits with current details.';
  } catch (err) { error.value = err.message || 'Could not load this draft.'; }
  event.target.value = '';
}

async function saveTemplate() {
  error.value = ''; saving.value = true;
  try {
    const print = normalizePrintSettings({ ...printFormats['35702'], format:'35702' });
    const rectanglePrint = normalizePrintSettings({ ...printFormats['8870'], format:'8870' });
    const organizationSettings = { ...organization, logo: await embedCardLogo(organization.logo), watermarkLogo: await embedCardLogo(organization.watermarkLogo) };
    if (organization.qrUrl) organizationSettings.qrUrl = cardQrUrl(organization);
    await api.put(`/agencies/${agencyId.value}/business-cards`, { version: 1, organization: organizationSettings, print, printFormats: { '8870': rectanglePrint } });
    notice.value = 'Organization template saved. Staff will use it when opening their business cards.';
  } catch (err) { error.value = err.response?.data?.error?.message || err.message || 'Could not save the card template.'; }
  finally { saving.value = false; }
}

async function exportCards(fileType) {
  error.value = ''; exporting.value = true;
  try {
    fonts.value = await loadBusinessCardFonts();
    for (const person of selected.value) {
      if (person.offices.length && !person.officeId && !person.address.trim()) throw new Error(`${person.name}: choose an assigned office before printing.`);
      if (!person.kind && person.officeId && !resolveCard(person, organization).address) throw new Error(`${person.name}: the selected office has no address. Enter an address override before printing.`);
    }
    const cards = selected.value.map(p => resolveCard(p, organization));
    for (const card of cards) {
      if (!card.name.trim()) throw new Error('Enter a display name for every selected card.');
      for (const field of fields) {
        const limit = card.kind && field.key === 'address' ? 500 : field.max;
        if (String(card[field.key] || '').length > limit) throw new Error(`${card.name}: shorten the ${field.label.toLowerCase()} to ${limit} characters.`);
      }
    }
    const logo = await embedCardLogo(organization.logo);
    const watermarkLogo = await embedCardLogo(organization.watermarkLogo);
    cards.forEach(c => { c.logo = logo; c.watermarkLogo = watermarkLogo; });
    const filename = `business-cards-${agencyId.value}-avery-${format.value}`;
    if (fileType === 'pdf') downloadCardFile(await businessCardsPdf(cards, { ...printSettings.value, format: format.value, guides: guides.value, side: printSide.value }), 'application/pdf', `${filename}.pdf`);
    else downloadCardFile(printableCardsHtml(cards, { ...printSettings.value, format: format.value, guides: guides.value, side: printSide.value }, fonts.value), 'text/html', `${filename}.html`);
    notice.value = `Downloaded ${pageCount.value} pages for ${cards.length} selections.`;
  } catch (err) { error.value = err.message || 'Could not export cards. Please check the logo and card details.'; }
  finally { exporting.value = false; }
}
</script>

<style scoped>
.card-format-toggle { display:flex; gap:12px; margin:20px 0 8px; flex-wrap:wrap; }
.card-format-toggle legend { font-weight:700; margin-bottom:10px; }
.card-format-toggle button { flex:1; min-width:220px; text-align:left; border:2px solid #d3dfdf; border-radius:10px; padding:14px; background:#fff; color:#19373b; cursor:pointer; }
.card-format-toggle button[aria-pressed="true"] { border-color:#24786b; background:#edf8f4; box-shadow:0 0 0 1px #24786b; }
.card-format-toggle strong,.card-format-toggle span { display:block; }.card-format-toggle strong { font-size:17px; margin-bottom:6px; }.card-format-toggle span { font-size:12px; }
.shared-card-picker { margin: 0 0 22px; padding: 14px; background: #edf8f4; border: 1px solid #a9cfc7; border-radius: 10px; }
.shared-card-picker label { margin-bottom: 6px; }.shared-card-picker p { margin: 0; }
.card-stock-note { background:#f2f6f5; padding:10px 14px; border-radius:8px; }

.business-cards-dialog { width: min(1220px, 96vw); max-height: 94vh; margin: auto; border: 1px solid #d3dfdf; border-radius: 16px; padding: 24px; background: #fff; color: #19373b; }
.business-cards-dialog.self-service-dialog { width: min(800px, 96vw); }
.business-cards-dialog > header { flex-wrap: wrap; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.business-cards-dialog::backdrop { background: #132d3bcc; }
header, footer, .card-toolbar, .colors, .selection-actions { display: flex; gap: 14px; align-items: center; justify-content: space-between; }
h2, h3 { margin: 0 0 8px; } p { font-size: 13px; line-height: 1.5; } header { align-items: flex-start; } header p { margin: 0; }
.card-toolbar { justify-content: flex-start; flex-wrap: wrap; margin: 22px 0; padding-bottom: 18px; border-bottom: 1px solid #e0e7e5; }
.card-workspace { display: grid; grid-template-columns: 260px minmax(230px, 1fr) 340px; gap: 24px; }
.card-workspace.self-service { grid-template-columns: 260px minmax(280px, 1fr); }
label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; margin-bottom: 13px; }
input, select, textarea { border: 1px solid #bdcccb; border-radius: 7px; padding: 9px; width: 100%; color: #19373b; background: #fff; font: inherit; }
textarea { resize: vertical; }.colors label { width: 50%; }input[type=color] { height: 38px; padding: 3px; }input[type=checkbox] { width: 18px; height: 18px; flex-shrink: 0; }
.card-toolbar label { margin: 0; }.file-label { max-width: 240px; }.card-settings, .card-people { border-right: 1px solid #e0e7e5; padding-right: 20px; }
.card-preview { width: 100%; aspect-ratio: 1; box-shadow: 0 4px 16px #19373b20; border-radius: 10px; }.preview-note { font-size: 11px; }
.person-row { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 8px; border: 1px solid transparent; }.person-row.current { background: #edf6f4; border-color: #a9cfc7; }
.person-row button { border: 0; background: none; text-align: left; padding: 5px; flex: 1; cursor: pointer; color: inherit; }.person-row small { display: block; margin-top: 5px; }.card-error { color: #a42929; background: #fff1ee; padding: 10px; }
.selection-actions { margin: 10px 0; justify-content: flex-start; }.check { display: flex; align-items: center; }details { margin-top: 20px; }summary { cursor: pointer; }
.card-data-note { padding: 8px 10px; background: #fff7df; border-radius: 6px; }
footer { border-top: 1px solid #e0e7e5; margin-top: 24px; padding-top: 14px; }footer p { max-width: 400px; }footer div { display: flex; gap: 10px; }
@media(max-width: 1000px) { .card-workspace { grid-template-columns: 1fr 1fr; }.card-editor { grid-column: 1 / -1; max-width: 400px; }.card-people { border: 0; }footer { flex-wrap: wrap; } }
@media(max-width: 600px) { .card-workspace { display: block; }.card-settings, .card-people { border: 0; padding: 0; margin-bottom: 24px; }footer div { flex-wrap: wrap; } }
</style>
