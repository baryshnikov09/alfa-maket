"""Build the 73 standalone, dependency-free HTML pages from the Figma export."""
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parent

ICONS = {
    "home": '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    "arrow": '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    "heart": '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    "chat": '<path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.7A9 9 0 1 1 21 11.5Z"/>',
    "bag": '<path d="M5 7h14l-1 14H6Zm3 0V5a4 4 0 0 1 8 0v2"/>',
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    "envelope": '<path d="M3 5h18v14H3Zm0 0 9 7 9-7"/>',
    "grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
}


def icon(name, cls=""):
    return f'<svg class="icon {cls}" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>'


def link(target, nested):
    return f'{"" if nested else "screens/"}{int(target):02}.html'


def shared_header(screen_id, nested):
    nav = []
    for label, name in [("Главная", "home"), ("Платежи", "arrow"), ("Выгода", "heart"), ("История", "clock"), ("Чаты", "chat")]:
        nav.append(f'<button type="button" data-bank-placeholder="{label}">{icon(name)}<span>{label}</span></button>')
    return f'''<header class="app-header bank-header">
      <button class="bank-identity" type="button" data-bank-placeholder="Профиль"><span class="bank-alpha" aria-hidden="true">А</span><span>Альфа-Онлайн</span></button>
      <nav class="primary-nav" aria-label="Разделы банка">{"".join(nav)}</nav>
      <button type="button" class="bank-game-launch" data-action="open-game">{icon('envelope')}<span>Игровой стол</span></button>
      <button class="bank-avatar" type="button" data-bank-placeholder="Профиль" aria-label="Профиль Александра">АК</button>
    </header>'''


def shared_sidebar(screen_id, nested):
    return f'''<aside class="sidebar" aria-label="Мои продукты">
      <section class="bank-summary"><span class="eyebrow">Мои продукты</span><h2>Общий баланс</h2><strong>120 000 ₽</strong><div class="bank-product-list">
      <button type="button" data-bank-placeholder="Карты">{icon('bag')}<span>Карты<small>Альфа-Карта · 0000</small></span></button>
      <button type="button" data-bank-placeholder="Накопления">{icon('target')}<span>Накопления<small>Вклады и счета</small></span></button>
      <button type="button" data-bank-placeholder="Настройки банка">{icon('grid')}<span>Настройки<small>Личные данные</small></span></button>
      </div></section><p class="demo-caption">Демонстрационный прототип</p>
    </aside>'''


def apply_routes(markup, screen_id, nested, routes):
    local = routes.get(str(screen_id), {})
    global_routes = {"Главный":1,"Выгода":2,"Мой стол":25,"Задания":39,"Цель":52,"Итоги":59,"Посмотреть цель":52,"Как работают Конверты":73}
    def replace(match):
        attrs, inner = match.groups()
        label_match = re.search(r'data-label=[\"\'](.*?)[\"\']', attrs)
        if not label_match:
            return match.group(0)
        label = html.unescape(label_match.group(1))
        target = local.get(label, global_routes.get(label))
        if isinstance(target, int):
            attrs = re.sub(r'\s+type=[\"\']button[\"\']', '', attrs)
            return f'<a{attrs} href="{link(target,nested)}">{inner}</a>'
        if isinstance(target, str):
            attrs += f' data-action="{html.escape(target,quote=True)}"'
        return f'<button{attrs}>{inner}</button>'
    return re.sub(r'<button\b([^>]*)>(.*?)</button>', replace, markup, flags=re.S)


