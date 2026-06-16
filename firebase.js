// ============================================================
//  CSC Prüf-App — Firebase / Firestore Integration
//  Fristenüberwachung + Ampel + Mängel-Tracking
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, limit, updateDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCvyN25-m4LQI4Sdr7B8B4gMeTfqTPPjq0",
  authDomain:        "csc-pruef-app.firebaseapp.com",
  projectId:         "csc-pruef-app",
  storageBucket:     "csc-pruef-app.firebasestorage.app",
  messagingSenderId: "868967629513",
  appId:             "1:868967629513:web:d6a5cda0d19685aa200318"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ============================================================
//  Prüf-Intervalle (Tage) je Listentyp
// ============================================================
const INTERVALLE = {
  aufzug:           30,
  brandschutztuer:  30,
  notbeleuchtung:   30,
  leiterkontrolle: 365,
  gfb_szp:         365,
  gfb_glasreinigung:365,
};

// ============================================================
//  Prüfung in Firestore speichern
//  Wird nach erfolgreichem Drive-Upload aufgerufen
// ============================================================
window.fbSavePruefung = async function({
  bereichId, standortId, standortName, bereichName, listentyp,
  pruefer, datum, hatMaengel, maengelText, driveFileId
}) {
  try {
    const now = new Date();
    // Letzte Prüfung pro Bereich (überschreibt sich selbst → immer aktuell)
    const letzteRef = doc(db, 'letztePruefung', bereichId);
    await setDoc(letzteRef, {
      bereichId, standortId, standortName, bereichName, listentyp,
      pruefer, datum: datum.toISOString(), timestamp: serverTimestamp(),
      driveFileId: driveFileId || null
    });

    // Prüfungs-Verlauf (History-Eintrag mit eindeutigem Timestamp-Key)
    const histKey   = `${bereichId}_${now.getTime()}`;
    const histRef   = doc(db, 'pruefHistory', histKey);
    await setDoc(histRef, {
      bereichId, standortId, bereichName, listentyp,
      pruefer, datum: datum.toISOString(),
      hatMaengel: !!hatMaengel,
      maengelText: maengelText || '',
      driveFileId: driveFileId || null,
      timestamp: serverTimestamp()
    });

    // Wenn Mängel → offenen Mangel anlegen
    if (hatMaengel && maengelText) {
      const mangelRef = doc(db, 'maengel', histKey);
      await setDoc(mangelRef, {
        bereichId, standortId, bereichName, listentyp,
        pruefer, datum: datum.toISOString(),
        beschreibung: maengelText,
        status: 'offen',   // 'offen' | 'erledigt'
        erledigtAm: null,
        timestamp: serverTimestamp()
      });
    }

    console.log('[Firebase] Prüfung gespeichert:', bereichId);
  } catch (e) {
    console.warn('[Firebase] Speichern fehlgeschlagen:', e.message);
    // Kein harter Fehler — App läuft weiter
  }
};

