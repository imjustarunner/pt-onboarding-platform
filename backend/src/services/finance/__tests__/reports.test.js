import pool from '../../../config/database.js';
import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {operationalReport} from '../reports.js';
import {csvCell} from '../policy.js';
test('grant and program reports distinguish commitments from payments and never add bank evidence',()=>{
 const data={organization:{name:'Demo'},role:'manager',programs:[{id:1,name:'Mentoring'}],budgets:[{id:2,program_id:1,grant_id:3,amount_cents:10000}],grants:[{id:3,name:'Award',award_cents:12000}],allocations:[{id:4,budget_id:2}],expenses:[{id:5,program_id:1,amount_cents:2000,status:'paid'},{id:6,program_id:1,amount_cents:3000,status:'approved'},{id:7,program_id:1,amount_cents:1000,status:'submitted'}],splits:[{expense_id:5,allocation_id:4,amount_cents:2000},{expense_id:6,allocation_id:4,amount_cents:3000}]};
 assert.deepEqual(operationalReport(data,'program-budgets')[1],['Demo','Mentoring',100,20,30,50,10]);
 assert.deepEqual(operationalReport(data,'grant-utilization')[1].slice(0,7),['Demo','Award',120,100,20,30,70]);
 assert.throws(()=>operationalReport({...data,role:'requester'},'grant-utilization'),/manager/);
 assert.equal(csvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
});

after(()=>pool.end());
