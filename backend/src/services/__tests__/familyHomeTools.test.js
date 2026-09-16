import { beforeEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),authorize:vi.fn(),gemini:vi.fn(),save:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../familyAuth.service.js',()=>({requireHousehold:mocks.authorize}));
vi.mock('../family.service.js',()=>({familyTransaction:fn=>fn({execute:mocks.execute}),saveFamilyEntry:mocks.save}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:mocks.gemini}));
import { normalizeHomePreferences,chooseDecision,chooseFamilyTakeout,addRecipeIngredients,getFamilyPhoto,generateFamilyRecipe } from '../familyHomeTools.service.js';
import { FAMILY_CUISINES } from '../familyCuisines.js';
import { normalizeRecipe,parseRecipeResponse,ingredientIndexes } from '../familyRecipePolicy.js';
const recipe={title:'Lemon pasta',ingredients:[{name:'Pasta',quantity:'1 lb'},{name:'Lemon',quantity:'1'}],steps:['Cook pasta.','Add lemon.'],servings:4,minutes:20};
beforeEach(()=>{vi.clearAllMocks();mocks.authorize.mockResolvedValue({id:7,role:'parent'});});
describe('family home tools',()=>{
  it('normalizes distinct choices and picks from the complete list',()=>{
    expect(normalizeHomePreferences({decisionOptions:[' A ','A','B','']} ).decisionOptions).toEqual(['A','B']);
    const random=vi.fn(n=>n-1);expect(chooseDecision([' A ','A','B'],random)).toBe('B');expect(random).toHaveBeenCalledWith(2);
    expect(()=>chooseDecision(['A','A'])).toThrow('two different');
    expect(()=>normalizeHomePreferences({idleMinutes:0})).toThrow('timing');
  });
  it('rejects malformed AI output and out-of-recipe selections',()=>{
    expect(parseRecipeResponse('```json\n'+JSON.stringify(recipe)+'\n```').ingredients).toHaveLength(2);
    expect(()=>parseRecipeResponse('not json')).toThrow('could not be read');
    expect(()=>normalizeRecipe({...recipe,ingredients:[]})).toThrow('ingredients');
    expect(()=>ingredientIndexes([-1],2)).toThrow('this recipe');
    expect(()=>ingredientIndexes([2],2)).toThrow('this recipe');
    expect(ingredientIndexes([0,0,1],2)).toEqual([0,1]);
  });
  it('checks household membership before reading private photos or generating recipes',async()=>{
    mocks.authorize.mockRejectedValue(new Error('Not a member'));
    await expect(getFamilyPhoto({userId:1},7,4)).rejects.toThrow('Not a member');
    await expect(generateFamilyRecipe({userId:1},7,{})).rejects.toThrow('Not a member');
    expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.gemini).not.toHaveBeenCalled();
  });
  it('reads private photos only from the current household',async()=>{
    mocks.execute.mockResolvedValue([[{image_data:'data:image/jpeg;base64,/9g='}]]);
    const result=await getFamilyPhoto({userId:1},7,4);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('household_id=? AND id=?'),[7,4]);expect(result.type).toBe('image/jpeg');
  });
  it('adds only selected saved ingredients and skips already-added ingredients',async()=>{
    mocks.execute.mockImplementation(async(sql,params)=>{
      if(sql.includes('SELECT * FROM family_entries'))return [[{metadata:{recipe}}]];
      if(sql.includes('SELECT r.list_entry_id'))return params[1]===0?[[{list_entry_id:30}]]:[[]];
      if(sql.includes('INSERT INTO family_entries'))return [{insertId:31}];
      return [[]];
    });
    expect(await addRecipeIngredients({userId:1},7,10,{ingredientIndexes:[0,1],listKind:'grocery'})).toEqual({added:1,skipped:1});
    const calls=mocks.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO family_entries'));
    expect(calls).toHaveLength(1);expect(calls[0][1]).toContain('1 — Lemon');
    expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('does not add ingredients from a missing or foreign meal',async()=>{
    mocks.execute.mockResolvedValue([[]]);
    await expect(addRecipeIngredients({userId:1},7,100,{ingredientIndexes:[0]})).rejects.toMatchObject({status:404});
    expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
  });
  it('can shop for a saved recipe again after buying its ingredients',async()=>{
    mocks.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM family_entries')?[[{metadata:{recipe}}]]:sql.includes('SELECT r.list_entry_id')?[[{list_entry_id:30,completed_at:'2026-09-15'}]]:sql.includes('INSERT INTO family_entries')?[{insertId:31}]:[[]]);
    expect(await addRecipeIngredients({userId:1},7,10,{ingredientIndexes:[0]})).toEqual({added:1,skipped:0});
  });
  it('validates model output before offering a recipe',async()=>{
    mocks.gemini.mockResolvedValue({text:JSON.stringify(recipe)});
    expect((await generateFamilyRecipe({userId:1},7,{servings:4,minutes:30})).recipe.title).toBe(recipe.title);
    mocks.gemini.mockRejectedValue(new Error('provider error'));
    await expect(generateFamilyRecipe({userId:1},7,{})).rejects.toMatchObject({status:503});
  });
  it.each(['Italian','Mexican','Thai','Chinese'])('uses the selected %s cuisine and keeps it when saving recipes',async cuisine=>{
    mocks.gemini.mockResolvedValue({text:JSON.stringify(recipe)});
    const result=await generateFamilyRecipe({userId:1},7,{cuisine});
    expect(mocks.gemini.mock.calls[0][0].prompt).toContain(`selected cuisine is "${cuisine}"`);
    expect(normalizeRecipe(result.recipe).cuisine).toBe(cuisine);
    expect(normalizeRecipe(recipe).cuisine).toBe(null);
  });
  it('chooses an explicit cuisine for surprise recipes and rejects unknown cuisine input before AI calls',async()=>{
    mocks.gemini.mockResolvedValue({text:JSON.stringify(recipe)});
    expect(FAMILY_CUISINES).toContain((await generateFamilyRecipe({userId:1},7,{})).recipe.cuisine);
    mocks.gemini.mockClear();
    await expect(generateFamilyRecipe({userId:1},7,{cuisine:'not a cuisine'})).rejects.toMatchObject({status:400});
    expect(mocks.gemini).not.toHaveBeenCalled();
  });
  it('randomly picks only from selected takeout cuisines, with deduplication and single-choice support',async()=>{
    const random=vi.fn(n=>n-1);
    expect(await chooseFamilyTakeout({userId:1},7,{cuisines:['Italian','Thai','italian']},random)).toEqual({cuisine:'Thai'});
    expect(random).toHaveBeenCalledWith(2);
    expect(await chooseFamilyTakeout({userId:1},7,{cuisines:['Mexican']},random)).toEqual({cuisine:'Mexican'});
    expect(await chooseFamilyTakeout({userId:1},7,{},()=>0)).toEqual({cuisine:FAMILY_CUISINES[0]});
    for(const cuisines of [[],[''],['invalid'],null])await expect(chooseFamilyTakeout({userId:1},7,{cuisines},random)).rejects.toMatchObject({status:400});
  });
  it('requires household membership for takeout selection',async()=>{
    mocks.authorize.mockRejectedValue(new Error('Not a member'));
    const random=vi.fn();
    await expect(chooseFamilyTakeout({userId:1},7,{},random)).rejects.toThrow('Not a member');
    expect(random).not.toHaveBeenCalled();
  });
});