// ============================================================
//  Ampelstatus für einen Bereich berechnen
//  Gibt zurück: 'gruen' | 'gelb' | 'rot' | 'unbekannt'
// ============================================================
window.fbGetAmpel = async function(bereichId, listentyp) {
  try {
    const ref  = doc(db, 'letztePruefung', bereichId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 'unbekannt';

    const data     = snap.data();
    const letztes  = new Date(data.datum);
    const intervall= INTERVALLE[listentyp] || 30;
    const faelligAm= new Date(letztes.getTime() + intervall * 86400000);
    const heute    = new Date();
    const restTage = Math.floor((faelligAm - heute) / 86400000);

    if (restTage < 0)  return 'rot';
    if (restTage <= 7) return 'gelb';
    return 'gruen';
  } catch (e) {
    return 'unbekannt';
  }
};

// ============================================================
//  Ampel für alle Bereiche eines Standorts laden
//  Gibt zurück: { bereichId: 'gruen'|'gelb'|'rot'|'unbekannt', ... }
// ============================================================
window.fbGetAmpelAlle = async function(bereiche) {
  const result = {};
  await Promise.all(bereiche.map(async b => {
    result[b.id] = await window.fbGetAmpel(b.id, b.liste);
  }));
  return result;
};

// ============================================================
//  Ampel für alle Leitern (dynamische bereichIds leiter_*)
//  Lädt alle Dokumente aus letztePruefung die mit 'leiter_' beginnen
// ============================================================
window.fbGetAmpelLeitern = async function() {
  try {
    const snap = await getDocs(collection(db, 'letztePruefung'));
    const results = {};
    snap.docs.forEach(d => {
      if (d.id.startsWith('leiter_')) {
        results[d.id] = d.data();
      }
    });
    // Ampelstatus berechnen
    const ampeln = {};
    Object.entries(results).forEach(([id, data]) => {
      const letztes   = new Date(data.datum);
      const intervall = INTERVALLE['leiterkontrolle'] || 365;
      const faelligAm = new Date(letztes.getTime() + intervall * 86400000);
      const restTage  = Math.floor((faelligAm - new Date()) / 86400000);
      if (restTage < 0)  ampeln[id] = 'rot';
      else if (restTage <= 7) ampeln[id] = 'gelb';
      else ampeln[id] = 'gruen';
    });
    return ampeln; // leer = noch keine Prüfungen
  } catch (e) {
    return {};
  }
};

// ============================================================
//  Alle Leitern-Daten mit Datum, Prüfer, Fälligkeit
//  Gibt zurück: Array von { id, leiterNr, bereichName, datum,
//               pruefer, faelligAm, restTage, ampel }
// ============================================================
window.fbGetAlleLeiternDaten = async function() {
  try {
    const snap = await getDocs(collection(db, 'letztePruefung'));
    const liste = [];
    const intervall = INTERVALLE['leiterkontrolle'] || 365;
    snap.docs.forEach(d => {
      if (!d.id.startsWith('leiter_')) return;
      const data = d.data();
      const letztes   = new Date(data.datum);
      const faelligAm = new Date(letztes.getTime() + intervall * 86400000);
      const restTage  = Math.floor((faelligAm - new Date()) / 86400000);
      let ampel = 'gruen';
      if (restTage < 0)       ampel = 'rot';
      else if (restTage <= 60) ampel = 'gelb';
      // Leiter-Nr aus ID extrahieren (leiter_L-01 → L-01)
      const leiterNr = d.id.replace(/^leiter_/, '');
      liste.push({
        id: d.id,
        leiterNr,
        bereichName: data.bereichName || leiterNr,
        datum: data.datum,
        pruefer: data.pruefer || '',
        faelligAm: faelligAm.toISOString(),
        restTage,
        ampel
      });
    });
    // Sortieren: rot → gelb → grün, dann nach Fälligkeit
    liste.sort((a, b) => {
      const prio = { rot: 0, gelb: 1, gruen: 2 };
      if (prio[a.ampel] !== prio[b.ampel]) return prio[a.ampel] - prio[b.ampel];
      return a.restTage - b.restTage;
    });
    return liste;
  } catch (e) {
    console.warn('[Firebase] fbGetAlleLeiternDaten fehlgeschlagen:', e.message);
    return [];
  }
};

// ============================================================
//  Letzte Prüfung eines Bereichs abrufen
// ============================================================
window.fbGetLetztePruefung = async function(bereichId) {
  try {
    const ref  = doc(db, 'letztePruefung', bereichId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
};

// ============================================================
//  Alle offenen Mängel laden
// ============================================================
window.fbGetOffeneMaengel = async function() {
  try {
    const q    = query(collection(db, 'maengel'), where('status', '==', 'offen'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[Firebase] Mängel laden fehlgeschlagen:', e.message);
    return [];
  }
};

// ============================================================
//  Mangel als erledigt markieren
// ============================================================
window.fbMangelErledigt = async function(mangelId) {
  try {
    const ref = doc(db, 'maengel', mangelId);
    await updateDoc(ref, {
      status: 'erledigt',
      erledigtAm: new Date().toISOString()
    });
    return true;
  } catch (e) {
    console.warn('[Firebase] Mangel-Update fehlgeschlagen:', e.message);
    return false;
  }
};

// ============================================================
//  Prüfhistorie für Leitern laden (alle pruefHistory-Einträge
//  die mit leiter_ beginnen), sortiert nach Datum absteigend
// ============================================================
window.fbGetHistorieLeitern = async function() {
  try {
    const snap = await getDocs(collection(db, 'pruefHistory'));
    const liste = [];
    snap.docs.forEach(d => {
      if (!d.id.startsWith('leiter_')) return;
      const data = d.data();
      liste.push({
        id: d.id,
        bereichId:   data.bereichId   || d.id,
        bereichName: data.bereichName || d.id,
        listentyp:   data.listentyp   || 'leiterkontrolle',
        pruefer:     data.pruefer     || '',
        datum:       data.datum       || '',
        hatMaengel:  !!data.hatMaengel,
        maengelText: data.maengelText || '',
        driveFileId: data.driveFileId || null,
        // Leiter-Nr aus bereichId extrahieren (leiter_L-01 → L-01)
        leiterNr: (data.bereichId || d.id).replace(/^leiter_/, '')
      });
    });
    // Neueste zuerst
    liste.sort((a, b) => new Date(b.datum) - new Date(a.datum));
    return liste;
  } catch (e) {
    console.warn('[Firebase] fbGetHistorieLeitern fehlgeschlagen:', e.message);
    return [];
  }
};

// ============================================================
//  Hilfsfunktion: Tage bis zur nächsten Prüfung
// ============================================================
window.fbRestTage = function(datumISO, listentyp) {
  const letztes   = new Date(datumISO);
  const intervall = INTERVALLE[listentyp] || 30;
  const faelligAm = new Date(letztes.getTime() + intervall * 86400000);
  return Math.floor((faelligAm - new Date()) / 86400000);
};
