import {linkLooksLikeOfficeIntake} from './officeIntakeLink.js';
export function allowsProviderPreference(link) {
 const type=String(link?.form_type||link?.formType||'').toLowerCase();
 if(/quick|short|interest|registration|request/.test(type))return false;
 if(String(link?.scope_type||'').toLowerCase()==='school')return false;
 return linkLooksLikeOfficeIntake(link)||link?.master_channel==='tutoring';
}

// Legacy translated masters must expose the same optional choice as English.
// Preserve their questions/documents and IDs so saved enrollments remain resumable.
export function ensureOfficeProviderStep(link, steps = []) {
 if (!allowsProviderPreference(link) || steps.some(step => step.type === 'provider_match')) return steps;
 const es = String(link.language_code || '').startsWith('es');
 const choice = { id:'office_available_providers', type:'provider_match', visibility:'always', fields:[],
  label: es ? 'Elegir un profesional' : 'Choose a provider' };
 const list = [...steps];
 const firstAgreement = list.findIndex(step => ['insurance_info','package_selection','document','smart_disclosure','disclosure','packet_informed_group_consent','packet_policy_services','packet_hipaa_notice'].includes(step.type));
 list.splice(firstAgreement < 0 ? list.length : firstAgreement, 0, choice);
 return list;
}
export function stripIneligibleProviderPreference(link,intakeData) {
 if(allowsProviderPreference(link))return;
 const bag=intakeData?.responses?.submission;if(!bag)return;
 for(const key of ['preferred_office_provider_ids','preferred_office_provider_summary','requested_opening_preference','preferredProviderUserId','preferredProviderId','providerSelection','providerSelections','requested_profile_provider_id','enrollment_source'])delete bag[key];
}
// Brief interest forms never select a provider or reserve a time. Those requests
// belong to the full enrollment pathway and its server-side policy validation.
export function withoutQuickProviderSelection(payload={}) {
 const clean={...payload,preferences:{...payload.preferences}};
 for(const bag of [clean,clean.preferences])for(const key of ['preferredProviderUserId','preferredProviderId','providerId','preferred_office_provider_ids','preferred_office_provider_summary','requested_opening_preference','requestedOpening','requestedOpeningPreference','providerHoldToken','providerSelection','providerSelections','requested_profile_provider_id','enrollment_source'])delete bag[key];
 return clean;
}
