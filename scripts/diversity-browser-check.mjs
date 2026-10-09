import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Math.random=()=>.123456789;});
  await page.goto('http://127.0.0.1:5173/#sight');
  const ready=()=>page.waitForFunction(()=>{const e=document.querySelector('.score-system');return e?.dataset.renderedExercise&&e.dataset.renderedExercise===e.dataset.exerciseId;});
  await ready();
  const summary=()=>page.evaluate(()=>({id:document.querySelector('.score-system').dataset.exerciseId,history:JSON.parse(localStorage.getItem('note-garden-sight-generated-v2')),results:localStorage.getItem('note-garden-sight-results-v1')}));
  const first=await summary();assert.equal(first.history.length,1);
  await page.getByRole('button',{name:'產生新曲 ↻',exact:true}).click();await ready();
  const second=await summary();assert.notEqual(second.id,first.id);assert.equal(second.history.length,2);assert.notEqual(second.history[0].fingerprint,first.history[0].fingerprint);assert.equal(second.results,first.results);
  await page.reload();await ready();const third=await summary();assert.equal(third.history.length,3);assert.notEqual(third.history[0].fingerprint,second.history[0].fingerprint);
  await page.getByLabel('預覽時間').selectOption('0');await page.getByLabel('速度 BPM').fill('160');await page.getByLabel('練習方式').selectOption('slow');await page.getByLabel('聲部').selectOption('right');
  await page.locator('.sight-transport .primary-button').click();await page.getByText('慢練中：',{exact:false}).waitFor();
  await page.getByRole('button',{name:'停止',exact:true}).click();const stopped=await summary();
  await page.getByRole('button',{name:'重練原曲 →',exact:true}).click();await page.getByText('慢練中：',{exact:false}).waitFor();
  const replay=await summary();assert.equal(replay.id,stopped.id);assert.deepEqual(replay.history,stopped.history);
  await page.getByRole('button',{name:'停止',exact:true}).click();
  await page.evaluate(()=>localStorage.setItem('note-garden-sight-generated-v2','broken json'));await page.reload();await ready();assert.equal((await summary()).history.length,1);
  await page.evaluate(()=>localStorage.setItem('note-garden-sight-generated-v2',JSON.stringify(Array(25).fill(JSON.parse(localStorage.getItem('note-garden-sight-generated-v2'))[0]))));await page.reload();await ready();assert.ok((await summary()).history.length<=20);
  assert.deepEqual(errors,[]);console.log('PASS: new-curve selection, persistent unfinished history, reload diversity, replay identity, malformed storage recovery and 20-entry cap');
}finally{await browser.close();}
