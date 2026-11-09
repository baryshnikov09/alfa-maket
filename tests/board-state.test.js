const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../board-state.js');
const plans=()=>Object.fromEntries(M.baseEnvelopes.map(e=>[e.id,e.plan]));
function setup(mode='A') {const s=M.create(mode);s.hasCard=true;M.setForecast(s,120000,plans());if(mode==='B')M.receiveIncome(s,120000);const r=s.receipts[0];M.distribute(s,r.id,M.suggestDistribution(s,r));return s;}
function buy(s,name='Кофейня',amount=380,category='restaurant'){return M.createPurchase(s,{name,amount,category});}
function sorted(s,name='Кофейня',amount=380,category='restaurant',envelope='cafe'){const op=buy(s,name,amount,category);M.assign(s,op.id,envelope);return op;}
const env=(s,id)=>M.totals(s).find(e=>e.id===id);

test('US-2/3: the 30-day trial has ten purchases and never debits the live ledger',()=>{const s=setup(),balance=M.cardBalance(s);assert.equal(M.trialOperations.length,10);assert.equal(M.trialOperations.reduce((n,o)=>n+o.amount,0),56600);M.trialOperations.forEach(o=>s.trial.assignments[o.id]=o.suggested);assert.equal(M.cardBalance(s),balance);assert.equal(s.operations.length,0);assert.deepEqual(s.training.assignments,{});});
test('US-3/4/8: cold start has no card, history, forecast or deposit; training remains isolated',()=>{const s=M.create('B');assert.equal(s.hasCard,false);assert.equal(s.income,null);assert(s.envelopes.every(e=>e.plan===null));assert.equal(M.goal(s).opened,false);assert.equal(M.task(s).analytical,false);assert.throws(()=>M.transfer(s,1,'card',true),/первым итогом/);assert.equal(s.operations.length,0);});
test('US-5: five budget envelopes, and Reserve cannot be removed',()=>{const s=setup();assert.equal(s.envelopes.length,5);assert.throws(()=>M.deleteEnvelope(s,'reserve'),/остаются/);assert.equal(M.goal(s).name,'Квартира');});
test('US-6/26: additions consume free funds, rename propagates, delete preserves expenses',()=>{const s=setup();const e=M.addEnvelope(s,{name:'Дети',type:'children',plan:5000});assert.equal(env(s,'free').remaining,22000);assert.equal(e.sensitive,true);M.renameEnvelope(s,e.id,'Семейные расходы');assert.equal(env(s,e.id).name,'Семейные расходы');const op=sorted(s,'Детский магазин',500,'children',e.id);M.deleteEnvelope(s,e.id);assert.equal(s.operations.find(o=>o.id===op.id).envelope,'unplanned');assert.equal(M.report(s).unplanned,500);assert.equal(env(s,'free').remaining,26500);});
test('US-7: target and deadline calculate a monthly contribution and demonstration interest',()=>{const s=setup();M.setGoal(s,{name:'Автомобиль',target:2000000,deadline:'2031-11'});assert.equal(M.goal(s).monthly,33334);assert(M.projection(s).interest>0);assert.throws(()=>M.setGoal(s,{name:'bad',target:1,deadline:'2030-99'}),/срок/);});
test('US-8: arbitrary forecasts and real deficits are retained, original stays available',()=>{const s=setup();M.setForecast(s,80000,{...plans(),cafe:15000});assert.equal(M.forecast(s).deficit,16000);assert.equal(env(s,'cafe').plan,15000);assert.equal(M.report(s).rows.find(r=>r.id==='cafe').original,12000);assert.equal(M.report(s).rows.find(r=>r.id==='cafe').plan,15000);});
test('US-9: changing a category binding changes the suggestion for subsequent cards',()=>{const s=setup();s.bindings.restaurant='reserve';const op=buy(s);assert.equal(M.suggested(s,op),'reserve');});
test('US-10: advance and salary each fund half a forecast without duplicate allocation',()=>{const s=M.create('B');s.hasCard=true;M.setForecast(s,120000,plans());const advance=M.receiveIncome(s,60000,'Аванс');M.distribute(s,advance.id,M.suggestDistribution(s,advance));assert.equal(env(s,'groceries').funded,15000);const salary=M.receiveIncome(s,60000,'Зарплата');M.distribute(s,salary.id,M.suggestDistribution(s,salary));assert.equal(env(s,'groceries').funded,30000);assert.equal(M.goalReserve(s),20000);assert.equal(env(s,'free').remaining,27000);assert.throws(()=>M.distribute(s,salary.id,{plans:plans(),reserve:0}),/уже распределено/);});
test('US-10: automatic distribution never opens or funds a deposit',()=>{const s=setup('B');s.automaticSalary=true;const r=M.receiveIncome(s,60000,'Аванс');assert.equal(r.allocated,true);assert.equal(M.goal(s).opened,false);assert.equal(M.goal(s).balance,0);});
test('US-11/12: one drop removes only its card and never charges a purchase twice',()=>{const s=setup();const a=buy(s),b=buy(s,'Такси',240,'taxi'),balance=M.cardBalance(s),before=env(s,'cafe').remaining;M.assign(s,a.id,'cafe');assert.deepEqual(M.pending(s).map(o=>o.id),[b.id]);assert.equal(env(s,'cafe').remaining,before-380);assert.equal(M.cardBalance(s),balance);M.assign(s,b.id,'transport');assert.equal(M.pending(s).length,0);assert.equal(s.dayRewards.length,1);M.assign(s,a.id,'groceries');assert.equal(s.dayRewards.length,1);assert.equal(M.cardBalance(s),balance);});
test('US-11: a saved session retains exact assignments and untouched purchases',()=>{const s=setup(),a=buy(s),b=buy(s,'Такси',240,'taxi');M.assign(s,a.id,'reserve');const restored=M.restore(JSON.parse(JSON.stringify(s)));assert.deepEqual(M.pending(restored).map(o=>o.id),[b.id]);assert.equal(env(restored,'reserve').remaining,9620);});
test('US-13/14: unplanned and reserve remain ordinary accounting destinations; goal is excluded',()=>{const s=setup(),a=buy(s);M.assign(s,a.id,'unplanned');assert.equal(M.report(s).unplanned,380);M.assign(s,a.id,'reserve');assert.equal(env(s,'reserve').remaining,9620);assert.equal(M.report(s).unplanned,0);assert.throws(()=>M.assign(s,a.id,'goal'),/нельзя положить/);});
test('US-15: enabled shop rules bypass the hand; disabling brings future cards back',()=>{const s=setup();M.setRule(s,'Кофейня','cafe',true);const a=buy(s);assert.equal(a.envelope,'cafe');assert.equal(M.pending(s).length,0);M.setRule(s,'Кофейня','cafe',false);const b=buy(s);assert.equal(b.envelope,null);assert.equal(M.pending(s).length,1);});
test('US-16: reclassification and partial refund update net costs, never income',()=>{const s=setup(),a=sorted(s);M.assign(s,a.id,'groceries');const income=s.receipts.reduce((n,r)=>n+r.amount,0),balance=M.cardBalance(s);const r=M.refund(s,a.id,100);assert.equal(M.cardBalance(s),balance+100);assert(M.pending(s).some(o=>o.id===r.id));M.assign(s,r.id,'groceries');assert.equal(env(s,'groceries').spent,280);assert.equal(s.receipts.reduce((n,r)=>n+r.amount,0),income);assert.throws(()=>M.refund(s,a.id,281),/больше/);});
test('US-17/18: replacement and postponement preserve other achievements; only allowed categories are analysed',()=>{const s=setup();sorted(s);const rewards=[...s.dayRewards];assert.equal(M.task(s).kind,'fastfood');M.taskAction(s,'defer');assert.equal(M.task(s).status,'deferred');M.taskAction(s,'replace');assert.equal(M.task(s).kind,'pinch');M.taskAction(s,'accept');assert.equal(M.task(s).status,'accepted');assert.deepEqual(s.dayRewards,rewards);assert(!['medicine','utilities','education','children'].includes(M.task(s).kind));});
test('US-17: a new client receives analytical tasks only after enough data and the first result',()=>{const s=setup('B');for(let i=0;i<3;i++)sorted(s,'Покупка '+i);assert.equal(M.task(s).analytical,false);M.closeMonth(s);assert.equal(M.task(s).analytical,true);assert.equal(M.task(s).kind,'pinch');});
test('US-19/20: a 3,000 ₽ task uses actual accepted transfers as progress',()=>{const s=setup();M.taskAction(s,'replace');M.taskAction(s,'accept');assert.equal(M.task(s).progress,0);M.transfer(s,3000,'card',true);assert.equal(M.task(s).progress,3000);assert.equal(M.taskComplete(s),true);});
test('US-20: first opening and arbitrary amount are atomic; invalid transfers cannot open a deposit',()=>{const s=setup(),balance=M.cardBalance(s);assert.throws(()=>M.transfer(s,3000,'card'),/подтвердите открытие/);assert.equal(M.goal(s).opened,false);assert.throws(()=>M.transfer(s,balance+1,'card',true),/больше доступного/);assert.equal(M.goal(s).opened,false);M.transfer(s,3141.59,'cafe',true);assert.equal(M.goal(s).balance,3141.59);assert.equal(env(s,'cafe').remaining,8858.41);assert.equal(M.cardBalance(s),balance-3141.59);assert(s.lastResult.days>0);});
test('US-14: early withdrawal returns money and moves the goal date back',()=>{const s=setup();M.transfer(s,3200,'card',true);const b=M.cardBalance(s),days=M.projection(s).days;M.withdraw(s,1500);assert.equal(M.cardBalance(s),b+1500);assert.equal(M.goal(s).balance,1700);assert(M.projection(s).days>days);});
test('US-21: regular proposals preserve funds until a separate confirmation and omit reserve',()=>{const s=setup();sorted(s);s.regular={enabled:true,kind:'leftovers',amount:3000};const b=M.cardBalance(s);M.closeMonth(s);const notice=s.notifications.find(n=>n.type==='regular');assert.equal(notice.payload.amount,62620);assert.equal(M.cardBalance(s),b);assert.equal(M.goal(s).balance,0);assert.equal(M.restore(M.clone(s)).regular.enabled,true);});
test('US-22/26: completed and new goals coexist with separate balances',()=>{const s=setup();M.setGoal(s,{name:'Поездка',target:3000,deadline:'2027-02'});const first=M.goal(s).id;M.transfer(s,3000,'card',true);assert.equal(M.projection(s).progress,100);M.setGoal(s,{name:'Квартира',target:1500000,deadline:'2033-02'},true);assert.equal(s.goals.length,2);assert.equal(M.goal(s).balance,0);s.activeGoal=first;assert.equal(M.goal(s).balance,3000);});
test('US-23: report has the actual forecast, outside-plan spending and exact deposited total',()=>{const s=setup();sorted(s,'Продукты',1000,'supermarket','groceries');sorted(s,'Внеплановая',700,'restaurant','unplanned');M.transfer(s,1500,'card',true);const r=M.report(s);assert.equal(r.actual,1700);assert.equal(r.unplanned,700);assert.equal(r.pinched,1500);assert.equal(r.rows.find(r=>r.id==='groceries').actual,1000);assert.equal(typeof r.matched,'boolean');assert(r.largest.name);});
test('US-23/25: close requires an empty hand; a new month preserves goals/rules and immutable results',()=>{const s=setup(),op=buy(s);assert.throws(()=>M.closeMonth(s),/карточки/);M.assign(s,op.id,'cafe');M.setRule(s,'Кофейня','cafe',true);M.transfer(s,1500,'card',true);s.regular.enabled=true;M.closeMonth(s);const proposal=M.nextProposal(s);M.nextMonth(s,proposal);assert.equal(s.month,'2026-12');assert.equal(M.pending(s).length,0);assert.equal(s.archives[0].pinched,1500);assert.equal(M.goal(s).balance,1500);assert.equal(s.rules['кофейня'],'cafe');assert.equal(s.regular.enabled,true);assert.throws(()=>M.assign(s,op.id,'reserve'),/не найдена/);s.envelopes[0].plan=999;assert.equal(s.archives[0].rows[0].plan,30000);});
test('ledger identity survives moves, refund, pinches, extra envelopes and withdrawal',()=>{const s=setup();const check=()=>{const sumBudget=M.totals(s).filter(e=>e.id!=='unplanned').reduce((n,e)=>n+e.remaining,0)+M.goalReserve(s);assert(Math.abs(sumBudget-M.cardBalance(s))<.001);};check();const a=buy(s);check();M.assign(s,a.id,'reserve');check();const r=M.refund(s,a.id,100);check();M.assign(s,r.id,'reserve');check();M.transfer(s,765.43,'groceries',true);check();M.withdraw(s,222.22);check();const extra=M.addEnvelope(s,{name:'Машина',plan:2000});check();M.deleteEnvelope(s,extra.id);check();});

