import {expect,it} from 'vitest';
import {publicErrorMessage} from '../publicErrorMessage.js';
it.each([
 {message:"Unknown column 'metadata_json' in 'field list'"},
 {message:'A query failed',code:'ER_BAD_FIELD_ERROR'},
 {message:'Invalid request',sqlMessage:'SQLSTATE 42S22'},
 {message:'Failure at worker.js:52'}
])('keeps internal database and stack errors out of responses: %j',error=>{
 expect(publicErrorMessage(error)).toBe('We could not complete this request. Please try again. If it continues, contact support.');
});
it('retains an actionable authorization or validation message',()=>{
 expect(publicErrorMessage({status:409,message:'Review the student roster before opening this session.'})).toBe('Review the student roster before opening this session.');
});
