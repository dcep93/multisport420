import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectDatabaseEmulator, getDatabase, goOffline, type Database } from "firebase/database";

let databasePromise: Promise<Database> | undefined;

export function getRoomDatabase() {
  databasePromise ??= initializeDatabase().catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

async function initializeDatabase() {
  let app = getApps()[0];
  if (!app) {
    let config: FirebaseOptions;
    if (import.meta.env.VITE_FIREBASE_CONFIG) {
      config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
    } else {
      // Firebase Hosting supplies the configuration of the hosting project.
      const response = await fetch("/__/firebase/init.json", { signal: AbortSignal.timeout(10_000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
        throw new Error("Phone remote is not configured on this site yet.");
      }
      config = await response.json();
    }
    if (!config.databaseURL) {
      throw new Error("Realtime Database needs to be enabled in this site's Firebase project.");
    }
    app = initializeApp(config);
  }
  const database = getDatabase(app);
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR) {
    const [host, port] = import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR.split(":");
    connectDatabaseEmulator(database, host, Number(port));
  }
  // Only a joined viewer or an open remote should keep a socket alive.
  goOffline(database);
  return database;
}
