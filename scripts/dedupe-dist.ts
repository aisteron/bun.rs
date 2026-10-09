// Post-build обвязка: удаляет дубли ассетов в dist
// (например about.<hash>.js, дублирующий index.<hash>.js — все страницы
// используют один COMMON_SCRIPT, а Rspack эмитит отдельный бандл на каждый entry)
// и переписывает ссылки в HTML на surviving-файл.
//
// Нюанс: каждый entry-чанк несёт свой chunk-id в заголовке
// `(self.rspackChunk...).push([[410],` vs `[[607],` — остальное тело
// (модули + хвост `e.O(0,[<shared>],...)`) идентично. Поэтому перед хешированием
// нормализуем только этот заголовок; сам рантайм при этом обязан лежать
// в общем `runtimeChunk: 'single'` (см. rsbuild.config.ts), иначе в хвостах
// останутся встроенные `t={410:0,...}` и нормализации заголовка не хватит.
//
// Безопасность:
// - сливаются только файлы с идентичным содержимым после нормализации
//   chunk-id заголовка (sha256 по нормализованному телу);
// - подмена безопасна: entry-чанк саморегистрируется через push,
//   зависимость у всех общая (один shared-чанк), рантайм общий;
// - имена страниц произвольные (index, about, contacts, category, ...);
// - survivor: предпочтителен `index.*`, иначе первый по алфавиту;
// - трогаются только quoted URL в <script src> / <link href>;
// - external (http:, //, data:), относительные пути и якоря игнорируются.
//
// Запуск: bun scripts/dedupe-dist.ts [--dry-run]
// Встроен в `bun run build`.
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dir, '../dist');
const DRY_RUN = process.argv.includes('--dry-run');

// Нормализация Rspack-заголовка чанка: `.push([[410],` -> `.push([[CHUNK],`.
// Трогаем только push-хедер (двойная скобка), одиночные `[656]` зависимостей
// и номера модулей (`902`, `380`) не задеваются.
const normalizeChunkHeader = (content: string): string =>
  content.replace(/(\.push\(\[\[)[\d,\s]+(\],)/g, '$1CHUNK$2');

const sha256 = (file: string): string =>
  createHash('sha256')
    .update(normalizeChunkHeader(readFileSync(file, 'utf8')))
    .digest('hex');

// Маппит URL из HTML в файл внутри dist. null — не локальный/не найден.
function resolveLocal(url: string): string | null {
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('#')) {
    return null;
  }
  const clean = url.split(/[?#]/)[0];
  if (!clean.startsWith('/')) return null;
  const full = path.join(DIST, decodeURIComponent(clean).replace(/^\//, ''));
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

interface Ref {
  htmlFile: string;
  url: string; // как записан в HTML (может быть с query/hash)
  file: string; // резолвленный путь в dist
}

function collectRefs(htmlFile: string): Ref[] {
  const html = readFileSync(htmlFile, 'utf8');
  const refs: Ref[] = [];
  const patterns = [
    /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g,
    /<link\b[^>]*\bhref="([^"]+)"[^>]*>/g,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const file = resolveLocal(m[1]);
      if (file) refs.push({ htmlFile, url: m[1], file });
    }
  }
  return refs;
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error(`[dedupe] dist not found: ${DIST}`);
    process.exit(1);
  }

  const htmlFiles = readdirSync(DIST, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => path.join(DIST, e.name));

  const refs = htmlFiles.flatMap(collectRefs);
  if (refs.length === 0) {
    console.log('[dedupe] no local asset refs found, nothing to do');
    return;
  }

  // Группировка файлов по хешу содержимого
  const byHash = new Map<string, Set<string>>();
  for (const { file } of refs) {
    const hash = sha256(file);
    if (!byHash.has(hash)) byHash.set(hash, new Set());
    byHash.get(hash)!.add(file);
  }

  // deletedUrl (чистый, без query) -> survivorUrl (чистый, без query)
  const redirect = new Map<string, string>();

  for (const files of byHash.values()) {
    if (files.size < 2) continue;
    const sorted = [...files].sort();
    const survivor =
      sorted.find((f) => path.basename(f).startsWith('index.')) ?? sorted[0];
    for (const dup of sorted) {
      if (dup !== survivor) {
        redirect.set(dup, survivor);
        console.log(
          `[dedupe] dup: ${path.relative(DIST, dup)} -> ${path.relative(DIST, survivor)}`,
        );
      }
    }
  }

  if (redirect.size === 0) {
    console.log('[dedupe] no identical duplicates, nothing to do');
    return;
  }

  // Переписываем ссылки: заменяем quoted-префикс, query/hash-суффиксы сохраняются
  const toPublicUrl = (file: string): string =>
    '/' + path.relative(DIST, file).split(path.sep).join('/');
  const renames = [...redirect.entries()].map(([del, keep]) => ({
    del: toPublicUrl(del),
    keep: toPublicUrl(keep),
    delFile: del,
  }));

  for (const htmlFile of htmlFiles) {
    // 404.html — статическая заглушка из public/ (без скриптов и стилей):
    // ссылок на ассеты в ней нет, переписывать там нечего, файл сохраняем.
    if (path.basename(htmlFile) === '404.html') continue;
    let html = readFileSync(htmlFile, 'utf8');
    let touched = false;
    for (const { del, keep } of renames) {
      for (const q of ['"', "'"]) {
        const from = q + del;
        if (html.includes(from)) {
          if (!DRY_RUN) html = html.split(from).join(q + keep);
          touched = true;
        }
      }
    }
    if (touched) {
      console.log(`[dedupe] rewrite: ${path.basename(htmlFile)}`);
      if (!DRY_RUN) writeFileSync(htmlFile, html);
    }
  }

  // Каждый dup-файл принадлежит ровно одной хеш-группе, повторов нет
  const removed = new Set<string>();
  for (const { delFile } of renames) {
    if (removed.has(delFile)) continue;
    removed.add(delFile);
    if (!DRY_RUN) rmSync(delFile);
  }

  console.log(
    DRY_RUN
      ? '[dedupe] dry-run: no changes written'
      : `[dedupe] done, removed ${removed.size} file(s)`,
  );
}

main();
