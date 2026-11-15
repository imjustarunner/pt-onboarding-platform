import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../demographicsImport.service.js', () => ({ clientHasDemographicsOnFile: vi.fn() }));
vi.mock('../paperPacketDemographics.service.js', () => ({ readPaperPacketDemographicCandidate: vi.fn() }));
vi.mock('../paperPacketVision.service.js', () => ({ getLatestPaperPacketVisionEval: vi.fn(), schedulePaperPacketVisionEval: vi.fn() }));
vi.mock('../../utils/paperPacketClient.js', () => ({ isPaperPacketClient: () => false, isSchoolRegistrationClient: client => client.client_type === 'school' }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { clientHasDemographicsOnFile } from '../demographicsImport.service.js';
import { loadChartSetupStatus } from '../chartSetupStatus.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockResolvedValue([[{ id: 1 }]]);
  clinicalPool.execute.mockResolvedValue([[{ id: 2 }]]);
});

it('recognizes demographics already on file for school clients', async () => {
  clientHasDemographicsOnFile.mockReturnValue(true);
  expect(await loadChartSetupStatus({ client: { id: 4, agency_id: 6, client_type: 'school' } }))
    .toMatchObject({ demographicsOnFile: true, setupComplete: true, schoolClient: true });
});

it('requires demographics for school charts just as for other clinical charts', async () => {
  clientHasDemographicsOnFile.mockReturnValue(false);
  expect(await loadChartSetupStatus({ client: { id: 4, agency_id: 6, client_type: 'school' } }))
    .toMatchObject({ demographicsOnFile: false, setupComplete: false });
});
