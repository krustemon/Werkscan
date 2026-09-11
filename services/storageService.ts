import { HistoryItem } from '../types';

const DB_NAME = 'WerkaholicDB';
const STORE_NAME = 'history';
const DB_VERSION = 1;

let memoryHistory: HistoryItem[] = [];

/**
 * Öffnet die Datenbankverbindung. Erstellt den Store, falls er nicht existiert.
 */
const initDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.warn("IndexedDB error, falling back to memory storage:", request.error);
        resolve(null);
      };

      request.onsuccess = (event) => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    } catch (e) {
      console.warn("IndexedDB open threw error, falling back to memory:", e);
      resolve(null);
    }
  });
};

/**
 * Lädt die gesamte Historie aus der Datenbank.
 */
export const getHistory = async (): Promise<HistoryItem[]> => {
  try {
    const db = await initDB();
    if (!db) {
      return [...memoryHistory];
    }
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => {
          resolve([...memoryHistory]);
        };
      } catch (err) {
        resolve([...memoryHistory]);
      }
    });
  } catch (error) {
    console.warn("Failed to get history:", error);
    return [...memoryHistory];
  }
};

/**
 * Speichert oder aktualisiert ein einzelnes Item.
 */
export const saveHistoryItem = async (item: HistoryItem): Promise<void> => {
  // Update memory store
  const idx = memoryHistory.findIndex(h => h.id === item.id);
  if (idx >= 0) {
    memoryHistory[idx] = item;
  } else {
    memoryHistory.unshift(item);
  }

  try {
    const db = await initDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  } catch (err) {
    // Memory is updated anyway
  }
};

/**
 * Löscht ein Item anhand der ID.
 */
export const deleteHistoryItem = async (id: string): Promise<void> => {
  memoryHistory = memoryHistory.filter(h => h.id !== id);
  try {
    const db = await initDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  } catch (err) {
    // Memory is updated anyway
  }
};

/**
 * (Optional) Löscht alle Daten - z.B. für Reset-Funktion.
 */
export const clearHistoryDB = async (): Promise<void> => {
  memoryHistory = [];
  try {
    const db = await initDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  } catch (err) {
    // Memory is updated anyway
  }
};