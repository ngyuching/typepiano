import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE?require(process.env.PLAYWRIGHT_MODULE):require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const errors=[];
try{
 const helper=await browser.newPage();await helper.goto('http://127.0.0.1:5173/#sight');
 const fixtures=await helper.evaluate(async()=>{
 const e=await import('/src/sight/engine.ts');
 return Array.from({length:8},(_,i)=>{const grade=i+1,key=grade===8?'B':grade>=2?'Em':'C',meter=grade===6?'5/8':grade===7?'7/8':grade===8?'12/8':'4/4';
 let seed=0;for(;seed<100000;seed++){const ex=e.generateExercise({...e.sightDefaults,grade,short:true},seed);if(ex.key===key&&ex.meter===meter)break;}
 if(seed===100000)throw Error('No fixture seed');return {grade,key,meter,seed};});});await helper.close();
 await mkdir('artifacts',{recursive:true});
 for(const width of [1440,390])for(const fixture of fixtures){
 const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.addInitScript(f=>{Math.random=()=> (f.seed+.25)/0xffffffff;localStorage.setItem('note-garden-sight-settings-v1',JSON.stringify({grade:f.grade,short:true,preview:0,mode:'slow'}));},fixture);
 await page.goto('http://127.0.0.1:5173/#sight');
 await page.waitForFunction(()=>{const e=document.querySelector('.score-system');return e?.dataset.renderedExercise&&e.dataset.renderedExercise===e.dataset.exerciseId;});
 assert.equal(await page.getByRole('alert').count(),0);
 const check=await page.evaluate(async f=>{
 const e=await import('/src/sight/engine.ts');const xml=await import('/src/sight/musicxml.ts');const ex=e.generateExercise({...e.sightDefaults,grade:f.grade,short:true},f.seed);
 const doc=new DOMParser().parseFromString(xml.exerciseMusicXML(ex),'application/xml');
 const rendered=new Set(Array.from(document.querySelectorAll('[data-event-id]'),n=>n.dataset.eventId));
 return {xmlErrors:doc.querySelectorAll('parsererror').length,missing:ex.events.filter(event=>!rendered.has(event.id)).map(event=>event.id),whole:ex.events.filter(event=>event.wholeBarRest).length,overflow:document.documentElement.scrollWidth>innerWidth,svg:document.querySelector('.score-system svg')?.getBoundingClientRect().width};
 },fixture);
 assert.equal(check.xmlErrors,0);assert.deepEqual(check.missing,[],JSON.stringify(fixture));assert.equal(check.overflow,false);if(fixture.grade===1)assert.equal(check.whole,4);
 await page.locator('.sight-score').screenshot({path:`artifacts/osmd-grade${fixture.grade}-${width}.png`});
 console.log('PASS OSMD fixture',width,JSON.stringify(fixture),check.svg);
 if(width===1440&&fixture.grade===3){
   await page.getByLabel('聲部').selectOption('right');await page.getByLabel('速度 BPM').fill('160');
   await page.waitForFunction(()=>{const e=document.querySelector('.score-system');return e?.dataset.renderedExercise&&e.dataset.renderedExercise===e.dataset.exerciseId;});
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.sight-transport .primary-button').click();await page.getByText('慢練中：',{exact:false}).waitFor();
   await page.getByRole('button',{name:'E4',exact:true}).click();
   await page.locator('.note-head-hit').first().waitFor();
   assert.equal(await page.locator('.note-head-hit').evaluateAll(heads=>heads.some(head=>head.getAnimations().length>0)),false);
   await page.getByRole('button',{name:'停止',exact:true}).click();
 }
 await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
