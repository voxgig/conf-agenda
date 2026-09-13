import { defineConfig } from 'vite'

// Library build, as podmind's widget/ask does: one entry, a UMD global for a
// plain <script>, and an .mjs for a module import. minify stays ON here (unlike
// podmind) because SPEC 11.2 sets a hard 30KB gzipped budget and CI enforces it.
export default defineConfig({
  build: {
    minify: true,
    target: 'es2019',
    lib: {
      entry: 'src/conf-agenda.js',
      name: 'ConfAgenda',
      formats: ['es', 'umd'],
      // Explicit per-format names: podmind's widget ships .mjs + a UMD build,
      // and package.json's module/main point straight at these.
      fileName: (format) => ('es' === format ? 'conf-agenda.mjs' : 'conf-agenda.umd.cjs'),
    },
    emptyOutDir: false,
    rollupOptions: { treeshake: true },
  },
})
