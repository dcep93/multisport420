// Only the last real league visit is persisted. No scores or credentials.
globalThis.scoreboardLeagueStore = (() => {
  let opening;
  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open("multisport420-scoreboard", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("preferences");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = undefined; };
          db.onclose = () => { opening = undefined; };
          resolve(db);
        };
      }).catch(error => { opening = undefined; throw error; });
    }
    return opening;
  }
  async function transact(mode, visit) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("preferences", mode);
      const store = transaction.objectStore("preferences");
      const request = store.get("lastLeague");
      let saved;
      request.onsuccess = () => {
        saved = request.result;
        if (visit && (!saved || visit.visitedAt >= saved.visitedAt)) {
          saved = visit;
          store.put(visit, "lastLeague");
        }
      };
      transaction.oncomplete = () => resolve(saved);
      transaction.onabort = () => reject(transaction.error || new Error("Could not save the ESPN league."));
      transaction.onerror = () => reject(transaction.error || new Error("Could not read the saved ESPN league."));
    });
  }
  return {
    get: () => transact("readonly"),
    remember: visit => transact("readwrite", visit),
  };
})();
