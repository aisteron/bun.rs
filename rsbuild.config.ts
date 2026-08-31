import { defineConfig } from '@rsbuild/core';
import { pluginPug } from '@rsbuild/plugin-pug';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgSprite } from './plugins/svg-sprite';
import { pluginReactModules } from './plugins/react-modules';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

const PAGES_DIR = path.resolve(__dirname, 'src/pug/pages');
const COMMON_SCRIPT = './src/js/index.js';

const getPageNames = (dir: string): string[] => {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.pug'))
    .map((item) => path.basename(item.name, '.pug'));
};

const pageNames = getPageNames(PAGES_DIR);

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
  },

  server: { host: '0.0.0.0' },
});