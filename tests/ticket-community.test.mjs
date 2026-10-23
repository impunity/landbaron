import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const leaderboard = load('lib/ticket-leaderboard.ts');
const introductions = load('lib/tenant-introductions.ts');
const insights = load('lib/profile-insights.ts');
const descriptions = load('lib/ticket-description.ts');
const tenant = { id: 'tenant-user', email: 'tenant@example.test', role: 'tenant' };
const owner = { id: 'owner-user', email: 'owner@example.test', role: 'owner' };
const ticketId = '11111111-1111-4111-8111-111111111111';
const parentId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ ticketId }) };
const request = (body) => ({ json: async () => body });
const resolution = (overrides = {}) => ({
  status: 'Resolved', created_at: '2026-01-01T00:00:00Z', resolved_at: '2026-01-03T12:00:00Z',
  resolved_by: 'alice', resolved_by_name: 'Alice', ...overrides,
});

function database(tables = {}, failure = null) {
  const writes = [];
  const calls = [];
  return {
    writes, calls,
    from(table) {
      const call = { table };
      calls.push(call);
      let rows = [...(tables[table] ?? [])];
      let single = false;
      let start = 0;
      let end = Infinity;
      const query = {
        select() { return query; },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
        ilike(key, value) { rows = rows.filter((row) => row[key]?.toLowerCase() === value.toLowerCase()); return query; },
        order() { return query; },
        range(first, last) { start = first; end = last; call.range = [first, last]; return query; },
        limit() { return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        update(updates) { writes.push({ table, updates }); return query; },
        insert(value) { writes.push({ table, value }); rows = [{ id: 'new-message', ...value }]; return query; },
        then(resolve, reject) {
          return Promise.resolve({
            data: failure?.table === table ? null : single ? rows[0] ?? null : rows.slice(start, end + 1),
            error: failure?.table === table ? { message: 'Database unavailable' } : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function ticketRoute(user, db, accessible = true) {
  return load('app/api/tickets/[ticketId]/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-auth': { getAuthenticatedRequestUser: async () => user },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/organization-context': { isTicketInRequestOrganization: async () => accessible },
    '@/lib/ticket-access': { canAccessTicket: async () => accessible },
    '@/lib/ticket-creators': { getTicketCreatorLabels: async () => new Map([[user?.id, 'Test Resolver']]) },
    '@/lib/ticket-description': descriptions,
    '@/lib/ticket-assignment-email': { sendTicketAssignmentEmail: async () => {}, sendTicketStatusChangeEmail: async () => {} },
  });
}
const storedTicket = { id: ticketId, title: 'Repair', created_by: tenant.id, status: 'Archived', description: 'Repair\n\nOwner notes:\nKeep this note', assigned_to: 'Staff <staff@example.test>' };

test('introduction limits accept exactly 30 words and exactly 250 characters', () => {
  assert.equal(introductions.validateAboutMe(Array(30).fill('word').join(' ')), null);
  assert.equal(introductions.validateAboutMe('a'.repeat(250)), null);
  assert.match(introductions.validateAboutMe(Array(31).fill('word').join(' ')), /30 words/);
  assert.match(introductions.validateAboutMe('a'.repeat(251)), /250 characters/);
  assert.match(introductions.validateAboutMe(null), /Enter text/);
  assert.equal(introductions.validateAboutMe(' \n\t '), null);
  assert.equal(introductions.countWords(' hello\nworld\tfriend  '), 3);
});

test('leaderboard counts each current resolution, including archived, but not open or dismissed', () => {
  const result = leaderboard.buildTicketLeaderboard([
    resolution(), resolution({ status: 'Archived' }), resolution({ status: 'Open' }),
    resolution({ status: 'Closed' }), resolution({ status: 'Archived', resolved_at: null }),
    resolution({ resolved_by: null }), resolution({ resolved_by: 'bob', resolved_by_name: 'Bob', resolved_at: '2026-01-02T00:00:00Z' }),
  ]);
  assert.equal(result.total_resolved, 4);
  assert.equal(result.unattributed, 1);
  assert.deepEqual(result.rows[0], { id: 'alice', name: 'Alice', resolved_count: 2, percentage: 50, average_days: 2.5 });
  assert.equal(result.rows[1].percentage, 25);
  assert.equal(result.rows[1].average_days.toFixed(1), '1.0');
});

test('leaderboard ties use age then name and empty history has no division by zero', () => {
  const result = leaderboard.buildTicketLeaderboard([
    resolution({ resolved_by: 'b', resolved_by_name: 'Bob' }),
    resolution({ resolved_by: 'a', resolved_by_name: 'Alice' }),
    resolution({ resolved_by: 'c', resolved_by_name: 'Charlie', resolved_at: '2026-01-02T00:00:00Z' }),
  ]);
  assert.deepEqual(result.rows.map((row) => row.name), ['Charlie', 'Alice', 'Bob']);
  assert.deepEqual(leaderboard.buildTicketLeaderboard([]), { rows: [], total_resolved: 0, unattributed: 0 });
  assert.throws(() => leaderboard.buildTicketLeaderboard([resolution({ resolved_at: null })]), /invalid resolution dates/);
});

for (const role of ['tenant', 'owner', 'manager', 'maintenance', 'contractor']) {
  test(`${role} can resolve and re-open an archived ticket without modifying old notes`, async () => {
    for (const status of ['Resolved', 'Open']) {
      const db = database({ tickets: [storedTicket] });
      const response = await ticketRoute({ ...tenant, role }, db).PATCH(request({ status }), context);
      assert.equal(response.status, 200);
      const updates = db.writes[0].updates;
      assert.equal(updates.status, status);
      assert.equal(updates.description, undefined);
      if (status === 'Resolved') {
        assert.equal(updates.resolved_by, tenant.id);
        assert.equal(updates.resolved_by_name, 'Test Resolver');
      }
    }
  });
}

test('tenant lifecycle permission does not grant costs, assignments, notes, archiving or other tenant tickets', async () => {
  for (const body of [
    { status: 'Archived' }, { status: 'Closed' }, { status: 'In Progress' },
    { status: 'Resolved', assigned_to: 'Other' }, { status: 'Open', notes: '' },
    { labor_cost: 5 }, { materials_cost: 10 },
  ]) {
    const db = database({ tickets: [storedTicket] });
    assert.equal((await ticketRoute(tenant, db).PATCH(request(body), context)).status, 403);
    assert.equal(db.writes.length, 0);
  }
  const db = database({ tickets: [storedTicket] });
  assert.equal((await ticketRoute(tenant, db, false).PATCH(request({ status: 'Open' }), context)).status, 404);
  assert.equal(db.writes.length, 0);
  assert.equal((await ticketRoute(null, db).PATCH(request({ status: 'Open' }), context)).status, 401);
});

test('description edits preserve legacy notes and assignment', async () => {
  const db = database({ tickets: [storedTicket] });
  assert.equal((await ticketRoute(tenant, db).PATCH(request({ description: 'Updated repair' }), context)).status, 200);
  const parsed = descriptions.parseTicketDescription(db.writes[0].updates.description);
  assert.equal(parsed.notes, 'Keep this note');
  assert.equal(parsed.assignment, storedTicket.assigned_to);
});

test('ticket access is organization-scoped and tenant creator-scoped, even for archived tickets', async () => {
  for (const [user, creator, inOrganization, expected] of [
    [tenant, tenant.id, true, true], [tenant, 'other', true, false],
    [tenant, null, true, false], [owner, tenant.id, true, true], [owner, tenant.id, false, false],
  ]) {
    const db = database({ tickets: [{ id: ticketId, created_by: creator, status: 'Archived' }] });
    const { canAccessTicket } = load('lib/ticket-access.ts', {
      '@/lib/organization-context': { isTicketInRequestOrganization: async () => inOrganization },
      '@/lib/supabase-admin': { supabaseAdmin: db },
    });
    assert.equal(await canAccessTicket(user, ticketId), expected);
  }
});

function messageRoute(user, db, accessible = true) {
  return load('app/api/tickets/[ticketId]/messages/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-auth': { getAuthenticatedRequestUser: async () => user },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/ticket-access': { canAccessTicket: async () => accessible },
    '@/lib/ticket-creators': { getTicketCreatorLabels: async () => new Map([[user?.id, 'Verified Author']]) },
  });
}

test('threaded messages persist verified author, ticket and same-ticket parent', async () => {
  const db = database({ ticket_messages: [{ id: parentId, ticket_id: ticketId }] });
  const response = await messageRoute(tenant, db).POST(request({ body: '  A reply  ', parent_id: parentId, author_name: 'Forged Author' }), context);
  assert.equal(response.status, 201);
  assert.deepEqual(db.writes[0].value, {
    ticket_id: ticketId, parent_id: parentId, author_user_id: tenant.id, author_name: 'Verified Author', body: 'A reply',
  });
});

test('messages reject blank, oversized, cross-ticket and inaccessible replies', async () => {
  for (const body of [{ body: '' }, { body: ' '.repeat(5) }, { body: 'x'.repeat(5001) }, { body: 'Reply', parent_id: parentId }, { body: 'Reply', parent_id: 3 }]) {
    const db = database({ ticket_messages: [{ id: parentId, ticket_id: 'different-ticket' }] });
    assert.equal((await messageRoute(tenant, db).POST(request(body), context)).status, 400);
    assert.equal(db.writes.length, 0);
  }
  const db = database();
  assert.equal((await messageRoute(tenant, db, false).POST(request({ body: 'Hello' }), context)).status, 404);
  assert.equal((await messageRoute(null, db).POST(request({ body: 'Hello' }), context)).status, 401);
});

test('conversation read paginates beyond default row limits and preserves every reply', async () => {
  const messages = Array.from({ length: 1101 }, (_, index) => ({ id: String(index), ticket_id: ticketId, body: 'Message', parent_id: index ? '0' : null }));
  const db = database({ tickets: [storedTicket], ticket_messages: messages });
  const response = await ticketRoute(tenant, db).GET({}, context);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.messages.length, 1101);
  assert.equal(result.conversationError, null);
  assert.equal(result.ticket.description, storedTicket.description);
});

test('missing conversation migration produces a visible error without hiding retained notes', async () => {
  const db = database({ tickets: [storedTicket] }, { table: 'ticket_messages' });
  const result = await (await ticketRoute(tenant, db).GET({}, context)).json();
  assert.equal(result.messages, null);
  assert.match(result.conversationError, /Apply supabase/);
  assert.equal(result.ticket.description, storedTicket.description);
});

test('leaderboard endpoint paginates and exposes aggregates only within the organization for tenants', async () => {
  const tickets = Array.from({ length: 1101 }, () => ({ ...resolution(), organization_id: 'org-a' }));
  tickets.push({ ...resolution({ resolved_by: 'outsider' }), organization_id: 'org-b' });
  const db = database({ tickets });
  const { GET } = load('app/api/tickets/leaderboard/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-auth': { getAuthenticatedRequestUser: async () => tenant },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/organization-context': { getRequestOrganizationId: async () => 'org-a' },
    '@/lib/ticket-leaderboard': leaderboard,
  });
  const response = await GET({});
  const result = await response.json();
  assert.equal(result.total_resolved, 1101);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].resolved_count, 1101);
  assert.equal(result.rows[0].percentage, 100);
  assert.equal(result.rows[0].created_at, undefined);
  assert.equal(db.calls.length, 3);
});

test('zodiac lookup batches tenant ids and never returns birthdays on profile objects', async () => {
  const calls = [];
  const { withTenantZodiacSigns } = load('lib/tenant-zodiac.ts', {
    '@/lib/profile-insights': insights,
    '@/lib/supabase-admin': { supabaseAdmin: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: params.tenant_ids.map((id) => ({ tenant_id: id, birthdate: '1990-10-23' })), error: null };
      },
    } },
  });
  const rows = await withTenantZodiacSigns(Array.from({ length: 101 }, (_, index) => ({ id: String(index) })));
  assert.equal(calls.length, 2);
  assert.equal(rows.length, 101);
  assert.equal(rows[0].zodiac_sign, 'Scorpio');
  assert.equal(rows[0].birthdate, undefined);
  assert.equal(insights.getZodiacSign('1990-12-22'), 'Capricorn');
  assert.equal(insights.getZodiacSign('1990-01-19'), 'Capricorn');
  assert.equal(insights.getZodiacSign('1990-01-20'), 'Aquarius');
});

