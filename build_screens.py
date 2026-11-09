#!/usr/bin/env python3
"""Rebuild the 73 HTML screens from the unoutlined Figma SVG export.

SVG is retained as a source reference only. The generated interface consists of
normal document-flow HTML, controls, responsive rows and cards; SVG is used only
for small decorative icons. Run: python3 build_screens.py
"""
from __future__ import annotations
import html
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

BASE = Path(__file__).resolve().parent
SOURCE = BASE / 'figma-source' / '01 · Конверты'
COLORS = {'#F1F2F4':'var(--bg)', '#FFFFFF':'var(--surface)', 'white':'var(--surface)',
          '#F2F3F5':'var(--soft)', '#202022':'var(--ink)', '#5F626B':'var(--muted)',
          '#777980':'var(--muted)', '#E7E8EC':'var(--line)', '#EF3124':'var(--red)',
          '#FFF0ED':'var(--rose)', '#218555':'var(--green)', '#EAF6EF':'var(--mint)',
          '#EAF1FC':'var(--blue)', '#F2EDFA':'var(--purple)', '#FFF4DF':'var(--amber)'}
SVG_PATHS = {
'env':'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/>',
'shield':'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
'gift':'<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C4 8 4 2 7 2s5 6 5 6Zm0 0c8 0 8-6 5-6s-5 6-5 6Z"/>',
'coffee':'<path d="M3 8h13v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm13 1h2a3 3 0 0 1 0 6h-2M2 22h17M6 2v3M11 2v3"/>',
'bag':'<path d="M5 7h14l1 14H4ZM8 7V5a4 4 0 0 1 8 0v2"/>',
'car':'<path d="m4 10 2-6h12l2 6M3 10h18v9H3ZM6 19v3M18 19v3M6 14h2M16 14h2"/>',
'home':'<path d="m3 11 9-8 9 8v10h-7v-7h-4v7H3Z"/>',
'check':'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
'arrow':'<path d="M3 12h18m-7-7 7 7-7 7"/>',
'target':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
'wallet':'<path d="M3 5h17v16H3ZM3 5V3h14v2M15 11h6v5h-6Z"/>',
'chart':'<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>',
'clock':'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
'heart':'<path d="M12 21 3 12C-2 5 6-1 12 6c6-7 14-1 9 6Z"/>',
'chat':'<path d="M21 11a9 9 0 0 1-9 9H3v-9a9 9 0 0 1 18 0Z"/>',
'info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>'}

def tag(e): return e.tag.rsplit('}',1)[-1]
def esc(s): return html.escape(str(s), quote=True)
def name(e):
    s=e.get('id','')
    try: return s.encode('latin1').decode('utf8')
    except (UnicodeEncodeError, UnicodeDecodeError): return s

def children(e): return [c for c in e if tag(c) in ('g','text')]
def texts(e): return [''.join(t.itertext()) for t in e.iter() if tag(t)=='text']
def text(e): return ''.join(e.itertext())
def direct_rect(e): return next((c for c in e if tag(c)=='rect'),None)
def number(e,k,default=0):
    try: return float(e.get(k,default))
    except (ValueError,TypeError): return float(default)
def color(c): return COLORS.get(c,COLORS.get(c.upper(),c))
def fmt(n): return str(round(float(n),2)).rstrip('0').rstrip('.') if float(n)%1 else str(int(float(n)))

