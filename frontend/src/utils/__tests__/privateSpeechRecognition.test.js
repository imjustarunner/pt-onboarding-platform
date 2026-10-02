import {afterEach,describe,expect,it,vi} from 'vitest';
import {privateSpeechRecognition} from '../privateSpeechRecognition.js';
afterEach(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;});
describe('on-device browser dictation',()=>{
 it('rejects browser cloud recognition when local processing is unsupported',()=>{
  window.SpeechRecognition=class{start(){throw new Error('Must not start');}};
  expect(privateSpeechRecognition()).toBeNull();
 });
 it('forces local processing on construction and every start',()=>{
  const start=vi.fn();window.SpeechRecognition=class{get processLocally(){return this.local;}set processLocally(v){this.local=v;}start(){start(this.processLocally);}};
  const Recognition=privateSpeechRecognition(),recognition=new Recognition();expect(recognition.processLocally).toBe(true);recognition.processLocally=false;recognition.start();expect(start).toHaveBeenCalledWith(true);
 });
});
