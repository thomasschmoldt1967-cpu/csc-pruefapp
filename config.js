// ============================================================
// CSC Prüf-App — Zentrale Konfiguration
// Neue Standorte, Listen oder Bereiche hier eintragen
// ============================================================

const APP_CONFIG = {
  firma: "CSC Hannover",
  version: "1.0.0",

  // Google Drive Folder-ID (wo PDFs abgelegt werden)
  googleDriveFolderId: "YOUR_FOLDER_ID_HERE",

  standorte: [
    {
      id: "raschplatz5",
      name: "Raschplatz 5",
      bereiche: [
        { id: "aufzug_1",         name: "Aufzug 1",                    liste: "aufzug" },
        { id: "bst_eg",           name: "Brandschutztür EG",            liste: "brandschutztuer" },
        { id: "bst_og1",          name: "Brandschutztür 1. OG",         liste: "brandschutztuer" },
        { id: "bst_og2",          name: "Brandschutztür 2. OG",         liste: "brandschutztuer" },
        { id: "bst_og3",          name: "Brandschutztür 3. OG",         liste: "brandschutztuer" },
        { id: "bst_kg",           name: "Brandschutztür KG",            liste: "brandschutztuer" },
        { id: "notbel_th01",      name: "Notbeleuchtung Treppenhaus 01", liste: "notbeleuchtung" },
        { id: "notbel_th05",      name: "Notbeleuchtung Treppenhaus 05", liste: "notbeleuchtung" },
        { id: "notbel_anliefeg",  name: "Notbeleuchtung Anlieferzone EG",liste: "notbeleuchtung" },
        { id: "notbel_keller",    name: "Notbeleuchtung Kellerbereich",  liste: "notbeleuchtung" },
        { id: "notbel_eingang",   name: "Notbeleuchtung Eingang",        liste: "notbeleuchtung" },
      ]
    }
    // Weiterer Standort: { id: "...", name: "...", bereiche: [...] }
  ],

  listen: {
    aufzug: {
      titel: "Aufzug-Wartungskontrolle",
      untertitel: "gemäß TRBS 3121 und TRBS 2181",
      intervall: "Wöchentlich",
      abschnitte: [
        {
          titel: "Zugang & Sicherheit",
          punkte: [
            { id: "a1", text: "Zugang zu den Aufzugstüren sind sicher begehbar, Beleuchtung funktioniert." },
            { id: "a2", text: "Alle aufzugsgehörigen Räume und Bereiche werden unter Verschluss gehalten und können nur von Befugten Personen betreten werden." },
          ]
        },
        {
          titel: "Schachttüren",
          punkte: [
            { id: "a3", text: "Der Fahrkorb kann nicht angefahren, solange eine Schachttür geöffnet ist." },
            { id: "a4", text: "Eine Schachttür lässt sich nicht öffnen, solange sich der Fahrkorb außerhalb der Entriegelungszone dieser Tür befindet." },
          ]
        },
        {
          titel: "Fahrkorb",
          punkte: [
            { id: "a5", text: "Der Fahrkorb kann nicht anfahren, solange die Fahrkorbtür geöffnet ist." },
            { id: "a6", text: "Der Fahrkorb fährt die einzelnen Haltestellen bodenbündig an." },
            { id: "a7", text: "Die Fahrkorbbeleuchtung funktioniert." },
            { id: "a8", text: "Fahrkorbtüren, -wände und Schachttüren sind mechanisch in Ordnung." },
          ]
        },
        {
          titel: "Notruf & Sicherheit",
          punkte: [
            { id: "a9", text: "Die Notrufeinrichtung funktioniert und bei Anlagen mit Fernnotruf ist die Verständigung mit der Leitzentrale möglich." },
            { id: "a10", text: "Der TÜT-AUF-Taster ist wirksam." },
            { id: "a11", text: "Sicherheitszeichen und Piktogramme sind vorhanden und lesbar." },
          ]
        }
      ]
    },

    brandschutztuer: {
      titel: "Brandschutztür Sichtkontrolle",
      untertitel: "Wöchentliche Sicht- und Funktionskontrolle",
      intervall: "Wöchentlich",
      abschnitte: [
        {
          titel: "Zustand & Freihaltung",
          punkte: [
            { id: "b1", text: "Zuhaltung: Die Tür wird zu keiner Zeit (auch nicht temporär) durch Keile, Holzstücke oder ähnliche Hilfsmittel blockiert oder offen gehalten." },
          ]
        },
        {
          titel: "Sichtprüfung der Türstruktur",
          punkte: [
            { id: "b2", text: "Türblatt & Zarge: Keine offensichtlichen Beschädigungen, tiefen Risse, Verformungen oder Durchbrüche erkennbar." },
            { id: "b3", text: "Brandschutzverglasung: Sofern vorhanden: Die Scheibe weist keine Sprünge, Risse oder Trübungen auf." },
            { id: "b4", text: "Dichtungen: Die Dichtungsprofile in der Zarge (und bei Rauchschutztüren am Boden) sind vollständig vorhanden, intakt und nicht porös oder überstrichen." },
          ]
        },
        {
          titel: "Kontrolle der Beschläge und Schlösser",
          punkte: [
            { id: "b5", text: "Türdrücker: Beide Türgriffe (oder Stoßgriffe) sitzen fest, sind leichtgängig und fallen nach dem Herunterdrücken selbstständig in die Ausgangsposition zurück." },
            { id: "b6", text: "Schloss & Falle: Der Riegel lässt sich leichtgängig schließen; die Falle schließt sauber in das Schließblech ein, ohne zu klemmen." },
            { id: "b7", text: "Bänder & Scharniere: Keine Beschädigungen, Brüche oder extremes Quietschen." },
          ]
        },
        {
          titel: "Überprüfung der Schließfunktion (Selbstschließung)",
          punkte: [
            { id: "b8", text: "Freilaufprüfung: Die Tür wird ca. 30 Grad geöffnet und muss danach selbsttätig und vollständig ins Schloss fallen." },
            { id: "b9", text: "Endschlag: Die Tür schließt nicht zu rabiat, fällt aber hörbar in das Schloss (inkl. Einrasten der Falle)." },
            { id: "b10", text: "Türen mit Feststellanlagen: Sofern vorhanden — Auslöse-Taster (Handauslöseknopf) drücken, um zu prüfen, ob die Tür sicher zufällt." },
          ]
        }
      ]
    },

    notbeleuchtung: {
      titel: "Notbeleuchtung Sichtprüfung",
      untertitel: "Wöchentliche Sichtkontrolle",
      intervall: "Wöchentlich",
      abschnitte: [
        {
          titel: "Funktionskontrolle",
          punkte: [
            { id: "n1", text: "Alle Leuchten im Bereich sind eingeschaltet und leuchten." },
            { id: "n2", text: "Keine Leuchte zeigt Störungsanzeige (rote LED / blinken)." },
            { id: "n3", text: "Piktogramme (Fluchtweg, Notausgang) sind beleuchtet und gut lesbar." },
            { id: "n4", text: "Leuchten sind mechanisch unbeschädigt (kein Gehäuseschaden, keine losen Teile)." },
            { id: "n5", text: "Leitungsführung und Befestigung sind in Ordnung (kein loses Kabel sichtbar)." },
          ]
        }
      ]
    }

    // Neue Liste hinzufügen: leiterkontrolle: { titel: "...", abschnitte: [...] }
  }
};
