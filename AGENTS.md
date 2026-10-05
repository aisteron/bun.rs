## О проекте
MPA приложение bun + rsbuild
- страницы на pug автоматически генерируются из src/pug/pages в index.html, about.html, etc. через fs.readdirSync
- стили sass, одни на все страницы
- js файл один общий для всех страниц


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


=====
установка

npm i --save-dev @types/node

bun add -D @rsbuild/core @rsbuild/plugin-pug sass
bun add -D @rsbuild/plugin-sass
bun add -D pug-html-loader

bun add -D @rsbuild/plugin-react
bun add react react-dom
