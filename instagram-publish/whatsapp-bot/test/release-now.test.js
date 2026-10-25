import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SendPacing } from '../src/send-pacing.js';

test('manual release bypasses the deadline, persists and restores interval after claim', t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-now-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const options = { now: () => 1000000, minMs: 600000, maxMs: 600000, chooseInterval: min => min };
 const file = path.join(dir, 'schedule.json');
 const pacing = new SendPacing(file, options);
 assert.equal(pacing.canSend(), false);
 pacing.releaseNow();
 assert.equal(new SendPacing(file, options).canSend(), true);
 assert.equal(pacing.claim(), true);
 assert.equal(pacing.canSend(), false);
 assert.equal(pacing.nextAllowedAt, 1600000);
});
