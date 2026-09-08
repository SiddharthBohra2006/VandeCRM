// Run with: node server/scripts/check-companies.cjs (no database needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const project = process.argv[2] || path.resolve(__dirname, '../..');
const sourcePath = path.join(project, 'server/src/api/companies.js');
const realRequire = createRequire(sourcePath);
const org = '111111111111111111111111';
const id = '222222222222222222222222';
const admin = { _id: '333333333333333333333333', role: 'admin', organization: { _id: org } };
let company, created, setup, collaborators, failSave = false, duplicate = false;
const companies = {
  findOne: async filter => {
    assert.equal(filter.organization, org, 'Every lookup must be scoped to the organization');
    return filter.name ? (duplicate ? { name: 'Existing' } : null) : company;
  },
  create: async data => (created = { ...data, _id: id }),
  updateOne: async (filter, update) => { assert.equal(filter.organization, org); collaborators = update.assignedUsers; },
};
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
  module: moduleStub, exports: moduleStub.exports,
  require: name => {
    if (name === './middleware/auth') return { requireApiAuth: (req, res, next) => next(), generateToken: () => 'test' };
    if (name === './middleware/permission') return () => (req, res, next) => next();
    if (name === '../models/ClientCompany') return companies;
    if (name === '../models/User') return { find: query => ({ distinct: async () => query._id.$in.filter(value => value !== 'outsider') }) };
    if (name === '../utils/audit') return { logAudit: async () => {} };
    if (name === '../services/defaults') return { ensureCrmDefaults: async (...args) => { setup = args; } };
    return realRequire(name);
  },
});
const router = moduleStub.exports;
async function call(route, body, user = admin, activeCompanyId = 'other') {
  const layer = router.stack.find(layer => layer.route?.path === route && layer.route.methods.post);
  assert.ok(layer, `Missing POST ${route}`);
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
  await layer.route.stack[0].handle({ body, params: { id }, user, activeCompanyId }, res, error => { result.error = error; });
  return result;
}
function resetCompany() {
  company = { _id: id, name: 'Test CRM', status: 'active', isMain: false, assignedUsers: [admin._id], notes: 'Keep these notes', website: 'https://example.com',
    save: async () => { if (failSave) throw new Error('Storage unavailable'); } };
}
(async () => {
  resetCompany();
  assert.equal((await call('/', { name: '   ' })).status, 400);
  duplicate = true;
  assert.equal((await call('/', { name: 'Existing' })).status, 400);
  duplicate = false;
  assert.equal((await call('/', { name: ' New CRM ', businessType: 'consumer', moduleSetup: 'blank' })).status, 200);
  assert.equal(created.name, 'New CRM');
  assert.equal(created.businessType, 'consumer');
  assert.equal(setup[2].moduleSetup, 'blank');
  assert.equal(String(created.assignedUsers[0]), admin._id);
  assert.equal((await call('/:id/status', { status: 'deleted' })).status, 400);
  assert.equal((await call('/:id/status', { status: 'inactive' }, { ...admin, role: 'video_editor' })).status, 403);
  assert.equal((await call('/:id/status', { status: 'inactive' }, { ...admin, _id: 'unassigned', role: 'agent' })).status, 403);
  assert.equal((await call('/:id/status', { status: 'inactive' }, admin, id)).status, 400);
  company.isMain = true;
  assert.equal((await call('/:id/status', { status: 'inactive' })).status, 400);
  company.isMain = false;
  assert.equal((await call('/:id/status', { status: 'inactive' })).status, 200);
  assert.equal(company.status, 'inactive');
  assert.equal(company.notes, 'Keep these notes');
  assert.equal(company.website, 'https://example.com');
  assert.equal((await call('/:id/status', { status: 'active' })).status, 200);
  assert.equal(company.status, 'active');
  failSave = true;
  assert.equal((await call('/:id/status', { status: 'inactive' })).error.message, 'Storage unavailable');
  failSave = false;
  company = null;
  assert.equal((await call('/:id/status', { status: 'active' })).status, 404);
  assert.equal((await call('/:id/collaborators', { userIds: [] })).status, 404);
  resetCompany();
  assert.equal((await call('/:id/collaborators', { userIds: [] }, { ...admin, _id: 'unassigned', role: 'agent' })).status, 403);
  assert.equal((await call('/:id/collaborators', { userIds: [] }, { ...admin, role: 'agent' })).status, 400);
  assert.equal((await call('/:id/collaborators', { userIds: [admin._id, 'outsider'] })).status, 200);
  assert.equal(collaborators.length, 1);
  console.log('PASS: CRM creation, duplicate validation, templates, archive/restore, profile preservation, permission boundaries, access updates, and storage failure handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
