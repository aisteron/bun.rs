import fs from 'node:fs';
import path from 'node:path';
import type { RsbuildPlugin } from '@rsbuild/core';

type Options = {
  dir: string;
  symbolId?: string;
  /** Куда писать файл относительно dist, по умолчанию assets/img */
  outputDir?: string;
  /** Имя без хеша: sprite → sprite.[hash].svg */
  filename?: string;
  /** Длина хеша */
  hashLength?: number;
  /** Инжектить спрайт в HTML (dev). false = внешний файл + подмена плейсхолдера (прод) */
  inject?: boolean;
};

/** Плейсхолдер в шаблонах, заменяется реальным URL после того, как известен fullhash сборки */
export const SPRITE_URL_PLACEHOLDER = '__SPRITE_URL__';

function toSymbolId(fileName: string, template: string) {
  const name = path.basename(fileName, '.svg');
  return template.replace('[name]', name);
}

function svgToSymbol(content: string, id: string): string {
  let svg = content
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const openMatch = svg.match(/<svg([^>]*)>/i);
  if (!openMatch) return '';

  const attrs = openMatch[1];
  const viewBoxMatch = attrs.match(/viewBox=["']([^"']+)["']/i);
  let viewBox = viewBoxMatch?.[1];

  if (!viewBox) {
    const w = attrs.match(/\bwidth=["']([0-9.]+)["']/i)?.[1];
    const h = attrs.match(/\bheight=["']([0-9.]+)["']/i)?.[1];
    if (w && h) viewBox = `0 0 ${w} ${h}`;
  }

  const inner = svg
    .replace(/<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim();

  const viewBoxAttr = viewBox ? ` viewBox="${viewBox}"` : '';
  return `<symbol id="${id}"${viewBoxAttr}>${inner}</symbol>`;
}

function buildSymbols(dir: string, symbolIdTemplate: string): string {
  if (!fs.existsSync(dir)) return '';

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .sort()
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      return svgToSymbol(raw, toSymbolId(file, symbolIdTemplate));
    })
    .filter(Boolean)
    .join('');
}

function buildSpriteBody(dir: string, symbolIdTemplate: string): { body: string; symbols: string } | null {
  const symbols = buildSymbols(dir, symbolIdTemplate);
  if (!symbols) return null;

  const body = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`,
    symbols,
    `</svg>`,
  ].join('');

  return { body, symbols };
}

export function pluginSvgSprite(options: Options): RsbuildPlugin {
  const symbolIdTemplate = options.symbolId ?? 'icon-[name]';
  const outputDir = options.outputDir ?? 'assets/img';
  const baseName = options.filename ?? 'sprite';
  const hashLength = options.hashLength ?? 8;
  const shouldInject = options.inject ?? true;

  return {
    name: 'local-svg-sprite',
    setup(api) {
      // Имя файла с fullhash сборки — известно только на стадии optimize-hash.
      // Один хеш на js/css/sprite: бэкенду достаточно одного значения.
      let spriteFileName = '';

      // 1) файл в dist (и в memory dev-server)
      api.processAssets({ stage: 'optimize-hash' }, ({ compilation, sources }) => {
				// watch
				compilation.contextDependencies.add(options.dir);

				if (fs.existsSync(options.dir)) {
					for (const file of fs.readdirSync(options.dir)) {
						if (file.endsWith('.svg')) {
							compilation.fileDependencies.add(path.join(options.dir, file));
						}
					}
				}

				const sprite = buildSpriteBody(options.dir, symbolIdTemplate);
				if (!sprite) return;

				// fullhash всей сборки (как у js/css при filenameHash: 'fullhash:8')
				const hash = (compilation.hash ?? 'dev').slice(0, hashLength);
				spriteFileName = `${outputDir}/${baseName}.${hash}.svg`;

				compilation.emitAsset(spriteFileName, new sources.RawSource(sprite.body));
			});

      // 2) опционально — инжект в HTML (dev: pug ссылается на голый #icon-…)
      if (shouldInject) {
        api.modifyHTMLTags(({ headTags, bodyTags }) => {
          const sprite = buildSpriteBody(options.dir, symbolIdTemplate);
          if (!sprite) return { headTags, bodyTags };

          const already = bodyTags.some(
            (t) => t.tag === 'svg' && t.attrs?.['data-svg-sprite'] === 'true',
          );
          if (already) return { headTags, bodyTags };

          bodyTags.unshift({
            tag: 'svg',
            attrs: {
              xmlns: 'http://www.w3.org/2000/svg',
              'aria-hidden': 'true',
              focusable: 'false',
              'data-svg-sprite': 'true',
              style: 'position:absolute;width:0;height:0;overflow:hidden',
            },
            children: sprite.symbols,
          });

          return { headTags, bodyTags };
        });
      }

      // 3) SPRITE_URL в шаблоны.
      // Прод (без инжекта): плейсхолдер, реальный URL подставляется в п.4,
      // когда известен fullhash. Dev (инжект): пусто, миксин fallback'ится на #icon-….
      api.modifyRsbuildConfig((config) => {
        config.html ??= {};
        const prev = config.html.templateParameters;

        config.html.templateParameters = (defaultParams, ctx) => {
          const base =
            typeof prev === 'function' ? prev(defaultParams, ctx) : { ...defaultParams, ...prev };

          return {
            ...base,
            SPRITE_URL: shouldInject ? '' : SPRITE_URL_PLACEHOLDER,
          };
        };
      });

      // 4) прод: подмена плейсхолдера реальным URL во всех HTML.
      // Стадия после optimize-hash (файл уже заэмичен) и после генерации HTML.
      if (!shouldInject) {
        api.processAssets({ stage: 'optimize-transfer' }, ({ assets, compilation, sources }) => {
          if (!spriteFileName) return;
          const url = `/${spriteFileName.replace(/\\/g, '/')}`;

          for (const name of Object.keys(assets)) {
            if (!name.endsWith('.html')) continue;
            const content = assets[name].source().toString();
            if (!content.includes(SPRITE_URL_PLACEHOLDER)) continue;
            compilation.updateAsset(
              name,
              new sources.RawSource(content.split(SPRITE_URL_PLACEHOLDER).join(url)),
            );
          }
        });
      }
    },
  };
}