/* Shared domain model for US-1…US-26. All money movements are demo ledger entries. */
(() => {
  'use strict';
  const VERSION = 2;
  const BASE_MONTH = '2026-11';
  const baseEnvelopes = [
    {id:'groceries',name:'Продукты и быт',plan:30000},
    {id:'bills',name:'Квартплата и связь',plan:15000,sensitive:true},
    {id:'transport',name:'Транспорт',plan:6000},
    {id:'cafe',name:'Кафе и развлечения',plan:12000},
    {id:'reserve',name:'Запас',plan:10000,protected:true}
  ];
  const extras = [{id:'children',name:'Дети',sensitive:true},{id:'car',name:'Автомобиль'},
    {id:'health',name:'Здоровье',sensitive:true},{id:'clothes',name:'Одежда'},{id:'holiday',name:'Отпуск'}];
  const categories = [{id:'supermarket',name:'Супермаркеты',envelope:'groceries'},
    {id:'restaurant',name:'Рестораны и доставка',envelope:'cafe'}, {id:'fastfood',name:'Фастфуд',envelope:'cafe'},
    {id:'taxi',name:'Такси и метро',envelope:'transport'}, {id:'utilities',name:'ЖКУ и связь',envelope:'bills',sensitive:true},
    {id:'medicine',name:'Медицина и аптеки',envelope:'reserve',sensitive:true},
    {id:'education',name:'Образование',envelope:'reserve',sensitive:true}, {id:'children',name:'Детские расходы',envelope:'reserve',sensitive:true}];
  const trialOperations = [
    ['coffee','Кофейня',380,'restaurant'], ['market','Супермаркет',1280,'supermarket'], ['taxi','Такси',240,'taxi'],
    ['rent','Квартплата и связь',15000,'utilities'], ['groceries-2','Продукты на неделю',15720,'supermarket'],
    ['groceries-3','Продукты и быт',10000,'supermarket'], ['metro','Метро и транспорт',5560,'taxi'],
    ['fastfood','Фастфуд',2400,'fastfood'], ['cafe-2','Кафе',3020,'restaurant'], ['delivery','Доставка',3000,'restaurant']
  ].map(([id,name,amount,category],index)=>({id,name,amount,category,time:`Октябрь, ${30-index} число`,suggested:categories.find(c=>c.id===category).envelope}));
  const clone = object => JSON.parse(JSON.stringify(object));
  const sum = values => values.reduce((a,b)=>a+b,0);
  const rub = value => Math.round(Number(value)*100)/100;
  const fail = message => { throw new Error(message); };
  const amount = (value,positive=false) => {
    const n=rub(value);
    if (!Number.isFinite(n)||n<0||(positive&&n===0)||n>1e10) fail('Укажите корректную сумму'+(positive?' больше нуля.':'.'));
    return n;
  };
  function addMonths(month,n) { const [y,m]=month.split('-').map(Number); const d=new Date(Date.UTC(y,m-1+n,1)); return d.toISOString().slice(0,7); }
  function monthsBetween(a,b) { const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number); return (by-ay)*12+bm-am; }
  function goalTemplate(id='goal-1') {return {id,name:'Квартира',target:1500000,deadline:'2033-02',monthly:20000,balance:0,opened:false};}
  function create(mode='A',manual=false) {
    const s={version:VERSION,mode,month:BASE_MONTH,day:9,seq:1,hasCard:mode==='A',onboarded:false,
      income:mode==='A'?120000:null,envelopes:baseEnvelopes.map(e=>({...e,plan:mode==='B'||manual?null:e.plan})),
      originalForecast:null,funded:{},goalReserved:0,goals:[goalTemplate()],activeGoal:'goal-1',
      receipts:[],operations:[],transfers:[],withdrawals:[],rules:{},bindings:Object.fromEntries(categories.map(c=>[c.id,c.envelope])),
      automaticSalary:false,regular:{enabled:false,kind:'leftovers',amount:3000,goalId:'goal-1'},payrollTransferred:false,
      notifications:[],dayRewards:[],completedTasks:[],assignmentHistory:[],task:{kind:mode==='A'?'fastfood':'first',status:'offered',baseline:0},
      monthClosed:false,archives:[],trial:{assignments:{}},training:{assignments:{}},lastResult:null};
    if(mode==='A') receiveIncome(s,120000,'Зарплата');
    return s;
  }
  function goal(s){return s.goals.find(g=>g.id===s.activeGoal)||s.goals[0];}
  function id(s,prefix){return prefix+'-'+s.seq++;}
  function notify(s,type,text,payload={}){s.notifications.unshift({id:id(s,'notice'),type,text,payload,read:false});s.notifications=s.notifications.slice(0,40);}
  function currentOps(s){return s.operations.filter(o=>o.month===s.month);}
  function currentTransfers(s){return s.transfers.filter(t=>t.month===s.month);}
  function cardBalance(s){return rub(sum(s.receipts.map(r=>r.amount))-sum(s.operations.map(o=>o.amount))-sum(s.transfers.map(t=>t.amount))+sum(s.withdrawals.map(w=>w.amount)));}
  function goalReserve(s){return Math.max(0,rub(s.goalReserved-sum(currentTransfers(s).map(t=>t.amount))));}
  function validEnvelope(s,envelope){return ['free','unplanned'].includes(envelope)||s.envelopes.some(e=>e.id===envelope);}
  function spent(s,envelope){return rub(sum(currentOps(s).filter(o=>o.envelope===envelope).map(o=>o.amount)));}
  function totals(s){
    const budget=s.envelopes.map(e=>{const used=spent(s,e.id),pinched=sum(currentTransfers(s).map(t=>t.source===e.id?t.amount:(t.sources?.[e.id]||0)));
      return {...e,spent:used,funded:s.funded[e.id]||0,pinched,remaining:rub((s.funded[e.id]||0)-used-pinched)};});
    const free=rub(cardBalance(s)-sum(budget.map(e=>e.remaining))-goalReserve(s));
    return [...budget,{id:'free',name:'Свободные',plan:free,spent:spent(s,'free'),remaining:free,funded:free},
      {id:'unplanned',name:'Вне плана',plan:0,spent:spent(s,'unplanned'),remaining:0,funded:0}];
  }
  function forecast(s){const budget=sum(s.envelopes.map(e=>Number(e.plan)||0));return {budget,goal:goal(s).monthly,total:budget+goal(s).monthly,free:rub((s.income||0)-budget-goal(s).monthly),deficit:Math.max(0,budget+goal(s).monthly-(s.income||0))};}
  function setGoal(s,values,newGoal=false){
    const target=amount(values.target,true),deadline=String(values.deadline),name=String(values.name||'').trim();
    if(!name)fail('Назовите цель.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(deadline)||monthsBetween(s.month,deadline)<1||monthsBetween(s.month,deadline)>600)fail('Выберите срок от следующего месяца до 50 лет.');
    const g=newGoal?goalTemplate(id(s,'goal')):goal(s);
    if(target<g.balance)fail('Сумма цели должна быть не меньше уже накопленного.');
    Object.assign(g,{name,target,deadline,monthly:Math.ceil((target-g.balance)/monthsBetween(s.month,deadline))});
    if(newGoal){s.goals.push(g);s.activeGoal=g.id;}
    if(s.receipts.some(r=>r.month===s.month&&r.allocated))s.goalReserved=g.monthly;
    return g;
  }
  function projection(s,g=goal(s)){
    const months=Math.max(1,monthsBetween(s.month,g.deadline)),rate=.09/12;
    const future=g.balance*(1+rate)**months+(g.monthly||0)*(((1+rate)**months-1)/rate);
    return {months,monthly:g.monthly,interest:Math.max(0,Math.round(future-g.balance-g.monthly*months)),
      days:g.monthly?Math.ceil(Math.max(0,g.target-g.balance)/g.monthly*30.44):0,estimatedDate:new Date(Date.UTC(Number(s.month.slice(0,4)),Number(s.month.slice(5))-1,s.day+(g.monthly?Math.ceil(Math.max(0,g.target-g.balance)/g.monthly*30.44):0))).toISOString().slice(0,10),progress:Math.min(100,g.balance/g.target*100)};
  }
  function setForecast(s,income,plans){
    if(s.monthClosed)fail('Этот месяц уже закрыт. Измените прогноз следующего месяца.');
    const parsed=Object.fromEntries(s.envelopes.map(e=>[e.id,amount(plans[e.id])]));
    s.income=amount(income,true);
    if(!s.originalForecast)s.originalForecast={income:s.income,plans:clone(parsed)};
    const allocated=s.receipts.some(r=>r.month===s.month&&r.allocated);
    s.envelopes.forEach(e=>{
      if(allocated){const delta=parsed[e.id]-(Number(e.plan)||0);s.funded[e.id]=delta<0?Math.min(s.funded[e.id]||0,parsed[e.id]):(s.funded[e.id]||0)+Math.min(delta,Math.max(0,totals(s).find(t=>t.id==='free').remaining));}
      e.plan=parsed[e.id];
    });
    s.onboarded=true;
  }
  function receiveIncome(s,value,label='Зарплата'){
    if(s.monthClosed)fail('Месяц закрыт. Начните следующий месяц для новых поступлений.');
    const receipt={id:id(s,'income'),amount:amount(value,true),label,month:s.month,allocated:false};s.receipts.push(receipt);
    notify(s,'salary',`${label}: на карту поступило ${receipt.amount} ₽. Можно распределить по прогнозу.`,{receiptId:receipt.id});
    if(s.automaticSalary&&s.onboarded) distribute(s,receipt.id,suggestDistribution(s,receipt));
    return receipt;
  }
  function suggestDistribution(s,receipt){
    const ratio=Math.min(1,receipt.amount/(s.income||receipt.amount));let left=receipt.amount;
    const plans={};s.envelopes.forEach(e=>{plans[e.id]=Math.min(left,Math.max(0,(e.plan||0)-(s.funded[e.id]||0)),Math.round((e.plan||0)*ratio));left-=plans[e.id];});
    const reserve=Math.min(left,Math.max(0,goal(s).monthly-s.goalReserved),Math.round(goal(s).monthly*ratio));
    return {plans,reserve};
  }
  function distribute(s,receiptId,values){
    if(s.monthClosed)fail('Месяц закрыт. Новая раздача доступна в следующем месяце.');
    const receipt=s.receipts.find(r=>r.id===receiptId&&r.month===s.month);
    if(!receipt||receipt.allocated)fail('Это поступление уже распределено.');
    const plans=Object.fromEntries(s.envelopes.map(e=>[e.id,amount(values.plans[e.id]||0)])),reserve=amount(values.reserve||0);
    if(sum(Object.values(plans))+reserve>receipt.amount+.001)fail('Суммы распределения больше поступления. Уменьшите их: остаток останется в Свободных.');
    s.envelopes.forEach(e=>s.funded[e.id]=(s.funded[e.id]||0)+plans[e.id]);
    s.goalReserved+=reserve;receipt.allocated=true;receipt.distribution={plans,reserve};
    return receipt;
  }
  function pending(s){return currentOps(s).filter(o=>!o.envelope);}
  function suggested(s,operation){return s.bindings[operation.category]||'unplanned';}
  function createPurchase(s,values){
    if(s.monthClosed)fail('Сначала начните следующий месяц.');
    if(!s.hasCard)fail('Сначала оформите демонстрационную карту.');
    const value=amount(values.amount,true),name=String(values.name||'').trim();
    if(!name)fail('Укажите магазин.');
    if(value>cardBalance(s))fail('Для этой покупки недостаточно денег на карте. Можно показать поступление зарплаты.');
    if(!categories.some(c=>c.id===values.category))fail('Выберите категорию покупки.');
    const rule=s.rules[name.toLocaleLowerCase('ru')];
    const operation={id:id(s,'purchase'),name,amount:value,category:values.category,month:s.month,day:s.day,time:`${s.day} число, 12:40`,envelope:rule&&validEnvelope(s,rule)?rule:null};
    s.operations.push(operation);
    notify(s,'purchase',operation.envelope?`${name}: ${value} ₽ автоматически учтены в конверте.`:`Появилась карточка: ${name}, ${value} ₽.`,{operationId:operation.id});
    if(s.mode==='B'&&s.task.kind==='first'){s.task.status='completed';if(!s.completedTasks.includes('first'))s.completedTasks.push('first');}
    return operation;
  }
  function markDay(s){if(currentOps(s).length&&!pending(s).length){const key=s.month+'-'+s.day;if(!s.dayRewards.includes(key)){s.dayRewards.push(key);notify(s,'reward','День разобран. Доступна демонстрационная награда за усердие.');}}}
  function assign(s,operationId,envelope){
    if(s.monthClosed)fail('Месяц закрыт: его операции доступны только для просмотра.');
    if(!validEnvelope(s,envelope))fail('Карточку нельзя положить во вклад «Цель». Выберите бюджетный конверт.');
    const operation=currentOps(s).find(o=>o.id===operationId);if(!operation)fail('Покупка не найдена в этом месяце.');
    const previous=operation.envelope;if(previous!==envelope){s.assignmentHistory||=[];s.assignmentHistory.push({id:operationId,previous});operation.envelope=envelope;}markDay(s);return previous;
  }
  function refund(s,operationId,value){
    if(s.monthClosed)fail('Для демонстрации возврата начните новый месяц и выберите его покупку.');
    const purchase=s.operations.find(o=>o.id===operationId&&o.amount>0);if(!purchase)fail('Выберите покупку для возврата.');
    const n=amount(value,true),returned=-sum(s.operations.filter(o=>o.refundOf===operationId).map(o=>o.amount));
    if(n>purchase.amount-returned)fail('Возврат больше оставшейся суммы покупки.');
    const operation={id:id(s,'refund'),name:'Возврат · '+purchase.name,amount:-n,category:purchase.category,month:s.month,day:s.day,time:`${s.day} число, 13:10`,envelope:null,refundOf:purchase.id,suggested:validEnvelope(s,purchase.envelope)?purchase.envelope:suggested(s,purchase)};
    s.operations.push(operation);notify(s,'purchase',`Возврат ${n} ₽ пришёл отдельной карточкой. Это уменьшение расходов, не новый доход.`,{operationId:operation.id});return operation;
  }
  function setRule(s,merchant,envelope,enabled){if(!validEnvelope(s,envelope))fail('Выберите конверт.');const key=String(merchant).trim().toLocaleLowerCase('ru');if(!key)fail('Укажите магазин.');if(enabled)s.rules[key]=envelope;else delete s.rules[key];}
  function addEnvelope(s,values){if(s.monthClosed)fail('Добавьте конверт в следующем месяце.');const name=String(values.name||'').trim();if(!name)fail('Назовите конверт.');if(s.envelopes.some(e=>e.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))fail('Такое название уже есть.');
    const plan=amount(values.plan||0),known=extras.find(e=>e.id===values.type),e={id:id(s,'envelope'),name,plan,type:known?.id||null,sensitive:Boolean(known?.sensitive)};
    const free=Math.max(0,totals(s).find(t=>t.id==='free').remaining);s.envelopes.push(e);s.funded[e.id]=s.receipts.some(r=>r.month===s.month&&r.allocated)?Math.min(plan,free):0;if(known?.id==='children')s.bindings.children=e.id;if(known?.id==='health')s.bindings.medicine=e.id;return e;
  }
  function renameEnvelope(s,envelope,name){if(s.monthClosed)fail('Набор закрытого месяца не меняется.');const e=s.envelopes.find(e=>e.id===envelope);if(!e)fail('Конверт не найден.');if(e.protected)fail('Запас остаётся всегда.');name=String(name).trim();if(!name)fail('Назовите конверт.');if(s.envelopes.some(other=>other.id!==envelope&&other.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))fail('Такое название уже есть.');e.name=name;}
  function deleteEnvelope(s,envelope){if(s.monthClosed)fail('Набор закрытого месяца не меняется.');const e=s.envelopes.find(e=>e.id===envelope);if(!e||e.protected)fail('Запас и Цель остаются всегда.');
    currentOps(s).filter(o=>o.envelope===envelope).forEach(o=>o.envelope='unplanned');
    Object.keys(s.bindings).forEach(k=>{if(s.bindings[k]===envelope)s.bindings[k]='unplanned';});
    Object.keys(s.rules).forEach(k=>{if(s.rules[k]===envelope)delete s.rules[k];});
    s.envelopes=s.envelopes.filter(e=>e.id!==envelope);delete s.funded[envelope];
  }
  function canPinch(s){return s.mode==='A'||s.archives.length>0||s.monthClosed;}
  function available(s,source){if(source==='card')return Math.max(0,cardBalance(s));if(source==='planned')return Math.min(cardBalance(s),goalReserve(s));if(source==='leftovers')return Math.max(0,Math.min(cardBalance(s),sum(totals(s).filter(e=>!['reserve','free','unplanned'].includes(e.id)).map(e=>Math.max(0,e.remaining)))));const e=totals(s).find(e=>e.id===source);return Math.max(0,Math.min(cardBalance(s),e?.remaining||0));}
  function transfer(s,value,source='free',open=false,requestId=null){
    if(requestId&&s.transfers.some(t=>t.requestId===requestId))fail('Этот перевод уже подтверждён. Для нового щипка выберите сумму заново.');
    if(!canPinch(s))fail('Для нового клиента первый щипок предложим с первым итогом месяца.');
    const g=goal(s),n=amount(value,true);
    if(!g.opened&&!open)fail('Сначала подтвердите открытие вклада и его условия.');
    if(n>available(s,source)+.001)fail('Сумма больше доступного остатка выбранного конверта или карты.');
    const before=projection(s).days,beforeDate=projection(s).estimatedDate;
    if(open){g.opened=true;g.openedMonth=s.month;}
    g.balance=rub(g.balance+n);const sources={};if(source==='leftovers'){let left=n;for(const e of totals(s).filter(e=>!['reserve','free','unplanned'].includes(e.id))){const part=Math.min(left,Math.max(0,e.remaining));if(part)sources[e.id]=part;left=rub(left-part);}}s.transfers.push({id:id(s,'transfer'),month:s.month,goalId:g.id,amount:n,source,sources,requestId});
    s.lastResult={kind:'transfer',amount:n,balance:g.balance,beforeDate,afterDate:projection(s).estimatedDate,days:Math.max(0,before-projection(s).days)};if(taskComplete(s)&&!s.completedTasks.includes('pinch:'+s.month))s.completedTasks.push('pinch:'+s.month);
    notify(s,'reward',`Щипок ${n} ₽ подтверждён. Цель стала ближе.`,{goalId:g.id});return s.lastResult;
  }
  function openDeposit(s){if(!canPinch(s))fail('Вклад можно открыть при первом щипке после итога месяца.');goal(s).opened=true;goal(s).openedMonth=s.month;}
  function withdraw(s,value){const g=goal(s),n=amount(value,true);if(n>g.balance)fail('Сумма больше остатка вклада.');const before=projection(s).days,beforeDate=projection(s).estimatedDate;g.balance=rub(g.balance-n);s.withdrawals.push({id:id(s,'withdraw'),month:s.month,goalId:g.id,amount:n});s.lastResult={kind:'withdraw',amount:n,balance:g.balance,beforeDate,afterDate:projection(s).estimatedDate,days:Math.max(0,projection(s).days-before)};return s.lastResult;}
  function task(s){
    const analytical=s.mode==='A'||(s.operations.filter(o=>o.amount>0&&!o.refundOf).length>=3&&(s.monthClosed||s.archives.length>0));
    if(!analytical){const kind=s.task.kind==='payroll'?'payroll':'first';return {...s.task,kind,analytical:false,progress:kind==='payroll'?(s.payrollTransferred?1:0):(s.operations.some(o=>o.amount>0)?1:0),target:1};}
    const reference=s.mode==='A'?4000:sum(s.operations.filter(o=>o.month!==s.month&&o.category==='fastfood').map(o=>o.amount));
    let kind=['fastfood','pinch'].includes(s.task.kind)?s.task.kind:(reference>0?'fastfood':'pinch');
    if(kind==='fastfood'&&reference<=0)kind='pinch';
    const progress=kind==='pinch'?Math.max(0,sum(s.transfers.map(t=>t.amount))-(s.task.baseline||0)):sum(currentOps(s).filter(o=>o.category==='fastfood').map(o=>o.amount));
    return {...s.task,status:['first','payroll'].includes(s.task.kind)?'offered':s.task.status,kind,analytical:true,reference,progress,target:kind==='pinch'?(s.task.targetAmount||3000):Math.round(reference*.9)};
  }
  function taskAction(s,action){
    const t=task(s);
    if(action==='replace'){
      const kind=!t.analytical?(t.kind==='first'?'payroll':'first'):(t.kind==='fastfood'?'pinch':t.reference>0?'fastfood':'pinch');
      s.task={kind,status:'offered',baseline:sum(s.transfers.map(t=>t.amount)),targetAmount:t.analytical&&t.reference===0?(t.target===3000?1000:3000):3000};
    }else{const continuing=s.task.kind===t.kind&&Boolean(s.task.accepted||s.task.status==='accepted');s.task.kind=t.kind;s.task.status=action==='accept'?'accepted':'deferred';if(action==='accept'&&!continuing){s.task.baseline=sum(s.transfers.map(t=>t.amount));s.task.accepted=true;}}
  }
  function taskComplete(s){const t=task(s);if(t.kind==='first')return s.operations.some(o=>o.amount>0);if(t.kind==='payroll')return s.payrollTransferred;return t.status==='accepted'&&(t.kind==='pinch'?t.progress>=t.target:s.monthClosed&&t.progress<=t.target);}
  function report(s){
    const rows=s.envelopes.map(e=>{const actual=spent(s,e.id),plan=Number(e.plan)||0,difference=rub(plan-actual);return {id:e.id,name:e.name,plan,original:s.originalForecast?.plans[e.id]??plan,actual,difference,matched:Math.abs(difference)<=Math.max(100,plan*.05)};});
    const planned=sum(rows.map(r=>r.plan)),actual=sum(currentOps(s).map(o=>o.amount)),freeSpent=spent(s,'free'),unassigned=sum(pending(s).map(o=>o.amount));
    return {month:s.month,rows,unplanned:spent(s,'unplanned'),freeSpent,unassigned,planned,actual,savings:Math.max(0,sum(rows.filter(r=>r.id!=='reserve').map(r=>r.plan-r.actual))-spent(s,'unplanned')-freeSpent-unassigned),pinched:sum(currentTransfers(s).map(t=>t.amount)),matched:Math.abs(planned-actual)<=Math.max(100,planned*.05),largest:[...rows,...(freeSpent?[{id:'free',name:'Свободные',difference:-freeSpent}]:[]),...(spent(s,'unplanned')?[{id:'unplanned',name:'Вне плана',difference:-spent(s,'unplanned')}]:[])].sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference))[0],closed:s.monthClosed};
  }
  function closeMonth(s){if(s.monthClosed)return report(s);if(pending(s).length)fail('Сначала разложите оставшиеся карточки.');s.monthClosed=true;const r=report(s);if(taskComplete(s)&&!s.completedTasks.includes('task:'+s.month))s.completedTasks.push('task:'+s.month);if(s.regular.enabled){const proposed=s.regular.kind==='fixed'?s.regular.amount:sum(totals(s).filter(e=>!['reserve','free','unplanned'].includes(e.id)).map(e=>Math.max(0,e.remaining)));
    if(proposed>0)notify(s,'regular',`Предложение регулярного щипка: ${rub(proposed)} ₽. Перевод произойдёт только после подтверждения.`,{month:s.month,goalId:s.regular.goalId||goal(s).id,amount:rub(proposed),source:s.regular.kind==='leftovers'?'leftovers':'card'});}
    return r;
  }
  function regularProposal(s,noticeId){
    const notice=s.notifications.find(n=>n.id===noticeId&&n.type==='regular');
    if(!notice)fail('Предложение щипка не найдено.');
    if(notice.payload.confirmed)fail('Этот щипок уже подтверждён.');
    const goalId=notice.payload.goalId||s.goals[0].id;
    if(!s.goals.some(g=>g.id===goalId))fail('Цель предложения не найдена.');
    return {notice,goalId,source:notice.payload.month===s.month?(notice.payload.source||'card'):'card',amount:notice.payload.amount};
  }
  function confirmRegular(s,noticeId,value,source,open=false){
    const proposal=regularProposal(s,noticeId);
    if(s.activeGoal!==proposal.goalId)fail('Выберите цель, для которой создано предложение.');
    if(source!==proposal.source)fail('Источник предложения изменился. Откройте уведомление ещё раз.');
    const result=transfer(s,value,source,open);
    proposal.notice.payload.confirmed=true;proposal.notice.payload.confirmedAmount=result.amount;proposal.notice.read=true;
    return result;
  }
  function refundable(s,operation){return operation.amount>0?Math.max(0,rub(operation.amount+sum(s.operations.filter(o=>o.refundOf===operation.id).map(o=>o.amount)))):0;}
  function nextProposal(s){return Object.fromEntries(s.envelopes.map(e=>[e.id,e.sensitive||e.id==='reserve'?Number(e.plan)||0:Math.max(0,Math.round(((Number(e.plan)||0)+spent(s,e.id))/2000)*1000)]));}
  function nextMonth(s,plans){if(!s.monthClosed)fail('Сначала завершите месяц.');const parsed=Object.fromEntries(s.envelopes.map(e=>[e.id,amount(plans[e.id])]));s.archives.push({...clone(report(s)),taskCompleted:taskComplete(s)});s.month=addMonths(s.month,1);s.day=1;s.monthClosed=false;s.funded={};s.goalReserved=0;s.assignmentHistory=[];s.envelopes.forEach(e=>e.plan=parsed[e.id]);s.originalForecast={income:s.income,plans:clone(parsed)};s.task={kind:s.mode==='B'&&s.operations.length<3?'first':'fastfood',status:'offered',baseline:sum(s.transfers.map(t=>t.amount))};notify(s,'month','Новый месяц начался. Прогноз, накопления и правила сохранены.',{month:s.month});}
  function restore(value){if(!value||value.version!==VERSION)return null;try{if(!Array.isArray(value.envelopes)||!Array.isArray(value.goals)||!value.goals.length||!Array.isArray(value.operations)||!Array.isArray(value.receipts)||!Array.isArray(value.notifications))return null;if(!Array.isArray(value.assignmentHistory))value.assignmentHistory=[];if(!Array.isArray(value.completedTasks))value.completedTasks=[];return value;}catch{return null;}}
  const api={VERSION,BASE_MONTH,baseEnvelopes,extras,categories,trialOperations,clone,create,restore,goal,projection,forecast,setGoal,setForecast,receiveIncome,suggestDistribution,distribute,cardBalance,goalReserve,totals,pending,currentOps,currentTransfers,suggested,createPurchase,assign,refund,refundable,setRule,addEnvelope,renameEnvelope,deleteEnvelope,available,canPinch,transfer,openDeposit,withdraw,task,taskAction,taskComplete,report,closeMonth,regularProposal,confirmRegular,nextProposal,nextMonth,notify,addMonths,monthsBetween,validEnvelope,markDay};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.EnvelopeGame=api;
})();
