# Альфа конверты

Интерактивный прототип: прогноз расходов, раздача зарплаты, карточки покупок с перетаскиванием, задания, добровольный щипок в цель и итог месяца. Все операции демонстрационные. Сессия сохраняется в браузере.

## Локальный запуск

```sh
python3 -m http.server 8767 --bind 127.0.0.1
```

Откройте `http://127.0.0.1:8767/`. Прямой вход на стол — `index.html#table`. Два сценария входа доступны через «Об игре».

## Проверки и сборка

Нужны Node.js 24 и Python 3.13.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run check:pages
```

Публикуемые файлы собираются в `dist/`. Зависимости и результат сборки исключены из Git.

## GitHub Pages

Создайте пустой репозиторий на GitHub, замените `OWNER/REPO` и отправьте код:

```sh
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

В **Settings → Pages → Source** выберите **GitHub Actions**, затем запустите **Actions → Test and deploy GitHub Pages → Run workflow**. Следующие push в `main` проверяются и публикуются автоматически. URL сайта: `https://OWNER.github.io/REPO/`.

Рабочие файлы: `index.html`, `styles.css`, `app.js`, `board-state.js`, `board.js` и `assets/`. Файл `screens/25.html` сохраняет прежнюю ссылку на стол. Лицензия шрифта находится в `assets/fonts/OFL.txt`.
