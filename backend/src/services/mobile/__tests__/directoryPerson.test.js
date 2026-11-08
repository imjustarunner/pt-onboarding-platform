import {it,expect} from 'vitest';
import {mapDirectoryPerson} from '../directoryPerson.service.js';
it('keeps school identity and explicit admin authority separate from agency branding',()=>{
 const row={id:12,first_name:'Abby',last_name:'Synthetic',role:'school_staff',school_id:451,school_name:'Fictional school',is_school_admin:1,credential:null,work_phone_extension:'ext. 123',phone_number:'personal-do-not-use'};
 expect(mapDirectoryPerson(row,'school_staff',{slug:'itsco'})).toMatchObject({schoolId:451,schoolName:'Fictional school',isSchoolAdmin:true,workPhone:'719-657-7444',workPhoneExtension:'123'});
 expect(mapDirectoryPerson({...row,is_school_admin:0},'school_staff',{})).toMatchObject({isSchoolAdmin:false,workPhone:null});
});
it('preserves provider credentials and uses work/agency numbers without exposing personal phones',()=>{expect(mapDirectoryPerson({id:7,first_name:'Synthetic',last_name:'Provider',credential:'MSW, LSW',phone_number:'personal'},'providers',{slug:'nlu'})).toMatchObject({displayName:'Synthetic Provider',credential:'MSW, LSW',workPhone:'719-377-6577',isSchoolAdmin:false});});
