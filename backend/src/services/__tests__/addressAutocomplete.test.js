import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/config.js',()=>({default:{googleMaps:{apiKey:'fake-test-provider-key'}}}));
import {createAddressAutocompleteService,addressFromPlace} from '../addressAutocomplete.service.js';
const sessionToken='5f51e2c3-5e27-4da4-8664-d4e0654aaee7';
const place={formattedAddress:'1600 Pennsylvania Avenue NW, Washington, DC 20500, USA',addressComponents:[
 ['street_number','1600'],['route','Pennsylvania Avenue Northwest'],['locality','Washington'],['administrative_area_level_1','District of Columbia','DC'],['postal_code','20500'],['country','United States','US'],['subpremise','Unit 9']
].map(([type,longText,shortText])=>({types:[type],longText,shortText}))};
let http,service,now;
beforeEach(()=>{now=100000;http={post:vi.fn().mockResolvedValue({data:{suggestions:[{placePrediction:{placeId:'testPlace_1',text:{text:place.formattedAddress}}}]}}),get:vi.fn().mockResolvedValue({data:place})};service=createAddressAutocompleteService({http,apiKey:()=> 'fake-test-provider-key',now:()=>now});});
const suggest=(overrides={})=>service.suggest({query:'1600 Pennsylvania',sessionToken,locale:'es',scope:'user:100',...overrides});
describe('private address lookup proxy',()=>{
 it('sends minimal address query, anonymous UUID and language without app/user data or a broad field mask',async()=>{
  const suggestions=await suggest();expect(suggestions).toHaveLength(1);expect(suggestions[0]).toEqual({label:place.formattedAddress,selectionToken:expect.any(String)});
  const [url,body,opts]=http.post.mock.calls[0];expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');expect(body).toEqual({input:'1600 Pennsylvania',sessionToken,languageCode:'es',regionCode:'US',includedRegionCodes:['us'],includeQueryPredictions:false});
  expect(JSON.stringify(body)).not.toContain('user:100');expect(opts.headers['X-Goog-FieldMask']).toBe('suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
 });
 it('uses the selected permit and same session token for essential address fields, excluding apartment',async()=>{
  const [match]=await suggest();const result=await service.select({selectionToken:match.selectionToken,scope:'user:100',locale:'es-MX'});expect(result).toMatchObject({street:'1600 Pennsylvania Avenue Northwest',city:'Washington',state:'DC',postalCode:'20500',country:'US'});expect(result).not.toHaveProperty('apartment');
  const [url,opts]=http.get.mock.calls[0];expect(url).toBe('https://places.googleapis.com/v1/places/testPlace_1');expect(opts.params).toEqual({sessionToken,languageCode:'es',regionCode:'US'});expect(opts.headers['X-Goog-FieldMask']).toBe('addressComponents,formattedAddress');
 });
 it('rejects cross-account, expired, tampered or arbitrary place selections before calling Google',async()=>{
  const [match]=await suggest();for(const args of [{scope:'user:101',selectionToken:match.selectionToken},{scope:'user:100',selectionToken:match.selectionToken+'x'},{scope:'user:100',selectionToken:'some-place-id'}])await expect(service.select(args)).rejects.toMatchObject({status:400,code:'ADDRESS_SELECTION_EXPIRED'});
  now+=600001;await expect(service.select({scope:'user:100',selectionToken:match.selectionToken})).rejects.toMatchObject({status:400});expect(http.get).not.toHaveBeenCalled();
 });
 it.each(['','ab','a'.repeat(201),'123\nSecret'])('rejects invalid query before provider request (%s)',async query=>{await expect(suggest({query})).rejects.toMatchObject({status:400});expect(http.post).not.toHaveBeenCalled();});
 it('rejects nonanonymous session tokens and missing provider configuration',async()=>{await expect(suggest({sessionToken:'patient-123'})).rejects.toMatchObject({status:400});const disabled=createAddressAutocompleteService({http,apiKey:()=>''});await expect(disabled.suggest({query:'1600 Pennsylvania',sessionToken,scope:'user:100'})).rejects.toMatchObject({status:503});expect(http.post).not.toHaveBeenCalled();});
 it('only returns place matches and at most five options, not query predictions',async()=>{http.post.mockResolvedValue({data:{suggestions:[{queryPrediction:{text:{text:'not a place'}}},...Array.from({length:8},(_,i)=>({placePrediction:{placeId:`place${i}`,text:{text:`Address ${i}`}}}))]}});expect(await suggest()).toHaveLength(5);});
 it('requires manual review for non-US or incomplete addresses',async()=>{const [match]=await suggest();http.get.mockResolvedValue({data:{...place,addressComponents:place.addressComponents.map(p=>p.types.includes('country')?{...p,shortText:'CA'}:p)}});await expect(service.select({scope:'user:100',selectionToken:match.selectionToken})).rejects.toMatchObject({code:'ADDRESS_NEEDS_REVIEW'});http.get.mockResolvedValue({data:{formattedAddress:'Washington DC'}});await expect(service.select({scope:'user:100',selectionToken:match.selectionToken})).rejects.toMatchObject({code:'ADDRESS_NEEDS_REVIEW'});});
 it('clears unknown structured parts rather than inventing geographic data',()=>{expect(addressFromPlace({formattedAddress:'A public street',addressComponents:[{types:['route'],longText:'A public street'}]})).toEqual({street:'A public street',city:'',state:'',postalCode:'',country:'',formattedAddress:'A public street'});});
});