def bounds(e):
    r=direct_rect(e)
    if r is not None:
        return (number(r,'x'),number(r,'y'),number(r,'width'),number(r,'height'))
    if tag(e)=='text':
        ss=[c for c in e if tag(c)=='tspan']
        fs=number(e,'font-size',16)
        if ss:
            xs=[number(c,'x') for c in ss]; ys=[number(c,'y') for c in ss]
            width=max((len(''.join(c.itertext()))*fs*.52 for c in ss),default=0)
            return (min(xs),min(ys)-fs*.95,width,max(ys)-min(ys)+fs*1.4)
    bs=[bounds(c) for c in children(e)]
    bs=[b for b in bs if b[2] or b[3]]
    if bs:
        x=min(b[0] for b in bs);y=min(b[1] for b in bs)
        return (x,y,max(b[0]+b[2] for b in bs)-x,max(b[1]+b[3] for b in bs)-y)
    # Icons have path coordinates in the original page's coordinate system.
    # Only their relative placement matters to layout inference.
    ps=[x for x in e.iter() if tag(x)=='path']
    if ps:
        vals=[]
        for p in ps:
            m=re.match(r'[Mm]\s*(-?[\d.]+)[, ]+(-?[\d.]+)',p.get('d',''))
            if m: vals.append((float(m[1]),float(m[2])))
        if vals: return (min(p[0] for p in vals),min(p[1] for p in vals),22,22)
    return (0,0,0,0)

def horizontal(cs):
    if len(cs)<2:return False
    bs=[bounds(c) for c in cs]
    # Baselines vary by font size; SVG layout blocks have stable top edges.
    same_y=max(b[1] for b in bs)-min(b[1] for b in bs)<18
    distinct_x=max(b[0] for b in bs)-min(b[0] for b in bs)>30
    return same_y and distinct_x

def is_button(e):
    r=direct_rect(e); cs=children(e)
    return r is not None and 40<=number(r,'height')<=56 and len(cs)==1 and tag(cs[0])=='text' and len(text(cs[0]))<85

def control_content(markup):
    # Buttons only accept phrasing content. CSS keeps their cards in normal flow.
    return re.sub(r'<(/?)(?:h2|h3|p|div)(?=[ >])', r'<\1span', markup)

def icon(e,large=False):
    nm=name(e).split(' / ')[-1].lower().split('_')[0]
    key=next((k for k in SVG_PATHS if k in nm),'info')
    path=next((p for p in e.iter() if tag(p)=='path'),None)
    col=path.get('stroke',path.get('fill','#202022')) if path is not None else '#202022'
    if col=='none': col='#202022'
    size=48 if large else 22
    return f'<svg class="figma-icon{ " figma-icon-large" if large else ""}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{esc(color(col))}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{SVG_PATHS[key]}</svg>'

