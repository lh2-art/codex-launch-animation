'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { BoundsClient } = require('../helper-client.cjs');

function fixture(options = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.exitCode = null;
  child.kill = () => { child.exitCode = 0; child.emit('exit', 0); };
  let spawns = 0, queries = 0;
  child.stdin.on('data', (data) => {
    if (String(data).includes('q')) { child.exitCode = 0; child.emit('exit', 0); }
    if (String(data).includes('b')) queries++;
  });
  const client = new BoundsClient('fake', 'fake', {
    initTimeout: 80, queryTimeout: 80, ...options, spawn: () => { spawns++; return child; }
  });
  return { client, child, counts: () => ({ spawns, queries }) };
}

test('100 simultaneous callers send one request to one process; fragmented JSON survives', async () => {
  const f = fixture();
  const calls = Array.from({ length: 100 }, () => f.client.query());
  f.child.stdout.write('{"rea'); f.child.stdout.write('dy":true}\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.counts(), { spawns: 1, queries: 1 });
  f.child.stdout.write('{"ok":true,"left":12,');
  f.child.stdout.write('"top":34,"width":800,"height":600}\n');
  const results = await Promise.all(calls);
  assert.equal(results.length, 100);
  results.forEach((result) => assert.equal(result.width, 800));
  f.client.dispose();
  assert.equal(f.child.exitCode, 0);
});
test('an unresponsive helper times out and is disposed without restarting', async () => {
  const f = fixture({ queryTimeout: 20 });
  f.child.stdout.write('{"ready":true}\n');
  await assert.rejects(f.client.query(), /timed out/);
  assert.deepEqual(f.counts(), { spawns: 1, queries: 1 });
  assert.equal(f.client.disposed, true);
});
test('startup failure times out with no polling process storm', async () => {
  const f = fixture({ initTimeout: 20 });
  await assert.rejects(f.client.query(), /startup timed out/);
  assert.deepEqual(f.counts(), { spawns: 1, queries: 0 });
});
test('unexpected helper exit rejects the pending request and cleans up', async () => {
  const f = fixture();
  f.child.stdout.write('{"ready":true}\n');
  const query = f.client.query();
  await new Promise((resolve) => setImmediate(resolve));
  f.child.exitCode = 1; f.child.emit('exit', 1);
  await assert.rejects(query, /exited/);
  assert.equal(f.client.disposed, true);
});

test('reveal is serialized after bounds; it never consumes the bounds response', async () => {
  const f = fixture();
  const commands = [];
  f.child.stdin.on('data', data => commands.push(String(data).trim()));
  f.child.stdout.write('{"ready":true}\n');
  const bounds = f.client.query();
  const reveal = f.client.revealNative();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(commands, ['b']);
  f.child.stdout.write('{"ok":true,"width":800}\n');
  assert.equal((await bounds).width, 800);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(commands, ['b','r']);
  f.child.stdout.write('{"ok":true}\n');
  assert.equal((await reveal).ok, true);
  assert.equal(f.counts().spawns, 1);
  f.client.dispose();
});