test('tenant introduction API validates limits and updates only the signed-in tenant', async () => {
  const db = database({ tenants: [{ id: 'own', email: tenant.email, status: 'active' }, { id: 'other', email: 'other@example.test', status: 'active' }] });
  const { PATCH } = load('app/api/tenant-portal/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-auth': { getAuthenticatedRequestUser: async () => tenant },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/tenant-introductions': introductions,
    '@/lib/tenant-zodiac': { withTenantZodiacSigns: async (rows) => rows },
  });
  assert.equal((await PATCH(request({ about_me: Array(31).fill('word').join(' ') }))).status, 400);
  assert.equal(db.writes.length, 0);
  const response = await PATCH(request({ about_me: '  Hello neighbors!  ', id: 'other' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tenant.id, 'own');
  assert.deepEqual(db.writes[0].updates, { about_me: 'Hello neighbors!' });
  assert.equal((await PATCH(request({ about_me: '' }))).status, 200);
  assert.deepEqual(db.writes[1].updates, { about_me: null });
});

test('Legal Disclosures is last for every role, and leaderboard appears only on the ticket queue', () => {
  for (const role of ['tenant', 'owner', 'manager', 'maintenance', 'contractor']) {
    for (const pathname of ['/dashboard', '/dashboard/tickets/123', '/dashboard/settings', '/dashboard/ticket-leaderboard']) {
      const { DashboardNavButtons } = load('app/dashboard/nav-buttons.tsx', {
        'next/navigation': { useRouter: () => ({ push() {} }), usePathname: () => pathname },
        './announcements-nav-button': { AnnouncementsNavButton: () => React.createElement('button', null, 'Announcements') },
      });
      const markup = renderToStaticMarkup(React.createElement(DashboardNavButtons, { role, current: 'dashboard' }));
      const labels = [...markup.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
      assert.equal(labels.at(-1), 'Legal Disclosures', `${role} ${pathname}`);
      assert.equal(labels.includes('Ticket Leaderboard'), pathname === '/dashboard');
    }
  }
});

test('public introductions and zodiac remain visible when a neighbor hides contact details', async () => {
  const unit = { property_id: 'property-a', unit_number: '1', properties: { name: 'Test Property' } };
  const own = { id: 'own', email: tenant.email, status: 'active', name: 'Tenant', units: unit };
  const neighbor = {
    id: 'neighbor', email: 'neighbor@example.test', status: 'active', name: 'Neighbor', units: { ...unit, unit_number: '2' },
    share_contact_info: false, phone: '555-0100', instagram_handle: 'neighbor', about_me: 'I love gardening.',
  };
  const { GET } = load('app/api/tenant-portal/directory/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/request-auth': { getAuthenticatedRequestUser: async () => tenant },
    '@/lib/supabase-admin': { supabaseAdmin: {
      from() {
        let self = false;
        const query = {
          select() { return query; },
          ilike() { self = true; return query; },
          eq() { return query; },
          limit() { return query; },
          maybeSingle() { return query; },
          then(resolve) { return Promise.resolve({ data: self ? own : [own, neighbor], error: null }).then(resolve); },
        };
        return query;
      },
    } },
    '@/lib/tenant-zodiac': { withTenantZodiacSigns: async (rows) => rows.map((row) => ({ ...row, zodiac_sign: 'Taurus' })) },
  });
  const result = await (await GET({})).json();
  const visible = result.tenants.find((row) => row.id === neighbor.id);
  assert.equal(visible.email, null);
  assert.equal(visible.phone, null);
  assert.equal(visible.instagram_handle, null);
  assert.equal(visible.about_me, 'I love gardening.');
  assert.equal(visible.zodiac_sign, 'Taurus');
  assert.equal(visible.birthdate, undefined);
});

test('conversation UI renders retained notes, nested replies, timestamps and safely escaped text', () => {
  const { TicketConversation } = load('app/dashboard/tickets/[ticketId]/ticket-conversation.tsx', {
    '@/lib/supabase': { supabase: null },
  });
  const markup = renderToStaticMarkup(React.createElement(TicketConversation, {
    ticketId, legacyNotes: ['Original owner note'], loadError: null, onMessage() {},
    messages: [
      { id: 'parent', parent_id: null, author_name: 'Tenant', body: 'Repair needed', created_at: '2026-01-01T00:00:00Z' },
      { id: 'reply', parent_id: 'parent', author_name: 'Staff', body: '<script>alert(1)</script>', created_at: '2026-01-02T00:00:00Z' },
    ],
  }));
  assert.match(markup, /Original owner note/);
  assert.match(markup, /Previous owner notes \(retained\)/);
  assert.match(markup, /border-l-2/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /dateTime="2026-01-02T00:00:00Z"/i);
  assert.equal([...markup.matchAll(/>Reply<\/button>/g)].length, 2);
});

test('leaderboard UI uses gold, silver and bronze awards and one-decimal metrics', () => {
  const seeds = ['tenant', { total_resolved: 10, unattributed: 0, rows: [
    { id: 'a', name: 'Alex', resolved_count: 5, percentage: 50, average_days: 2.25 },
    { id: 'b', name: 'Blair', resolved_count: 3, percentage: 30, average_days: 1.5 },
    { id: 'c', name: 'Casey', resolved_count: 2, percentage: 20, average_days: 4 },
  ] }, null];
  const { default: Page } = load('app/dashboard/ticket-leaderboard/page.tsx', {
    react: { ...React, useState: () => [seeds.shift(), () => {}], useEffect() {} },
    'lucide-react': {
      Trophy: (props) => React.createElement('svg', props),
      Medal: (props) => React.createElement('svg', props),
    },
    '@/lib/auth': {},
    '@/lib/supabase': {},
    '../breadcrumbs': { Breadcrumbs: () => null },
    '../nav-buttons': { DashboardNavButtons: () => null },
  });
  const markup = renderToStaticMarkup(React.createElement(Page));
  for (const label of ['Gold trophy', 'Silver medal', 'Bronze medal']) assert.match(markup, new RegExp(`aria-label="${label}"`));
  for (const metric of ['50.0%', '30.0%', '20.0%', '2.3', '1.5', '4.0']) assert.ok(markup.includes(`>${metric}</td>`), metric);
});

test('page-specific header actions never follow the canonical navigation and Legal Disclosures', () => {
  const violations = [];
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (file.endsWith('.tsx')) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        function visit(node) {
          if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'DashboardNavButtons' && ts.isJsxElement(node.parent)) {
            const children = node.parent.children;
            const followingControls = children.slice(children.indexOf(node) + 1).filter((child) => (
              !ts.isJsxText(child) && !(ts.isJsxExpression(child) && !child.expression)
            ));
            if (followingControls.length) violations.push(file);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  inspect(path.resolve(import.meta.dirname, '../app/dashboard'));
  assert.deepEqual(violations, []);
});
