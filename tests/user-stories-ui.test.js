const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const M=require('../board-state.js');
const root=path.resolve(__dirname,'..');
const source=['board-state.js','app.js','board.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const plans=()=>Object.fromEntries(M.baseEnvelopes.map(e=>[e.id,e.plan]));
function prepared(mode='A'){const s=M.create(mode);s.hasCard=true;M.setForecast(s,120000,plans());if(mode==='B')M.receiveIncome(s,120000);M.distribute(s,s.receipts[0].id,M.suggestDistribution(s,s.receipts[0]));return s;}
function boot(t,state=null,view='home',baseUrl='http://localhost:8767/'){
 const dom=new JSDOM(html,{url:baseUrl+'#'+view,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,errors=[];w.addEventListener('error',event=>errors.push(event.error));
 w.scrollTo=()=>{};w.scrollBy=()=>{};w.matchMedia=()=>({matches:false});
 w.HTMLElement.prototype.scrollIntoView=function(){};
 // jsdom does not implement the native dialog API used by real browsers.
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.HTMLElement.prototype.setPointerCapture=function(id){this._capture=id;};
 w.HTMLElement.prototype.hasPointerCapture=function(id){return this._capture===id;};
 w.HTMLElement.prototype.releasePointerCapture=function(){this._capture=null;};
 if(state)w.sessionStorage.setItem('envelopes-prototype:v2',JSON.stringify(state));
 source.forEach(script=>w.eval(script));
 t.after(()=>{w.close();assert.deepEqual(errors,[],'No uncaught UI exceptions');});
 const q=selector=>w.document.querySelector(selector);
 const qa=selector=>[...w.document.querySelectorAll(selector)];
 const click=selector=>{const el=q(selector);assert(el,'Visible action exists: '+selector);el.click();assert.deepEqual(errors,[]);};
 const fill=(name,value,kind='')=>{const el=q(`${kind?'[data-form="'+kind+'"]':'main'} [name="${name}"]`);assert(el,'Field exists: '+name);el.value=String(value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=kind=>{const f=q(`[data-form="${kind}"]`);assert(f,'Form exists: '+kind);assert(f.checkValidity(),'Form inputs valid for '+kind);f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.deepEqual(errors,[]);};
 const text=()=>q('main').textContent;
 const app=()=>w.EnvelopePrototype;
 return {dom,w,q,qa,click,fill,submit,text,app};
}

test('US-1…US-12/20: existing-client path opens a deposit for the entered amount and continues through setup',t=>{
 const x=boot(t);x.click('[data-action="start-a"]');x.click('[data-view="trial"]');assert.equal(x.qa('[data-operation]').length,10);
 x.click('[data-operation="coffee"]');assert(x.q('[data-drop-envelope="cafe"]').classList.contains('is-suggested'));
 x.click('[data-drop-envelope="cafe"]');assert.equal(x.qa('[data-operation]').length,9);assert.equal(x.app().state.operations.length,0);
 x.click('[data-action="sort-all"]');x.click('main [data-view="trial-result"]');assert.match(x.text(),/6.?400/);
 x.click('main [data-view="goal-edit"]');x.fill('name','Первый взнос');x.fill('target',1500000);x.fill('deadline','2033-02');x.submit('goal');
 assert.equal(x.app().view,'pinch');x.fill('amount',3141.59);x.submit('pinch');assert.equal(x.app().view,'deposit');assert.equal(M.goal(x.app().state).opened,false);
 x.click('main [data-view="confirm"]');assert.match(x.text(),/3.?141,59/);x.click('[data-action="confirm-transfer"]');assert.equal(M.goal(x.app().state).balance,3141.59);
 x.click('main [data-view="setup"]');x.click('main [data-view="goal-edit"]');x.submit('goal');assert.equal(x.app().view,'forecast');
 x.fill('cafe',15000);x.submit('forecast');assert.equal(x.app().view,'salary');x.submit('salary');assert.equal(x.app().view,'table');assert.equal(x.qa('[data-operation]').length,3);
 assert.equal(M.totals(x.app().state).find(e=>e.id==='cafe').plan,15000);
});

test('US-3/4/8/17/20: new-client path stays empty until salary and a first real purchase, then offers first pinch after report',t=>{
 const x=boot(t);x.click('[data-action="start-b"]');assert.match(x.text(),/1.?500.?000/);x.click('[data-action="issue-card"]');assert.equal(x.app().view,'training');assert.equal(x.qa('[data-operation]').length,3);
 x.click('main [data-view="setup"]');x.click('main [data-view="goal-edit"]');x.submit('goal');assert.equal(x.app().view,'forecast');assert.equal(x.q('[name="groceries"]').value,'');
 x.click('[data-action="forecast-example"]');x.submit('forecast');assert.equal(x.app().view,'payroll');x.click('[data-action="payroll-ready"]');x.click('main [data-view="income"]');x.submit('income');x.submit('salary');assert.equal(x.app().view,'table');assert.equal(x.qa('[data-operation]').length,0);assert.equal(M.goal(x.app().state).opened,false);assert.equal(M.task(x.app().state).analytical,false);
 x.click('main [data-view="income"]'); // demo event is always available without changing entry mode
 assert.equal(x.app().state.mode,'B');
});

test('US-4/11/12/23: first purchase notification, day completion and a voluntary first pinch',t=>{
 const state=prepared('B'),x=boot(t,state,'table');x.click('main [data-view="purchase"]');x.submit('purchase');assert.equal(x.qa('[data-operation]').length,1);assert(x.app().state.notifications.some(n=>n.type==='purchase'));
 x.click('[data-action="sort-all"]');assert.match(x.text(),/День разобран/);assert.equal(x.app().state.dayRewards.length,1);
 x.click('main [data-view="summary"]');x.click('[data-action="close-month"]');x.click('main [data-view="pinch"]');x.fill('amount',3000);x.submit('pinch');assert.equal(x.app().view,'deposit');x.click('main [data-view="confirm"]');x.click('[data-action="confirm-transfer"]');assert.equal(M.goal(x.app().state).balance,3000);
});

test('US-5/6/9/26: add, rename, remap and remove envelopes through real UI controls',t=>{
 const x=boot(t,prepared(),'settings');x.fill('type','car','add-envelope');x.fill('name','Моя машина','add-envelope');x.fill('plan',7000,'add-envelope');x.submit('add-envelope');let added=x.app().state.envelopes.find(e=>e.name==='Моя машина');assert(added);
 const f=x.qa('[data-form="rename"]').find(f=>f.querySelector('[name="id"]').value===added.id);f.querySelector('[name="name"]').value='Автомобиль семьи';f.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(x.app().state.envelopes.find(e=>e.id===added.id).name,'Автомобиль семьи');
 x.click('main [data-view="rules"]');x.fill('taxi',added.id);x.submit('bindings');assert.equal(x.app().state.bindings.taxi,added.id);
 x.click('main [data-view="table"]');assert.match(x.text(),/Автомобиль семьи/);x.click('main [data-view="settings"]');x.click(`[data-action="delete-envelope"][data-id="${added.id}"]`);x.click('[data-action="confirm-delete"]');assert(!x.app().state.envelopes.some(e=>e.id===added.id));
});

test('US-8: current income and category inputs drive the actual deficit warning',t=>{
 const x=boot(t,prepared(),'forecast');x.fill('income',80000);x.fill('cafe',15000);assert.match(x.q('[data-budget-warning]').textContent,/16.?000/);x.submit('forecast');assert.equal(M.forecast(x.app().state).deficit,16000);assert.equal(x.app().view,'table');
});

test('US-15/16: merchant automation, reclassification and refund remain available after sorting',t=>{
 const s=prepared(),op=M.createPurchase(s,{name:'Кофейня',amount:380,category:'restaurant'});M.assign(s,op.id,'cafe');const x=boot(t,s,'envelope');x.click('main [data-action="rule-edit"]');const check=x.q('[name="enabled"]');check.checked=true;x.submit('rule');assert.equal(x.app().state.rules['кофейня'],'cafe');
 x.click('main [data-view="table"]');x.click('main [data-view="purchase"]');x.submit('purchase');assert.equal(x.qa('[data-operation]').length,0);
 x.click('main [data-view="envelope"][data-id="cafe"]');x.click('main [data-view="move"]');x.click('[data-action="move-to"][data-envelope="reserve"]');assert.match(x.text(),/Запас/);x.click('main [data-view="refund"]');x.fill('amount',100);x.submit('refund');assert.equal(x.qa('[data-operation]').length,1);assert.match(x.text(),/Возврат/);
});

test('US-17/18/19/24: task decisions persist and terms are accessible before accepting',t=>{
 const x=boot(t,prepared(),'tasks');assert(x.q('main [data-view="reward-terms"]'));x.click('[data-action="task-defer"]');assert.match(x.text(),/Отложено/);x.click('[data-action="task-replace"]');assert.match(x.text(),/3.?000/);x.click('[data-action="task-accept"]');assert.match(x.text(),/Вы приняли/);assert.equal(x.app().state.task.kind,'pinch');
 x.click('main [data-view="goal"]');assert.match(x.text(),/3.?000/);assert.match(x.text(),/0 ₽ из/);
});

test('US-21/23/25: fixed recurring proposal never transfers automatically and next month retains rules',t=>{
 const s=prepared(),x=boot(t,s,'regular');x.fill('kind','fixed');x.fill('amount',1234);x.q('[name="enabled"]').checked=true;x.submit('regular');assert.equal(x.app().state.regular.enabled,true);
 x.click('main [data-view="summary"]');x.click('[data-action="close-month"]');assert.equal(M.goal(x.app().state).balance,0);assert(x.app().state.notifications.some(n=>n.type==='regular'&&n.payload.amount===1234));
 x.click('main [data-view="next"]');x.fill('groceries',29000);x.submit('next');assert.equal(x.app().state.month,'2026-12');assert.equal(x.app().state.envelopes[0].plan,29000);assert.equal(x.app().state.regular.enabled,true);assert.equal(x.app().state.archives.length,1);assert.equal(x.qa('[data-operation]').length,0);
});

test('US-7/22/26: a reached custom goal exposes next steps and can coexist with a new goal',t=>{
 const s=prepared();M.setGoal(s,{name:'Поездка',target:1000,deadline:'2027-02'});M.transfer(s,1000,'card',true);const x=boot(t,s,'goal');assert.match(x.text(),/Цель достигнута/);x.click('main [data-view="milestones"]');assert.match(x.text(),/25%/);assert.match(x.text(),/100%/);assert.equal(x.qa('.partner-placeholder').length,4);x.click('main [data-view="goal"]');x.click('main [data-view="goal-edit"][data-new-goal]');x.fill('name','Квартира');x.submit('goal');assert.equal(x.app().state.goals.length,2);assert.equal(M.goal(x.app().state).name,'Квартира');
});

function pointerFixture(x){
 const proto=x.w.HTMLElement.prototype;
 proto.getBoundingClientRect=function(){let left=0,top=0,width=180,height=160;if(this.dataset.operation){left=100;top=600;width=190;height=220;}else if(this.dataset.dropEnvelope){const i=x.qa('[data-drop-envelope]').indexOf(this);left=100+(i%3)*200;top=100+Math.floor(i/3)*200;}return {left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}};};
 x.w.document.elementFromPoint=(px,py)=>x.qa('[data-drop-envelope]').find(el=>{const r=el.getBoundingClientRect();return px>=r.left&&px<r.right&&py>=r.top&&py<r.bottom;})||x.w.document.body;
 return (target,type,px,py,pointerType='mouse')=>{const ev=new x.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:px,clientY:py});Object.defineProperties(ev,{isPrimary:{value:true},pointerId:{value:1},pointerType:{value:pointerType}});target.dispatchEvent(ev);};
}

test('drag regression: a held card drops into only the selected envelope without following its link',t=>{
 const s=prepared(),op=M.createPurchase(s,{name:'Кофейня',amount:380,category:'restaurant'});M.createPurchase(s,{name:'Такси',amount:240,category:'taxi'});const x=boot(t,s,'table'),emit=pointerFixture(x),b=M.cardBalance(x.app().state),card=x.q(`[data-operation="${op.id}"]`);
 emit(card,'pointerdown',150,650);emit(x.w.document,'pointermove',150,340);assert(x.q('.card-drag-ghost'));assert(x.q('[data-drop-envelope="cafe"]').classList.contains('is-drag-over'));
 emit(x.w.document,'pointerup',150,340);assert.equal(x.qa('[data-operation]').length,1);assert.equal(x.app().state.operations.find(o=>o.id===op.id).envelope,'cafe');assert.equal(M.cardBalance(x.app().state),b);assert(!x.q('.card-drag-ghost'));
 x.q('[data-drop-envelope="cafe"]').dispatchEvent(new x.w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));assert.equal(x.app().view,'table');
});

test('drag regression: outside drop and Escape keep the same card in hand',t=>{
 const s=prepared(),op=M.createPurchase(s,{name:'Кофейня',amount:380,category:'restaurant'}),x=boot(t,s,'table'),emit=pointerFixture(x);let card=x.q(`[data-operation="${op.id}"]`);
 emit(card,'pointerdown',150,650);emit(x.w.document,'pointermove',10,10);emit(x.w.document,'pointerup',10,10);assert.equal(x.app().state.operations[0].envelope,null);assert.equal(x.qa('[data-operation]').length,1);
 card=x.q(`[data-operation="${op.id}"]`);emit(card,'pointerdown',150,650);emit(x.w.document,'pointermove',150,340);x.w.document.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(x.app().state.operations[0].envelope,null);assert(!x.q('.card-drag-ghost'));
});

test('touch regression: horizontal swipe browses the hand rather than assigning a purchase',t=>{
 const s=prepared(),op=M.createPurchase(s,{name:'Кофейня',amount:380,category:'restaurant'}),x=boot(t,s,'table'),emit=pointerFixture(x),hand=x.q('.card-hand');Object.defineProperties(hand,{scrollWidth:{value:600},clientWidth:{value:200}});
 emit(x.q(`[data-operation="${op.id}"]`),'pointerdown',150,650,'touch');emit(x.w.document,'pointermove',50,650,'touch');emit(x.w.document,'pointerup',50,650,'touch');assert.equal(hand.scrollLeft,100);assert.equal(x.app().state.operations[0].envelope,null);
});

test('all prototype views render with an empty and a mature session without exceptions',t=>{
 const views=['home','savings','intro','new','trial','training','setup','goal-edit','forecast','salary','income','payroll','table','purchase','envelope','reserve','unplanned','move','refund','rules','rule','tasks','goal','pinch','deposit','confirm','result','withdraw','regular','milestones','summary','next','rewards','reward-terms','settings','notifications','help','history','archive'];
 for(const state of [prepared(),M.create('B')])for(const view of views){const x=boot(t,state,view);assert(x.q('main h1'),view);assert(!x.text().includes('undefined'),view+' has no undefined user-facing text');}
});

test('US-6: a starter suggestion adds the envelope in one click and respects sensitive categories',t=>{const x=boot(t,M.create('B'),'setup');x.click('[data-action="quick-add"][data-id="children"]');const child=x.app().state.envelopes.find(e=>e.type==='children');assert(child);assert.equal(child.sensitive,true);assert.equal(x.app().state.bindings.children,child.id);assert.equal(M.cardBalance(x.app().state),0);});
test('US-7: opening from edited goal fields saves those exact values before showing terms',t=>{const x=boot(t,prepared(),'goal-edit');x.fill('name','Автомобиль');x.fill('target',900000);x.fill('deadline','2030-11');x.click('[data-action="save-goal-open"]');assert.equal(x.app().view,'deposit');assert.match(x.text(),/Автомобиль/);assert.equal(M.goal(x.app().state).target,900000);assert.equal(M.goal(x.app().state).opened,false);});

test('bank shell: sections are inert placeholders, the game launcher opens Alfa envelopes with draggable purchases',t=>{
 const x=boot(t,null,'bank');assert.equal(x.q('main h1').textContent,'Добрый день, Клиент');assert.match(x.w.document.title,/Альфа конверты/);
 const before=JSON.stringify(x.app().state);
 for(const control of x.qa('.app-header [data-bank-placeholder]')){control.click();assert.equal(x.app().view,'bank');assert.equal(JSON.stringify(x.app().state),before);assert.match(x.q('[data-message-content]').textContent,/Раздел пока недоступен/);assert(x.q('#demo-message').hasAttribute('open'));x.q('#demo-message').close();}
 x.click('.app-header [data-action="open-game"]');assert.equal(x.app().view,'table');assert.equal(x.qa('[data-operation]').length,3);assert.match(x.text(),/Альфа конверты/);assert(x.q('.game-table-surface'));assert(x.q('.round-goal'));
});

test('US-12/20: the table exposes the monthly loop and a pinch from the chosen envelope',t=>{
 const s=prepared(),op=M.createPurchase(s,{name:'Кофейня',amount:380,category:'restaurant'}),x=boot(t,s,'table');
 assert.equal(x.qa('.journey-steps li').length,6);x.click('[data-action="focus-hand"]');assert.equal(x.w.document.activeElement.id,'purchase-hand');
 x.click(`[data-operation="${op.id}"]`);x.click('[data-drop-envelope="cafe"]');
 assert(x.q('[data-action="task-accept"]'));const pinch=x.q('.envelope-pinch[data-source="cafe"]');assert(pinch);assert.equal(Number(pinch.dataset.amount),11620);
 x.click('.envelope-pinch[data-source="cafe"]');assert.equal(x.q('[name="source"]').value,'cafe');assert.equal(x.q('[name="amount"]').value,'11620');
 x.fill('amount',620);x.submit('pinch');x.click('main [data-view="confirm"]');x.click('[data-action="confirm-transfer"]');
 assert.equal(M.goal(x.app().state).balance,620);assert.equal(M.totals(x.app().state).find(e=>e.id==='cafe').remaining,11000);
});

test('US-7: opening a deposit later saves edited goal values without opening it',t=>{
 const x=boot(t,prepared(),'goal-edit');x.fill('name','Обучение');x.fill('target',240000);x.fill('deadline','2027-11');
 x.click('[data-action="save-goal-later"]');assert.equal(x.app().view,'goal');assert.equal(M.goal(x.app().state).name,'Обучение');
 assert.equal(M.goal(x.app().state).monthly,20000);assert.equal(M.goal(x.app().state).opened,false);
});

test('US-16/23: history filters, archived results and an old purchase refund are usable end to end',t=>{
 const s=prepared(),op=M.createPurchase(s,{name:'Магазин для дома',amount:1280,category:'supermarket'});M.assign(s,op.id,'groceries');
 M.closeMonth(s);M.nextMonth(s,M.nextProposal(s));const x=boot(t,s,'summary');
 x.click('main [data-view="archive"]');assert.match(x.text(),/1.?280/);x.click('main [data-view="history"]');
 assert.equal(x.q('[name="period"]').value,'2026-11');x.fill('query','для дома');x.submit('history-filters');assert.equal(x.qa('.transaction-row').length,1);
 assert(!x.q('main [data-view="move"]'));x.click('main [data-view="refund"]');x.fill('amount',280);x.submit('refund');
 assert.equal(x.qa('[data-operation]').length,1);assert.equal(x.app().state.archives[0].actual,1280);
 x.click('[data-action="sort-all"]');assert.equal(M.report(x.app().state).actual,-280);
});

test('US-21: a notification confirms the original goal, preserves edited amount and becomes fulfilled',t=>{
 const s=prepared(),original=M.goal(s).id;s.regular={enabled:true,kind:'fixed',amount:3000,goalId:original};
 M.closeMonth(s);const notice=s.notifications.find(n=>n.type==='regular');M.setGoal(s,{name:'Поездка',target:120000,deadline:'2027-11'},true);
 const x=boot(t,s,'notifications');x.click('[data-action="open-regular"]');assert.equal(M.goal(x.app().state).id,original);
 assert.equal(x.qa('[name="source"] option').length,1);x.fill('amount',1234);x.submit('pinch');x.click('main [data-view="confirm"]');
 x.click('[data-action="edit-transfer"]');assert.equal(x.q('[name="amount"]').value,'1234');x.submit('pinch');x.click('main [data-view="confirm"]');x.click('[data-action="confirm-transfer"]');
 assert.equal(M.goal(x.app().state).balance,1234);assert.equal(x.app().state.notifications.find(n=>n.id===notice.id).payload.confirmed,true);
 x.click('main [data-view="notifications"]');assert(!x.q('[data-action="open-regular"]'));assert.match(x.text(),/Подтверждено: 1.?234/);
});

test('US-19: task progress follows its category binding into the associated envelope',t=>{
 const s=prepared();s.bindings.fastfood='transport';M.taskAction(s,'accept');const op=M.createPurchase(s,{name:'Фастфуд',amount:600,category:'fastfood'});M.assign(s,op.id,'transport');
 const x=boot(t,s,'table');assert.match(x.q('[data-drop-envelope="transport"] .envelope-task').textContent,/600/);
 assert(!x.q('[data-drop-envelope="cafe"] .envelope-task'));x.click('[data-drop-envelope="transport"]');assert(x.q('.task-card'));
});

test('GitHub Pages: root and index entry retain the repository path and local assets',t=>{
 const prefix='https://example.github.io/alfa-envelopes/';
 for(const url of [prefix,prefix+'index.html']){
  const x=boot(t,prepared(),'table',url);
  for(const asset of x.qa('script[src],link[rel="stylesheet"],link[rel="icon"]')){
   assert((asset.src||asset.href).startsWith(prefix));
  }
  x.click('main [data-view="goal"]');assert.equal(x.app().view,'goal');assert.equal(x.w.location.href,url+'#goal');
  x.click('main [data-view="table"]');x.click('main [data-view="history"]');assert.equal(x.w.location.href,url+'#history');
  assert(!x.q('.screen-viewer'));assert(!x.q('#screen-catalog'));
 }
});

test('the direct table URL prepares a playable first session and preserves saved new-client progress',t=>{
 const x=boot(t,null,'table');assert.equal(x.qa('[data-operation]').length,3);assert.equal(M.cardBalance(x.app().state),118100);
 const saved=prepared('B');M.createPurchase(saved,{name:'Магазин',amount:500,category:'supermarket'});
 const y=boot(t,saved,'table');assert.equal(y.app().state.mode,'B');assert.equal(y.qa('[data-operation]').length,1);assert.equal(M.cardBalance(y.app().state),119500);
});
