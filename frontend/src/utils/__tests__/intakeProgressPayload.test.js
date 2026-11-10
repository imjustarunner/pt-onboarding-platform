import {test,expect} from 'vitest';import {compactIntakeProgress,restoreIntakeProgressSnapshot} from '../intakeProgressPayload.js';
test('a large insurance draft round-trips once without losing signatures or card previews',()=>{
 const responses={submission:{insuranceInfo:{photos:{primary_front_preview:'data:image/png;base64,'+'A'.repeat(600000)},authorizationSignature:'Parent'},smartSchoolRoi:{signatureData:'signed'}},clients:[{name:'First'},{name:'Second'},{name:'Third'}]};
 const data={responses,progressSnapshot:{intakeResponses:structuredClone(responses),currentFlowIndex:9,sessionToken:'same-session'}};
 const compact=compactIntakeProgress(data);expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(data).length*.51);expect(restoreIntakeProgressSnapshot(JSON.parse(JSON.stringify(compact))).intakeResponses).toEqual(responses);expect(compact.progressSnapshot.sessionToken).toBe('same-session');expect(data.progressSnapshot.intakeResponses).toEqual(responses);
});
test('old saved snapshots still restore their own responses',()=>{expect(restoreIntakeProgressSnapshot({responses:{a:2},progressSnapshot:{intakeResponses:{a:1}}}).intakeResponses).toEqual({a:1});});
import { savedInsuranceCard } from '../savedInsuranceCard.js';
test('recovers a retained image as an uploadable File without fetching another URL',async()=>{
 const file=savedInsuranceCard('data:image/png;base64,aGVsbG8=','primary_front');expect(file.name).toBe('primary_front.png');expect(file.type).toBe('image/png');expect(file.size).toBe(5);
 expect(savedInsuranceCard('https://outside.example/anything','primary_front')).toBeNull();expect(savedInsuranceCard('data:text/html;base64,aGVsbG8=','primary_front')).toBeNull();expect(savedInsuranceCard('data:image/png;base64,???','primary_front')).toBeNull();
});
