import axios from 'axios';
import config from '../config/config.js';

export const allianceSuggestion = {
  name: 'Alliance Urgent Care & Family Practice', organization_name: 'Alliance Urgent Care & Family Practice',
  phone: '719-282-6337', fax: '719-282-0532',
  address: '9320 Grand Cordera Parkway #100, Colorado Springs, CO 80924',
  website: 'https://www.alliancemedicalpractice.com/',
  source_url: 'https://www.alliancemedicalpractice.com/services/family-practice',
  specialties: 'Family practice, pediatrics, urgent care', checked_on: '2026-09-28'
};

export async function lookupReferralBusiness({ name, location }, { http = axios } = {}) {
  const queryName = String(name || '').trim(), queryLocation = String(location || '').trim();
  if (queryName.length < 3 || queryName.length > 200 || !queryLocation || queryLocation.length > 120 || /[\r\n@]/.test(queryName + queryLocation)) {
    throw Object.assign(new Error('Enter only a business name and city/state.'), { safe: true, status: 400 });
  }
  const known = /\balliance\b/i.test(queryName) && /colorado springs/i.test(queryLocation) ? [allianceSuggestion] : [];
  const key = config.googleMaps?.apiKey;
  if (!key) return { candidates: known, warning: 'Live business lookup needs GOOGLE_MAPS_API_KEY and Places API (New). You can enter a directory record manually.' };
  try {
    const response = await http.post('https://places.googleapis.com/v1/places:searchText', {
      textQuery: `${queryName} ${queryLocation}`, regionCode: 'US', languageCode: 'en', pageSize: 5
    }, { timeout: 15000, headers: { 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri' } });
    return { candidates: [...known, ...(response.data?.places || []).map(p => ({
      name: p.displayName?.text || '', organization_name: p.displayName?.text || '',
      address: p.formattedAddress || '', phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '', source_url: p.googleMapsUri || ''
    }))] };
  } catch { return { candidates: known, warning: 'Live business lookup is unavailable. Review the saved suggestion or enter contact information manually.' }; }
}
