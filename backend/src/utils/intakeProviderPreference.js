import {linkLooksLikeOfficeIntake} from './officeIntakeLink.js';
export function allowsProviderPreference(link) {
 const type=String(link?.form_type||link?.formType||'').toLowerCase();
 if(/quick|short|interest|registration|request/.test(type))return false;
 if(String(link?.scope_type||'').toLowerCase()==='school')return false;
 return linkLooksLikeOfficeIntake(link)||link?.master_channel==='tutoring';
}
export function stripIneligibleProviderPreference(link,intakeData) {
 if(allowsProviderPreference(link))return;
 const bag=intakeData?.responses?.submission;if(!bag)return;
 for(const key of ['preferred_office_provider_ids','preferred_office_provider_summary','requested_opening_preference','preferredProviderUserId','preferredProviderId'])delete bag[key];
}
// Quick interest submissions never select a provider or reserve appointment time,
// including stale clients or requests forged outside the browser UI.
export function withoutQuickProviderSelection(payload={}) {
 const clean={...payload,preferences:{...payload.preferences}};
 for(const bag of [clean,clean.preferences])for(const key of ['preferredProviderUserId','preferredProviderId','providerId','preferred_office_provider_ids','preferred_office_provider_summary','requested_opening_preference','requestedOpening','providerHoldToken'])delete bag[key];
 return clean;
}
