// The node:test files behind `npm run test:integration`, split into groups that CI runs as parallel
// jobs (`npm run test:integration -- --group <name>`). Each file belongs to exactly one group;
// scripts/ci/check-coverage.mjs fails when the workflow does not run every group.
export const INTEGRATION_GROUPS = {
  domain: ['tests/admin.test.ts', 'tests/domain.test.ts', 'tests/hosting.test.ts'],
  transcription: ['tests/integration.test.ts', 'tests/transcription.test.ts'],
};
const files = Object.values(INTEGRATION_GROUPS).flat();
const repeated = files.filter((file, index) => files.indexOf(file) !== index);
if (repeated.length) throw new Error(`integration test files listed in more than one group: ${repeated.join(', ')}`);
export const INTEGRATION_FILES = files;
