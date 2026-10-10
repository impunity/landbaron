import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  const resolve = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(resolve, loaded, loaded.exports);
  return loaded.exports;
}

const model = load('lib/platform-admin.ts');
const adminAuth = load('lib/platform-admin-auth.ts');
const orgA = '11111111-1111-1111-1111-111111111111';
const orgB = '22222222-2222-2222-2222-222222222222';
const organization = (id, name, ownerEmail = null) => ({
  id, name, owner_email: ownerEmail, contact_email: ownerEmail, contact_phone: '555-0100', created_at: '2026-01-01T00:00:00Z',
});
const admin = { id: 'user-a', email: 'admin@example.test', role: 'tenant', isPlatformAdmin: true };

function database(tables = {}, failures = {}) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, filters: [], orders: [] };
      calls.push(call);
      let rows = tables[table] ?? [];
      let single = false;
      let start = 0;
      let end = Number.MAX_SAFE_INTEGER;
      const query = {
        select(fields) { call.select = fields; return query; },
        eq(column, value) {
          call.filters.push([column, value]);
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        order(column) { call.orders.push(column); return query; },
        range(first, last) { start = first; end = last; call.range = [first, last]; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve({
            data: failures[table] ? null : single ? rows[0] ?? null : rows.slice(start, end + 1),
            count: rows.length,
            error: failures[table] ?? null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        calls.push({ bucket });
        return {
          createSignedUrl: async (storagePath, seconds) => {
            calls.push({ storagePath, seconds });
            return { data: { signedUrl: 'https://example.test/signed-file' }, error: null };
          },
        };
      },
    },
  };
  return { client, calls };
}

function route(file, user, db) {
  return load(file, {
    'next/server': { NextResponse: Response },
    '@/lib/request-auth': { getAuthenticatedRequestUser: async () => user },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/platform-admin': model,
  });
}

const overviewPath = 'app/api/platform-admin/route.ts';
const detailPath = 'app/api/platform-admin/organizations/[organizationId]/route.ts';
const request = (query = '') => ({ nextUrl: new URL(`https://example.test/api/platform-admin${query}`) });
const params = (id = orgA) => ({ params: Promise.resolve({ organizationId: id }) });

test('Platform Admin allowlist is server-only, exact, case-insensitive, and disabled by default', () => {
  const previous = process.env.PLATFORM_ADMIN_EMAILS;
  try {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    assert.equal(adminAuth.isPlatformAdminEmail('admin@example.test'), false);
    process.env.PLATFORM_ADMIN_EMAILS = ' admin@example.test , second@example.test ';
    assert.equal(adminAuth.isPlatformAdminEmail(' ADMIN@example.test '), true);
    assert.equal(adminAuth.isPlatformAdminEmail('second@example.test'), true);
    for (const email of ['', 'other@example.test', 'admin@example.test.attacker', 'prefixadmin@example.test']) {
      assert.equal(adminAuth.isPlatformAdminEmail(email), false);
    }
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = previous;
  }
});

test('Authenticated admin capability comes from validated email, not client headers or organization role', async () => {
  const previous = process.env.PLATFORM_ADMIN_EMAILS;
  try {
    process.env.PLATFORM_ADMIN_EMAILS = 'admin@example.test';
    const auth = load('lib/request-auth.ts', {
      '@/lib/auth': { getUserRoleByEmail: () => 'owner' },
      '@/lib/platform-admin-auth': adminAuth,
      '@/lib/supabase-admin': {
        supabaseAdmin: { auth: { getUser: async (token) => token === 'valid'
          ? { data: { user: { id: 'a', email: 'admin@example.test' } }, error: null }
          : token === 'owner' ? { data: { user: { id: 'b', email: 'owner@example.test' } }, error: null }
            : { data: { user: null }, error: new Error('Invalid token') } } },
      },
    });
    assert.equal((await auth.getAuthenticatedRequestUser(new Request('https://example.test', { headers: { authorization: 'Bearer valid' } }))).isPlatformAdmin, true);
    const owner = await auth.getAuthenticatedRequestUser(new Request('https://example.test', { headers: { authorization: 'Bearer owner', 'x-user-role': 'admin', 'x-user-email': 'admin@example.test' } }));
    assert.equal(owner.role, 'owner');
    assert.equal(owner.isPlatformAdmin, false);
    assert.equal(await auth.getAuthenticatedRequestUser(new Request('https://example.test', { headers: { authorization: 'Bearer invalid' } })), null);
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = previous;
  }
});

test('Overview and organization APIs reject unauthenticated users and every non-admin organization role before querying', async () => {
  for (const user of [null, ...['owner', 'manager', 'maintenance', 'contractor', 'tenant'].map((role) => ({ ...admin, role, isPlatformAdmin: false }))]) {
    const { client, calls } = database();
    for (const file of [overviewPath, detailPath]) {
      const response = await route(file, user, client).GET(request(), params());
      assert.equal(response.status, user ? 403 : 401);
    }
    assert.deepEqual(calls, []);
  }
});

test('Summary isolates organizations, includes every role, deduplicates owner contacts, and selects the latest login', () => {
  const staff = [
    { organization_id: orgA, name: 'Primary', email: 'OWNER@example.test', phone_number: '555-0101', role: 'Owner' },
    { organization_id: orgA, name: 'Second', email: 'second@example.test', phone_number: null, role: 'Owner' },
    ...['Manager', 'Maintenance', 'Contractor'].map((role) => ({ organization_id: orgA, name: role, email: `${role}@example.test`, phone_number: null, role })),
    { organization_id: orgB, name: 'Other', email: 'other@example.test', phone_number: null, role: 'Manager' },
  ];
  const summaries = model.summarizeOrganizations(
    [organization(orgA, 'Alpha', 'owner@example.test'), organization(orgB, 'Beta')],
    staff,
    [{ organization_id: orgA }, { organization_id: orgB }, { organization_id: null }],
    [{ organization_id: orgA }],
    [{ organization_id: orgA }, { organization_id: orgA }],
    [
      { organization_id: orgA, created_at: '2026-10-01T12:00:00Z' },
      { organization_id: orgA, created_at: '2026-10-07T12:00:00Z' },
      { organization_id: orgA, created_at: '2026-10-02T12:00:00Z' },
    ],
    Date.parse('2026-10-09T12:00:00Z'),
  );
  assert.equal(summaries[0].ownersCount, 2);
  assert.equal(summaries[0].owners[0].phone, '555-0101');
  assert.deepEqual(['tenants', 'managers', 'maintenance', 'contractors', 'properties', 'units'].map((key) => summaries[0][key]), [1, 1, 1, 1, 1, 2]);
  assert.equal(summaries[0].daysSinceLastLogin, 2);
  assert.equal(summaries[0].lastLoginAt, '2026-10-07T12:00:00Z');
  assert.equal(summaries[1].daysSinceLastLogin, null);
  for (const direction of ['asc', 'desc']) {
    assert.equal(model.compareOrganizations(summaries[0], summaries[1], 'daysSinceLastLogin', direction), -1);
  }
  assert.equal(model.compareOrganizations(summaries[0], summaries[1], 'name', 'asc') < 0, true);
  assert.equal(model.compareOrganizations(summaries[0], summaries[1], 'units', 'desc') < 0, true);
});

test('Primary owners retain organization contact numbers without duplicate owner counts', () => {
  const [summary] = model.summarizeOrganizations(
    [organization(orgA, 'Alpha', 'owner@example.test')],
    [{ organization_id: orgA, name: 'Owner', email: 'owner@example.test', phone_number: null, role: 'Owner' }],
    [], [], [], [],
  );
  assert.equal(summary.ownersCount, 1);
  assert.equal(summary.owners[0].phone, '555-0100');
});

test('Overview counts beyond the Supabase default row cap and surfaces query failures', async () => {
  const { client, calls } = database({
    organizations: [organization(orgA, 'Alpha')],
    tenants: Array.from({ length: 1201 }, () => ({ organization_id: orgA })),
  });
  const response = await route(overviewPath, admin, client).GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).organizations[0].tenants, 1201);
  assert.deepEqual(calls.filter((call) => call.table === 'tenants').map((call) => call.range), [[0, 499], [500, 999], [1000, 1499]]);
  const broken = database({}, { tenants: { message: 'Missing table' } });
  assert.equal((await route(overviewPath, admin, broken.client).GET(request())).status, 500);
});

