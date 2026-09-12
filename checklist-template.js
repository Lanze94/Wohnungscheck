// Checkliste basierend auf "Checkliste Besichtigung" / "Fragestellungen Wohnungskauf" (Peuker)
// Struktur: Eckdaten (Freitext-Felder) + mehrere Checklisten-Sektionen.
// Jeder Punkt ist entweder:
//   type "rating" -> Dropdown mit fixen Antwortoptionen (siehe RATING_KINDS) + optionale Notiz
//   type "text"   -> reine Freitext-Notiz (für faktische/offene Fragen ohne gut/schlecht-Bewertung)

const ECKDATEN_FIELDS = [
  { key: "anbieter", label: "Anbieter" },
  { key: "adresse", label: "Adresse" },
  { key: "baujahr", label: "Gebäudejahr" },
  { key: "hwb", label: "HWB-Wert" },
  { key: "groesse", label: "Größe (m²)" },
  { key: "stockwerk", label: "Stockwerk" },
  { key: "preis", label: "Preis / Miete" },
  { key: "hausverwaltung", label: "Name Hausverwaltung" },
];

// Antwortoptionen je Frage-"Kind". Wert bleibt immer eines von: none, good, medium, bad.
// Nur die Beschriftung wird passend zur Frage wählbar gemacht.
const RATING_KINDS = {
  quality: { none: "– nicht geprüft –", good: "Gut", medium: "Mittelmäßig", bad: "Schlecht" },
  presence: { none: "– nicht geprüft –", good: "Vorhanden", medium: "Teilweise / eingeschränkt", bad: "Nicht vorhanden" },
  issue: { none: "– nicht geprüft –", good: "Kein Problem", medium: "Leichte Auffälligkeit", bad: "Deutliches Problem" },
  yesno: { none: "– nicht geprüft –", good: "Ja", medium: "Teilweise", bad: "Nein" },
};

