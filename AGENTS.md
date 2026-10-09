## О проекте
MPA приложение bun + rsbuild
- страницы на pug автоматически генерируются из src/pug/pages в index.html, about.html, etc. через fs.readdirSync
- стили sass, одни на все страницы
- js файл один общий для всех страниц

## Сборка dist — порядок чанков (после `bun run build`)
- обычные страницы: `runtime.{hash}.js` → `index.{hash}.js` (оба обязательны, `defer` сохраняет порядок; `runtime` удалять нельзя — entry-чанки без него не исполняются)
- `module1.html`: `runtime` → `react-vendor` → `module1` (React-остров, скрипты не инжектятся — пустой шелл, чанки подключать вручную)
- CSS: `main.{hash}.css` — общий для всех страниц, `module1.{hash}.css` — только React-остров
- имена `index`/`module1`/`react-vendor`/`runtime`/`main` заданы явно (entry, `reactVendor` в `plugins/react-modules.ts`, `sharedStyles` + `runtimeChunk: 'single'` в `rsbuild.config.ts`); безымянный shared-чанк получил бы числовой id типа `656`
- `scripts/dedupe-dist.ts` схлопывает дубли entry-бандлов в `index.*.js` (перед хешем нормализует Rspack chunk-id в шапке `push([[NNN],`)


СТРУКТУРА ПРОЕКТА

/
├── public/                     # Статика (копируется в dist как есть)
│   ├── img/
│   └── vendors/
├── src/
│   ├── fonts/
│   ├── js/                     # Точка входа (JS)
│   │   ├── index.jsx
│   ├── pug/
│   │   ├── pages/              # Главные шаблоны страниц
│   │   │   ├── index.pug
│   │   │   └── about.pug
│   │   ├── layout/             # Базовые лейауты
│   │   │   ├── index/
│   │   │   │   ├── index.pug
│   │   │   │   └── content.pug
│   │   │   └── about/
│   │   │       ├── index.pug
│   │   │       ├── content.pug
│   │   │       └── bread.pug
│   │   └── partials/           # Компоненты (header, footer)
│   │       ├── header.pug
│   │       └── footer.pug
│   └── sass/
│       ├── index.sass          # Главный SASS-файл (импортирует base)
│       └── base.sass
├── rsbuild.config.ts
└── package.json

