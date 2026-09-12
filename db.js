// Kleine IndexedDB-Wrapper für WohnungsCheck
// Stores: apartments (Metadaten + Checkliste als JSON), photos (Blobs, per apartmentId + itemKey)

const DB_NAME = "wohnungscheck";
const DB_VERSION = 1;

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = openDb();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DB = {
  async listApartments() {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("apartments", "readonly");
      const req = tx.objectStore("apartments").getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
      req.onerror = () => reject(req.error);
    });
  },

  async getApartment(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("apartments", "readonly").objectStore("apartments").get(id);
      req.onsuccess = () => resolve(req.result);
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
        checklist[section.key + "." + item.key] = { status: "open", note: "" };
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
};
