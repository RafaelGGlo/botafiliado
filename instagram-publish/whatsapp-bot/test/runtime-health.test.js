import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDashboardOwner } from '../src/runtime-health.js';
test('launcher rejects an old disconnected dashboard even with HTTP 200', () => {
 assert.throws(() => assertDashboardOwner({ botRunning: true, connection: 'offline' }, 42), /outra instancia/);
 assert.throws(() => assertDashboardOwner({ botRunning: true, runtimePid: 99 }, 42), /outra instancia/);
});
test('launcher accepts the current bot and does not require an already paired WhatsApp', () => {
 const report = { runtimePid: 42, botRunning: true, connection: 'connecting', stale: false };
 assert.equal(assertDashboardOwner(report, 42), report);
});
test('stale or stopping owner cannot count as a successful launch', () => {
 for (const patch of [{ stale: true }, { botStopping: true }, { botRunning: false }]) {
  assert.throws(() => assertDashboardOwner({ runtimePid: 42, botRunning: true, ...patch }, 42));
 }
});