def make_page(screen, all_screens, routes, nested):
    sid = screen["id"]
    prefix = "../" if nested else ""
    content = apply_routes(screen["html"], sid, nested, routes)
    catalog = "".join(f'<a href="{link(s["id"],nested)}" class="catalog-entry" data-screen-title="{html.escape(s["title"].lower(),quote=True)}" {"aria-current=\"page\"" if sid == s["id"] else ""}><span>{s["id"]:02}</span>{html.escape(s["title"])}</a>' for s in all_screens)
    previous = f'<a href="{link(sid-1,nested)}" class="viewer-step" aria-label="Предыдущий экран">←</a>' if sid > 1 else '<span class="viewer-step" aria-hidden="true">←</span>'
    following = f'<a href="{link(sid+1,nested)}" class="viewer-step" aria-label="Следующий экран">→</a>' if sid < 73 else '<span class="viewer-step" aria-hidden="true">→</span>'
    return f'''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Альфа конверты — интерактивная игра: {html.escape(screen['title'],quote=True)}">
  <meta name="theme-color" content="#f1f2f4">
  <title>{html.escape(screen['title'])} · Альфа конверты</title>
  <link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{prefix}styles.css"><link rel="stylesheet" href="{prefix}screens.css"><link rel="stylesheet" href="{prefix}game.css">
  <script defer src="{prefix}board-state.js"></script>
  <script defer src="{prefix}app.js"></script>
  <script defer src="{prefix}board.js"></script>
</head>
<body data-screen="{sid}">
  <a href="#main-content" class="skip-link">К содержимому</a>
  <div class="bank-app">{shared_header(sid,nested)}
    <div class="app-shell">{shared_sidebar(sid,nested)}<main id="main-content" class="page-content" tabindex="-1">{content}</main></div>
    <footer class="prototype-footer"><span>Альфа конверты · Демонстрационный прототип</span><a href="{link(73,nested)}">Об игре</a></footer>
  </div>
  <nav class="screen-viewer" aria-label="Просмотр экранов">{previous}<button type="button" data-open-catalog>{icon('grid','icon-sm')}<span>Все экраны</span><span class="viewer-count">{sid:02} / 73</span></button>{following}</nav>
  <dialog class="catalog-dialog" id="screen-catalog" aria-labelledby="catalog-title"><div class="dialog-heading"><div><h2 id="catalog-title">Экраны прототипа</h2><p>Все 73 экрана из Figma</p></div><button type="button" class="icon-button" data-close-dialog aria-label="Закрыть">×</button></div><label class="catalog-search">Поиск экрана<input type="search" placeholder="Название или номер" autocomplete="off" data-catalog-search></label><div class="screen-catalog">{catalog}</div><p class="catalog-empty" hidden>Ничего не найдено</p></dialog>
  <dialog class="message-dialog" id="demo-message" aria-labelledby="message-title"><div class="dialog-heading"><h2 id="message-title">Демонстрационный режим</h2><button type="button" class="icon-button" data-close-dialog aria-label="Закрыть">×</button></div><p data-message-content></p><button class="btn btn-primary" type="button" data-close-dialog>Понятно</button></dialog>
  <div role="status" aria-live="polite" class="toast" hidden></div>
</body></html>'''


def build():
    screens = json.loads((ROOT / "screens.json").read_text())
    if isinstance(screens, dict):
        screens = screens.get("screens", list(screens.values()))
    screens = sorted(screens, key=lambda s: s["id"])
    assert [s["id"] for s in screens] == list(range(1,74)), "Expected all 73 Figma screens"
    routes = json.loads((ROOT / "routes.json").read_text())
    (ROOT / "screens").mkdir(exist_ok=True)
    (ROOT / "assets").mkdir(exist_ok=True)
    (ROOT / "assets/favicon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#ef3124"/><path fill="white" d="M10 37h28v4H10zm3-6L21 7h7l8 24h-6l-2-7h-8l-2 7zm9-12h5l-2.5-8z"/></svg>')
    for screen in screens:
        (ROOT / f'screens/{screen["id"]:02}.html').write_text(make_page(screen,screens,routes,True))
    (ROOT / "index.html").write_text(make_page(screens[0],screens,routes,False))
    print(f"Built {len(screens)} HTML screens and index.html")


if __name__ == "__main__":
    build()
