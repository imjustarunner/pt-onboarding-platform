import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isItscoSupervisor,publicPerson} from '../../backend/src/utils/itscoPublicWebsite.js';
test('supervisor eligibility is independent of seeing clients, openings, and display title',()=>{
 for(const row of [
  {first_name:'Pauline',last_name:'Boyd',role:'provider',has_supervisor_privileges:1,sees_clients:0},
  {first_name:'Michael',last_name:'Mendez',role:'super_admin',title:'Director',has_supervisor_privileges:true},
  {first_name:'Rachel',last_name:'Finch',role:'admin',title:'Director',has_supervisor_privileges:'1'},
  {role:'supervisor',has_supervisor_privileges:0,provider_accepting_new_clients:0}
 ])assert.equal(isItscoSupervisor(row),true);
 assert.equal(isItscoSupervisor({role:'provider',title:'Former supervisor',has_supervisor_privileges:0}),false);
 assert.equal(isItscoSupervisor({role:'admin',has_supervisor_privileges:'0'}),false);
 assert.equal(isItscoSupervisor(null),false);
});
test('supervision roster retains only public profile data',()=>{
 const person=publicPerson({id:506,first_name:'Pauline',last_name:'Boyd',has_supervisor_privileges:1,sees_clients:0,email:'private@example.test',role:'provider'},null,()=>null);
 assert.equal(person.displayName,'Pauline Boyd');
 for(const key of ['email','role','has_supervisor_privileges','sees_clients'])assert.equal(key in person,false);
});
