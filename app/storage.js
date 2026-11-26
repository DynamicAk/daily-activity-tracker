import { defaults, empty, maps } from './model.js';
import { enableCloud, firebaseConfig } from './firebase-config.js';

const DATABASE = 'abhishek-daily-tracker-v1';
const KEY = 'tracker';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other tracker tabs and reload.'));
  });
}

function query(database, change) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('data', change ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('data');
    const request = store.get(KEY);
    let record;
    let problem;
    request.onsuccess = () => {
      record = request.result || { data: empty(), revision: 0, synced: -1, device: crypto.randomUUID() };
      if (!change) return;
      try {
        change(record);
        store.put(record, KEY);
      } catch (error) {
        problem = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(record);
    transaction.onabort = () => reject(problem || transaction.error || new Error('The save was interrupted.'));
    transaction.onerror = () => reject(transaction.error);
  });
}

export function mergeData(remote, local) {
  const merged = { profile: local.profile, profileEdited: local.profileEdited === true };
  if (!local.profileEdited && remote.profileEdited) {
    merged.profile = { ...defaults, ...remote.profile };
    merged.profileEdited = true;
  }
  for (const key of maps) merged[key] = { ...remote[key], ...local[key] };
  return merged;
}

export function wrapSnapshot(data, device, revision, current) {
  const previous = current ? JSON.parse(current.snapshot) : empty();
  const sync = current?.sync || {};
  if ((sync[device] ?? -1) >= revision) return;
  return {
    snapshot: JSON.stringify(mergeData(previous, data)),
    sync: { ...sync, [device]: revision }
  };
}

async function firebaseConnection() {
  const sdk = 'https://www.gstatic.com/firebasejs/12.6.0/';
  const [app, auth, database] = await Promise.all([
    import(sdk + 'firebase-app.js'), import(sdk + 'firebase-auth.js'), import(sdk + 'firebase-database.js')
  ]);
  const instance = app.initializeApp(firebaseConfig, 'daily-tracker');
  const identity = auth.getAuth(instance);
  await auth.setPersistence(identity, auth.browserLocalPersistence);
  await identity.authStateReady();
  const user = identity.currentUser || (await auth.signInAnonymously(identity)).user;
  if (!user.isAnonymous) throw new Error('Anonymous identity unavailable.');
  const db = database.getDatabase(instance);
  const ref = database.ref(db, 'dailyTracker/users/' + user.uid);
  return {
    uid: user.uid,
    get: async () => (await database.get(ref)).val(),
    push: record => database.runTransaction(ref,
      value => wrapSnapshot(record.data, record.device, record.revision, value), { applyLocally: false })
  };
}

export async function createStore(onExternalChange, onStatus) {
  const db = await openDatabase();
  // Initialize the device ID in the same read/write transaction across all tabs.
  let record = await query(db, () => {});
  let cloud;
  let pending = false;
  let missed = false;
  const tab = typeof BroadcastChannel === 'function' ? new BroadcastChannel(DATABASE) : null;
  const status = () => {
    if (enableCloud && (record.synced < record.revision || !cloud)) {
      onStatus('Sync pending');
    } else {
      onStatus(enableCloud ? 'Synced' : 'Saved on this device');
    }
  };
  const accept = next => {
    if (next.revision >= record.revision) record = next;
    status();
  };

  async function sync() {
    if (!enableCloud) return;
    if (pending) {
      missed = true;
      return;
    }
    pending = true;
    let failed = false;
    try {
      if (!cloud) {
        const connection = await firebaseConnection();
        const remote = await connection.get();
        const next = await query(db, draft => {
          if (draft.uid && draft.uid !== connection.uid) throw new Error('Saved identity changed.');
          if (!draft.uid) {
            if (remote) draft.data = mergeData(JSON.parse(remote.snapshot), draft.data);
            draft.revision += 1;
            draft.uid = connection.uid;
          } else if (remote && draft.synced === draft.revision) {
            const data = mergeData(JSON.parse(remote.snapshot), draft.data);
            if (JSON.stringify(data) !== JSON.stringify(draft.data)) {
              draft.data = data;
              draft.revision += 1;
            }
          }
        });
        cloud = connection;
        accept(next);
        onExternalChange(record.data);
        tab?.postMessage('updated');
      }
      const draft = await query(db);
      if (draft.synced < draft.revision) {
        await cloud.push(draft);
        accept(await query(db, latest => { latest.synced = Math.max(latest.synced, draft.revision); }));
        tab?.postMessage('updated');
      }
    } catch (error) {
      failed = true;
      // Local saves remain authoritative while Firebase is unavailable.
      console.warn('Tracker cloud sync is pending.', error.code || error.message);
      onStatus('Sync pending');
    } finally {
      pending = false;
      if (missed) {
        missed = false;
        if (!failed) void sync();
      }
    }
  }

  tab?.addEventListener('message', async () => {
    try {
      const previousRevision = record.revision;
      accept(await query(db));
      if (record.revision !== previousRevision) onExternalChange(record.data);
      if (record.synced < record.revision) void sync();
    } catch (error) {
      console.warn('Unable to read updates from another tab.', error);
    }
  });

  if (enableCloud) {
    window.addEventListener('online', sync);
    window.setInterval(sync, 30_000);
    void sync();
  }
  status();
  return {
    data: record.data,
    async change(callback) {
      accept(await query(db, draft => {
        callback(draft.data);
        draft.revision += 1;
      }));
      tab?.postMessage('updated');
      void sync();
      return record.data;
    }
  };
}
