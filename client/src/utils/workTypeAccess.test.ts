import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailableWorkTypes } from './workTypeAccess';

const workTypes = [
  { key: 'task', name: 'Tasks' },
  { key: 'video', name: 'Videos' },
  { key: 'content', name: 'Content' },
];

test('keeps all work types when no recipient is selected', () => {
  assert.deepEqual(getAvailableWorkTypes(workTypes, undefined), workTypes);
});

test('limits work types to the selected recipient for dropdown and slash commands', () => {
  assert.deepEqual(getAvailableWorkTypes(workTypes, { workTypeKeys: ['content'] }), [workTypes[2]]);
});

test('shows no work types when the recipient has no eligible work areas', () => {
  assert.deepEqual(getAvailableWorkTypes(workTypes, { workTypeKeys: [] }), []);
});
