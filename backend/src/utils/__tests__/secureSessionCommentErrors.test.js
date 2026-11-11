import { describe, expect, it } from 'vitest';
import { safeFamilySharingErrorDetails } from '../safeFamilySharingErrorDetails.js';
import { FAMILY_COMMUNICATION_POLICY_VERSION } from '../../../../frontend/src/navigation/familyCommunicationPolicy.js';

describe('shared communication recovery metadata', () => {
  const privateFields = {
    body:'private clinical text',request:{body:'private draft'},headers:{authorization:'private token'},
    recipients:[{id:1729,email:'private@example.test'}],details:{raw:'private'},sqlMessage:'private SQL',stack:'private stack'
  };
  it('returns only current notice coordinates for a known acknowledgment conflict', () => {
    const error = Object.assign(new Error('Review the notice.'),privateFields,{
      status:409,code:'FAMILY_SHARING_ACK_REQUIRED',agencyId:'450',version:FAMILY_COMMUNICATION_POLICY_VERSION
    });
    expect(safeFamilySharingErrorDetails(error)).toEqual({code:'FAMILY_SHARING_ACK_REQUIRED',agencyId:450,version:FAMILY_COMMUNICATION_POLICY_VERSION});
    expect(error.body).toBe('private clinical text');
  });
  it.each(['FAMILY_SHARED_AUDIENCE_CHANGED','FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED','FAMILY_SHARED_CONTEXT_REQUIRED'])(
    'passes only the code for %s',code=>{
      expect(safeFamilySharingErrorDetails({...privateFields,status:409,code,agencyId:450,version:FAMILY_COMMUNICATION_POLICY_VERSION})).toEqual({code});
    });
  it.each([undefined,null,{}, {status:403,code:'FAMILY_SHARING_ACK_REQUIRED'},
    {status:500,code:'FAMILY_SHARED_AUDIENCE_CHANGED'}, {status:409,code:'FAMILY_UNKNOWN_ERROR'},
    {status:409,code:'INSURANCE_VERIFICATION_REQUIRED'}, {status:409,code:'__proto__'}])('ignores unknown or non-conflict errors %#',error=>{
    expect(safeFamilySharingErrorDetails(error)).toEqual({});
  });
  it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'not-an-id',null,undefined])('omits invalid agency metadata %#',agencyId=>{
    expect(safeFamilySharingErrorDetails({status:409,code:'FAMILY_SHARING_ACK_REQUIRED',agencyId,version:FAMILY_COMMUNICATION_POLICY_VERSION})).toEqual({code:'FAMILY_SHARING_ACK_REQUIRED',version:FAMILY_COMMUNICATION_POLICY_VERSION});
  });
  it.each(['old-version','private clinical text',{},null,undefined])('never forwards unrecognized version values %#',version=>{
    expect(safeFamilySharingErrorDetails({status:409,code:'FAMILY_SHARING_ACK_REQUIRED',agencyId:450,version})).toEqual({code:'FAMILY_SHARING_ACK_REQUIRED',agencyId:450});
  });
});
