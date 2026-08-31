import { defineConfig } from '@rsbuild/core';
import { pluginPug } from '@rsbuild/plugin-pug';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgSprite } from './plugins/svg-sprite';
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

		pluginSass({ rewriteUrls: false, }), // отключает resolve-url-loader. иначе ломает css map
		pluginSvgSprite({
			dir: path.join(__dirname, 'src/svg'),
			symbolId: 'icon-[name]',
			outputDir: 'assets/img',
			filename: 'sprite',
			hashLength: 8,
			inject: process.env.NODE_ENV === 'development', // false — только файл, без инжекта в HTML
		}),

	],

	source: {
		entry: Object.fromEntries(
			pageNames.map((name) => [name, COMMON_SCRIPT]),
		),
	},


	output: {
		filenameHash: 'fullhash:8',
		distPath: { // чтобы была папка /assets/
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
		template: ({ entryName }) => `./src/pug/pages/${entryName}.pug`,
	},

	tools: { 
		lightningcssLoader: false, // для поддержки maps
		cssLoader: {
			// Заставляет CSS-лоадер игнорировать пути в url() и оставлять их "как есть"
			url: false,
		},
	},

	server: { host: '0.0.0.0' },

	

});