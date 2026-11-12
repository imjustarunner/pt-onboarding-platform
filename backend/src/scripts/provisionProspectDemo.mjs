import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { createProspectDemoService, prospectPlan } from '../services/prospectDemo.service.js';

const { values } = parseArgs({ options: {
  research: { type: 'string' }, slug: { type: 'string' }, 'provider-alias': { type: 'string' },
  'careers-alias': { type: 'string' }, 'owner-email': { type: 'string' },
  'source-agency': { type: 'string', default: '450' }, 'actor-id': { type: 'string' },
  'fixture-count': { type: 'string' }, apply: { type: 'boolean', default: false },
  'self-pay-rate-cents': { type: 'string' },
  'agency-id': { type: 'string' }, 'clear-fixtures': { type: 'boolean', default: false },
  activate: { type: 'boolean', default: false }, 'confirm-slug': { type: 'string' }
} });
try {
  const service = createProspectDemoService({ database: pool, hashPassword: value => bcrypt.hash(value, 12) });
  if (values['clear-fixtures'] || values.activate) {
    if (!values.apply || !values['agency-id'] || !values['confirm-slug']) throw new Error('Cleanup requires --apply, --agency-id and --confirm-slug.');
    console.log(JSON.stringify(await service.clearFixtures(Number(values['agency-id']), { id: Number(values['actor-id']) },
      { activate: values.activate, confirmSlug: values['confirm-slug'] }), null, 2));
  } else {
    if (!values.research || !values.slug || !values['actor-id']) throw new Error('Use --research FILE --slug SLUG --actor-id ID; add --apply after reviewing the plan.');
    const research = JSON.parse(await fs.readFile(values.research, 'utf8'));
    const options = { slug: values.slug, providerAlias: values['provider-alias'], careersAlias: values['careers-alias'],
      ownerEmail: values['owner-email'], sourceAgencyId: Number(values['source-agency']),
      actorUserId: Number(values['actor-id']), fixtureCount: Number(values['fixture-count']) || undefined,
      selfPayRateCents: values['self-pay-rate-cents'] ? Number(values['self-pay-rate-cents']) : null };
    const plan = prospectPlan(research, options);
    if (!values.apply) console.log(JSON.stringify({ dryRun: true, name: plan.name, slug: plan.slug,
      providerCount: plan.providers.length, officeCount: research.locations?.length || 0,
      clientCount: plan.fixtureCount, ownerEmail: plan.providers[plan.ownerIndex].email,
      providerAlias: plan.providerAlias, careersAlias: plan.careersAlias, sampleJobs: 3 }, null, 2));
    else console.log(JSON.stringify(await service.provision(research, options), null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }
