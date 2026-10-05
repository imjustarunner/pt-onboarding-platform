// Generates blank carrier-review examples from the actual signing component.
// No recipient data, provider calls, database access or enrollment.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { buildSmsConsentDisclosure } from '../../backend/src/utils/smsConsentDisclosure.js';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(frontend, '../deliverables/vonage-10dlc-itsco');
const component = await fs.readFile(path.join(frontend, 'src/components/communications/SmsConsentForm.vue'), 'utf8');
const { descriptor } = parse(component);
const compiled = compileScript(descriptor, { id: 'sms-proof', inlineTemplate: true, templateOptions: { ssr: true } });
const scratch = await fs.mkdtemp(path.join(frontend, 'node_modules/.cache/sms-proof-'));
try {
  const modulePath = path.join(scratch, 'form.mjs');
  await fs.writeFile(modulePath, compiled.content);
  const { default: Form } = await import(pathToFileURL(modulePath).href);
  await fs.mkdir(output, { recursive: true });
  for (const [name, signerRole, purposes] of [
    ['operations', 'client', ['care', 'reminders', 'workforce']],
    ['staff', 'staff', ['care', 'reminders', 'workforce']],
    ['marketing', 'client', ['marketing']]
  ]) {
    const disclosure = buildSmsConsentDisclosure({ brandName: 'ITSCO', legalName: 'ITSCO, LLC',
      supportContact: 'support@itsco.health', termsUrl: 'https://www.itsco.health/itsco/terms',
      privacyUrl: 'https://www.itsco.health/itsco/privacypolicy', purposes }, { signerRole });
    const rendered = await renderToString(createSSRApp(Form, { disclosure, example: true, signerRole }));
    const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ITSCO ${name} consent example</title><style>body{font-family:Arial,sans-serif;background:#edf4f3;margin:0;padding:20px}${descriptor.styles.map(s => s.content).join('\n')}</style></head><body>${rendered}</body></html>`;
    await fs.writeFile(path.join(output, `itsco-${name}-consent-example.html`), html);
  }
} finally {
  await fs.rm(scratch, { recursive: true, force: true });
}
