import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/domain.js';

const user = { id: 7, fullName: 'Test Librarian', email: 'admin@example.com', role: 'Admin', passwordHash: hashPassword('secret123') };
const pool = {
  async execute(sql) {
    if (sql.includes('FROM users WHERE email')) return [[{ ...user }]];
    throw new Error(`Unexpected query: ${sql}`);
  },
  async query(sql) {
    if (sql.includes('AS returnedUnpaid')) return [[{ titles: 1, copies: 1, available: 1, members: 0, activeLoans: 0, finesCollected: 0, returnedUnpaid: 0 }]];
    if (sql.includes('FROM loans l JOIN books')) return [[]];
    throw new Error(`Unexpected query: ${sql}`);
  },
};

test('API health check and session authentication work over HTTP', async t => {
  const server = createApp({ pool, sessionSecret: 'test-secret' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const anonymous = await fetch(`${base}/api/auth/me`);
  assert.equal(anonymous.status, 401);

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ADMIN@example.com', password: 'secret123' }),
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.user.fullName, user.fullName);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const authenticated = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
  assert.equal((await authenticated.json()).user.role, 'Admin');
  const protectedRoute = await fetch(`${base}/api/admin/dashboard`, { headers: { cookie } });
  assert.equal(protectedRoute.status, 200);
  assert.equal((await protectedRoute.json()).titles, 1);
});

test('admin report rows include the accrued fine beside the loan status data', async t => {
  const reportRow = { id: 4, bookTitle: 'Overdue title', memberName: 'Student Member', issuedOn: '2026-10-01 10:00:00', dueOn: '2026-10-15', returnedOn: null, fineAmount: 0, overdueDays: 2 };
  const reportPool = {
    async execute(sql) {
      if (sql.includes('FROM users WHERE email')) return [[{ ...user }]];
      if (sql.includes('l.issued_on>=')) return [[reportRow]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const server = createApp({ pool: reportPool, sessionSecret: 'test-secret', finePerDay: 7 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'secret123' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${base}/api/admin/report`, { headers: { cookie } });
  const report = await response.json();
  assert.equal(response.status, 200);
  assert.equal(report.loans[0].fine, 14);
});

test('role authorization rejects a signed-in student from admin routes', async t => {
  const student = { ...user, role: 'Student' };
  const studentPool = { async execute(sql) { if (sql.includes('FROM users WHERE email')) return [[student]]; throw new Error('Should not query dashboard.'); } };
  const server = createApp({ pool: studentPool, sessionSecret: 'test-secret' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/login`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:user.email,password:'secret123'}) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${base}/api/admin/dashboard`, { headers: { cookie } });
  assert.equal(response.status, 403);
});
