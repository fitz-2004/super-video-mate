import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// Copies the manifest and the plain (unbundled) extension scripts into dist/.
// Content scripts can't be ES modules, so they are written dependency-free and
// only minified here (comments and names stripped) in production builds.
function extensionFiles(minify) {
  const dir = here('./src/extension/');
  return {
    name: 'extension-files',
    buildStart() {
      this.addWatchFile(here('./manifest.json'));
      for (const f of readdirSync(dir)) this.addWatchFile(dir + f);
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: readFileSync(here('./manifest.json'), 'utf8') });
      for (const f of readdirSync(dir)) {
        let source = readFileSync(dir + f, 'utf8');
        if (minify && /\.(js|css)$/.test(f)) {
          const loader = f.endsWith('.css') ? 'css' : 'js';
          source = (await transformWithEsbuild(source, f, { loader, minify: true, legalComments: 'none', target: 'chrome120' })).code;
        }
        this.emitFile({ type: 'asset', fileName: f, source });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: here('./src'),
  base: './',
  publicDir: here('./public'),
  plugins: [react(), extensionFiles(mode === 'production')],
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    rollupOptions: {
      input: {
        sidebar: here('./src/sidebar.html'),
        options: here('./src/options.html'),
      },
    },
  },
}));
