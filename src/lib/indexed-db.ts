// src/lib/indexed-db.ts
const DB_NAME = 'MemoryLaneDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

let db: IDBDatabase;

// Function to initialize and open the database.
export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event);
      reject('Error opening DB');
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });
};

// Function to store an image blob in the database.
export const storeImage = async (url: string, blob: Blob): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ url, blob });

    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      console.error('Error storing image:', event);
      reject('Error storing image');
    };
  });
};

// Function to retrieve an image blob from the database.
export const getImage = async (url: string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(url);

    request.onsuccess = () => {
      resolve(request.result ? request.result.blob : null);
    };

    request.onerror = (event) => {
      console.error('Error getting image:', event);
      reject('Error getting image');
    };
  });
};