test('forecast edits after a half salary preserve funding up to the new lower plan',()=>{const s=M.create('B');s.hasCard=true;M.setForecast(s,120000,plans());const r=M.receiveIncome(s,60000);M.distribute(s,r.id,M.suggestDistribution(s,r));M.setForecast(s,120000,{...plans(),groceries:10000});assert.equal(env(s,'groceries').funded,10000);});
test('regular leftover confirmation actually sweeps budget envelopes and leaves reserve intact',()=>{const s=setup();sorted(s);s.regular={enabled:true,kind:'leftovers',amount:0};M.closeMonth(s);const n=s.notifications.find(n=>n.type==='regular');assert.equal(n.payload.source,'leftovers');M.transfer(s,n.payload.amount,n.payload.source,true);assert.equal(env(s,'reserve').remaining,10000);assert(M.totals(s).filter(e=>!['reserve','free','unplanned'].includes(e.id)).every(e=>e.remaining===0));});
test('US-23/24: matched forecasts and accepted spending tasks are achieved without changing other rewards',()=>{const s=setup();M.taskAction(s,'accept');for(const e of s.envelopes)sorted(s,e.name,e.plan,e.id==='reserve'?'medicine':'supermarket',e.id);M.closeMonth(s);assert.equal(M.report(s).matched,true);assert(M.report(s).rows.every(e=>e.matched));assert.equal(M.taskComplete(s),true);assert(s.completedTasks.length>0);});
test('a previous-month refund stays a separate current-month credit',()=>{const s=setup(),o=sorted(s);M.closeMonth(s);M.nextMonth(s,M.nextProposal(s));const r=M.refund(s,o.id,100);assert.equal(r.month,'2026-12');assert.equal(M.pending(s).length,1);assert.equal(s.archives[0].actual,380);});

