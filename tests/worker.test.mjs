import {
  test
} from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync
} from 'node:fs';
const root = new URL('..', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const engine = read('src/engine.js').replaceAll('export ', '');
const constants = [
    ['HTML', 'public/index.html'],
    ['CSS', 'public/styles.css'],
    ['APP_JS', 'public/app.js']
  ].map(([name, path]) => `const ${name}=${JSON.stringify(read(path))};`).join('\n') +
  '\nconst STARTER_ZIP="UEs=";';
const worker = (await import('data:text/javascript;base64,' + Buffer.from(engine + '\n' + constants + '\n' +
  read('src/worker-shell.js')).toString('base64'))).default;
const w = JSON.parse(read('tests/fixtures.json'));
const request = (message, identity = true, origin = 'https://rewear.test') => new Request(
  'https://rewear.test/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(identity ? {
        'oai-authenticated-user-id': 'unit-user'
      } : {})
    },
    body: JSON.stringify(message)
  });
test('discovery is public and private data calls require identity', async () => {
  const list = await worker.fetch(request({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  }, false));
  assert.equal((await list.json()).result.tools.length, 4);
  const call = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'build_outfits',
      arguments: {
        wardrobe: w
      }
    }
  };
  assert.equal((await worker.fetch(request(call, false))).status, 401);
  assert.equal((await worker.fetch(request(call, true, 'https://evil.test'))).status, 403);
  const result = await (await worker.fetch(request(call))).json();
  assert.equal(result.result.structuredContent.total, 8);
});
test('MCP errors and frontend assets have expected status', async () => {
  const init = await (await worker.fetch(request({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize'
  }))).json();
  assert.equal(init.result.serverInfo.name, 'REWEAR');
  const bad = await (await worker.fetch(request({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'check_outfit',
      arguments: {
        wardrobe: w,
        item_ids: ['unknown']
      }
    }
  }))).json();
  assert.equal(bad.result.isError, true);
  const missing = await (await worker.fetch(request({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'check_outfit',
      arguments: {
        wardrobe: w
      }
    }
  }))).json();
  assert.equal(missing.error.code, -32602);
  for (const path of ['/', '/styles.css', '/app.js', '/rewear-starter.zip', '/rewear-github.zip']) assert.equal((await worker
    .fetch(new Request('https://rewear.test' + path))).status, 200);
  assert.equal((await worker.fetch(new Request('https://rewear.test/mcp'))).status, 405);
  assert.equal((await worker.fetch(new Request('https://rewear.test/unknown'))).status, 404);
});
