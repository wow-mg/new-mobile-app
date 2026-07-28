import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      API_BEARER_TOKEN: 'test',
      PARTICIPANT_PREVIEW_BEARER_TOKEN: 'participant-test',
    },
  },
});
