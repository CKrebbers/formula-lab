import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  // fixed port: av-kern owns 5173, and localStorage (the archive) is per origin
  server: { port: 5174, strictPort: true },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
