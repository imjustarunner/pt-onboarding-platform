import {it,expect,vi} from 'vitest';
import * as XLSX from 'xlsx';
vi.mock('../../config/database.js',()=>({onTableWrite:vi.fn(),default:{execute:vi.fn(),query:vi.fn(),getConnection:vi.fn()}}));
import {parsePayrollFile} from '../payroll.controller.js';
import {getBillingImportMetadata,copyBillingImportMetadata} from '../../utils/payrollBillingImportMetadata.js';
const headers=['Date of Service','Clinician Name','First Name','Last Name','Patient DOB','Primary Payer','Insurance Member ID','POS','Location','Service Code','Units','Note Status','Type'];
const row=['10/24/2026','Provider Example','Alice','SensitiveSurname','02/03/2014','Source Payer','MEMBER123','03','School A','H0004','4','Finalized','Appointment'];
it('uses the payroll header detector and keeps profile source fields out of JSON DTOs',()=>{
 const file=Buffer.from(['Payroll report,','Period October 24-November 6,',headers.join(','),row.join(',')].join('\n'));
 const parsed=parsePayrollFile(file,'report.csv');expect(parsed.rows).toHaveLength(1);
 const metadata=getBillingImportMetadata(parsed.rows[0]);expect(metadata).toMatchObject({sourceRowNumber:4,placeOfService:'03',profileFields:{fullName:'Alice SensitiveSurname',dateOfBirth:'2014-02-03',primaryPayer:'Source Payer',explicitMemberId:'MEMBER123'}});
 expect(JSON.stringify(parsed)).not.toContain('SensitiveSurname');expect(JSON.stringify(parsed)).not.toContain('MEMBER123');expect(JSON.stringify(parsed)).not.toContain('Source Payer');
 const copied={serviceCode:parsed.rows[0].serviceCode,...copyBillingImportMetadata(parsed.rows[0])};expect(getBillingImportMetadata(copied)).toEqual(metadata);expect(Object.keys(copied)).toEqual(['serviceCode']);
});
it('uses the same source capture for XLSX preambles and retains skipped-row ordinals',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['Billing report'],headers,[...row.slice(0,12),'Payment'],row]);const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Report');
 const parsed=parsePayrollFile(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'report.xlsx');expect(parsed.rows).toHaveLength(1);expect(getBillingImportMetadata(parsed.rows[0]).sourceRowNumber).toBe(4);
 expect(getBillingImportMetadata(parsed.rows[0]).additionalProfileRows).toHaveLength(2);
 expect(getBillingImportMetadata(parsed.rows[0]).additionalProfileRows[0].sourceRowNumber).toBe(3);
});