test('All resource queries have explicit organization scopes, stable pagination and no mutation handlers', async () => {
  for (const [key, definition] of Object.entries(model.PLATFORM_RESOURCES)) {
    const scopedRow = { id: 'a', [definition.organizationFilter]: orgA, storage_path: 'org-a/file.pdf' };
    const otherRow = { id: 'b', [definition.organizationFilter]: orgB };
    const { client, calls } = database({ organizations: [organization(orgA, 'Alpha')], [definition.table]: [scopedRow, otherRow] });
    const api = route(detailPath, admin, client);
    assert.deepEqual(Object.keys(api), ['GET']);
    const response = await api.GET(request(`?resource=${key}&page=0`), params());
    assert.equal(response.status, 200, key);
    const result = await response.json();
    assert.equal(result.total, 1, key);
    assert.equal(result.records.length, 1, key);
    const call = calls.find((entry) => entry.table === definition.table);
    assert.deepEqual(call.filters, [[definition.organizationFilter, orgA]], key);
    assert.deepEqual(call.range, [0, 49], key);
    assert.deepEqual(call.orders, definition.order.split(','), key);
    if (key === 'disclosures') {
      assert.equal(result.records[0].file_url, 'https://example.test/signed-file');
      assert.equal(calls.find((entry) => entry.seconds).seconds, 300);
    }
  }
});

test('Pagination retrieves later records and invalid IDs, resources, or page numbers are rejected', async () => {
  const { client } = database({ organizations: [organization(orgA, 'Alpha')], properties: Array.from({ length: 51 }, (_, id) => ({ id, organization_id: orgA })) });
  const api = route(detailPath, admin, client);
  const response = await api.GET(request('?resource=properties&page=1'), params());
  const result = await response.json();
  assert.equal(result.records[0].id, 50);
  assert.equal(result.records.length, 1);
  assert.equal(result.total, 51);
  assert.equal((await api.GET(request(), params('not-a-uuid'))).status, 400);
  for (const query of ['?resource=auth.users', '?resource=__proto__', '?page=-1', '?page=1.5', '?page=1e2', '?page=Infinity', '?page=1000001']) {
    assert.equal((await api.GET(request(query), params())).status, 400, query);
  }
  assert.equal((await api.GET(request(), params(orgB))).status, 404);
});

test('Credential fields are excluded and resource query errors are explicit', async () => {
  assert.doesNotMatch(model.PLATFORM_RESOURCES.solar.select, /secret|access_token|refresh_token/);
  assert.doesNotMatch(model.PLATFORM_RESOURCES.requests.select, /token/);
  const { client } = database({ organizations: [organization(orgA, 'Alpha')] }, { properties: { code: '42P01', message: 'Missing table' } });
  const response = await route(detailPath, admin, client).GET(request(), params());
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /migration/);
});
