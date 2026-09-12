// Checkliste basierend auf "Checkliste Besichtigung" / "Fragestellungen Wohnungskauf" (Peuker)
// Struktur: Eckdaten (Freitext-Felder) + mehrere Checklisten-Sektionen (Status + Notiz + Fotos)

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

const CHECKLIST_SECTIONS = [
  {
    key: "wohnung",
    title: "Wohnung – Zustand & Ausstattung",
    items: [
      { key: "grundriss", label: "Grundriss & Raumaufteilung", hint: "Entspricht es dem Exposé?" },
      { key: "anschluesse", label: "Anschlüsse", hint: "Steckdosen, TV, Internet, Waschmaschine" },
      { key: "fenster_tueren", label: "Fenster und Türen", hint: "Zustand, öffnen/schließen, dicht?" },
      { key: "abstell", label: "Abstellmöglichkeiten", hint: "Abstellraum, Keller, Garage" },
      { key: "bad", label: "Zustand Bad" },
      { key: "kueche", label: "Zustand Küche", hint: "Einbauküche vorhanden?" },
      { key: "waende_decken", label: "Wände und Decken", hint: "Risse, Dichtheit" },
      { key: "helligkeit", label: "Helligkeit & Ausrichtung", hint: "Lichteinfall im Tagesverlauf" },
      { key: "heizung", label: "Heizungsart", hint: "Eigener Verbrauchszähler?" },
      { key: "feuchtigkeit", label: "Feuchtigkeit oder Schimmel" },
      { key: "wasserleitungen", label: "Wasserleitungen & Wasserhähne", hint: "Funktionsfähig? Wasserdruck testen" },
      { key: "sanitaer", label: "Sanitäranlagen, Fugen" },
      { key: "elektrik", label: "Elektrik & Verteilerkasten", hint: "Funktioniert alles?" },
      { key: "daemmung", label: "Dichtung & Dämmung der Wohnung" },
      { key: "laerm_innen", label: "Lärmpegel bei geschlossenen Fenstern" },
      { key: "reparaturen", label: "Notwendige Reparaturen" },
    ],
  },
  {
    key: "gebaeude",
    title: "Gebäude & Umfeld",
    items: [
      { key: "altbau_neubau", label: "Altbau oder Neubau" },
      { key: "gebaeudezustand", label: "Gebäudezustand", hint: "Dach, Außenwände, Keller" },
      { key: "stiegenhaus", label: "Zustand Stiegenhaus" },
      { key: "aufzug", label: "Aufzug vorhanden?", hint: "Zustand" },
      { key: "gruenanlagen", label: "Innenhof / Garten / Grünanlagen" },
      { key: "gemeinschaft", label: "Gemeinschaftsräume", hint: "Fahrradkeller, Waschküche, Müllraum" },
      { key: "parkplaetze_besucher", label: "Parkplätze für Besucher" },
      { key: "gewerbe", label: "Gewerbebetrieb im Haus?", hint: "Beeinträchtigung durch Lärm/Geruch?" },
      { key: "umfeld", label: "Eindruck Umfeld / Nachbarn" },
    ],
  },
  {
    key: "lage",
    title: "Lage",
    items: [
      { key: "oeffis", label: "Anbindung an Öffis / Verkehrsnetz" },
      { key: "nahversorgung", label: "Nahversorgung", hint: "Geschäfte, Ärzte, Schulen, Kindergärten" },
      { key: "naherholung", label: "Naherholung / Grünflächen" },
      { key: "laerm_umgebung", label: "Lärmpegel in der Umgebung" },
      { key: "naehe_stoerfaktoren", label: "Nähe zu Bahnhof / Flughafen / Hauptverkehrsstraße / Industrie" },
    ],
  },
  {
    key: "kosten_vertrag",
    title: "Kosten & Vertrag",
    items: [
      { key: "mietvertrag_aktuell", label: "Aktueller Mietvertrag vorhanden?", hint: "Bei vermieteter Wohnung" },
      { key: "zahlungsrueckstaende", label: "Zahlungsrückstände durch aktuellen Mieter?" },
      { key: "befristung", label: "Wie lange befristet vermietet?" },
      { key: "letzter_mietvertrag", label: "Letzter Mietvertrag einsehbar?" },
      { key: "betriebskosten_umlegbar", label: "Betriebskosten umlegbar?" },
      { key: "laufende_kosten", label: "Laufende Betriebs-/Energiekosten" },
      { key: "sanierung_offen", label: "Offenes Sanierungsdarlehen / Sanierungskonto" },
      { key: "anstehende_sanierung", label: "Anstehende Sanierungen" },
      { key: "nachfrage", label: "Wie lange ist die Wohnung schon am Markt?" },
    ],
  },
  {
    key: "unterlagen",
    title: "Unterlagen",
    items: [
      { key: "grundbuchsauszug", label: "Grundbuchsauszug" },
      { key: "grundriss_doc", label: "Grundriss der Wohnung" },
      { key: "energieausweis", label: "Energieausweis" },
      { key: "betriebskostenabrechnung", label: "Aktuelle Betriebskostenabrechnung" },
      { key: "betriebskostenvorschau", label: "Betriebskostenvorschau" },
      { key: "nutzwertgutachten", label: "Nutzwertgutachten", hint: "Falls vorhanden" },
      { key: "protokoll_eigentuemer", label: "Protokoll der letzten Eigentümerversammlung" },
      { key: "wohnungseigentuemervertrag", label: "Wohnungseigentümervertrag" },
    ],
  },
];

// Reihenfolge aller Item-Keys (für Fortschrittsanzeige)
function allChecklistItemKeys() {
  return CHECKLIST_SECTIONS.flatMap(s => s.items.map(i => s.key + "." + i.key));
}
