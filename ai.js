// Anbindung an die Anthropic-API, um Eckdaten aus hochgeladenen Unterlagen (Exposé,
// Energieausweis, Grundbuchsauszug, ...) automatisch zu extrahieren.
// Der API-Key wird ausschließlich lokal auf dem Gerät gespeichert (localStorage) und
// nie an einen eigenen Server geschickt – die App hat keinen Server, der Call geht
// direkt vom Handy-Browser an api.anthropic.com.

const AI_MODEL = "claude-sonnet-4-6";
const API_KEY_STORAGE_KEY = "wc_anthropic_api_key";

const DOCUMENT_TYPES = [
  "grundbuchsauszug", "grundriss_doc", "energieausweis", "betriebskostenabrechnung",
  "betriebskostenvorschau", "nutzwertgutachten", "protokoll_eigentuemer",
  "wohnungseigentuemervertrag", "expose", "sonstiges",
];

const AI = {
  getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  },
  setApiKey(key) {
    if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  },

  async fileToBase64(blob) {
    const buf = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  },

  buildPrompt() {
    return `Du bekommst mehrere Dokumente zu einer einzelnen Immobilie (z.B. Exposé, Energieausweis, Grundbuchsauszug, Betriebskostenabrechnung). Extrahiere daraus folgende Eckdaten. Falls eine Information in keinem Dokument vorkommt, verwende einen leeren String "".

Felder:
- anbieter: Name des Maklers/Anbieters/Verkäufers
- adresse: vollständige Adresse der Immobilie
- baujahr: Baujahr des Gebäudes
- gebaeudeklasse: NUR falls im Energieausweis explizit eine Energieeffizienzklasse als Buchstabe (A, B, C, D, E, F, G oder H) angegeben ist, sonst leer. Keine eigene Umrechnung aus einem HWB-Zahlenwert vornehmen.
- groesse: Wohnfläche in m² (nur die Zahl)
- stockwerk: Stockwerk/Etage
- preis: Kaufpreis oder Miete (mit Betrag, wie im Dokument angegeben)
- hausverwaltung: Name der Hausverwaltung

Klassifiziere außerdem JEDES Dokument in der Reihenfolge, in der du es erhalten hast (Index beginnend bei 0), als genau einen dieser Typen: ${DOCUMENT_TYPES.join(", ")}.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format, ohne Markdown-Codeblock, ohne zusätzlichen Text:
{"eckdaten":{"anbieter":"","adresse":"","baujahr":"","gebaeudeklasse":"","groesse":"","stockwerk":"","preis":"","hausverwaltung":""},"dateien":[{"index":0,"typ":"expose"}]}`;
  },

  async extractFromDocuments(documents) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.");
    if (!documents.length) throw new Error("Keine Dokumente zum Analysieren vorhanden.");

    const contentBlocks = [];
    for (const doc of documents) {
      const base64 = await this.fileToBase64(doc.blob);
      if (doc.mimeType === "application/pdf") {
        contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
      } else {
        contentBlocks.push({ type: "image", source: { type: "base64", media_type: doc.mimeType || "image/jpeg", data: base64 } });
      }
    }
    contentBlocks.push({ type: "text", text: this.buildPrompt() });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API-Fehler (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error("Antwort der KI konnte nicht gelesen werden.");
    }
  },
};
