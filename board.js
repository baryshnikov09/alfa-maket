/* Direct card dragging is shared by live purchases, history trials and training. */
(() => {
  'use strict';
  const app=window.EnvelopePrototype;
  const main=document.querySelector('main');
  if(!app||!main)return;
  const $=(q,root=main)=>root.querySelector(q);
  const $$=(q,root=main)=>[...root.querySelectorAll(q)];
  const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
  const announce=text=>app.announce(text);
  const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let targets=[],selected=null,gesture=null,suppressClickUntil=0;
  function paintTargets(){
    targets=$$('[data-drop-envelope]');
    const d=app.boardData(),operation=d?.operations.find(o=>o.id===selected);
    if(!operation)selected=null;
    targets.forEach(target=>{
      const envelope=d?.envelopes.find(x=>x.id===target.dataset.dropEnvelope);
      target.classList.toggle('is-suggested',Boolean(operation&&operation.suggested===envelope?.id));
      target.classList.toggle('is-available',Boolean(operation));
      if(operation)target.setAttribute('aria-label',`Положить ${operation.name}, ${money(operation.amount)}, в ${envelope.name}`);
      else target.removeAttribute('aria-label');
    });
    $$('[data-operation]').forEach(card=>{card.classList.toggle('is-selected',card.dataset.operation===selected);card.setAttribute('aria-pressed',String(card.dataset.operation===selected));});
    const hint=$('#board-instructions');
    if(hint){if(!hint.dataset.original)hint.dataset.original=hint.textContent;hint.textContent=operation?`${operation.name} · ${money(operation.amount)}. Перенесите в конверт или нажмите на него. Esc — отменить.`:hint.dataset.original;}
  }
  function place(id,destination){
    const d=app.boardData(),operation=d?.operations.find(o=>o.id===id),envelope=d?.envelopes.find(x=>x.id===destination);
    if(!operation||!envelope)return false;
    try{const accepted=app.place(id,destination);if(accepted)announce(`${operation.name} · ${money(operation.amount)} → ${envelope.name}${app.boardData()?.operations.length?'':'. Все карточки разложены!'}`);return accepted;}
    catch(error){announce(error.message);return false;}
  }
  function hitTarget(x, y) {
    const target = document.elementFromPoint(x, y)?.closest('[data-drop-envelope]');
    return target && main.contains(target) ? target : null;
  }
  function hoverTarget(drag) {
    drag.target = hitTarget(drag.x, drag.y);
    targets.forEach(target => target.classList.toggle('is-drag-over', target === drag.target));
  }
  function tick() {
    const drag = gesture;
    if (!drag?.active) return;
    const edge = Math.min(90, window.innerHeight / 5);
    const speed = drag.y < edge ? -Math.ceil((edge - drag.y) / 5)
      : drag.y > window.innerHeight - edge ? Math.ceil((drag.y - window.innerHeight + edge) / 5) : 0;
    if (speed) window.scrollBy(0, Math.max(-18, Math.min(18, speed)));
    hoverTarget(drag);
    drag.frame = requestAnimationFrame(tick);
  }
  function moveGhost(drag) {
    drag.ghost.style.transform = `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0) rotate(-3deg)`;
  }
  function startDrag(drag) {
    if (gesture !== drag || drag.active) return;
    clearTimeout(drag.timer);
    drag.active = true;
    selected = drag.id;
    paintTargets();
    const rect = drag.card.getBoundingClientRect();
    const width = Math.min(240, rect.width);
    drag.offsetX = width * Math.max(0, Math.min(1, (drag.startX - rect.left) / rect.width));
    drag.offsetY = Math.min(65, Math.max(12, drag.startY - rect.top));
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.className = 'figma-operation interactive-operation card-drag-ghost';
    drag.ghost.removeAttribute('data-operation');
    drag.ghost.removeAttribute('aria-describedby');
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.tabIndex = -1;
    drag.ghost.style.width = width + 'px';
    document.body.append(drag.ghost);
    drag.card.classList.add('is-grabbed');
    document.documentElement.classList.add('card-drag-active');
    moveGhost(drag);
    hoverTarget(drag);
    drag.frame = requestAnimationFrame(tick);
  }
  function finish(cancelled = false) {
    const drag = gesture;
    if (!drag) return;
    gesture = null;
    clearTimeout(drag.timer);
    cancelAnimationFrame(drag.frame);
    // Release capture before replacing the hand and removing its source button.
    if (drag.card.hasPointerCapture?.(drag.pointerId)) drag.card.releasePointerCapture(drag.pointerId);
    if (!drag.active) {
      if (drag.scrolling) suppressClickUntil = performance.now() + 500;
      return;
    }
    suppressClickUntil = performance.now() + 500;
    document.documentElement.classList.remove('card-drag-active');
    drag.card.classList.remove('is-grabbed');
    targets.forEach(target => target.classList.remove('is-drag-over'));
    const target = cancelled ? null : hitTarget(drag.x, drag.y);
    const box = (target || drag.card).getBoundingClientRect();
    const accepted = target && place(drag.id, target.dataset.dropEnvelope);
    selected = null;
    paintTargets();
    if (!accepted) announce('Карточка вернулась в руку. Отпустите её над конвертом.');
    if (reducedMotion() || !drag.ghost.animate) drag.ghost.remove();
    else {
      const animation = drag.ghost.animate([
        { transform: drag.ghost.style.transform, opacity: 1 },
        { transform: `translate3d(${box.left + box.width / 2 - drag.ghost.offsetWidth / 2}px, ${box.top}px, 0) scale(${accepted ? .55 : 1})`, opacity: 0 }
      ], { duration: accepted ? 220 : 160, easing: 'ease-out', fill: 'forwards' });
      animation.finished.then(() => drag.ghost.remove(), () => drag.ghost.remove());
    }
    if (accepted && !reducedMotion() && target.animate) target.animate([
      { boxShadow: '0 0 0 4px #EF3124', transform: 'scale(1.025)' },
      { boxShadow: '0 0 0 0 transparent', transform: 'scale(1)' }
    ], { duration: 500, easing: 'ease-out' });
  }
  main.addEventListener('pointerdown', event => {
    const card = event.target.closest('[data-operation]');
    if (!card || !event.isPrimary || event.button !== 0 || gesture) return;
    const row = card.closest('.card-hand');
    gesture = { id: card.dataset.operation, card, pointerId: event.pointerId, pointerType: event.pointerType,
      row, scrollLeft: row.scrollLeft,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
    const drag = gesture;
    drag.timer = setTimeout(() => startDrag(drag), 180);
    card.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    const drag = gesture;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const dx = drag.x - drag.startX, dy = drag.y - drag.startY;
    // A quick horizontal swipe browses the hand. Holding first picks up a card.
    if (!drag.active && !drag.scrolling && drag.pointerType === 'touch'
      && Math.abs(dx) >= 7 && Math.abs(dx) > Math.abs(dy) * 1.35 && drag.row.scrollWidth > drag.row.clientWidth) {
      clearTimeout(drag.timer);
      drag.scrolling = true;
    }
    if (drag.scrolling) {
      event.preventDefault();
      drag.row.scrollLeft = drag.scrollLeft - dx;
      return;
    }
    if (!drag.active && Math.hypot(dx, dy) >= 7) startDrag(drag);
    if (drag.active) { event.preventDefault(); moveGhost(drag); hoverTarget(drag); }
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    finish();
  });
  document.addEventListener('pointercancel', event => {
    if (gesture?.pointerId === event.pointerId) finish(true);
  });
  main.addEventListener('lostpointercapture', event => {
    if (gesture?.pointerId === event.pointerId) finish(true);
  });
  main.addEventListener('contextmenu', event => {
    if (event.target.closest('[data-operation]')) event.preventDefault();
  });
  main.addEventListener('dragstart', event => {
    if (event.target.closest('[data-operation]')) event.preventDefault();
  });
  window.addEventListener('blur', () => finish(true));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (gesture) finish(true);
    selected = null;
    paintTargets();
  });

  document.addEventListener('click',event=>{
    if(!main.contains(event.target))return;
    if(performance.now()<suppressClickUntil&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();return;}
    const card=event.target.closest('[data-operation]'),destination=event.target.closest('[data-drop-envelope]');
    if(!card&&!(destination&&selected))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(card){selected=selected===card.dataset.operation?null:card.dataset.operation;paintTargets();}
    else{place(selected,destination.dataset.dropEnvelope);selected=null;paintTargets();}
  },true);
  document.addEventListener('envelopes:render',()=>{if(gesture)finish(true);selected=null;paintTargets();});
  paintTargets();
})();
