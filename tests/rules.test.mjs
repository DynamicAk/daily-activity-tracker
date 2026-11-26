import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, runTransaction, set, update } from 'firebase/database';
import { empty } from '../app/model.js';
import { wrapSnapshot } from '../app/storage.js';

let env;
const own = 'dailyTracker/users/browser-a';
const other = 'dailyTracker/users/browser-b';
const snapshot = wrapSnapshot(empty(), 'browser-a-device', 1, null);
const user = () => env.authenticatedContext('browser-a', { firebase: { sign_in_provider: 'anonymous' } }).database();
const stranger = () => env.authenticatedContext('browser-b', { firebase: { sign_in_provider: 'anonymous' } }).database();
const guest = () => env.unauthenticatedContext().database();

before(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Run only in the Realtime Database Emulator.');
  env = await initializeTestEnvironment({
    projectId: 'demo-daily-tracker',
    database: { rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8') }
  });
});
after(async () => { await env?.cleanup(); });

test('owner can read, write, and update their own tracker with a transaction', async () => {
  const db = user();
  await assertSucceeds(set(ref(db, own), snapshot));
  await assertSucceeds(get(ref(db, own)));
  await assertSucceeds(runTransaction(ref(db, own), record => wrapSnapshot(empty(), 'browser-a-device', 2, record)));
  await assertSucceeds(set(ref(stranger(), other), snapshot));
});

test('signed-out users and other IDs cannot read or write tracker records', async () => {
  for (const db of [guest(), stranger()]) {
    await assertFails(get(ref(db, own)));
    await assertFails(set(ref(db, own), snapshot));
    await assertFails(set(ref(db, own + '/snapshot'), snapshot.snapshot));
  }
});

test('parent access and cross-owner multi-path writes are denied', async () => {
  const db = user();
  for (const path of ['dailyTracker', 'dailyTracker/users']) {
    await assertFails(get(ref(db, path)));
    await assertFails(set(ref(db, path), {}));
  }
  await assertFails(update(ref(db, 'dailyTracker/users'), {
    'browser-a/snapshot': snapshot.snapshot, 'browser-b/snapshot': snapshot.snapshot
  }));
});

test('owner cannot write an invalid snapshot or unknown top-level fields', async () => {
  const db = user();
  await assertFails(set(ref(db, own), { snapshot: 42, sync: snapshot.sync }));
  await assertFails(set(ref(db, own), { ...snapshot, unexpected: true }));
});
