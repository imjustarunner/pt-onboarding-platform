import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const publishedContract = JSON.parse(readFileSync(new URL('../data/claimmd-data-contract.json', import.meta.url), 'utf8'));
export const contractHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const pathName = path => path.replace(/^result\./, '').replaceAll('[]', '');

// These are specific uses in the current importers, not an assumption that every
// documented field is mapped. All remaining fields are reported for assessment.
const mapped = {
  eligdata: 'elig.eligid elig.ins_number elig.group_number elig.ins_name_f elig.ins_name_l elig.ins_dob elig.ins_sex elig.ins_addr_1 elig.ins_city elig.ins_state elig.ins_zip elig.plan_begin_date elig.plan_end_date elig.pat_name_f elig.pat_name_l elig.pat_dob elig.pat_sex elig.pat_addr_1 elig.pat_city elig.pat_state elig.pat_zip elig.benefit.benefit_code elig.benefit.benefit_coverage_code elig.benefit.entity_code elig.error.error_code elig.error.error_mesg',
  eradata: 'eraid check_number paid_amount paid_date payerid payer_name prov_taxid prov_npi payment_method payer_companyid claim.pcn claim.ins_number claim.payer_icn claim.pat_name_f claim.pat_name_l claim.status_code claim.total_paid claim.total_charge claim.from_dos claim.crossover_id claim.crossover_carrier claim.adjustment.group claim.adjustment.code claim.adjustment.amount claim.charge.proc_code claim.charge.from_dos claim.charge.thru_dos claim.charge.units claim.charge.mod1 claim.charge.mod2 claim.charge.mod3 claim.charge.mod4 claim.charge.charge claim.charge.paid claim.charge.adjustment.group claim.charge.adjustment.code claim.charge.adjustment.amount claim.charge.remark_code claim.charge.remark claim.charge.rem_code',
  eralist: 'last_eraid era.eraid era.payerid era.payer_name era.prov_taxid era.prov_npi era.paid_amount era.paid_date era.check_number era.check_type',
  response: 'last_responseid claim.remote_claimid claim.claimmd_id claim.claimid claim.status claim.messages.status claim.messages.message claim.messages.mesgid claim.messages.responseid',
  upload: 'claim.claimmd_id claim.claimid claim.status claim.messages.status claim.messages.message claim.messages.mesgid',
  payerlist: 'payer.payerid payer.payer_name payer.1500_claims payer.era payer.eligibility payer.secondary_support payer.payer_alt_names.alt_payerid payer.payer_alt_names.alt_payer_name',
  enroll: 'success link.url error.error_code error.error_mesg',
  webhook: 'acct_number events.eventid events.event_type events.event_time events.event_data.enroll.event events.event_data.enroll.prov_npi events.event_data.enroll.prov_taxid events.event_data.enroll.payerid events.event_data.enroll.enroll_type'
};
mapped.eligdata += ' elig.benefit.inplan_network elig.benefit.benefit_level_code elig.benefit.benefit_period_code elig.benefit.benefit_amount elig.benefit.benefit_percent elig.benefit.benefit_notes';
export const integratedEndpoints = Object.keys(mapped);
const used = Object.fromEntries(Object.entries(mapped).map(([key, paths]) => [key, new Set(paths.split(' '))]));
export const unintegratedDataEndpoints = ['uploadlist', 'claimdata', 'elig', 'era835', 'erapdf', 'notes'];

export function summarizePublishedContract(spec) {
  if (!spec?.paths || !spec?.components?.schemas) throw Error('claimmd_contract_format');
  const endpoints = {};
  const walk = (schema, path, out, depth = 0) => {
    if (!schema || depth > 30) return;
    if (schema.$ref) {
      if (!schema.$ref.startsWith('#/components/schemas/')) throw Error('claimmd_contract_external_reference');
      return walk(spec.components.schemas[schema.$ref.split('/').at(-1)], path, out, depth + 1);
    }
    if (schema.items) return walk(schema.items, path, out, depth + 1);
    for (const variant of [...(schema.oneOf || []), ...(schema.anyOf || []), ...(schema.allOf || [])]) walk(variant, path, out, depth + 1);
    if (schema.properties) {
      for (const key of Object.keys(schema.properties).sort()) walk(schema.properties[key], path ? `${path}.${key}` : key, out, depth + 1);
    } else if (path && !(schema.oneOf || schema.anyOf || schema.allOf)) {
      const key=pathName(path),type=String(schema.type || 'unspecified');
      out[key]=[...new Set([...(out[key]?.split('|') || []),type])].sort().join('|');
    }
  };
  for (const path of Object.keys(spec.paths).sort()) {
    const name = path.match(/^\/services\/([a-z0-9]+)\/$/)?.[1];
    if (!name) continue;
    const fields = {};
    walk(spec.components.schemas[name], '', fields);
    // Include request options, enums, and descriptions as well as response fields.
    // Their changes can expose capabilities without adding a new response key.
    endpoints[name] = { fields, definitionHash:contractHash(canonical({operation:spec.paths[path],schema:spec.components.schemas[name] || null})) };
  }
  if (spec.webhooks?.Webhook?.post?.requestBody?.content?.['application/json']?.schema) {
    const fields = {};
    walk(spec.webhooks.Webhook.post.requestBody.content['application/json'].schema, '', fields);
    endpoints.webhook = { fields, definitionHash:contractHash(canonical(spec.webhooks.Webhook)) };
  }
  if (!endpoints.eligdata || Object.keys(endpoints.eligdata.fields).length < 10) throw Error('claimmd_contract_incomplete');
  return { version: String(spec.info?.version || ''), sharedDefinitionsHash:contractHash(canonical(spec.components)), endpoints };
}

