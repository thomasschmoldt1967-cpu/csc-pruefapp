// ============================================================
// CSC Prüf-App — Zentrale Konfiguration
// Neue Standorte, Listen oder Bereiche hier eintragen
// ============================================================

const APP_CONFIG = {
  firma: "CSC Hannover",
  version: "1.0.0",

  // Google Drive Folder-ID (wo PDFs abgelegt werden) — Hauptordner
  googleDriveFolderId: "1PendBTPwGultV9MzKcRoBoKfqUYXBVn3",

  // Unterordner je Prüfungstyp (in Dokumentenablage/csc-pruefapp/)
  googleDriveUnterordner: {
    aufzug:           "11VQSlyrlb4AoJd0-mla_MXqMSlpB0IYw",
    brandschutztuer:  "1gzXpsDtFatEjQqxmpoPWyhyI0LoRBzvx",
    notbeleuchtung:   "1ZnXMl4vCNsYrbdu2i3d2_kKgYrkN6Fps",
    leiterkontrolle:  "1iwyyDvyFTl0Jz2wTlfNQkgNRqDHt1oZ-",
    gfb_szp:          "1PendBTPwGultV9MzKcRoBoKfqUYXBVn3",  // Hauptordner vorerst
    gfb_glasreinigung:"1PendBTPwGultV9MzKcRoBoKfqUYXBVn3",  // Hauptordner vorerst
  },

  standorte: [
    {
      id: "raschplatz5",
      name: "Prüfungen",

      // Bereiche werden in Gruppen (Ordner) zusammengefasst
      gruppen: [
        {
          id: "aufzug",
          name: "Aufzug",
          icon: "🛗",
          bereiche: [
            { id: "aufzug_1", name: "Aufzug", liste: "aufzug" },
          ]
        },
        {
          id: "brandschutz",
          name: "Brandschutztüren",
          icon: "🚪",
          bereiche: [
            { id: "bst_eg",  name: "Brandschutztür EG",     liste: "brandschutztuer" },
            { id: "bst_og1", name: "Brandschutztür 1. OG",  liste: "brandschutztuer" },
            { id: "bst_og2", name: "Brandschutztür 2. OG",  liste: "brandschutztuer" },
            { id: "bst_og3", name: "Brandschutztür 3. OG",  liste: "brandschutztuer" },
            { id: "bst_kg",  name: "Brandschutztür KG",     liste: "brandschutztuer" },
          ]
        },
        {
          id: "notbeleuchtung",
          name: "Notbeleuchtung",
          icon: "💡",
          bereiche: [
            { id: "notbel_th01",     name: "Treppenhaus 01",    liste: "notbeleuchtung" },
            { id: "notbel_th05",     name: "Treppenhaus 05",    liste: "notbeleuchtung" },
            { id: "notbel_anliefeg", name: "Anlieferzone EG",   liste: "notbeleuchtung" },
            { id: "notbel_keller",   name: "Kellerbereich",     liste: "notbeleuchtung" },
            { id: "notbel_eingang",  name: "Eingang",           liste: "notbeleuchtung" },
          ]
        },
        {
          id: "leitern",
          name: "Leitern",
          icon: "🪜",
          bereiche: [
            { id: "leiter_01", name: "Leiter 01", liste: "leiterkontrolle" },
            { id: "leiter_02", name: "Leiter 02", liste: "leiterkontrolle" },
            { id: "leiter_03", name: "Leiter 03", liste: "leiterkontrolle" },
            { id: "leiter_04", name: "Leiter 04", liste: "leiterkontrolle" },
            { id: "leiter_05", name: "Leiter 05", liste: "leiterkontrolle" },
            { id: "leiter_06", name: "Leiter 06", liste: "leiterkontrolle" },
            { id: "leiter_07", name: "Leiter 07", liste: "leiterkontrolle" },
            { id: "leiter_08", name: "Leiter 08", liste: "leiterkontrolle" },
            { id: "leiter_09", name: "Leiter 09", liste: "leiterkontrolle" },
            { id: "leiter_10", name: "Leiter 10", liste: "leiterkontrolle" },
            { id: "leiter_11", name: "Leiter 11", liste: "leiterkontrolle" },
            { id: "leiter_12", name: "Leiter 12", liste: "leiterkontrolle" },
            { id: "leiter_13", name: "Leiter 13", liste: "leiterkontrolle" },
            { id: "leiter_14", name: "Leiter 14", liste: "leiterkontrolle" },
            { id: "leiter_15", name: "Leiter 15", liste: "leiterkontrolle" },
            { id: "leiter_16", name: "Leiter 16", liste: "leiterkontrolle" },
            { id: "leiter_17", name: "Leiter 17", liste: "leiterkontrolle" },
            { id: "leiter_18", name: "Leiter 18", liste: "leiterkontrolle" },
            { id: "leiter_19", name: "Leiter 19", liste: "leiterkontrolle" },
            { id: "leiter_20", name: "Leiter 20", liste: "leiterkontrolle" },
          ]
        },
      ]
    },
    // ===== GFU: Gefährdungsbeurteilungen =====
    {
      id: "gfu",
      name: "Gefährdungsbeurteilungen",
      gruppen: [
        {
          id: "gfu_szp",
          name: "SZP – Seil-Zugangs-Technik",
          icon: "🧗",
          bereiche: [
            { id: "gfb_szp_neu", name: "Neue GFB erstellen", liste: "gfb_szp" },
          ]
        },
        {
          id: "gfu_glas",
          name: "Glasreinigung",
          icon: "🪟",
          bereiche: [
            { id: "gfb_glas_neu", name: "Neue GFB erstellen", liste: "gfb_glasreinigung" },
          ]
        },
      ]
    },

    // Weiterer Standort: { id: "...", name: "...", gruppen: [...] }
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
    },

    leiterkontrolle: {
      titel: "Leiterkontrolle",
      untertitel: "Regelmäßige Sicht- und Funktionskontrolle gemäß DGUV 208-016 (BGR 191)",
      intervall: "Monatlich",
      abschnitte: [
        {
          titel: "Holme / Schenkel",
          punkte: [
            { id: "l1", text: "Holme/Schenkel sind frei von Rissen, Verformungen und Korrosion." },
            { id: "l2", text: "Keine Kerben, Einschnitte oder sonstige Beschädigungen der Holme." },
          ]
        },
        {
          titel: "Sprossen / Stufen",
          punkte: [
            { id: "l3", text: "Alle Sprossen/Stufen vorhanden, keine fehlenden oder gebrochenen." },
            { id: "l4", text: "Sprossen/Stufen fest verankert, kein Wackeln oder Drehen." },
            { id: "l5", text: "Trittflächen frei von Verunreinigungen (Öl, Farbe, Fett, Eis)." },
          ]
        },
        {
          titel: "Befestigungen & Verbindungen",
          punkte: [
            { id: "l6", text: "Schrauben und Bolzen vollständig vorhanden und fest angezogen." },
            { id: "l7", text: "Gelenke zwischen Vorder- und Rückseite (Anlege-/Stehleiter) einwandfrei." },
            { id: "l8", text: "Spreizesicherungen und Eckaussteifungen funktionsfähig." },
          ]
        },
        {
          titel: "Sicherheitseinrichtungen",
          punkte: [
            { id: "l9",  text: "Leiterfüße vorhanden und nicht abgenutzt (rutschsicherer Stand)." },
            { id: "l10", text: "Führungsbügel und Klappen (falls vorhanden) einwandfrei." },
            { id: "l11", text: "Verriegelungsschnapper (Stehleiter) rasten sicher ein." },
            { id: "l12", text: "Sicherheitskennzeichnung (Inventar-Nr., Typenschild) lesbar vorhanden." },
          ]
        },
        {
          titel: "Gesamtzustand & Ergebnis",
          punkte: [
            { id: "l13", text: "Leiter insgesamt verwendungsfähig — keine Mängel erkennbar." },
          ]
        }
      ]
    },

    // Neue Liste hinzufügen: { titel: "...", abschnitte: [...] }

    // ===== GFB SZP: Gefährdungsbeurteilung Seil-Zugangs-Technik =====
    gfb_szp: {
      titel: "Gefährdungsbeurteilung SZP",
      untertitel: "Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA",
      intervall: "Je Einsatz",
      abschnitte: [
        {
          titel: "1  Mechanische Gefährdungen",
          punkte: [
            { id: "szp_1_1", text: "1.1 Ungeschützt bewegte Maschinenteile — Im Arbeitsbereich sichern." },
            { id: "szp_1_2", text: "1.2 Teile mit gefährlichen Oberflächen (Kanten, Spitzen) — Kanten und rutschige Flächen: geeignete Schutzhandschuhe, Sicherheitsschuhe S3." },
            { id: "szp_1_3", text: "1.3 Bewegte Transportmittel / Arbeitsmittel — Im Arbeitsbereich sichern." },
            { id: "szp_1_4", text: "1.4 Unkontrolliert bewegte Teile — Im Arbeitsbereich sichern." },
            { id: "szp_1_5", text: "1.5 Sturz, Ausrutschen, Stolpern, Umknicken — PSAgA im Gefahrenbereich tragen; Arbeitsbereich sichern." },
            { id: "szp_1_6", text: "1.6 Absturz (Höhenarbeiten mit SZP) — Sicherung durch PSAgA (Gurt, Trag- und Sicherungsseil); Gurtpflicht ab 3 m vor Absturzkante." },
            { id: "szp_1_7", text: "1.7 Weitere mechanische Gefährdungen" },
          ]
        },
        {
          titel: "2  Elektrische Gefährdungen",
          punkte: [
            { id: "szp_2_1", text: "2.1 Elektrischer Schlag / Stromschlag — Freischalten durch Fachkraft. Gegen Wiedereinschalten sichern." },
            { id: "szp_2_2", text: "2.2 Lichtbögen — Freischalten durch Fachkraft. Gegen Wiedereinschalten sichern." },
            { id: "szp_2_3", text: "2.3 Elektrostatische Aufladungen — Ableiten laut Vorgabe Arbeitsplatz-System." },
            { id: "szp_2_4", text: "2.4 Weitere elektrische Gefährdungen" },
          ]
        },
        {
          titel: "3  Gefahrstoffe",
          punkte: [
            { id: "szp_3_1", text: "3.1 Hautkontakt mit Gefahrstoffen — Schutzkleidung anpassen und tragen (ggf. Einweganzug + Maske)." },
            { id: "szp_3_2", text: "3.2 Einatmen von Gefahrstoffen — Schutzmasken entsprechend der Gefahrenklasse, Rücksprache mit AG." },
            { id: "szp_3_3", text: "3.3 Verschlucken — Siehe DIN Sicherheitsdatenblatt-Betriebsanweisung." },
            { id: "szp_3_4", text: "3.4 Brand- / Explosionsgefahr durch Gefahrstoffe — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
            { id: "szp_3_5", text: "3.5 Weitere Gefährdungen durch Gefahrstoffe" },
          ]
        },
        {
          titel: "4  Biologische Arbeitsstoffe",
          punkte: [
            { id: "szp_4_1", text: "4.1 Infektionsgefahr — Einhaltung der aktuellen Hygiene- und Schutzvorschriften." },
            { id: "szp_4_2", text: "4.2 Toxische Wirkungen von Biostoffen — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
            { id: "szp_4_3", text: "4.3 Weitere Gefährdungen durch biologische Stoffe — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
          ]
        },
        {
          titel: "5  Brand- und Explosionsgefährdungen",
          punkte: [
            { id: "szp_5_1", text: "5.1 Brennbare Stoffe / Materialien — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
            { id: "szp_5_2", text: "5.2 Explosionsfähige Atmosphäre — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
            { id: "szp_5_3", text: "5.3 Explosivstoffe — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
            { id: "szp_5_4", text: "5.4 Weitere Gefährdungen — Klärung und Abstimmung mit Ansprechpartner vor Ort. Schutzmaßnahmen laut AG." },
          ]
        },
        {
          titel: "6  Thermische Gefährdungen",
          punkte: [
            { id: "szp_6_1", text: "6.1 Heiße Medien / Oberflächen — Körper und Materialschutz (Information vom AG welche Bereiche)." },
            { id: "szp_6_2", text: "6.2 Kalte Medien / Oberflächen — Körper und Materialschutz (Information vom AG welche Bereiche)." },
            { id: "szp_6_3", text: "6.3 Weitere thermische Gefährdungen" },
          ]
        },
        {
          titel: "7  Physikalische Einwirkungen",
          punkte: [
            { id: "szp_7_1", text: "7.1 Lärm — Hörschutz tragen." },
            { id: "szp_7_2", text: "7.2 Ultraschall — Vorgabe Hersteller beachten." },
            { id: "szp_7_3", text: "7.3 Ganzkörper-Vibration — Vorgabe Hersteller beachten." },
            { id: "szp_7_4", text: "7.4 Hand-Arm-Vibration — Vorgabe Hersteller beachten." },
            { id: "szp_7_5", text: "7.5 Nicht ionisierende Strahlung (UV, Laser) — Schutzbrille tragen." },
            { id: "szp_7_6", text: "7.6 Ionisierende Strahlung — Laut Vorgabe Auftraggeber Schutzmaßnahmen." },
            { id: "szp_7_7", text: "7.7 Weitere physikalische Einwirkungen" },
          ]
        },
        {
          titel: "8  Arbeitsumgebungsbedingungen",
          punkte: [
            { id: "szp_8_1", text: "8.1 Hitze, Kälte, unzureichende Lüftung — Ausreichend trinken, witterungsgerechte Kleidung, Pausenregelung einhalten." },
            { id: "szp_8_2", text: "8.2 Beleuchtung / Sichtverhältnisse — Abstimmung mit Ansprechpartner; ggf. zusätzliche Beleuchtung." },
            { id: "szp_8_3", text: "8.3 Ersticken (Atmosph.), Ertrinken — Freimessen des Bereiches, Messgerät tragen im Arbeitsbereich, Schutzmaske." },
            { id: "szp_8_4", text: "8.4 Flucht- und Verkehrswege — Laut Objektpläne." },
            { id: "szp_8_5", text: "8.5 Pausen- / Sanitärräume" },
            { id: "szp_8_6", text: "8.6 Weitere Gefährdungen (eingeschränkter Zugang) — PSAgA einsetzen; Ankerpunkte vorab prüfen." },
          ]
        },
        {
          titel: "9  Physische Belastungen",
          punkte: [
            { id: "szp_9_1", text: "9.1 Heben und Tragen schwerer Lasten — Hebehilfen je Situation berücksichtigen und einplanen." },
            { id: "szp_9_2", text: "9.2 Einseitige Körperbewegungen / Haltungsarbeit — Pausenregelung beachten; ggf. Ausgleichsübungen." },
            { id: "szp_9_3", text: "9.3 Zwangshaltungen — Körperhaltung wechseln und lockern." },
            { id: "szp_9_4", text: "9.4 Statische und dynamische Arbeit — Rotierende Arbeitsplätze." },
            { id: "szp_9_5", text: "9.5 Weitere physische Belastungen" },
          ]
        },
        {
          titel: "10  Psychische Belastungen",
          punkte: [
            { id: "szp_10_1", text: "10.1 Unzureichend gestaltete Arbeitsaufgabe — Prozessabläufe besprechen." },
            { id: "szp_10_2", text: "10.2 Arbeit unter hohem Zeitdruck — Zeitplanung überarbeiten und anpassen der Situation." },
            { id: "szp_10_3", text: "10.3 Erschwerte soziale Kontakte / Isolation — Teameinsatz statt Einzelarbeitsplatz, gemeinsame Pausenregelung." },
            { id: "szp_10_4", text: "10.4 Ungünstige Arbeitsbedingungen — Teilweise in gebückter Haltung; regelmäßige Pausen einhalten." },
            { id: "szp_10_5", text: "10.5 Weitere psychische Belastungen" },
          ]
        },
        {
          titel: "11  Sonstige Gefährdungen",
          punkte: [
            { id: "szp_11_1", text: "11.1 Zutritt Dritter / unbefugter Personen — Arbeitsbereich durch Absperrband und Hinweisschilder sichern." },
            { id: "szp_11_2", text: "11.2 Tiere (Bisse, Stiche) — Entsprechende Mittel bereithalten (Medikamente), Arbeiten einstellen, PSA bereithalten." },
            { id: "szp_11_3", text: "11.3 Pflanzen — Auf Gefahrenpotential prüfen und vor Körperkontakt schützen." },
            { id: "szp_11_4", text: "11.4 Weitere Gefährdungen (Ankerpunkte) — Ankerpunkte vor Gebrauch Sichtprüfung durchführen." },
          ]
        },
        {
          titel: "Notfall & Rettung — Freigabe",
          punkte: [
            { id: "szp_nf_1", text: "Notfallplan bekannt: Rettung grundsätzlich nach UNTEN zum Boden (Hängetrauma-Risiko < 15 Min.)." },
            { id: "szp_nf_2", text: "Notruf 112 bekannt. Nächsten Arzt / Krankenhaus notiert." },
            { id: "szp_nf_3", text: "Erste-Hilfe-Material am Einsatzort vorhanden." },
            { id: "szp_nf_4", text: "Buddy-Check durchgeführt: Gurt, Knoten, Geräte gegenseitig geprüft." },
            { id: "szp_nf_5", text: "Ankerpunkte Sichtprüfung durchgeführt (mind. 12 kN / 1.200 kg)." },
            { id: "szp_nf_6", text: "Trag- und Sicherungsseil an je 2 unabhängigen Ankerpunkten angeschlagen." },
            { id: "szp_nf_7", text: "Arbeitsbereich abgesperrt (Absperrband + Hinweisschilder)." },
            { id: "szp_nf_8", text: "Werkzeuge gegen Herunterfallen gesichert (Lanyards, Werkzeugpouches)." },
          ]
        },
      ]
    },

    // ===== GFB Glasreinigung =====
    gfb_glasreinigung: {
      titel: "Gefährdungsbeurteilung Glasreinigung",
      untertitel: "Glasreinigung / Fassadenreinigung gemäß ArbSchG § 5",
      intervall: "Je Einsatz",
      abschnitte: [
        {
          titel: "1 – Mechanische Gefährdungen",
          punkte: [
            { id: "glas_1_1", text: "1.1 Absturzgefahr — PSAgA tragen; Gurtpflicht ab 3 m vor Absturzkante." },
            { id: "glas_1_2", text: "1.2 Rutsch- und Stolpergefahr (nasse Flächen) — Geeignetes Schuhwerk, Arbeitsbereich sichern." },
            { id: "glas_1_3", text: "1.3 Glasbruch / scharfe Kanten — Schutzhandschuhe tragen." },
            { id: "glas_1_4", text: "1.4 Herunterfallende Gegenstände / Werkzeuge — Lanyards verwenden; Bereich absperren." },
          ]
        },
        {
          titel: "2 – Gefahrstoffe / Reinigungsmittel",
          punkte: [
            { id: "glas_2_1", text: "2.1 Hautkontakt mit Reinigungsmitteln — Chemikalienschutzhandschuhe tragen." },
            { id: "glas_2_2", text: "2.2 Einatmen von Reinigungsmitteldämpfen — Für ausreichend Belüftung sorgen." },
            { id: "glas_2_3", text: "2.3 Augenkontakt mit Reinigungsmitteln — Schutzbrille tragen." },
            { id: "glas_2_4", text: "2.4 Sicherheitsdatenblätter der verwendeten Reinigungsmittel bekannt und vorhanden." },
          ]
        },
        {
          titel: "3 – Elektrische Gefährdungen",
          punkte: [
            { id: "glas_3_1", text: "3.1 Elektrische Anlagen / Steckdosen im Nassbereich — Abstand halten; ggf. abkleben." },
            { id: "glas_3_2", text: "3.2 Elektrisch betriebene Reinigungsgeräte (Wasser) — Nur für Nassbereich geeignete Geräte verwenden." },
          ]
        },
        {
          titel: "4 – Arbeitsumgebung",
          punkte: [
            { id: "glas_4_1", text: "4.1 Hitze / UV-Belastung bei Außenarbeiten — Sonnenschutz, ausreichend trinken, Pausen." },
            { id: "glas_4_2", text: "4.2 Kälte / Eis / Glätte — Witterungsgerechte Kleidung; ggf. Arbeitsunterbrechung." },
            { id: "glas_4_3", text: "4.3 Lärm (Maschinen) — Hörschutz tragen bei maschineller Reinigung." },
            { id: "glas_4_4", text: "4.4 Sichtverhältnisse / Blendung — Sonnenblende / Schutzbrille." },
          ]
        },
        {
          titel: "5 – Physische Belastungen",
          punkte: [
            { id: "glas_5_1", text: "5.1 Überkopfarbeiten / Zwangshaltungen — Regelmäßige Pausen; Haltungswechsel." },
            { id: "glas_5_2", text: "5.2 Heben und Tragen von Ausrüstung / Leitern — Rückengerechtes Heben, ggf. zweite Person." },
            { id: "glas_5_3", text: "5.3 Wiederholende Bewegungen — Pausen einhalten; Ausgleichsübungen." },
          ]
        },
        {
          titel: "6 – Verkehr & Dritte",
          punkte: [
            { id: "glas_6_1", text: "6.1 Fußgänger / Fahrzeuge im Bereich — Arbeitsbereich absperren (Absperrband + Schilder)." },
            { id: "glas_6_2", text: "6.2 Unbefugter Zutritt zum Arbeitsbereich — Bereich kennzeichnen und überwachen." },
          ]
        },
        {
          titel: "7 – Freigabe & Kontrolle",
          punkte: [
            { id: "glas_7_1", text: "PSAgA vollständig und geprüft (Sachkundigenprüfung aktuell)." },
            { id: "glas_7_2", text: "Leitern / Arbeitsmittel auf Betriebssicherheit geprüft." },
            { id: "glas_7_3", text: "Reinigungsmittel korrekt etikettiert und sicher gelagert." },
            { id: "glas_7_4", text: "Erste-Hilfe-Material am Einsatzort vorhanden." },
            { id: "glas_7_5", text: "Alle Mitarbeiter über Gefährdungen unterwiesen (Unterweisungsnachweis vorhanden)." },
            { id: "glas_7_6", text: "Arbeitsbereich nach Abschluss gesichert und geräumt." },
          ]
        },
      ]
    },


  }
};
