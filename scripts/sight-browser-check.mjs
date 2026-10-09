import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=process.env.PLAYWRIGHT_MODULE?require(process.env.PLAYWRIGHT_MODULE):require('playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.on('pageerror',error=>errors.push(error.message));
await page.route('https://fonts.googleapis.com/**',route=>route.abort());
await page.addInitScript(()=>{
  Math.random=()=>.123456789;
  localStorage.setItem('note-garden-sight-settings-v1',JSON.stringify({grade:2,mode:'slow',hands:'both',short:true,bpm:160,preview:0}));
  const input={id:'piano',name:'Sight Test Piano',state:'connected',onmidimessage:null};
  const access={inputs:new Map([[input.id,input]]),onstatechange:null};window.testMidi={input,access};
  Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access,configurable:true});
});
try{
  await page.goto('http://127.0.0.1:5173/#sight');
  await page.getByRole('heading',{name:'讀下一拍，奏下一句。'}).waitFor();
  await page.locator('.score-system svg').first().waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/sight-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'連接 MIDI',exact:true}).click();
  await page.getByText('已連接 1 個輸入裝置',{exact:false}).waitFor();
  await page.getByRole('button',{name:'開始練習 →',exact:true}).click();
  await page.getByText('慢練中：',{exact:false}).waitFor();
  assert.ok(await page.getByLabel('速度 BPM').isDisabled());
  await page.evaluate(async()=>{
    const engine=await import('/src/sight/engine.ts');
    const s=engine.sanitizeSight(JSON.parse(localStorage.getItem('note-garden-sight-settings-v1')));
    const ex=engine.generateExercise(s,Math.floor(.123456789*0xffffffff));
    for(const n of engine.expectedNotes(ex,s.hands)){
      window.testMidi.input.onmidimessage({data:new Uint8Array([0x90,n.midi,100]),timeStamp:performance.now()});
      window.testMidi.input.onmidimessage({data:new Uint8Array([0x80,n.midi,0]),timeStamp:performance.now()});
    }
  });
  await page.getByRole('heading',{name:'慢練完成，音符都找到了。'}).waitFor();
  console.log('Slow MIDI completion and result highlighting passed.');
  assert.ok((await page.locator('.sight-results').innerText()).includes('100%'));
  assert.ok(await page.locator('.score-note.matched').count()>0);
  assert.equal(await page.locator('.sight-history tbody tr').count(),1);
  await page.getByRole('button',{name:'Grade 6',exact:true}).click();
  assert.equal(await page.getByRole('alert').count(),0);
  await page.screenshot({path:'artifacts/sight-grade6.png',fullPage:true});
  // Render all 1–8 grade full-length exercises, then force every allowed meter.
  for(let grade=1;grade<=8;grade++){
    await page.getByRole('button',{name:`Grade ${grade}`,exact:true}).click();
    assert.equal(await page.getByRole('alert').count(),0,`grade ${grade}`);
  }
  await page.getByLabel('樂曲長度').selectOption('full');
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByRole('button',{name:'Grade 6',exact:true}).click();
  assert.equal(await page.getByRole('alert').count(),0);
  await page.screenshot({path:'artifacts/sight-grade6.png',fullPage:true});
  await page.getByLabel('樂曲長度').selectOption('short');
  const configs=await page.evaluate(async()=>{const e=await import('/src/sight/engine.ts');return e.sightProfiles.flatMap(p=>p.meters.map(meter=>({grade:p.grade,meter})));});
  // Seeds choose each meter; reload with a fixed random seed per configuration.
  for(const config of process.env.SKIP_NOTATION_MATRIX?[]:configs){
    const seed=await page.evaluate(async config=>{
      const engine=await import('/src/sight/engine.ts');
      const s=engine.sanitizeSight({grade:config.grade,mode:'timed',short:true,bpm:160,preview:0});
      let seed=0;for(;seed<10000;seed++)if(engine.generateExercise(s,seed).meter===config.meter)break;
      return seed;
    },config);
    const render=await browser.newPage();render.on('pageerror',error=>errors.push(error.message));
    await render.route('https://fonts.googleapis.com/**',route=>route.abort());
    await render.addInitScript(config=>{localStorage.setItem('note-garden-sight-settings-v1',JSON.stringify({grade:config.grade,mode:'timed',short:true,bpm:160,preview:0}));Math.random=()=> (config.seed+.25)/0xffffffff;},{...config,seed});
    await render.goto('http://127.0.0.1:5173/#sight');await render.locator('.score-system svg').first().waitFor();
    assert.equal(await render.getByRole('alert').count(),0,`meter ${config.grade} ${config.meter}`);await render.close();
  }
  if(!process.env.SKIP_NOTATION_MATRIX)console.log('All grade/meter combinations rendered without notation errors.');
  await page.getByRole('button',{name:'Grade 2',exact:true}).click();
  await page.getByLabel('練習方式').selectOption('timed');
  await page.getByLabel('預覽時間').selectOption('30');
  await page.getByRole('button',{name:'開始練習 →',exact:true}).click();
  await page.getByRole('button',{name:'略過預覽 →',exact:true}).click();
  await page.getByText('演奏中，保持節奏',{exact:false}).waitFor();
  await page.evaluate(()=>{window.testMidi.input.state='disconnected';window.testMidi.access.onstatechange();});
  await page.getByText('MIDI 裝置中斷，本次評分已中止',{exact:false}).waitFor();
  assert.equal(await page.locator('.sight-history tbody tr').count(),1);
  await page.getByLabel('預覽時間').selectOption('0');
  await page.locator('.sight-transport .primary-button').click();
  await page.getByRole('heading',{name:'保持音樂流動，每一拍都在進步。'}).waitFor({timeout:30000});
  assert.ok((await page.locator('.sight-results').innerText()).includes('0%'));
  await page.getByLabel('延遲校正').fill('80');
  await page.evaluate(()=>{
    window.testMidi.input.state='connected';window.testMidi.access.onstatechange();
    window.clickTimes=[];
    const original=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(...args){const oscillator=original.apply(this,args);const start=oscillator.start.bind(oscillator);oscillator.start=(time=0)=>{if([800,1200].includes(oscillator.frequency.value))window.clickTimes.push(time);start(time);};return oscillator;};
  });
  await page.getByText('已連接 1 個輸入裝置',{exact:false}).waitFor();
  await page.locator('.sight-transport .primary-button').click();
  await page.getByText('演奏中，保持節奏',{exact:false}).waitFor();
  await page.evaluate(async()=>{
    const engine=await import('/src/sight/engine.ts');const audio=await import('/src/audio.ts');
    const s=engine.sanitizeSight(JSON.parse(localStorage.getItem('note-garden-sight-settings-v1')));const ex=engine.generateExercise(s,Math.floor(.123456789*0xffffffff));
    const start=window.clickTimes[0]+ex.barTicks*engine.secondsPerTick(ex,s.bpm);
    for(const n of engine.expectedNotes(ex,s.hands)){
      const timestamp=performance.now()+(start+n.tick*engine.secondsPerTick(ex,s.bpm)-audio.audioContext().currentTime+s.latency/1000)*1000;
      window.testMidi.input.onmidimessage({data:new Uint8Array([0x90,n.midi,100]),timeStamp:timestamp});
      window.testMidi.input.onmidimessage({data:new Uint8Array([0x80,n.midi,0]),timeStamp:timestamp});
    }
  });
  await page.getByRole('heading',{name:'保持音樂流動，每一拍都在進步。'}).waitFor({timeout:30000});
  assert.equal(await page.locator('.sight-result-grid strong').nth(0).innerText(),'100%');
  assert.equal(await page.locator('.sight-result-grid strong').nth(1).innerText(),'100%');
  console.log('Timed MIDI timestamp matching and +80ms latency correction passed.');
  await page.getByRole('button',{name:'♫ 示範播放',exact:true}).click();
  await page.getByText('已聆聽 · 非首次視奏',{exact:true}).waitFor();
  await page.getByText('示範結束。',{exact:false}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Grade 3',exact:true}).click();
  await page.getByLabel('練習方式').selectOption('slow');
  await page.getByLabel('聲部').selectOption('right');
  await page.waitForFunction(()=>{const e=document.querySelector('.score-system');return e?.dataset.renderedExercise===e?.dataset.exerciseId&&e?.dataset.renderedExercise;});
  await page.locator('.sight-transport .primary-button').click();
  await page.getByText('慢練中：',{exact:false}).waitFor();
  await page.evaluate(async()=>{
    const e=await import('/src/sight/engine.ts');const s=e.sanitizeSight(JSON.parse(localStorage.getItem('note-garden-sight-settings-v1')));window.singleHandExpected=e.expectedNotes(e.generateExercise(s,Math.floor(.123456789*0xffffffff)),s.hands);
    const chordIndex=window.singleHandExpected.findIndex((n,i,a)=>a[i+1]?.tick===n.tick);if(chordIndex<0)throw Error('Expected a double-note chord');
    window.singleHandPlayed=chordIndex+1;
    for(const n of window.singleHandExpected.slice(0,window.singleHandPlayed)){window.testMidi.input.onmidimessage({data:new Uint8Array([0x90,n.midi,100]),timeStamp:performance.now()});window.testMidi.input.onmidimessage({data:new Uint8Array([0x80,n.midi,0]),timeStamp:performance.now()});}
  });
  await page.locator('.score-note.partial').first().waitFor();
  assert.ok(await page.locator('.score-note.partial .note-head-hit').count()>0,'partial chords highlight the matched head');
  assert.ok(await page.locator('.note-head-hit').evaluateAll(heads=>heads.some(head=>head.getAnimations().length>0)),'correct notes have a hit animation');
  await page.evaluate(()=>{for(const n of window.singleHandExpected.slice(window.singleHandPlayed)){window.testMidi.input.onmidimessage({data:new Uint8Array([0x90,n.midi,100]),timeStamp:performance.now()});window.testMidi.input.onmidimessage({data:new Uint8Array([0x80,n.midi,0]),timeStamp:performance.now()});}});
  await page.getByRole('heading',{name:'慢練完成，音符都找到了。'}).waitFor();
  const completed=await page.locator('.sight-history tbody tr').count();
  await page.locator('.sight-transport .primary-button').click();
  await page.getByText('慢練中：',{exact:false}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByText('分頁進入背景，本次評分已中止',{exact:false}).waitFor();
  assert.equal(await page.locator('.sight-history tbody tr').count(),completed);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});});
  console.log('Single-hand assessment, partial chord feedback and background abort passed.');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/sight-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.sight-transport .primary-button').click();
  await page.getByRole('button',{name:'♧ 識譜練習',exact:true}).click();
  await page.getByRole('heading',{name:'讓音符，落在指尖。'}).waitFor();
  assert.equal(await page.locator('.staff ellipse').count(),30);
  await page.evaluate(()=>{const results=JSON.parse(localStorage.getItem('note-garden-sight-results-v1'));localStorage.setItem('note-garden-sight-results-v1',JSON.stringify(Array.from({length:25},(_,i)=>({...results[0],id:`history-${i}`}))));});
  await page.getByRole('button',{name:'♫ 視奏訓練',exact:true}).click();
  await page.locator('.sight-history tbody tr').first().waitFor();
  assert.equal(await page.locator('.sight-history tbody tr').count(),20);
  assert.deepEqual(errors,[]);
  console.log('Sight browser checks passed: all grades/meters, notation, slow MIDI completion, timing completion, preview skip, disconnect abort, demo, history, desktop/mobile, navigation cleanup.');
}finally{await browser.close();}
