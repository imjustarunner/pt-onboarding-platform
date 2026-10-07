import 'dotenv/config';
import { campaignPath, listVonage10dlc } from '../services/vonage10dlc.service.js';

// Read-only, no database dependency and no messages, purchases or cancellations.
// Emit public registration metadata only; never EINs, contacts or credentials.
try {
  const brands = await listVonage10dlc('/brands', 'brands');
  const report = { checkedAt: new Date().toISOString(), complete: true, brands: [], campaigns: [], findings: [] };
  for (const brand of brands) {
    report.brands.push({ brandId: brand.brand_id, name: brand.display_name, status: brand.status, entityType: brand.entity_type });
    if (brand.entity_type === 'SOLE_PROPRIETOR') report.findings.push({ brandId: brand.brand_id, issue: 'confirm_no_EIN_or_business_registration' });
    const campaigns = await listVonage10dlc(`/brands/${encodeURIComponent(brand.brand_id)}/campaigns`, 'campaigns');
    for (const campaign of campaigns) {
      const entry = { brand: brand.display_name, brandId: brand.brand_id, campaignId: campaign.campaign_id,
        name: campaign.label, status: campaign.status, trafficEnabled: campaign.traffic_enabled,
        createdAt: campaign.created_date, registeredAt: campaign.registration_date,
        usecase: campaign.usecase, subUsecases: campaign.sub_usecases, resellerId: campaign.reseller_id,
        linkedNumbers: null };
      report.campaigns.push(entry);
      for (const field of ['help_message', 'opt_in_message', 'opt_out_message']) {
        if (/support@abc\.com|\bExample:\s*\[/i.test(campaign[field] || '')) {
          report.findings.push({ campaignId: entry.campaignId, issue: 'registration_contains_example_placeholder', field,
            action: 'Replace the example with the real branded response. Campaign edits may trigger a new carrier review.' });
        }
      }
      // Terminated campaign number endpoints return 404; that is not an active program.
      if (['TERMINATED', 'DELETED'].includes(campaign.status)) continue;
      try {
        const numbers = await listVonage10dlc(campaignPath(entry) + '/numbers', 'numbers');
        entry.linkedNumbers = numbers.filter(number => number.status === 'LINKED').length;
        if (!entry.linkedNumbers) report.findings.push({ campaignId: entry.campaignId,
          issue: campaign.status === 'ACTIVE' ? 'active_campaign_has_no_linked_number' : 'link_number_when_approved',
          action: 'Confirm non-use fee timing with Vonage; link an eligible number for intended use or review cancellation of an unused campaign.' });
      } catch (error) {
        report.complete = false;
        report.findings.push({ campaignId: entry.campaignId, issue: 'number_inventory_unavailable', code: error.code || 'audit_incomplete' });
      }
      if (campaign.status === 'ACTIVE' && campaign.traffic_enabled !== true) {
        report.findings.push({ campaignId: entry.campaignId, issue: 'active_campaign_traffic_disabled' });
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.complete ? (report.findings.length ? 2 : 0) : 1;
} catch (error) {
  console.error(JSON.stringify({ complete: false, code: error.code || 'audit_failed', message: error.message }));
  process.exitCode = 1;
}
