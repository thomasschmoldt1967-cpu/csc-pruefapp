// ============================================================
//  CSC Prüf-App — Firebase / Firestore Integration
//  Fristenüberwachung + Ampel + Mängel-Tracking
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, orderBy, limit, updateDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

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
const auth  = getAuth(fbApp);

// ============================================================
//  Auth-Ready Promise — wartet bis Firebase Auth-State bekannt
//  (verhindert PERMISSION_DENIED bei Firestore-Reads kurz nach
//  dem App-Start bevor onAuthStateChanged feuert)
// ============================================================
const authReady = new Promise(resolve => {
  const unsubscribe = onAuthStateChanged(auth, user => {
    unsubscribe();
    resolve(user);
  });
});

// ============================================================
//  Prüf-Intervalle (Tage) je Listentyp
// ============================================================
const INTERVALLE = {
  aufzug:           7,    // wöchentlich (donnerstags)
  brandschutztuer:  7,    // wöchentlich
  notbeleuchtung:   7,    // wöchentlich
  leiterkontrolle: 365,   // jährlich
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
    await authReady;
    const ref  = doc(db, 'letztePruefung', bereichId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 'unbekannt';

    const data     = snap.data();
    const letztes  = new Date(data.datum);
    const intervall= INTERVALLE[listentyp] || 30;
    const faelligAm= new Date(letztes.getTime() + intervall * 86400000);
    const heute    = new Date(); heute.setHours(0,0,0,0); faelligAm.setHours(0,0,0,0);
    const restTage = Math.floor((faelligAm - heute) / 86400000);

    if (restTage < 0)  return 'rot';
    if (restTage <= 3) return 'gelb';   // bei 7-Tage-Intervall: 3 Tage Vorwarnung
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
    await authReady;
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
      const faelligAm = new Date(letztes.getTime() + intervall * 86400000); faelligAm.setHours(0,0,0,0);
      const _h1 = new Date(); _h1.setHours(0,0,0,0);
      const restTage  = Math.floor((faelligAm - _h1) / 86400000);
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
    await authReady;
    const snap = await getDocs(collection(db, 'letztePruefung'));
    const liste = [];
    const intervall = INTERVALLE['leiterkontrolle'] || 365;
    snap.docs.forEach(d => {
      if (!d.id.startsWith('leiter_')) return;
      const data = d.data();
      const letztes   = new Date(data.datum);
      const faelligAm = new Date(letztes.getTime() + intervall * 86400000); faelligAm.setHours(0,0,0,0);
      const _h2 = new Date(); _h2.setHours(0,0,0,0);
      const restTage  = Math.floor((faelligAm - _h2) / 86400000);
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
    await authReady;
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
    await authReady;
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
//  Prüfhistorie für einen beliebigen Bereich laden
//  Gibt alle pruefHistory-Einträge für bereichId zurück,
//  neueste zuerst
// ============================================================
window.fbGetHistorieBereich = async function(bereichId) {
  try {
    await authReady;
    const snap = await getDocs(collection(db, 'pruefHistory'));
    const liste = [];
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.bereichId !== bereichId) return;
      liste.push({
        id: d.id,
        bereichId:   data.bereichId   || bereichId,
        bereichName: data.bereichName || bereichId,
        listentyp:   data.listentyp   || '',
        pruefer:     data.pruefer     || '',
        datum:       data.datum       || '',
        hatMaengel:  !!data.hatMaengel,
        maengelText: data.maengelText || '',
        driveFileId: data.driveFileId || null
      });
    });
    liste.sort((a, b) => new Date(b.datum) - new Date(a.datum));
    return liste;
  } catch (e) {
    console.warn('[Firebase] fbGetHistorieBereich fehlgeschlagen:', e.message);
    return [];
  }
};

// ============================================================
//  Prüfhistorie für Leitern laden (alle pruefHistory-Einträge
//  die mit leiter_ beginnen), sortiert nach Datum absteigend
// ============================================================
window.fbGetHistorieLeitern = async function() {
  try {
    await authReady;
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

// ============================================================
//  FEATURE 1: Editor-Anpassungen geräteübergreifend in Firestore
//  Speichert unter: editorAnpassungen/{email}
// ============================================================
window.fbEditorLade = async function(email) {
  if (!email) return {};
  try {
    const ref  = doc(db, 'editorAnpassungen', email.replace(/[@.]/g, '_'));
    const snap = await getDoc(ref);
    if (!snap.exists()) return {};
    return snap.data().anpassungen || {};
  } catch(e) {
    console.warn('[Firebase] Editor laden fehlgeschlagen:', e.message);
    return {};
  }
};

window.fbEditorSpeichere = async function(email, anpassungen) {
  if (!email) return;
  try {
    const ref = doc(db, 'editorAnpassungen', email.replace(/[@.]/g, '_'));
    await setDoc(ref, { email, anpassungen, geaendertAm: serverTimestamp() });
  } catch(e) {
    console.warn('[Firebase] Editor speichern fehlgeschlagen:', e.message);
  }
};

// ============================================================
//  FEATURE 9: Offline-Queue in Firestore speichern/laden
//  Speichert unter: offlineQueue/{email_timestamp}
// ============================================================
window.fbOfflineQueueAdd = async function(email, filename, dataUrl, folderId) {
  try {
    const key = `${email.replace(/[@.]/g,'_')}_${Date.now()}`;
    const ref = doc(db, 'offlineQueue', key);
    await setDoc(ref, { email, filename, dataUrl, folderId, ts: Date.now() });
  } catch(e) {
    console.warn('[Firebase] Offline-Queue (Firestore) speichern fehlgeschlagen:', e.message);
  }
};

window.fbOfflineQueueLade = async function(email) {
  try {
    const snap = await getDocs(collection(db, 'offlineQueue'));
    const result = [];
    snap.docs.forEach(d => {
      if (d.data().email === email) result.push({ id: d.id, ...d.data() });
    });
    return result.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  } catch(e) {
    return [];
  }
};

window.fbOfflineQueueDelete = async function(docId) {
  try {
    await deleteDoc(doc(db, 'offlineQueue', docId));
  } catch(e) {}
};

// ============================================================
//  FEATURE 10: Audit-Trail — PDF-Hash in Firestore speichern
//  Speichert unter: auditTrail/{bereichId_timestamp}
// ============================================================
window.fbSaveAuditHash = async function({ bereichId, listentyp, pruefer, datum, pdfHash, driveFileId }) {
  try {
    const key = `${bereichId}_${Date.now()}`;
    const ref = doc(db, 'auditTrail', key);
    await setDoc(ref, {
      bereichId, listentyp, pruefer,
      datum: datum.toISOString(),
      pdfHash,        // SHA-256 des PDFs — Manipulationsnachweis
      driveFileId: driveFileId || null,
      timestamp: serverTimestamp()
    });
  } catch(e) {
    console.warn('[Firebase] Audit-Trail speichern fehlgeschlagen:', e.message);
  }
};

// Alle fälligen / überfälligen Bereiche laden (für Fälligkeits-Übersicht)
window.fbGetFaelligkeitenUebersicht = async function() {
  try {
    await authReady;
    const snap = await getDocs(collection(db, 'letztePruefung'));
    const heute = new Date(); heute.setHours(0,0,0,0);
    const result = [];
    snap.docs.forEach(d => {
      const data = d.data();
      const intervall = INTERVALLE[data.listentyp] || 30;
      const letztes = new Date(data.datum);
      const faelligAm = new Date(letztes.getTime() + intervall * 86400000); faelligAm.setHours(0,0,0,0);
      const restTage  = Math.floor((faelligAm - heute) / 86400000);
      if (restTage <= 14) { // nächste 14 Tage anzeigen (2 Prüfzyklen bei wöchentlichen Intervallen)
        result.push({ bereichId: d.id, bereichName: data.bereichName, listentyp: data.listentyp, restTage, faelligAm: faelligAm.toISOString() });
      }
    });
    result.sort((a, b) => a.restTage - b.restTage);
    return result;
  } catch(e) {
    return [];
  }
};

// ============================================================
//  Alle Prüfprotokolle laden (für globale Protokoll-Übersicht)
//  Gibt alle pruefHistory-Einträge zurück, neueste zuerst
// ============================================================
window.fbGetAlleProtokolle = async function() {
  try {
    await authReady;
    const snap = await getDocs(collection(db, 'pruefHistory'));
    const liste = [];
    snap.docs.forEach(d => {
      const data = d.data();
      liste.push({
        id:          d.id,
        bereichId:   data.bereichId   || d.id,
        bereichName: data.bereichName || d.id,
        standortId:  data.standortId  || '',
        standortName:data.standortName|| '',
        listentyp:   data.listentyp   || '',
        pruefer:     data.pruefer     || '',
        datum:       data.datum       || '',
        hatMaengel:  !!data.hatMaengel,
        maengelText: data.maengelText || '',
        driveFileId: data.driveFileId || null
      });
    });
    liste.sort((a, b) => new Date(b.datum) - new Date(a.datum));
    return liste;
  } catch (e) {
    console.warn('[Firebase] fbGetAlleProtokolle fehlgeschlagen:', e.message);
    return [];
  }
};

// Alle offenen Mängel für Reminder-Cron laden
window.fbGetAlleOffeneMaengel = async function() {
  try {
    const q = query(collection(db, 'maengel'), where('status', '==', 'offen'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { return []; }
};

// ============================================================
//  Firebase Authentication
// ============================================================

// Login mit E-Mail + Passwort → gibt Firebase-User zurück
window.fbSignIn = async function(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
};

// Logout
window.fbSignOut = async function() {
  await signOut(auth);
};

// Auth-Status-Listener (ruft callback(user) auf bei Login/Logout)
window.fbOnAuthStateChanged = function(callback) {
  return onAuthStateChanged(auth, callback);
};

// Aktuellen User zurückgeben
window.fbCurrentUser = function() {
  return auth.currentUser;
};
