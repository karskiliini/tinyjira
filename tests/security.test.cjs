const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyjira-security-test-'));
process.env.TINYJIRA_DATA_DIR = dataDir;
const token = 'test-only-operator-token-with-at-least-32-characters';
process.env.TINYJIRA_TOKEN = token;
const { server } = require('../server');
test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function request(method, url, { headers = {}, body } = {}) {
  return new Promise(resolve => {
    const req = new EventEmitter();
    req.method = method; req.url = url;
    req.headers = { host: 'localhost', ...headers };
    const res = {
      headers: {}, status: 200, writableEnded: false,
      setHeader(key, value) { this.headers[key] = value; },
      writeHead(code, values) { this.status = code; Object.assign(this.headers, values); },
      end(value) { this.writableEnded = true; resolve({ status: this.status, body: String(value || ''), headers: this.headers }); },
    };
    server.emit('request', req, res);
    if (body !== undefined) req.emit('data', Buffer.from(body));
    req.emit('end');
  });
}

test('HTTP denies missing token, credentials, hostile Host and browser Origin', async () => {
  const auth = { authorization: `Bearer ${token}` };
  assert.equal((await request('GET', '/api/config')).status, 401);
  assert.equal((await request('PUT', '/api/config', { headers: { ...auth, host: 'evil.invalid' }, body: '{}' })).status, 403);
  assert.equal((await request('PUT', '/api/config', { headers: { ...auth, origin: 'https://evil.invalid' }, body: '{}' })).status, 403);
  delete process.env.TINYJIRA_TOKEN;
  assert.equal((await request('GET', '/api/config')).status, 503);
  process.env.TINYJIRA_TOKEN = token;
  assert.equal(fs.existsSync(path.join(dataDir, 'server.conf')), false);
});

test('HTTP bounds writes and rejects prototype keys before persistence', async () => {
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await request('PUT', '/api/config', { headers, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
  assert.equal((await request('PUT', '/api/config', { headers, body: '{"__proto__":{"polluted":true}}' })).status, 400);
  assert.equal((await request('PUT', '/api/config', { headers, body: 'null' })).status, 400);
  assert.equal(fs.existsSync(path.join(dataDir, 'server.conf')), false);
  const basic = { authorization: 'Basic ' + Buffer.from(`admin:${token}`).toString('base64') };
  assert.equal((await request('PUT', '/api/config', { headers: basic, body: '{"visibleFields":["Summary"]}' })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'server.conf'))), { visibleFields: ['Summary'] });
});

test('HTML escapes card fields and quote characters in attribute values', () => {
  const html = fs.readFileSync(process.env.TINYJIRA_TEST_HTML || path.join(__dirname, '../index.html'), 'utf8');
  const helper = html.match(/function escapeHtml\(str\) \{[\s\S]*?\n  \}/)[0];
  const card = html.slice(html.indexOf('function createCard('), html.indexOf('// --- Drag & Drop on board columns ---'));
  function element() {
    return { dataset: {}, addEventListener() {}, querySelector() { return element(); },
      set textContent(value) { this._text = value; },
      get innerHTML() { return this._html ?? String(this._text || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); },
      set innerHTML(value) { this._html = value; } };
  }
  const attack = '\"><img src=x onerror=alert(1)>';
  const context = { document: { createElement: element }, state: { issues: [{ id: 2, key: attack, title: attack }] } };
  vm.createContext(context);
  vm.runInContext(helper + '\n' + card, context);
  assert.equal(context.escapeHtml('\"\''), '&quot;&#39;');
  const output = context.createCard({ id: 1, key: attack, title: attack, priority: attack, assignee: attack, dependsOn: [2], estimateHours: 1 }, true).innerHTML;
  assert.equal(output.includes('<img'), false);
  assert.equal(output.includes('&lt;img'), true);
});