test('US-18: new-client bank tasks can be replaced even without fast-food history',()=>{const s=setup('B');for(let i=0;i<3;i++)sorted(s,'Покупка '+i);M.closeMonth(s);assert.equal(M.task(s).kind,'pinch');const before=M.task(s).target;M.taskAction(s,'replace');assert.notEqual(M.task(s).target,before);assert.equal(M.task(s).kind,'pinch');});

test('US-19: accepting again and resuming a postponed task preserve real progress',()=>{
 const s=setup();M.taskAction(s,'replace');M.taskAction(s,'accept');M.transfer(s,1500,'card',true);
 M.taskAction(s,'accept');assert.equal(M.task(s).progress,1500);
 M.taskAction(s,'defer');M.taskAction(s,'accept');assert.equal(M.task(s).progress,1500);
 M.transfer(s,1500,'card');assert.equal(M.taskComplete(s),true);
});

test('US-21: a recurring proposal remains attached to its goal and can be confirmed only once',()=>{
 const s=setup(),original=M.goal(s).id;s.regular={enabled:true,kind:'fixed',amount:3000,goalId:original};
 M.setGoal(s,{name:'Поездка',target:60000,deadline:'2027-11'},true);M.closeMonth(s);
 const notice=s.notifications.find(n=>n.type==='regular'),p=M.regularProposal(s,notice.id);
 assert.equal(p.goalId,original);assert.throws(()=>M.confirmRegular(s,notice.id,1234,'card',true),/Выберите цель/);
 s.activeGoal=original;const before=M.cardBalance(s);M.confirmRegular(s,notice.id,1234,'card',true);
 assert.equal(M.cardBalance(s),before-1234);assert.equal(notice.payload.confirmedAmount,1234);
 assert.throws(()=>M.confirmRegular(s,notice.id,1234,'card'),/уже подтверждён/);
 assert.equal(M.cardBalance(s),before-1234);
});

