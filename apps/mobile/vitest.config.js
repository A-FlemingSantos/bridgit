import { defineConfig } from 'vitest/config'

// Only the pure logic (events, operations, formatting) is tested here; screens need a device.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
