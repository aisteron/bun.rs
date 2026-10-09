import { defineConfig } from '@rsbuild/core';
import { pluginPug } from '@rsbuild/plugin-pug';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgSprite } from './plugins/svg-sprite';
import { pluginReactModules } from './plugins/react-modules';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';

const PAGES_DIR = path.resolve(__dirname, 'src/pug/pages');
const REACT_DIR = path.resolve(__dirname, 'src/js/react');
const NOT_FOUND_FILE = path.resolve(__dirname, 'public/404.html');
const COMMON_SCRIPT = './src/js/index.js';

const getPageNames = (dir: string): string[] => {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.pug'))
    .map((item) => path.basename(item.name, '.pug'));
};

// Имена react-модулей (src/js/react/*) — у них тоже есть свои html в dev/preview
const getReactModuleNames = (dir: string): string[] => {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);
};

const pageNames = getPageNames(PAGES_DIR);
const reactModuleNames = getReactModuleNames(REACT_DIR);

export default defineConfig({
  plugins: [
    pluginPug({
      pugOptions: { pretty: true },
    }),
    pluginReact(),
    pluginSass({ rewriteUrls: false }),
    pluginSvgSprite({
      dir: path.join(__dirname, 'src/svg'),
      symbolId: 'icon-[name]',
      outputDir: 'assets/img',
      filename: 'sprite',
      hashLength: 8,
      inject: process.env.NODE_ENV === 'development',
    }),
    pluginReactModules({
      enable: true,
    }),
  ],

  source: {
    entry: Object.fromEntries(
      pageNames.map((name) => [name, COMMON_SCRIPT]),
    ),
  },

  output: {
		legalComments: 'none',
    filenameHash: 'fullhash:8',
    distPath: {
      js: 'assets/js',
      css: 'assets/css',
      font: 'assets/fonts',
      image: 'assets/img',
    },
    sourceMap: {
      css: process.env.NODE_ENV === 'development',
    },
  },

html: {
  title: '',
  // Возвращаем дефолтный шаблон (строка), чтобы не ругался TypeScript
  template: ({ entryName }: { entryName: string }) => {
    if (pageNames.includes(entryName)) {
      return `./src/pug/pages/${entryName}.pug`;
    }
    return './src/pug/pages/index.pug';
  },
  // Отключаем впрыск скриптов и генерацию для не-Pug страниц
  inject: ({ entryName }: { entryName: string }) => {
    return pageNames.includes(entryName) ? 'head' : false;
  },
  chunks: ({ entryName }: { entryName: string }) => 
    pageNames.includes(entryName) ? [entryName] : [],
},

  tools: {
    lightningcssLoader: false,
    cssLoader: { url: false },
    rspack: (config) => {
      config.optimization ??= {};
      // Один общий рантайм на все entries: тела бандлов общего
      // COMMON_SCRIPT перестают отличаться встроенными chunk-id
      // (t={410:0,...} vs t={607:0,...}) и становятся байт-идентичными —
      // scripts/dedupe-dist.ts сможет схлопнуть их в index.*.js.
      config.optimization.runtimeChunk = 'single';

      // Именованный чанк общих стилей: без этого Rspack кладёт общий sass
      // в чанк с числовым id (656.{hash}.css). Матчим только CSS-модули
      // из src/sass (type: css/mini-extract), чтобы JS-стабы импортов
      // остались в entry (иначе рядом с main.css эмитится пустой main.js),
      // а App.sass React-островов остался отдельным module1.{hash}.css.
      const splitChunks = (config.optimization.splitChunks ??= {}) as {
        cacheGroups?: Record<string, unknown>;
      };
      splitChunks.cacheGroups ??= {};
      splitChunks.cacheGroups.sharedStyles = {
        name: 'main',
        type: 'css/mini-extract',
        test: /[\\/]src[\\/]sass[\\/]/,
        chunks: 'all',
        enforce: true,
        priority: 50,
      };
    },
  },

  server: {
    host: '0.0.0.0',
    // Отключаем fallback на index.html: неизвестные адреса должны давать 404,
    // а не 200 с контентом главной.
    htmlFallback: false,
    // Кастомная заглушка 404 для неизвестных страниц (dev + preview).
    // Тело берём из public/404.html — тот же файл копируется в dist/404.html
    // при билде, без стилей и скриптов, просто параграф.
    setup: ({ server }) => {
      const knownPages = new Set<string>([
        '/',
        '/404.html',
        ...pageNames.flatMap((n) => [`/${n}`, `/${n}.html`]),
        ...reactModuleNames.flatMap((n) => [`/${n}`, `/${n}.html`]),
      ]);

      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }

        const raw = (req.url ?? '/').split(/[?#]/)[0];
        let pathname = raw;
        try {
          pathname = decodeURIComponent(raw);
        } catch {
          // оставляем raw как есть
        }

        // Известные страницы и служебные/статические запросы — дефолтная обработка
        if (knownPages.has(pathname)) {
          next();
          return;
        }
        if (
          pathname.startsWith('/assets/') ||
          pathname.startsWith('/__/') ||
          pathname.startsWith('/@')
        ) {
          next();
          return;
        }

        const last = pathname.slice(pathname.lastIndexOf('/') + 1);
        const isHtmlPage = pathname.endsWith('.html');
        const hasOtherExt = last.includes('.') && !isHtmlPage;
        if (hasOtherExt) {
          next();
          return;
        }

        // Extensionless-навигацию (/test) перехватываем только для HTML-запросов
        if (!isHtmlPage) {
          const accept = String(req.headers?.accept ?? '');
          if (!accept.includes('text/html') && !accept.includes('*/*')) {
            next();
            return;
          }
        }

        let body: string;
        try {
          body = readFileSync(NOT_FOUND_FILE, 'utf8');
        } catch {
          body = '<p>Страница не найдена</p>';
        }

        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(body));
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(body);
      });
    },
  },
});