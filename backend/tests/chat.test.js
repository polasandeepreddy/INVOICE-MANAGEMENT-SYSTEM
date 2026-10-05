// Integration tests for /api/chat/*. Spawns the real server against a throw-away MySQL database
// (created and dropped here), so it never touches the production data.  Run: npm test
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const DB_NAME = `chat_test_${process.pid}`;
const PORT = 5600 + (process.pid % 300);
const BASE = `http://localhost:${PORT}/api`;
const SECRET = process.env.JWT_SECRET || 'your_secret_key';
const conn = { host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' };

let server, admin, db;
const auth = (id) => ({ headers: { Authorization: `Bearer ${jwt.sign({ id, email: `${id}@t.com`, role: 'user' }, SECRET)}` } });
const get = (u, id) => axios.get(BASE + u, auth(id)).then(r => r.data);
const post = (u, d, id) => axios.post(BASE + u, d, auth(id)).then(r => r.data);
const fail = (p) => p.then(() => assert.fail('expected an HTTP error'), e => e.response);
const addUser = (id, createdAt) => db.query(
  "INSERT INTO users (id, full_name, username, email, password, role, created_at) VALUES (?, ?, ?, ?, 'x', 'user', ?)",
  [id, id, id, `${id}@t.com`, createdAt || new Date(Date.now() - 3600 * 1000)]);

before(async () => {
  admin = await mysql.createConnection(conn);
  await admin.query(`CREATE DATABASE \`${DB_NAME}\``);
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DB_NAME },
    stdio: 'ignore',
  });
  for (let i = 0; ; i++) { // table creation on a fresh DB can take a while
    try { await axios.get(`${BASE}/test`); break; } catch { await new Promise(r => setTimeout(r, 1000)); }
    if (i >= 240) throw new Error('server did not start');
  }
  db = await mysql.createConnection({ ...conn, database: DB_NAME });
  for (const id of ['uA', 'uB', 'uC']) await addUser(id);
}, { timeout: 300000 });

after(async () => {
  if (server) server.kill();
  if (db) await db.end();
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``); await admin.end(); }
});

test('direct messages are private; broadcasts reach everyone', async () => {
  const d = (await post('/chat/messages', { recipient_id: 'uB', body: 'private A->B' }, 'uA')).message;
  const b = (await post('/chat/messages', { body: 'broadcast' }, 'uA')).message;
  const ids = async (u) => (await get('/chat/messages?after=0', u)).messages.map(m => m.id);
  assert.deepEqual(await ids('uA'), [d.id, b.id]);
  assert.deepEqual(await ids('uB'), [d.id, b.id]);
  assert.deepEqual(await ids('uC'), [b.id]);
});

test('ticks: sent -> delivered -> read; broadcast waits for everyone', async () => {
  const d = (await post('/chat/messages', { recipient_id: 'uB', body: 'tick direct' }, 'uA')).message;
  const b = (await post('/chat/messages', { body: 'tick broadcast' }, 'uA')).message;
  const st = async () => (await get('/chat/messages?after=999999', 'uA')).statuses;
  assert.equal((await st())[d.id], 'sent');
  await get('/chat/messages?after=999999', 'uB');
  assert.equal((await st())[d.id], 'delivered');
  assert.equal((await st())[b.id], 'sent'); // C has not polled yet
  await get('/chat/messages?after=999999', 'uC');
  assert.equal((await st())[b.id], 'delivered');
  await post('/chat/read', { thread: 'uA' }, 'uB');
  assert.equal((await st())[d.id], 'read');
  assert.equal((await st())[b.id], 'delivered'); // reading the direct thread must not read the broadcast
  await post('/chat/read', { thread: 'all' }, 'uB');
  await post('/chat/read', { thread: 'all' }, 'uC');
  assert.equal((await st())[b.id], 'read');
});

test("a third user cannot mark someone else's direct thread as read", async () => {
  const d = (await post('/chat/messages', { recipient_id: 'uB', body: 'secret' }, 'uA')).message;
  await post('/chat/read', { thread: 'uA' }, 'uC');
  await get('/chat/messages?after=999999', 'uB');
  assert.equal((await get('/chat/messages?after=999999', 'uA')).statuses[d.id], 'delivered');
});

test('unread counts are kept on the server and cleared by /chat/read', async () => {
  await addUser('uD');
  await post('/chat/messages', { recipient_id: 'uD', body: 'u1' }, 'uA');
  await post('/chat/messages', { recipient_id: 'uD', body: 'u2' }, 'uB');
  const pick = async () => { const u = (await get('/chat/messages?after=0', 'uD')).unread; return { uA: u.uA, uB: u.uB }; };
  assert.deepEqual(await pick(), { uA: 1, uB: 1 });
  await post('/chat/read', { thread: 'uA' }, 'uD');
  assert.deepEqual(await pick(), { uA: undefined, uB: 1 });
  await post('/chat/read', { thread: 'all' }, 'uD');
  assert.equal((await get('/chat/messages?after=0', 'uD')).unread.all, undefined);
});

test('users created after a broadcast do not see it and do not block its ticks', async () => {
  const b = (await post('/chat/messages', { body: 'before E joined' }, 'uA')).message;
  await new Promise(r => setTimeout(r, 1100));
  await addUser('uE', new Date());
  const seen = (await get('/chat/messages?after=0', 'uE')).messages.map(m => m.id);
  assert.ok(!seen.includes(b.id));
  for (const u of ['uB', 'uC', 'uD']) { await get('/chat/messages?after=0', u); await post('/chat/read', { thread: 'all' }, u); }
  assert.equal((await get('/chat/messages?after=999999', 'uA')).statuses[b.id], 'read');
});

test('paging forward from the cursor never skips messages', async () => {
  const base = (await post('/chat/messages', { body: 'p0' }, 'uC')).message.id;
  await db.query('INSERT INTO chat_messages (sender_id, recipient_id, body) VALUES ' + Array(350).fill("('uC', 'uA', 'bulk')").join(','));
  const first = (await get(`/chat/messages?after=${base}`, 'uA')).messages;
  assert.equal(first.length, 300);
  assert.equal(first[0].id, base + 1);
  const second = (await get(`/chat/messages?after=${first[first.length - 1].id}`, 'uA')).messages;
  assert.equal(second.length, 50);
});

test('validation and auth', async () => {
  assert.equal((await fail(post('/chat/messages', { body: '   ' }, 'uA'))).status, 400);
  assert.equal((await fail(post('/chat/messages', { body: 'x'.repeat(2001) }, 'uA'))).status, 400);
  assert.equal((await fail(post('/chat/messages', { recipient_id: 'uA', body: 'hi' }, 'uA'))).status, 400);
  assert.equal((await fail(post('/chat/messages', { recipient_id: 'nobody', body: 'hi' }, 'uA'))).status, 404);
  assert.equal((await fail(axios.get(`${BASE}/chat/messages`))).status, 401);
  const users = (await get('/chat/users', 'uA')).users;
  assert.ok(users.every(u => u.id !== 'uA' && !('role' in u)));
});
