// починил css map

import { defineConfig } from '@rsbuild/core';
import { pluginPug } from '@rsbuild/plugin-pug';
import { pluginSass } from '@rsbuild/plugin-sass';
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
      pugOptions: {
        pretty: true,
      },
    }),

    pluginSass({
      rewriteUrls: false, // отключает resolve-url-loader
    }),
  ],

  source: {
    entry: Object.fromEntries(
      pageNames.map((name) => [name, COMMON_SCRIPT]),
    ),
  },

  output: {
    sourceMap: {
      css: true,
    },
  },

  html: {
    title: '',
    template: ({ entryName }) =>
      `./src/pug/pages/${entryName}.pug`,
  },
  tools: {
    lightningcssLoader: false, // ключевое — именно он ломает maps
  },
});