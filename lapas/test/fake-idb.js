/* Minimalus IndexedDB pakaitalas testams.
 * Palaiko tik tai, ką naudoja vault.js: open/upgrade, get/put/clear, deleteDatabase.
 * Leidžia patikrinti, kas IŠ TIKRŲJŲ gula į „diską" — būtent to reikia saugumo testams.
 */

const databases = new Map();

function later(fn) { queueMicrotask(fn); }

class FakeRequest {
  constructor() { this.result = undefined; this.error = null; }
  _done(v) { this.result = v; later(() => this.onsuccess?.({ target: this })); }
}

class FakeStore {
  constructor(map) { this.map = map; }
  get(k) { const r = new FakeRequest(); r._done(this.map.get(k)); return r; }
  put(v, k) { this.map.set(k, v); const r = new FakeRequest(); r._done(k); return r; }
  delete(k) { this.map.delete(k); const r = new FakeRequest(); r._done(undefined); return r; }
  clear() { this.map.clear(); const r = new FakeRequest(); r._done(undefined); return r; }
}

class FakeTx {
  constructor(db, names) {
    this.db = db; this.names = [].concat(names);
    later(() => this.oncomplete?.());
  }
  objectStore(name) { return new FakeStore(this.db.stores.get(name)); }
  abort() { later(() => this.onabort?.()); }
}

class FakeDB {
  constructor(name) { this.name = name; this.stores = new Map(); this.version = 1; }
  get objectStoreNames() {
    const list = [...this.stores.keys()];
    return { contains: n => list.includes(n), [Symbol.iterator]: () => list[Symbol.iterator]() };
  }
  createObjectStore(name) { this.stores.set(name, new Map()); return new FakeStore(this.stores.get(name)); }
  transaction(names) { return new FakeTx(this, names); }
  close() {}
}

export function installFakeIndexedDB() {
  globalThis.indexedDB = {
    open(name) {
      const req = new FakeRequest();
      const fresh = !databases.has(name);
      if (fresh) databases.set(name, new FakeDB(name));
      const db = databases.get(name);
      req.result = db;
      later(() => {
        if (fresh) { req.transaction = new FakeTx(db, []); req.onupgradeneeded?.({ target: req }); }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
    deleteDatabase(name) {
      const req = new FakeRequest();
      databases.delete(name);
      later(() => req.onsuccess?.({ target: req }));
      return req;
    },
  };
  return {
    /** Ką iš tikrųjų matytų žmogus, atidaręs saugyklos inspektorių. */
    raw(dbName = 'appdata', store = 'kv') {
      const db = databases.get(dbName);
      return db ? db.stores.get(store) : null;
    },
    reset() { databases.clear(); },
  };
}
