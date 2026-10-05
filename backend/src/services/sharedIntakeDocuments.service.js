import { intakeDataForChild, intakeChildRoster } from '../utils/multiChildIntake.js';

/** Generate shared agreements separately for each chart using the one authorized
 * signing session. A child's failure must never substitute another child's PDF. */
export async function buildSharedIntakeDocuments({ clients, intakeData, generate }) {
  const pathsByClient = new Map();
  const failures = new Map();
  const expectedCount = intakeChildRoster(intakeData).length;
  const multi = expectedCount > 1;
  if (multi && (clients.length !== expectedCount || clients.some(client => !Number(client.id)))) {
    const error = new Error('Not every enrolled child has a chart for their signed packet');
    for (const client of clients) failures.set(Number(client.id) || 0, error);
    if (!failures.size) failures.set(0, error);
    return { pathsByClient, failures };
  }
  for (const [index, client] of clients.entries()) {
    const id = Number(client.id);
    if (!id) continue;
    try {
      const scopedData = multi ? intakeDataForChild(intakeData, index) : intakeData;
      const paths = await generate({ client, index, intakeData: scopedData });
      pathsByClient.set(id, [...new Set(paths.filter(Boolean))]);
    } catch (error) {
      failures.set(id, error);
    }
  }
  return { pathsByClient, failures };
}
