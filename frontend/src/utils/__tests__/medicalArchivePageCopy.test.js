import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getDocument:vi.fn(),create:vi.fn(),worker:{},render:vi.fn(),cleanup:vi.fn(),destroy:vi.fn(),save:vi.fn(),drawImage:vi.fn()}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:m.worker,getDocument:m.getDocument}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url',()=>({default:'/bundled-local-worker.mjs'}));
vi.mock('pdf-lib',()=>({PDFDocument:{create:m.create}}));
import {renderSmallerMedicalPage} from '../medicalArchivePageCopy.js';
let canvases;
beforeEach(()=>{
 vi.resetAllMocks();canvases=[];
 const createElement=document.createElement.bind(document);
 vi.spyOn(document,'createElement').mockImplementation(tag=>{
  if(tag!=='canvas')return createElement(tag);
  const canvas={width:0,height:0,getContext:()=>({}),toBlob:callback=>callback({arrayBuffer:async()=>new ArrayBuffer(3)})};canvases.push(canvas);return canvas;
 });
 m.render.mockReturnValue({promise:Promise.resolve()});m.destroy.mockResolvedValue();
 const page={getViewport:({scale})=>({width:612*scale,height:792*scale}),render:m.render,cleanup:m.cleanup};
 m.getDocument.mockReturnValue({promise:Promise.resolve({getPage:async()=>page,destroy:m.destroy})});
 m.create.mockResolvedValue({setCreationDate:vi.fn(),setModificationDate:vi.fn(),embedJpg:async()=>({}),addPage:()=>({drawImage:m.drawImage}),save:m.save});
 m.save.mockResolvedValue(new Uint8Array(10));
});
afterEach(()=>vi.restoreAllMocks());
it('uses a bundled local worker, preserves the source bytes and releases page resources after a bounded smaller-copy retry',async()=>{
 const source=new Uint8Array([1,2,3]);m.save.mockResolvedValueOnce(new Uint8Array(101));
 const result=await renderSmallerMedicalPage(source,3,100);
 expect(result.byteLength).toBe(10);expect(source).toEqual(new Uint8Array([1,2,3]));
 expect(m.worker.workerSrc).toBe('/bundled-local-worker.mjs');expect(m.getDocument.mock.calls[0][0].data).not.toBe(source);expect(m.getDocument.mock.calls[0][0].isEvalSupported).toBe(false);
 expect(m.render).toHaveBeenCalledTimes(2);expect(m.render.mock.calls[0][0].viewport.width).toBeCloseTo(2550);
 expect(m.drawImage).toHaveBeenCalledWith(expect.anything(),{x:0,y:0,width:612,height:792});
 expect(canvases.every(canvas=>canvas.width===0&&canvas.height===0)).toBe(true);expect(m.cleanup).toHaveBeenCalledOnce();expect(m.destroy).toHaveBeenCalledOnce();
});
it('cleans up a failed render and reports failure without returning an unreviewed or incomplete page',async()=>{
 m.render.mockReturnValue({promise:Promise.reject(Error('Page could not be rendered'))});
 await expect(renderSmallerMedicalPage(new Uint8Array([1]),3,100)).rejects.toThrow('Page could not be rendered');
 expect(m.save).not.toHaveBeenCalled();expect(canvases[0].width).toBe(0);expect(m.cleanup).toHaveBeenCalledOnce();expect(m.destroy).toHaveBeenCalledOnce();
});
