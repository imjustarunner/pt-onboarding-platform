import { CONTRACT_SERVICE_FOCUS_OPTIONS } from '../content/contractServiceFocusOptions.js';
import pool from '../config/database.js';
import { handbookTenant } from './handbookTenant.js';



export function serviceFocusOptionsFromSections(sections) {
  const options = [];
  for (const section of sections || []) {
    const html = String(section.body_html ?? section.bodyHtml ?? '');
    const categories = html.match(/<h[1-6]\b[^>]*>\s*Service Focus Categories\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/i)?.[1];
    const list = categories?.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/i)?.[1];
    for (const match of (list || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const label = match[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
      if (label && !options.includes(label)) options.push(label);
    }
  }
  return options;
}

export async function contractServiceFocusSettings(agency) {
  const tenant = handbookTenant(agency);
  if (!tenant) return { serviceFocusOptions: [], schoolDaysEnabled: false };
  // Read only the published version; opening a contract must never create a handbook draft.
  let sections;
  try {
    const [rows] = await pool.execute(
      `SELECT s.body_html FROM workplace_handbook_documents d
       JOIN workplace_handbook_sections s ON s.version_id = d.published_version_id
       WHERE d.agency_id = ? ORDER BY s.sort_order, s.id`, [agency.id]
    );
    sections = rows;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  if (!sections?.length) return { serviceFocusOptions: CONTRACT_SERVICE_FOCUS_OPTIONS[tenant] || [], schoolDaysEnabled: tenant === 'itsco' };
  return { serviceFocusOptions: serviceFocusOptionsFromSections(sections), schoolDaysEnabled: tenant === 'itsco' };
}

export function hasSchoolServiceFocus(value) {
  return /\bschools?\b/i.test(String(value || ''));
}

export const SCHOOL_DAY_EXPECTATION_HTML = '<p data-school-day-expectations="true"><strong>School-based attendance:</strong> As part of the school-based service focus, the {{ROLE_LABEL}} is expected to be present in the assigned school for a minimum of {{MIN_DAYS_PER_WEEK}} days per week. A school day is approximately 8:00 a.m.–3:00 p.m., with roughly seven clients per day. These are expected days in the school, including when school-based services are only part of the role’s service focus.</p>';
