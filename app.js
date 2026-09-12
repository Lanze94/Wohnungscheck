// WohnungsCheck – vanilla JS SPA, keine Frameworks, alles offline via IndexedDB.

const RATING_META = {
  none: { label: "– nicht geprüft –", cls: "r-none" },
  good: { label: "Gut", cls: "r-good" },
  medium: { label: "Mittel", cls: "r-medium" },
  bad: { label: "Schlecht", cls: "r-bad" },
};

const state = {
  route: "list",
  apartments: [],
  current: null, // aktuelles Apartment-Objekt
  expanded: {}, // sectionKey -> bool
  photos: {}, // itemKey -> [{id, url}]
  documents: [], // [{id, fileName, mimeType, blob, typ, url}]
  pendingPhotoTarget: null,
  viewingPhotoUrl: null,
  settingsOpen: false,
  aiLoading: false,
  aiMessage: null, // {type: "success"|"error", text}
};

const app = document.getElementById("app");
const photoInput = document.getElementById("photoInput");
const documentInput = document.getElementById("documentInput");

function documentTypeLabel(typ) {
  if (!typ) return "nicht analysiert";
  if (typ === "expose") return "Exposé";
  if (typ === "sonstiges") return "Sonstiges";
  const { item } = findItemDef("unterlagen." + typ);
  return item ? item.label : typ;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function itemProgress(apartment) {
  const keys = allChecklistItemKeys();
  let done = 0;
  for (const key of keys) {
    const { item } = findItemDef(key);
    const data = apartment.checklist[key];
    if (!data) continue;
    if (item.type === "text") { if (data.note && data.note.trim() !== "") done++; }
    else if (data.rating && data.rating !== "none") done++;
  }
  return { done, total: keys.length };
}

// Alle Rating-Punkte mit Auffälligkeit (medium/bad), schlechteste zuerst.
function collectWeaknesses(apartment) {
  const results = [];
  for (const section of CHECKLIST_SECTIONS) {
    for (const item of section.items) {
      if (item.type !== "rating") continue;
      const key = section.key + "." + item.key;
      const data = apartment.checklist[key];
      if (data && (data.rating === "bad" || data.rating === "medium")) {
        results.push({ key, sectionTitle: section.title, label: item.label, rating: data.rating, note: data.note });
      }
    }
  }
  results.sort((a, b) => (a.rating === b.rating ? 0 : a.rating === "bad" ? -1 : 1));
  return results;
}

async function init() {
  state.apartments = await DB.listApartments();
  render();
}

function render() {
  if (state.route === "list") {
    app.innerHTML = renderList();
  } else if (state.route === "apartment") {
    app.innerHTML = renderApartment();
  }
  if (state.viewingPhotoUrl) {
    app.insertAdjacentHTML("beforeend", renderPhotoOverlay());
  }
}

// ---------- Listen-Ansicht ----------

function renderList() {
  const cards = state.apartments.map(a => {
    const { done, total } = itemProgress(a);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const weaknesses = collectWeaknesses(a);
    const badCount = weaknesses.filter(w => w.rating === "bad").length;
    const badge = weaknesses.length
      ? `<span class="weak-badge">⚠ ${weaknesses.length}${badCount ? ` (${badCount} schwer)` : ""}</span>`
      : "";
    return `
      <div class="card" data-action="open-apartment" data-id="${a.id}">
        <div class="card-main">
          <div class="card-title">${escapeHtml(a.name) || "Ohne Namen"} ${a.favorite ? "★" : ""}</div>
          <div class="card-sub">${escapeHtml(a.date || "")}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="card-sub-row">
            <span class="card-sub">${done}/${total} geprüft</span>
            ${badge}
          </div>
        </div>
        <button class="icon-btn danger" data-action="delete-apartment" data-id="${a.id}" title="Löschen">🗑</button>
      </div>`;
  }).join("");

  return `
    <header class="topbar">
      <h1>WohnungsCheck</h1>
      <button class="icon-btn" data-action="toggle-settings" title="Einstellungen">⚙️</button>
      <button class="btn primary" data-action="new-apartment">+ Neu</button>
    </header>
    <main class="list">
      ${state.settingsOpen ? renderSettingsPanel() : ""}
      ${state.apartments.length ? cards : `<p class="empty">Noch keine Wohnung angelegt.<br>Tippe auf „+ Neu“, um deine erste Besichtigung zu starten.</p>`}
    </main>`;
}

function renderSettingsPanel() {
  const key = AI.getApiKey();
  return `
    <div class="settings-panel">
      <h2>Einstellungen</h2>
      <label class="field">
        <span>Anthropic API-Key</span>
        <input type="password" id="apiKeyInput" value="${escapeHtml(key)}" placeholder="sk-ant-...">
      </label>
      <p class="hint-text">Wird nur lokal auf diesem Gerät gespeichert, nie auf einen eigenen Server geladen. Nötig, damit hochgeladene Unterlagen (Exposé, Energieausweis, …) automatisch ausgelesen werden können. Key erstellen unter console.anthropic.com/settings/keys.</p>
      <div class="doc-actions">
        <button class="btn primary" data-action="save-api-key">Speichern</button>
        <button class="btn" data-action="close-settings">Schließen</button>
      </div>
    </div>`;
}

// ---------- Apartment-Ansicht ----------

function renderApartment() {
  const a = state.current;
  const { done, total } = itemProgress(a);

  const eckdatenHtml = ECKDATEN_FIELDS.map(f => {
    const value = a.eckdaten[f.key] || "";
    if (f.type === "select") {
      const cls = RATING_META[gebaeudeklasseRating(value)]?.cls || "r-none";
      const optionsHtml = [`<option value="">– nicht geprüft –</option>`]
        .concat(f.options.map(o => `<option value="${o}" ${value === o ? "selected" : ""}>${o}</option>`))
        .join("");
      return `
        <label class="field">
          <span>${escapeHtml(f.label)}</span>
          <select class="rating-select ${cls}" data-field="eckdatenSelect" data-key="${f.key}">${optionsHtml}</select>
        </label>`;
    }
    return `
      <label class="field">
        <span>${escapeHtml(f.label)}</span>
        <input type="text" data-field="eckdaten" data-key="${f.key}" value="${escapeHtml(value)}" placeholder="–">
      </label>`;
  }).join("");

  const generalPhotos = state.photos["_general"] || [];

  const sectionsHtml = CHECKLIST_SECTIONS.map(section => {
    const items = section.items;
    const sectionDone = items.filter(i => {
      const data = a.checklist[section.key + "." + i.key];
      return i.type === "text" ? (data.note && data.note.trim() !== "") : data.rating !== "none";
    }).length;
    const isOpen = !!state.expanded[section.key];
    const itemsHtml = items.map(item => renderItem(section.key, item)).join("");
    return `
      <section class="section">
        <button class="section-header" data-action="toggle-section" data-section="${section.key}">
          <span>${isOpen ? "▾" : "▸"} ${escapeHtml(section.title)}</span>
          <span class="section-count">${sectionDone}/${items.length}</span>
        </button>
        ${isOpen ? `<div class="section-body">${itemsHtml}</div>` : ""}
      </section>`;
  }).join("");

  return `
    <header class="topbar">
      <button class="icon-btn" data-action="back-to-list">←</button>
      <input class="apt-name" type="text" data-field="name" value="${escapeHtml(a.name)}" placeholder="Name / Adresse der Wohnung">
      <button class="icon-btn" data-action="toggle-favorite" title="Favorit">${a.favorite ? "★" : "☆"}</button>
    </header>
    <main class="apartment">
      <div class="row-inline">
        <label class="field grow">
          <span>Besichtigungsdatum</span>
          <input type="date" data-field="date" value="${escapeHtml(a.date)}">
        </label>
        <div class="field grow">
          <span>Fortschritt</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${total ? Math.round(done/total*100) : 0}%"></div></div>
          <small>${done}/${total} geprüft</small>
        </div>
      </div>

      <section class="section">
        <button class="section-header" data-action="toggle-section" data-section="_eckdaten">
          <span>${state.expanded._eckdaten ? "▾" : "▸"} Eckdaten</span>
        </button>
        ${state.expanded._eckdaten ? `<div class="section-body eckdaten-grid">${eckdatenHtml}</div>` : ""}
      </section>

      ${renderDocumentsSection()}

      <section class="section">
        <button class="section-header" data-action="toggle-section" data-section="_allgemein">
          <span>${state.expanded._allgemein ? "▾" : "▸"} Allgemeine Notizen & Fotos</span>
        </button>
        ${state.expanded._allgemein ? `
        <div class="section-body">
          <textarea data-field="generalNotes" placeholder="Allgemeiner Eindruck, Highlights, Bedenken …">${escapeHtml(a.generalNotes)}</textarea>
          ${renderPhotoRow("_general", generalPhotos)}
        </div>` : ""}
      </section>

      ${sectionsHtml}

      ${renderWeaknesses(a)}

      <button class="btn danger full" data-action="delete-apartment" data-id="${a.id}">Wohnung löschen</button>
    </main>`;
}

function renderItem(sectionKey, item) {
  const itemKey = sectionKey + "." + item.key;
  const data = state.current.checklist[itemKey] || { rating: "none", note: "" };
  const photos = state.photos[itemKey] || [];

  const ratingHtml = item.type === "rating" ? (() => {
    const options = RATING_KINDS[item.kind];
    const optionsHtml = Object.entries(options).map(([value, label]) =>
      `<option value="${value}" ${data.rating === value ? "selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");
    const cls = RATING_META[data.rating]?.cls || "r-none";
    return `<select class="rating-select ${cls}" data-field="itemRating" data-item="${itemKey}">${optionsHtml}</select>`;
  })() : "";

  return `
    <div class="item">
      <div class="item-label">
        <div>${escapeHtml(item.label)}</div>
        ${item.hint ? `<div class="item-hint">${escapeHtml(item.hint)}</div>` : ""}
      </div>
      ${ratingHtml}
      <textarea class="item-note" data-field="itemNote" data-item="${itemKey}" placeholder="${item.type === "rating" ? "Zusatzinfo (optional) …" : "Notiz …"}">${escapeHtml(data.note)}</textarea>
      ${renderPhotoRow(itemKey, photos)}
    </div>`;
}

function renderWeaknesses(apartment) {
  const weaknesses = collectWeaknesses(apartment);
  const body = weaknesses.length
    ? weaknesses.map(w => `
        <div class="weak-item ${w.rating === "bad" ? "weak-bad" : "weak-medium"}">
          <div class="weak-head">
            <div class="weak-label">${escapeHtml(w.label)}</div>
            <div class="weak-section">${escapeHtml(w.sectionTitle)}</div>
          </div>
          ${w.note ? `<div class="weak-note">${escapeHtml(w.note)}</div>` : ""}
        </div>`).join("")
    : `<p class="empty small">Bisher keine Auffälligkeiten erfasst.</p>`;

  return `
    <section class="section weaknesses">
      <div class="section-header static">
        <span>⚠️ Schwachstellen-Übersicht</span>
        <span class="section-count">${weaknesses.length}</span>
      </div>
      <div class="section-body">${body}</div>
    </section>`;
}

function renderDocumentsSection() {
  const hasKey = !!AI.getApiKey();
  const rows = state.documents.map(d => `
    <div class="doc-row">
      <div class="doc-icon">${d.mimeType === "application/pdf" ? "📄" : "🖼️"}</div>
      <div class="doc-info">
        <div class="doc-name">${escapeHtml(d.fileName)}</div>
        <div class="doc-type ${d.typ ? "doc-type-known" : ""}">${escapeHtml(documentTypeLabel(d.typ))}</div>
      </div>
      <button class="icon-btn" data-action="open-document" data-url="${d.url}" title="Öffnen">↗</button>
      <button class="icon-btn danger" data-action="delete-document" data-id="${d.id}" title="Löschen">🗑</button>
    </div>`).join("");

  const messageHtml = state.aiMessage
    ? `<div class="ai-message ai-${state.aiMessage.type}">${escapeHtml(state.aiMessage.text)}</div>`
    : "";

  return `
    <section class="section">
      <button class="section-header" data-action="toggle-section" data-section="_dokumente">
        <span>${state.expanded._dokumente ? "▾" : "▸"} Dokumente${state.documents.length ? ` (${state.documents.length})` : ""}</span>
      </button>
      ${state.expanded._dokumente ? `
      <div class="section-body">
        ${!hasKey ? `<p class="hint-text">Kein API-Key hinterlegt – Dokumente können trotzdem gespeichert werden. Für automatisches Ausfüllen: zurück zur Übersicht → ⚙️ Einstellungen.</p>` : ""}
        ${rows || `<p class="empty small">Noch keine Dokumente hochgeladen.</p>`}
        <div class="doc-actions">
          <button class="btn" data-action="upload-documents">+ Dokumente hochladen</button>
          <button class="btn primary" data-action="analyze-documents" ${state.aiLoading || !state.documents.length ? "disabled" : ""}>${state.aiLoading ? "Analysiere …" : "Mit KI Felder ausfüllen"}</button>
        </div>
        ${messageHtml}
      </div>` : ""}
    </section>`;
}

function renderPhotoRow(itemKey, photos) {
  const thumbs = photos.map(p => `
    <div class="thumb" data-action="view-photo" data-url="${p.url}" data-id="${p.id}">
      <img src="${p.url}" alt="Foto">
    </div>`).join("");
  return `
    <div class="photo-row">
      ${thumbs}
      <button class="thumb add-photo" data-action="add-photo" data-item="${itemKey}">+</button>
    </div>`;
}

function renderPhotoOverlay() {
  return `
    <div class="photo-overlay" data-action="close-photo">
      <img src="${state.viewingPhotoUrl.url}" alt="Foto">
      <button class="btn danger" data-action="delete-photo" data-id="${state.viewingPhotoUrl.id}" data-item="${state.viewingPhotoUrl.itemKey}">Foto löschen</button>
    </div>`;
}

// ---------- Aktionen ----------

async function openApartment(id) {
  const a = await DB.getApartment(id);
  state.current = a;
  state.expanded = {};
  state.aiMessage = null;
  await loadPhotosForCurrent();
  await loadDocumentsForCurrent();
  state.route = "apartment";
  render();
}

async function loadDocumentsForCurrent() {
  revokeDocumentUrls();
  const docs = await DB.getDocumentsForApartment(state.current.id);
  state.documents = docs.map(d => ({ ...d, url: URL.createObjectURL(d.blob) }));
}

function revokeDocumentUrls() {
  for (const d of state.documents) URL.revokeObjectURL(d.url);
  state.documents = [];
}

async function loadPhotosForCurrent() {
  revokePhotoUrls();
  const all = await DB.getPhotosForApartment(state.current.id);
  const map = {};
  for (const p of all) {
    const url = URL.createObjectURL(p.blob);
    (map[p.itemKey] ||= []).push({ id: p.id, url });
  }
  state.photos = map;
}

function revokePhotoUrls() {
  for (const arr of Object.values(state.photos)) {
    for (const p of arr) URL.revokeObjectURL(p.url);
  }
  state.photos = {};
}

function backToList() {
  revokePhotoUrls();
  revokeDocumentUrls();
  state.current = null;
  state.route = "list";
  init();
}

async function createApartment() {
  const a = DB.newApartment("Neue Wohnung");
  await DB.saveApartment(a);
  await openApartment(a.id);
  state.expanded._eckdaten = true;
  render();
}

async function deleteApartment(id) {
  if (!confirm("Diese Wohnung inkl. aller Notizen und Fotos wirklich löschen?")) return;
  await DB.deleteApartment(id);
  if (state.current && state.current.id === id) {
    backToList();
  } else {
    state.apartments = await DB.listApartments();
    render();
  }
}

function compressImage(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = height * (maxDim / width); width = maxDim; }
      else if (height > maxDim) { width = width * (maxDim / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file || !state.pendingPhotoTarget) return;
  const { itemKey } = state.pendingPhotoTarget;
  const blob = await compressImage(file);
  const photo = await DB.addPhoto(state.current.id, itemKey, blob);
  const url = URL.createObjectURL(photo.blob);
  (state.photos[itemKey] ||= []).push({ id: photo.id, url });
  await DB.saveApartment(state.current); // updatedAt bump
  render();
});

async function deletePhotoAction(id) {
  await DB.deletePhoto(id);
  for (const key of Object.keys(state.photos)) {
    state.photos[key] = state.photos[key].filter(p => p.id !== id);
  }
  state.viewingPhotoUrl = null;
  render();
}

documentInput.addEventListener("change", async () => {
  const files = Array.from(documentInput.files || []);
  documentInput.value = "";
  if (!files.length || !state.current) return;
  for (const file of files) {
    const doc = await DB.addDocument(state.current.id, file);
    state.documents.push({ ...doc, url: URL.createObjectURL(doc.blob) });
  }
  await DB.saveApartment(state.current);
  render();
});

async function deleteDocumentAction(id) {
  await DB.deleteDocument(id);
  const doc = state.documents.find(d => d.id === id);
  if (doc) URL.revokeObjectURL(doc.url);
  state.documents = state.documents.filter(d => d.id !== id);
  render();
}

async function analyzeDocuments() {
  if (state.aiLoading || !state.documents.length) return;
  state.aiLoading = true;
  state.aiMessage = null;
  render();
  try {
    const result = await AI.extractFromDocuments(state.documents);

    let filled = 0;
    if (result.eckdaten) {
      for (const [key, value] of Object.entries(result.eckdaten)) {
        if (value && !state.current.eckdaten[key]) {
          state.current.eckdaten[key] = value;
          filled++;
        }
      }
    }

    let recognized = 0;
    if (Array.isArray(result.dateien)) {
      for (const entry of result.dateien) {
        const doc = state.documents[entry.index];
        if (!doc || !entry.typ) continue;
        doc.typ = entry.typ;
        await DB.updateDocument({ id: doc.id, apartmentId: state.current.id, fileName: doc.fileName, mimeType: doc.mimeType, blob: doc.blob, typ: doc.typ, createdAt: doc.createdAt });
        const itemKey = "unterlagen." + entry.typ;
        if (state.current.checklist[itemKey]) {
          state.current.checklist[itemKey].rating = "good";
          recognized++;
        }
      }
    }

    await DB.saveApartment(state.current);
    state.aiMessage = { type: "success", text: `${filled} Feld(er) ausgefüllt, ${recognized} Unterlage(n) erkannt.` };
  } catch (err) {
    state.aiMessage = { type: "error", text: err.message || String(err) };
  } finally {
    state.aiLoading = false;
    render();
  }
}

// ---------- Event-Delegation ----------

app.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "new-apartment") return createApartment();
  if (action === "open-apartment") return openApartment(target.dataset.id);
  if (action === "back-to-list") return backToList();
  if (action === "delete-apartment") { e.stopPropagation(); return deleteApartment(target.dataset.id); }
  if (action === "toggle-favorite") {
    state.current.favorite = !state.current.favorite;
    await DB.saveApartment(state.current);
    return render();
  }
  if (action === "toggle-section") {
    const key = target.dataset.section;
    state.expanded[key] = !state.expanded[key];
    return render();
  }
  if (action === "add-photo") {
    state.pendingPhotoTarget = { itemKey: target.dataset.item };
    return photoInput.click();
  }
  if (action === "view-photo") {
    state.viewingPhotoUrl = { url: target.dataset.url, id: target.dataset.id, itemKey: findItemKeyForPhoto(target.dataset.id) };
    return render();
  }
  if (action === "close-photo") {
    if (e.target === target) { state.viewingPhotoUrl = null; render(); }
    return;
  }
  if (action === "delete-photo") return deletePhotoAction(target.dataset.id);
  if (action === "toggle-settings") { state.settingsOpen = !state.settingsOpen; return render(); }
  if (action === "close-settings") { state.settingsOpen = false; return render(); }
  if (action === "save-api-key") {
    const input = document.getElementById("apiKeyInput");
    AI.setApiKey(input.value.trim());
    state.settingsOpen = false;
    return render();
  }
  if (action === "upload-documents") return documentInput.click();
  if (action === "open-document") { window.open(target.dataset.url, "_blank"); return; }
  if (action === "delete-document") return deleteDocumentAction(target.dataset.id);
  if (action === "analyze-documents") return analyzeDocuments();
});

function findItemKeyForPhoto(id) {
  for (const [key, arr] of Object.entries(state.photos)) {
    if (arr.some(p => p.id === id)) return key;
  }
  return null;
}

app.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.field === "itemRating") {
    state.current.checklist[el.dataset.item].rating = el.value;
    DB.saveApartment(state.current);
    render();
  } else if (el.dataset.field === "eckdatenSelect") {
    state.current.eckdaten[el.dataset.key] = el.value;
    DB.saveApartment(state.current);
    render();
  }
});

app.addEventListener("input", (e) => {
  const el = e.target;
  const field = el.dataset.field;
  if (!field || !state.current) return;
  if (field === "name") state.current.name = el.value;
  else if (field === "date") state.current.date = el.value;
  else if (field === "generalNotes") state.current.generalNotes = el.value;
  else if (field === "eckdaten") state.current.eckdaten[el.dataset.key] = el.value;
  else if (field === "itemNote") state.current.checklist[el.dataset.item].note = el.value;
  else return;
  DB.saveApartment(state.current);
});

// Notizfelder lösen keinen Re-Render pro Tastendruck aus (Cursor würde springen).
// Beim Verlassen des Feldes einmal neu rendern, damit die Schwachstellen-Übersicht aktuell bleibt.
app.addEventListener("focusout", (e) => {
  const field = e.target.dataset.field;
  if (field === "itemNote" && state.route === "apartment") render();
});

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
