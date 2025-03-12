import { defineConfig } from 'tsup'

export default defineConfig({
  // Entry file(s) to start building from.
  entry: ['src/**/*.ts'],

  // Splitting & Sourcemap
  splitting: false,
  sourcemap: true,

  // To output .mjs files
  format: 'esm',
  // Optional: Empty dist directory before build
  clean: true,
  outDir: "dist/src"
})