test('US-20: reusing a submitted confirmation cannot debit money twice',()=>{
 const s=setup();M.transfer(s,3200,'cafe',true,'confirmation-1');const balance=M.cardBalance(s);
 assert.throws(()=>M.transfer(s,3200,'cafe',true,'confirmation-1'),/уже подтверждён/);
 assert.equal(M.cardBalance(s),balance);assert.equal(M.goal(s).balance,3200);
});

test('US-16: refunding an archived purchase uses an existing envelope after its old envelope is removed',()=>{
 const s=setup(),custom=M.addEnvelope(s,{name:'Разное',plan:1000}),o=sorted(s,'Магазин',500,'restaurant',custom.id);
 M.closeMonth(s);M.nextMonth(s,M.nextProposal(s));M.deleteEnvelope(s,custom.id);
 const refund=M.refund(s,o.id,200);assert(M.validEnvelope(s,refund.suggested));M.assign(s,refund.id,refund.suggested);
 assert.equal(M.refundable(s,o),300);assert.equal(s.archives[0].actual,500);
});

test('US-23: closing freezes income, allocations and envelope names until the next month',()=>{
 const s=setup(),receipt=M.receiveIncome(s,1000);M.closeMonth(s);const before=M.clone(s);
 assert.throws(()=>M.receiveIncome(s,1000),/Месяц закрыт/);
 assert.throws(()=>M.distribute(s,receipt.id,{plans:{},reserve:0}),/Месяц закрыт/);
 assert.throws(()=>M.renameEnvelope(s,'cafe','Новое название'),/закрытого месяца/);
 assert.deepEqual(s,before);
});
