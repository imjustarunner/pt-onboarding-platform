import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listClientsForGuardian:vi.fn(),isNoView:p=>!!p?.noView}}));
vi.mock('../guardianClinicalAccess.service.js',()=>({requireClinicalScope:vi.fn(),ageOn:dob=>dob==='1990-01-01'?36:null}));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { requireClinicalScope } from '../guardianClinicalAccess.service.js';
import { authorizedAppointmentClient, authorizedClient } from '../guardianAppointments.service.js';
const input={client_id:20,agency_id:450,client_type:'clinical',permissions_json:{}};
beforeEach(()=>{vi.clearAllMocks();ClientGuardian.listClientsForGuardian.mockResolvedValue([input]);pool.execute.mockImplementation(async sql=>sql.includes('SELECT c.id')?[[{id:20}]]:[[]]);requireClinicalScope.mockRejectedValue(Object.assign(new Error('Clinical access denied'),{status:403}));});
it('allows linked family scheduling without granting treatment or medical document access',async()=>{
  await expect(authorizedAppointmentClient(10,20,{agencyId:450})).resolves.toMatchObject({client_id:20,agency_id:450});
  expect(requireClinicalScope).not.toHaveBeenCalled();
  await expect(authorizedClient(10,20,'clinical_documents',{agencyId:450})).rejects.toMatchObject({status:403});
});
it.each([{noView:true},{noViewOtherGuardian:true},{coGuardianInviteRestricted:true},{canViewAppointments:false}])('preserves relationship restriction %j',async permissions_json=>{
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{...input,permissions_json}]);
  await expect(authorizedAppointmentClient(10,20,{agencyId:450})).rejects.toMatchObject({status:403});
});
it('rejects another family and an agency where the child is not enrolled',async()=>{
  await expect(authorizedAppointmentClient(10,21,{agencyId:450})).rejects.toMatchObject({status:403});
  pool.execute.mockResolvedValue([[]]);
  await expect(authorizedAppointmentClient(10,20,{agencyId:2})).rejects.toMatchObject({status:403});
});
it('keeps adult-child disclosure review while allowing an adult to schedule for themselves',async()=>{
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{...input,date_of_birth:'1990-01-01',relationship_type:'guardian'}]);
  await expect(authorizedAppointmentClient(10,20,{agencyId:450})).rejects.toMatchObject({status:403});
  ClientGuardian.listClientsForGuardian.mockResolvedValue([{...input,date_of_birth:'1990-01-01',relationship_type:'self'}]);
  await expect(authorizedAppointmentClient(10,20,{agencyId:450})).resolves.toMatchObject({client_id:20});
});
