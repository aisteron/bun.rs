import type { RsbuildPlugin } from '@rsbuild/core';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

export interface ReactModulesOptions {
  enable?: boolean;
  dir?: string;
}

export const pluginReactModules = (options: ReactModulesOptions = {}): RsbuildPlugin => ({
  name: 'plugin-react-modules',
  setup(api) {
    const { enable = true, dir = path.resolve(process.cwd(), 'src/js/react') } = options;

    if (!enable || !existsSync(dir)) {
      return;
    }

    const modules = readdirSync(dir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    if (modules.length === 0) return;

    const reactEntries: Record<string, string[]> = {};

    for (const mod of modules) {
      const modDir = path.join(dir, mod);
      const files = readdirSync(modDir);

      const entryFile = files.find((f) => /^App\.(jsx|tsx|js|ts)$/.test(f));
      const styleFile = files.find((f) => /^App\.(sass|scss|css)$/.test(f));

      if (entryFile) {
        const entryPaths = [path.join(modDir, entryFile)];
        if (styleFile) {
          entryPaths.push(path.join(modDir, styleFile));
        }
        reactEntries[mod] = entryPaths;
      }
    }

    api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
      return mergeRsbuildConfig(config, {
        source: {
          entry: reactEntries,
        },
        performance: {
          chunkSplit: {
            strategy: 'custom',
            splitChunks: {
              cacheGroups: {
                reactVendor: {
                  test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
                  name: 'react-vendor',
                  chunks: 'all',
                  priority: 40,
                },
              },
            },
          },
        },
      });
    });
  },
});