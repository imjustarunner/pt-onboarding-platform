import { FormSpecSyncService } from '../services/formSpecSync.service.js';

async function main() {
  const started = Date.now();
  const out = await FormSpecSyncService.syncFromProviderOnboardingModulesMd();
  const ms = Date.now() - started;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ...out, durationMs: ms }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