const CHECKLIST_SECTIONS = [
  {
    key: "wohnung",
    title: "Wohnung – Zustand & Ausstattung",
    items: [
      { key: "grundriss", label: "Grundriss & Raumaufteilung", hint: "Entspricht es dem Exposé?", type: "rating", kind: "quality" },
      { key: "anschluesse", label: "Anschlüsse", hint: "Steckdosen, TV, Internet, Waschmaschine", type: "text" },
      { key: "fenster_tueren", label: "Fenster und Türen", hint: "Zustand, öffnen/schließen, dicht?", type: "rating", kind: "quality" },
      { key: "abstell", label: "Abstellmöglichkeiten", hint: "Abstellraum, Keller, Garage", type: "rating", kind: "presence" },
      { key: "bad", label: "Zustand Bad", type: "rating", kind: "quality" },
      { key: "kueche", label: "Zustand Küche", hint: "Einbauküche vorhanden?", type: "rating", kind: "quality" },
      { key: "waende_decken", label: "Wände und Decken", hint: "Risse, Dichtheit", type: "rating", kind: "quality" },
      { key: "helligkeit", label: "Helligkeit & Ausrichtung", hint: "Lichteinfall im Tagesverlauf", type: "rating", kind: "quality" },
      { key: "heizung", label: "Heizungsart", hint: "Eigener Verbrauchszähler?", type: "text" },
      { key: "feuchtigkeit", label: "Feuchtigkeit oder Schimmel", type: "rating", kind: "issue" },
      { key: "wasserleitungen", label: "Wasserleitungen & Wasserhähne", hint: "Funktionsfähig? Wasserdruck testen", type: "rating", kind: "issue" },
      { key: "sanitaer", label: "Sanitäranlagen, Fugen", type: "rating", kind: "quality" },
      { key: "elektrik", label: "Elektrik & Verteilerkasten", hint: "Funktioniert alles?", type: "rating", kind: "issue" },
      { key: "daemmung", label: "Dichtung & Dämmung der Wohnung", type: "rating", kind: "quality" },
      { key: "laerm_innen", label: "Lärmpegel bei geschlossenen Fenstern", type: "rating", kind: "issue" },
      { key: "reparaturen", label: "Notwendige Reparaturen", type: "rating", kind: "issue" },
    ],
  },
  {
    key: "gebaeude",
    title: "Gebäude & Umfeld",
    items: [
      { key: "altbau_neubau", label: "Altbau oder Neubau", type: "text" },
      { key: "gebaeudezustand", label: "Gebäudezustand", hint: "Dach, Außenwände, Keller", type: "rating", kind: "quality" },
      { key: "stiegenhaus", label: "Zustand Stiegenhaus", type: "rating", kind: "quality" },
      { key: "aufzug", label: "Aufzug vorhanden?", hint: "Zustand", type: "rating", kind: "presence" },
      { key: "gruenanlagen", label: "Innenhof / Garten / Grünanlagen", type: "rating", kind: "presence" },
      { key: "gemeinschaft", label: "Gemeinschaftsräume", hint: "Fahrradkeller, Waschküche, Müllraum", type: "rating", kind: "presence" },
      { key: "parkplaetze_besucher", label: "Parkplätze für Besucher", type: "rating", kind: "presence" },
      { key: "gewerbe", label: "Gewerbebetrieb im Haus?", hint: "Beeinträchtigung durch Lärm/Geruch?", type: "rating", kind: "issue" },
      { key: "umfeld", label: "Eindruck Umfeld / Nachbarn", type: "rating", kind: "quality" },
    ],
  },
  {
    key: "lage",
    title: "Lage",
    items: [
      { key: "oeffis", label: "Anbindung an Öffis / Verkehrsnetz", type: "rating", kind: "quality" },
      { key: "nahversorgung", label: "Nahversorgung", hint: "Geschäfte, Ärzte, Schulen, Kindergärten", type: "rating", kind: "quality" },
      { key: "naherholung", label: "Naherholung / Grünflächen", type: "rating", kind: "quality" },
      { key: "laerm_umgebung", label: "Lärmpegel in der Umgebung", type: "rating", kind: "issue" },
      { key: "naehe_stoerfaktoren", label: "Nähe zu Bahnhof / Flughafen / Hauptverkehrsstraße / Industrie", type: "rating", kind: "issue" },
    ],
  },
  {
    key: "kosten_vertrag",
    title: "Kosten & Vertrag",
    items: [
      { key: "mietvertrag_aktuell", label: "Aktueller Mietvertrag vorhanden?", hint: "Bei vermieteter Wohnung", type: "rating", kind: "yesno" },
      { key: "zahlungsrueckstaende", label: "Zahlungsrückstände durch aktuellen Mieter?", type: "rating", kind: "issue" },
      { key: "befristung", label: "Wie lange befristet vermietet?", type: "text" },
      { key: "letzter_mietvertrag", label: "Letzter Mietvertrag einsehbar?", type: "rating", kind: "yesno" },
      { key: "betriebskosten_umlegbar", label: "Betriebskosten umlegbar?", type: "rating", kind: "yesno" },
      { key: "laufende_kosten", label: "Laufende Betriebs-/Energiekosten", type: "text" },
      { key: "sanierung_offen", label: "Offenes Sanierungsdarlehen / Sanierungskonto", type: "rating", kind: "issue" },
      { key: "anstehende_sanierung", label: "Anstehende Sanierungen", type: "rating", kind: "issue" },
      { key: "nachfrage", label: "Wie lange ist die Wohnung schon am Markt?", type: "text" },
    ],
  },
  {
    key: "unterlagen",
    title: "Unterlagen",
    items: [
      { key: "grundbuchsauszug", label: "Grundbuchsauszug", type: "rating", kind: "presence" },
      { key: "grundriss_doc", label: "Grundriss der Wohnung", type: "rating", kind: "presence" },
      { key: "energieausweis", label: "Energieausweis", type: "rating", kind: "presence" },
      { key: "betriebskostenabrechnung", label: "Aktuelle Betriebskostenabrechnung", type: "rating", kind: "presence" },
      { key: "betriebskostenvorschau", label: "Betriebskostenvorschau", type: "rating", kind: "presence" },
      { key: "nutzwertgutachten", label: "Nutzwertgutachten", hint: "Falls vorhanden", type: "rating", kind: "presence" },
      { key: "protokoll_eigentuemer", label: "Protokoll der letzten Eigentümerversammlung", type: "rating", kind: "presence" },
      { key: "wohnungseigentuemervertrag", label: "Wohnungseigentümervertrag", type: "rating", kind: "presence" },
    ],
  },
];

// Reihenfolge aller Item-Keys (für Fortschrittsanzeige)
function allChecklistItemKeys() {
  return CHECKLIST_SECTIONS.flatMap(s => s.items.map(i => s.key + "." + i.key));
}

// Findet Sektion + Item-Definition zu einem "section.key"-Itemkey
function findItemDef(itemKey) {
  const [sectionKey, key] = itemKey.split(".");
  const section = CHECKLIST_SECTIONS.find(s => s.key === sectionKey);
  const item = section?.items.find(i => i.key === key);
  return { section, item };
}
