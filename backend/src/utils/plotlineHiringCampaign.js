import { createHash } from 'node:crypto';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
// Bind the operator's reviewed broader program to its carrier description,
// collection methods and message content, excluding volatile status timestamps.
export function plotlineHiringCampaignDigest(campaign){
  const fields=['brand_id','campaign_id','label','description','message_flow','message_flow_details','sample_one','sample_two','sample_three','sample_four','sample_five','url_samples',
    'usecase','sub_usecases','reseller_id','opt_out_assist','embedded_link','embedded_phone',
    'help_message','opt_in_message','opt_out_message','opt_in_keywords','opt_out_keywords','help_keywords',
    'subscriber_opt_in','subscriber_opt_out','subscriber_help'];
  return createHash('sha256').update(JSON.stringify(canonical(Object.fromEntries(fields.map(key=>[key,campaign[key]??null]))))).digest('hex');
}

export function hasPlotlineOnlineHiringFlow(campaign) {
  return campaign?.message_flow_details?.consent_mechanisms?.some(mechanism =>
    mechanism.method === 'ONLINE_FORM' && typeof mechanism.details === 'string' && mechanism.details.trim()
    && mechanism.attachment === 'https://plotlinepo.com/hiring-sms-consent') === true;
}