class Renderer:
    def __init__(self,screen):
        self.screen=screen; self.labels=[];self.fields=[];self.field_no=0
    def label_attrs(self,value):
        value=value.strip();self.labels.append(value)
        return f'data-label="{esc(value)}"'
    def text_html(self,e,force_tag=None):
        value=text(e); fs=number(e,'font-size',16); weight=e.get('font-weight','400');col=color(e.get('fill','#202022'))
        large=fs>=32
        el=force_tag or ('h2' if fs>=22 and weight in ('bold','700') else 'p')
        cls='figma-text'+(' amount' if large else '')
        if value.strip() in ('Выполнено','В процессе'):
            cls+=' status'+(' status-success' if value.strip()=='Выполнено' else ' status-pending')
        return f'<{el} class="{cls}" style="--text-size:{fmt(fs)}px;--text-weight:{esc(weight)};--text-color:{esc(col)}">{esc(value).replace(chr(10),"<br>")}</{el}>'
    def button_html(self,e,tab=False):
        r=direct_rect(e); val=text(children(e)[0]);fill=r.get('fill','#F2F3F5')
        typ='btn-primary' if fill.upper()=='#EF3124' else 'btn-dark' if fill.upper()=='#202022' else 'btn-quiet' if fill=='white' else 'btn-secondary'
        active=' aria-current="page"' if tab and typ=='btn-dark' else ''
        return f'<button type="button" class="btn {typ}" {self.label_attrs(val)}{active}>{esc(val)}</button>'
    def field_html(self,e,ts):
        label=text(ts[0]);val=text(ts[1]);self.field_no+=1
        fid=f'f-{self.screen}-{self.field_no}'
        readonly=any(k in label.lower() for k in ('срок','счёт для','было'))
        self.fields.append({'label':label,'value':val,'readonly':readonly})
        return f'<label class="form-field figma-field" for="{fid}"><span>{esc(label)}</span><input id="{fid}" name="{esc(label)}" data-field="{esc(label)}" value="{esc(val)}"{ " readonly" if readonly else ""}></label>'
    def render(self,e,parent=None,top=False):
        if tag(e)=='text':return self.text_html(e)
        nm=name(e);cs=children(e);r=direct_rect(e);ts=[c for c in cs if tag(c)=='text']
        rects=[c for c in e if tag(c)=='rect']
        if nm.startswith('Icon /'):
            pr=direct_rect(parent) if parent is not None else None
            large=parent is not None and bounds(parent)[2]>=600 and not nm.endswith('shield') and (pr is None or number(pr,'height')>74)
            return icon(e,large=large)
        if is_button(e):return self.button_html(e)
        if r is not None:
            w,h=number(r,'width'),number(r,'height');bg=color(r.get('fill','white'));radius=number(r,'rx',16)
            if h<=8:
                bars=[c for c in rects if c is not r]
                barw=number(bars[-1],'width') if bars else 0
                pct=min(100,max(0,barw/w*100)) if w else 0
                return f'<div class="progress figma-progress" role="img" aria-label="Прогресс {round(pct,1)}%"><span style="--progress:{fmt(pct)}%"></span></div>'
            if len(ts)==2 and len(cs)==2 and 70<=h<=90 and w>=300:
                return self.field_html(e,ts)
            if len(ts)==1 and len(cs)==1 and h<=36:
                return f'<span class="badge figma-badge" style="background:{esc(bg)}">{self.text_html(ts[0],"span")}</span>'
            if len(ts)==1 and any(name(c).startswith('Icon /') for c in cs) and h<=74 and w>400:
                inner=''.join(self.render(c,e) for c in cs)
                return f'<aside class="alert figma-alert" style="background:{esc(bg)}">{inner}</aside>'
            if nm.startswith('Конверт /'):
                label=nm.split(' / ',1)[1]
                inner=control_content(''.join(self.render(c,e) for c in cs))
                return f'<button type="button" class="figma-envelope figma-stack" style="background:{esc(bg)}" {self.label_attrs(label)}>{inner}</button>'
            if nm.startswith('Карточка траты /'):
                label=nm.split(' / ',1)[1]
                inner=control_content(''.join(self.render(c,e) for c in cs))
                # Empty SVG groups beyond the artboard are retained in metadata,
                # never silently substituted for an entire screen image.
                if not inner:inner=f'<h3>{esc(label)}</h3>'
                return f'<button type="button" class="figma-operation figma-stack" style="background:{esc(bg)}" {self.label_attrs(label)}>{inner}</button>'
            if h<=48 and len(cs)>1:
                # The original summary bar was shorter than its contents.
                # Intrinsic height preserves its text and restores safe padding.
                inner=''.join(self.render(c,e) for c in cs)
                return f'<div class="figma-summary" style="background:{esc(bg)}">{inner}</div>'
            inner=''.join(self.render(c,e) for c in cs)
            cls='content-card' if w>=600 else 'figma-surface figma-stack'
            return f'<section class="{cls}" style="background:{esc(bg)};--figma-radius:{fmt(radius)}px">{inner}</section>'
        if not cs:return ''
        # Progress sometimes exports as two bare rectangles, without children.
        if len(rects)>=1 and not cs:return ''
        allbuttons=all(is_button(c) for c in cs)
        isrow=horizontal(cs)
        if allbuttons and isrow:
            labels=[text(children(c)[0]) for c in cs]
            tabs=labels==['Мой стол','Задания','Цель','Итоги'] or labels==['Всё','Предложения','Кэшбэк и сервисы']
            cl='tabs' if tabs else 'button-row'
            inner=''.join(self.button_html(c,tab=tabs) for c in cs)
            return f'<nav class="{cl}" aria-label="Разделы конвертов">{inner}</nav>' if tabs else f'<div class="{cl}">{inner}</div>'
        if len(cs)==2 and len(ts)==2 and isrow:
            left=self.text_html(ts[0],'span');right=self.text_html(ts[1],'span')
            # These text labels are actionable rows in settings screens.
            val=text(ts[1]).strip()
            if val in ('Изменить','Указать'):
                right=f'<button type="button" class="text-link figma-row-action" {self.label_attrs(val)} data-context="{esc(text(ts[0]))}">{esc(val)}</button>'
            if text(ts[0]).startswith('Откладывать по ') or text(ts[0]).strip() in ('25%','50%','75%','100%'):
                return f'<button type="button" class="data-row figma-row-button" {self.label_attrs(text(ts[0]))}>{left}{right}</button>'
            return f'<div class="data-row">{left}{right}</div>'
        inner=''.join(self.render(c,e) for c in cs)
        if isrow:
            # Cards are flexible grid columns; text and icon pairs are flex rows.
            if all(tag(c)=='g' and direct_rect(c) is not None and number(direct_rect(c),'height')>100 for c in cs):
                return f'<div class="figma-grid" style="--figma-columns:{len(cs)}">{inner}</div>'
            if len(cs)==2 and any(name(c).startswith('Icon /') for c in cs):
                return f'<div class="card-heading figma-inline">{inner}</div>'
            return f'<div class="figma-inline">{inner}</div>'
        return f'<div class="figma-stack">{inner}</div>'


