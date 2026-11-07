import { describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({text:'',destroy:vi.fn()}));
vi.mock('pdf-parse',()=>({PDFParse:class {async getText(){return {text:m.text};}async destroy(){m.destroy();}}}));
vi.mock('mammoth',()=>({default:{extractRawText:async()=>({value:m.text})}}));
import {extractResumeTextFromUpload} from '../resumeTextExtraction.service.js';

describe('bounded reference extraction',()=>{
 it.each(['text/plain','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])('preserves complete long reference content with an explicit limit (%s)',async mimeType=>{
  m.text='A'.repeat(308000)+' END_OF_GUIDANCE';
  const result=await extractResumeTextFromUpload({buffer:Buffer.from(m.text),mimeType,maxChars:900000});
  expect(result.status).toBe('completed');expect(result.truncated).toBe(false);expect(result.text.endsWith('END_OF_GUIDANCE')).toBe(true);expect(result.extractedCharacters).toBe(m.text.length);
 });
 it('retains the resume limit and distinguishes exact-boundary input from clipped input',async()=>{
  const atLimit=await extractResumeTextFromUpload({buffer:Buffer.from('A'.repeat(200000)),mimeType:'text/plain'});
  expect(atLimit.text).toHaveLength(200000);expect(atLimit.truncated).toBe(false);
  const clipped=await extractResumeTextFromUpload({buffer:Buffer.from('A'.repeat(200001)),mimeType:'text/plain'});
  expect(clipped.text).toHaveLength(200000);expect(clipped.truncated).toBe(true);expect(clipped.extractedCharacters).toBe(200001);
 });
});