export function parsePublishedState(text) {
  const prefix = 'const __redoc_state = JSON.parse(';
  if (!text.startsWith(prefix) || !text.trimEnd().endsWith(');')) throw Error('claimmd_contract_format');
  // Parse data only. Never execute code downloaded from documentation.
  const state = JSON.parse(JSON.parse(text.trimEnd().slice(prefix.length, -2)));
  return summarizePublishedContract(state.definition?.data);
}

export function comparePublishedContract(current, baseline = publishedContract) {
  const issues = [];
  if (current.sharedDefinitionsHash && current.sharedDefinitionsHash !== baseline.sharedDefinitionsHash) issues.push({endpoint:'documentation',path:'$definitions',kind:'published_schema_changed',revision:current.sharedDefinitionsHash});
  for (const endpoint of unintegratedDataEndpoints) if (current.endpoints[endpoint]) issues.push({ endpoint, path: '$endpoint', kind: 'available_endpoint_not_integrated' });
  for (const [endpoint, definition] of Object.entries(current.endpoints)) {
    if (!baseline.endpoints[endpoint]) issues.push({ endpoint, path: '$endpoint', kind: 'new_documented_endpoint' });
    else if (definition.definitionHash && definition.definitionHash !== baseline.endpoints[endpoint].definitionHash) issues.push({endpoint,path:'$contract',kind:'documented_contract_changed',revision:definition.definitionHash});
    for (const [path, type] of Object.entries(definition.fields)) {
      const previous = baseline.endpoints[endpoint]?.fields[path];
      if (!previous) issues.push({ endpoint, path, kind: 'new_documented_field' });
      else if (previous !== type) issues.push({ endpoint, path, kind: 'documented_type_changed' });
      else if (used[endpoint] && !used[endpoint].has(path)) issues.push({ endpoint, path, kind: 'documented_field_without_dedicated_mapping' });
    }
  }
  for (const [endpoint, definition] of Object.entries(baseline.endpoints)) {
    if (!current.endpoints[endpoint]) issues.push({ endpoint, path: '$endpoint', kind: 'documented_endpoint_removed' });
    else for (const path of Object.keys(definition.fields)) if (!(path in current.endpoints[endpoint].fields)) issues.push({ endpoint, path, kind: 'documented_field_removed' });
  }
  return issues;
}

export function inspectReturnedFields(endpoint, response, { maxNodes = 50000, maxFields = 512 } = {}) {
  const fields = new Map(), issues = new Map();
  let nodes = 0, limited = false;
  const walk = (value, path, depth = 0) => {
    if (++nodes > maxNodes || depth > 40 || fields.size >= maxFields || path.length > 1024) { limited = true; return; }
    if (Array.isArray(value)) { for (const item of value) { walk(item, path, depth + 1); if (nodes > maxNodes) break; } }
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) { walk(item, path ? `${path}.${key}` : key, depth + 1); if (nodes > maxNodes) break; }
    } else if (path && value !== null && value !== '') fields.set(pathName(path), typeof value);
  };
  walk(response, '');
  for (const [path, type] of fields) {
    const documented = Object.hasOwn(publishedContract.endpoints[endpoint]?.fields || {}, path);
    const expected = (publishedContract.endpoints[endpoint]?.fields[path] || '').split('|').map(type=>type==='integer'?'number':type);
    if (documented && expected.every(type=>['string','boolean','number'].includes(type)) && !expected.includes(type)) issues.set(`type:${path}`, { endpoint, path, kind:'returned_field_type_changed' });
    if (used[endpoint]?.has(path)) continue;
    const kind = documented ? 'returned_field_without_dedicated_mapping' : 'unrecognized_returned_field';
    issues.set(`${kind}:${path}`, { endpoint, path, kind });
  }
  if (limited) issues.set('limit', { endpoint, path: '$inspection', kind: 'response_inspection_incomplete' });
  return [...issues.values()];
}

export function publicIssuePath(issue) {
  // Unknown object keys can themselves contain identifiers. Only known public
  // schema names enter notifications; original paths are encrypted in storage.
  return ['$endpoint','$inspection','$processing','$catalog','$contract','$definitions'].includes(issue.path) ? issue.path
    : Object.hasOwn(publishedContract.endpoints[issue.endpoint]?.fields || {}, issue.path) ? issue.path
      : `unrecognized-field-${contractHash(issue.path).slice(0, 12)}`;
}