def get_main(root):
    rootg=next(c for c in root if tag(c)=='g')
    groups=[c for c in rootg if tag(c)=='g']
    body=groups[-1]
    return [c for c in body if tag(c)=='g'][-1]


def build():
    out=[];report=[]
    for file in sorted(SOURCE.glob('[0-9][0-9] ·*.svg')):
        sid=int(file.name[:2]);root=ET.parse(file).getroot();main=get_main(root)
        cs=children(main);first=[c for c in cs if tag(c)=='text'][:2]
        title=text(first[0]) if first else file.stem.split(' · ',1)[1]
        subtitle=text(first[1]) if len(first)>1 else ''
        r=Renderer(sid)
        heading=f'<header class="page-heading"><h1 id="screen-title" tabindex="-1">{esc(title)}</h1><p>{esc(subtitle)}</p></header>'
        content=''.join(r.render(c,main,top=True) for c in cs if c not in first)
        # Every source text must be represented as visible content or input value.
        expected=texts(main)
        decoded=html.unescape(re.sub('<[^>]*>',' ',heading+content))
        compact=lambda s: re.sub(r'\s+',' ',s).strip()
        missing=[]
        for val in expected:
            if compact(val) not in compact(decoded) and esc(val) not in heading+content:
                missing.append(val)
        title_name=re.sub(r'^\d+ · ','',file.stem).replace('_','?')
        entry={'id':sid,'title':title_name,'heading':title,'subtitle':subtitle,'html':heading+content,'labels':list(dict.fromkeys(r.labels))}
        out.append(entry)
        report.append({**entry,'source':str(file.relative_to(BASE)),'sourceTexts':expected,'fields':r.fields,'missingTexts':missing})
    assert [s['id'] for s in out]==list(range(1,74)), 'Expected all screens 01–73'
    assert not any(s['missingTexts'] for s in report),[(s['id'],s['missingTexts']) for s in report if s['missingTexts']]
    (BASE/'screens.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'Generated {len(out)} HTML screens; {sum(len(s["sourceTexts"]) for s in report)} source text blocks; {sum(len(s["labels"]) for s in out)} labelled controls.')

if __name__=='__main__':build()
