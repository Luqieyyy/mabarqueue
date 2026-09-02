import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Domain logic is pure — no DOM, no Firebase emulator needed.
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
