// Kleine IndexedDB-Wrapper für WohnungsCheck
// Stores: apartments (Metadaten + Checkliste als JSON), photos (Blobs, per apartmentId + itemKey)

const DB_NAME = "wohnungscheck";
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("apartments")) {
        db.createObjectStore("apartments", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("photos")) {
        const store = db.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("byApartment", "apartmentId", { unique: false });
      }
      if (!db.objectStoreNames.contains("documents")) {
        const store = db.createObjectStore("documents", { keyPath: "id" });
        store.createIndex("byApartment", "apartmentId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = openDb();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Alte Datensätze (Status-Kreis statt Dropdown) auf das neue {rating, note}-Format heben.
const OLD_STATUS_TO_RATING = { open: "none", ok: "good", issue: "bad" };
function migrateApartment(a) {
  if (!a) return a;
  for (const key of allChecklistItemKeys()) {
    const entry = a.checklist[key];
    if (!entry) { a.checklist[key] = { rating: "none", note: "" }; continue; }
    if (entry.rating === undefined) {
      entry.rating = OLD_STATUS_TO_RATING[entry.status] || "none";
      delete entry.status;
    }
  }
  return a;
}

const DB = {
  async listApartments() {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("apartments", "readonly");
      const req = tx.objectStore("apartments").getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt).map(migrateApartment));
      req.onerror = () => reject(req.error);
    });
  },

  async getApartment(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("apartments", "readonly").objectStore("apartments").get(id);
      req.onsuccess = () => resolve(migrateApartment(req.result));
      req.onerror = () => reject(req.error);
    });
  },

  async saveApartment(apartment) {
    apartment.updatedAt = Date.now();
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("apartments", "readwrite").objectStore("apartments").put(apartment);
      req.onsuccess = () => resolve(apartment);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteApartment(id) {
    const db = await dbPromise;
    const photos = await this.getPhotosForApartment(id);
    await Promise.all(photos.map(p => this.deletePhoto(p.id)));
    const documents = await this.getDocumentsForApartment(id);
    await Promise.all(documents.map(d => this.deleteDocument(d.id)));
    return new Promise((resolve, reject) => {
      const req = db.transaction("apartments", "readwrite").objectStore("apartments").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  newApartment(name) {
    const checklist = {};
    for (const section of CHECKLIST_SECTIONS) {
      for (const item of section.items) {
        checklist[section.key + "." + item.key] = { rating: "none", note: "" };
      }
    }
    const eckdaten = {};
    for (const f of ECKDATEN_FIELDS) eckdaten[f.key] = "";
    const now = Date.now();
    return {
      id: uid(),
      name: name || "Neue Wohnung",
      date: new Date().toISOString().slice(0, 10),
      generalNotes: "",
      favorite: false,
      eckdaten,
      checklist,
      createdAt: now,
      updatedAt: now,
    };
  },

  async addPhoto(apartmentId, itemKey, blob) {
    const db = await dbPromise;
    const photo = { id: uid(), apartmentId, itemKey: itemKey || "_general", blob, createdAt: Date.now() };
    return new Promise((resolve, reject) => {
      const req = db.transaction("photos", "readwrite").objectStore("photos").put(photo);
      req.onsuccess = () => resolve(photo);
      req.onerror = () => reject(req.error);
    });
  },

  async deletePhoto(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("photos", "readwrite").objectStore("photos").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getPhotosForApartment(apartmentId) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const idx = db.transaction("photos", "readonly").objectStore("photos").index("byApartment");
      const req = idx.getAll(IDBKeyRange.only(apartmentId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getPhotosForItem(apartmentId, itemKey) {
    const all = await this.getPhotosForApartment(apartmentId);
    return all.filter(p => p.itemKey === itemKey);
  },

  async addDocument(apartmentId, file) {
    const db = await dbPromise;
    const doc = {
      id: uid(),
      apartmentId,
      typ: null, // wird nach KI-Analyse gesetzt, z.B. "energieausweis" oder "expose"
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      blob: file,
      createdAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const req = db.transaction("documents", "readwrite").objectStore("documents").put(doc);
      req.onsuccess = () => resolve(doc);
      req.onerror = () => reject(req.error);
    });
  },

  async updateDocument(doc) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("documents", "readwrite").objectStore("documents").put(doc);
      req.onsuccess = () => resolve(doc);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteDocument(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("documents", "readwrite").objectStore("documents").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getDocumentsForApartment(apartmentId) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const idx = db.transaction("documents", "readonly").objectStore("documents").index("byApartment");
      const req = idx.getAll(IDBKeyRange.only(apartmentId));
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
      req.onerror = () => reject(req.error);
    });
  },
};
