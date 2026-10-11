import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mock }));
import OfficeLocation from '../OfficeLocation.model.js';
import { buildNoteAidLocationChoices } from '../../services/noteAidLocations.service.js';
import { requirePhysicalOffice } from '../../middleware/physicalOffice.middleware.js';
beforeEach(() => { vi.restoreAllMocks(); mock.execute.mockReset(); });
describe('shared physical buildings and agency billing identities', () => {
  it('blocks old billing IDs from creating their own rooms, bookings, or kiosk setup', async () => {
    mock.execute.mockResolvedValue([[{id:5,physical_office_location_id:1}]]);
    const res = {status:vi.fn().mockReturnThis(),json:vi.fn()}, next = vi.fn();
    await requirePhysicalOffice({user:{id:2}},res,next,'5');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({error:expect.objectContaining({physicalOfficeId:1})});
    expect(next).not.toHaveBeenCalled();
    mock.execute.mockResolvedValue([[{id:1,physical_office_location_id:null}]]);
    await requirePhysicalOffice({user:{id:2}},res,next,'1');
    expect(next).toHaveBeenCalledWith();
  });
  it('filters only physical lists, preserving billing/legacy queries by default', async () => {
    mock.execute.mockResolvedValue([[]]);
    await OfficeLocation.listAll({ physicalOnly: true });
    expect(mock.execute.mock.calls[0][0]).toContain('physical_office_location_id IS NULL');
    await OfficeLocation.findByAgencyMembership(6, { physicalOnly: true });
    expect(mock.execute.mock.calls[1][0]).toContain('ol.physical_office_location_id IS NULL');
    await OfficeLocation.findByAgencyMembership(6);
    expect(mock.execute.mock.calls[2][0]).not.toContain('physical_office_location_id IS NULL');
  });
  it('uses NLU’s identity even when shared ITSCO Windchime is first', async () => {
    const shared = { id:1, agency_id:2, name:'Windchime', practice_npi:'itsco' };
    const nlu = { id:5, agency_id:6, name:'Windchime', physical_office_location_id:1, practice_npi:'nlu' };
    vi.spyOn(OfficeLocation, 'findByAgencyMembership').mockResolvedValue([shared,nlu]);
    vi.spyOn(OfficeLocation, 'findByAgency').mockResolvedValue([nlu]);
    expect(await OfficeLocation.findBillingByAgency(6)).toEqual([nlu]);
  });
  it('keeps billing sites available to a provider assigned to the physical building', () => {
    const choices = buildNoteAidLocationChoices({ officeIds:[1], offices:[{id:5,physical_office_location_id:1,name:'Windchime',is_active:1}], locations:[{id:15,billing_office_location_id:5,name:'Office',place_of_service:'11',is_active:1}] });
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({serviceLocationId:15,billingOfficeLocationId:5});
    expect(buildNoteAidLocationChoices({officeIds:[6],offices:[{id:5,physical_office_location_id:1,name:'Windchime'}]})).toEqual([]);
  });
  it('rejects recreating a building the agency already owns or shares', async () => {
    mock.execute.mockResolvedValue([[{id:1}]]);
    await expect(OfficeLocation.create({agencyId:6,name:' Windchime '})).rejects.toMatchObject({status:409});
    expect(mock.execute).toHaveBeenCalledTimes(1);
    expect(mock.execute.mock.calls[0][1]).toEqual(['Windchime',6,6]);
  });
});
