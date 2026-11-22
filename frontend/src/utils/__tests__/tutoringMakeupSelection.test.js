import {it,expect} from 'vitest';
import {tutoringMakeupSelection} from '../tutoringMakeupSelection.js';
const a={agencyId:453,providerUserId:1496,participants:[{clientId:2547}],learningContext:{serviceEnrollmentId:1038}};
const context={agencyId:453,providerId:1496,clientIds:[2547],subjects:[{key:'math',serviceEnrollmentId:1038}]};
it('keeps the original learner and exact subject for the new makeup',()=>expect(tutoringMakeupSelection(a,context)).toEqual({clientId:2547,subjectKey:'math'}));
it.each([{agencyId:450},{providerId:1807},{clientIds:[]},{subjects:[]}])('explains a missing makeup prerequisite %j',bad=>expect(()=>tutoringMakeupSelection(a,{...context,...bad})).toThrow());
it('allows General only when the original appointment was General',()=>expect(tutoringMakeupSelection({...a,learningContext:{generalSupport:true}},{...context,subjects:[]})).toEqual({clientId:2547,subjectKey:'general'}));
