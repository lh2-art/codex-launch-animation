'use strict';
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

// One child per launch; reuse one pending query rather than ever creating a backlog.
class BoundsClient {
  constructor(executable, script, options = {}) {
    this.pending = null;
    this.disposed = false;
    this.failure = null;
    this.requests = Promise.resolve();
    this.queuedQuery = null;
    this.queryTimeout = options.queryTimeout || 2500;
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.child = (options.spawn || spawn)(executable, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.reader = createInterface({ input: this.child.stdout });
    this.initTimer = setTimeout(() => this.fail(new Error('Window helper startup timed out')), options.initTimeout || 10000);
    this.reader.on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.ready) { clearTimeout(this.initTimer); this.resolveReady(); }
      else if (this.pending) {
        const pending = this.pending;
        this.pending = null;
        clearTimeout(pending.timer);
        pending.resolve(message);
      }
    });
    this.child.stderr.on('data', () => {});
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', () => {
      clearTimeout(this.killTimer);
      if (!this.disposed) this.fail(new Error('Window helper exited'));
    });
    this.child.stdin.on('error', (error) => this.fail(error));
  }
  request(command) {
    const operation = this.requests.catch(() => {}).then(async () => {
      await this.ready;
      if (this.failure) throw this.failure;
      if (this.disposed) throw new Error('Window helper is closed');
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = setTimeout(() => this.fail(new Error('Window helper query timed out')), this.queryTimeout);
      this.pending = { promise, resolve, reject, timer };
      this.child.stdin.write(command + '\n');
      return promise;
    });
    this.requests = operation;
    return operation;
  }
  query() {
    if (this.queuedQuery) return this.queuedQuery;
    const operation = this.request('b');
    this.queuedQuery = operation;
    const clear = () => { if (this.queuedQuery === operation) this.queuedQuery = null; };
    operation.then(clear, clear);
    return operation;
  }
  hideOpening() { return this.request('h'); }
  revealNative() { return this.request('r'); }
  fail(error) {
    if (this.failure || this.disposed) return;
    this.failure = error;
    clearTimeout(this.initTimer);
    this.rejectReady(error);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
    this.dispose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.initTimer);
    this.rejectReady(new Error('Window helper is closed'));
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Window helper is closed'));
      this.pending = null;
    }
    this.reader.close();
    try { this.child.stdin.end('q\n'); } catch {}
    if (this.child.exitCode === null) this.killTimer = setTimeout(() => { try { this.child.kill(); } catch {} }, 1000);
  }
}
module.exports = { BoundsClient };
