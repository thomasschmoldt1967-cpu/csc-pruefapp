/* ============================================================
   © 2024–2026 CSC GmbH, Petermax-Müller-Straße 3, 30880 Laatzen
   Alle Rechte vorbehalten. Geistiges Eigentum der CSC GmbH.
   Unbefugte Vervielfältigung, Weitergabe oder Nutzung dieses
   Codes — ganz oder in Teilen — ist ohne ausdrückliche schrift-
   liche Genehmigung der CSC GmbH streng untersagt und wird
   zivil- und strafrechtlich verfolgt (§§ 69a ff. UrhG).
   Unauthorized copying, distribution or use of this software
   is strictly prohibited and constitutes a copyright violation.
   ============================================================ */
/* ============================================================
   CSC Prüf-App — Hauptlogik
   ============================================================ */

// ===== LOGIN / AUTH =====
const CSC_USERS = [
  { name: 'Thomas Schmoldt',    email: 'thomas@csc-hannover.de',    sendTo: 'tschmoldt@csc-hannover.de',        hash: 'd5651848baa6169aa41a065d20fb0f5c2329acf84cb6544369a9b5e1d18323ef' },
  { name: 'Katharina Schmoldt', email: 'katharina@csc-hannover.de', sendTo: 'reinigung@csc-hannover.de',         hash: 'c9437b3ac9f18eaf498d5576175325b5fae93eb137a5774d59c276a39d3c604f' },
  { name: 'Fabian Romeike',     email: 'fabian@csc-hannover.de',    sendTo: 'glasreinigung@csc-hannover.de',     hash: 'eeb9f5bdc61ca39d968cab3e00d217a704418facfea9ad384302a8baa39b8bbd' },
  { name: 'Klaus Stark',        email: 'klaus@csc-hannover.de',     sendTo: 'tschmoldt@csc-hannover.de',        hash: '78b673ed23e33cde5e839668445f6bbde2a41046f9ce716d3236b3f44d652114' },
];
const SESSION_KEY   = 'csc_session';
const SESSION_HOURS = 24;

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pw    = document.getElementById('login-password').value;
  const err   = document.getElementById('login-fehler');
  err.style.display = 'none';

  if (!email || !pw) { err.textContent = '⚠️ Bitte E-Mail und Passwort eingeben.'; err.style.display = 'block'; return; }

  // Lokale Zuordnung (Name + sendTo) aus CSC_USERS
  const userMeta = CSC_USERS.find(u => u.email === email);
  if (!userMeta) {
    err.textContent = '❌ E-Mail oder Passwort falsch.';
    err.style.display = 'block';
    document.getElementById('login-password').value = '';
    return;
  }

  try {
    // Firebase Authentication
    await window.fbSignIn(email, pw);
  } catch(e) {
    err.textContent = '❌ E-Mail oder Passwort falsch.';
    err.style.display = 'block';
    document.getElementById('login-password').value = '';
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    name:    userMeta.name,
    email:   userMeta.email,
    sendTo:  userMeta.sendTo || userMeta.email,
    expires: Date.now() + SESSION_HOURS * 3600 * 1000
  }));

  showScreen('home');
  document.getElementById('home-user-name').textContent = userMeta.name;
  renderHome();
  cscShowLegalFooter(true);

  const params = new URLSearchParams(window.location.search);
  const bereichId = params.get('bereich');
  if (bereichId) openBereichById(bereichId);
  const geraetId = params.get('geraet');
  if (geraetId) showGeraeteScreen().then(() => geraetDetailAnzeigen(geraetId));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function checkSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s) return null;
    if (Date.now() > s.expires) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch(e) { return null; }
}

// DSGVO: localStorage-Bereinigung (Offline-Queue älter als 30 Tage)
(function dsgvoLocalStorageBereinigung() {
  try {
    const TAGE_30 = 30 * 24 * 60 * 60 * 1000;
    const jetzt = Date.now();
    // Offline-Queue: alte Einträge entfernen
    const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    const queueNeu = queue.filter(item => (jetzt - (item.ts || 0)) < TAGE_30);
    if (queueNeu.length < queue.length) {
      localStorage.setItem('offline_queue', JSON.stringify(queueNeu));
      console.log(`[DSGVO] ${queue.length - queueNeu.length} alte Queue-Einträge gelöscht`);
    }
    // Session prüfen
    const s = JSON.parse(localStorage.getItem('csc_session') || 'null');
    if (s && Date.now() > s.expires) localStorage.removeItem('csc_session');
  } catch(e) { console.warn('[DSGVO] Bereinigung fehlgeschlagen:', e); }
})();

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-fehler').style.display = 'none';
  if (window.fbSignOut) window.fbSignOut().catch(() => {});
  showScreen('login');
}

function togglePwVisible() {
  const inp = document.getElementById('login-password');
  const btn = document.getElementById('pw-toggle-btn');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

// ===== STATE =====
let currentStandort  = null;
let currentGruppe    = null;
let currentBereich   = null;
let currentListe     = null;
let pruefErgebnisse  = {};  // { punktId: 'ok' | 'nok' | null }
let qrScanner        = null;
let sigPad           = null;
let isDrawing        = false;
let lastX = 0, lastY = 0;
let fotoListe        = [];   // Array von { dataUrl, name }
let gfbMitarbeiter   = [];   // Array von { name, sigCanvas }
let lmraMitarbeiter  = [];   // Array von { name, sigCanvas } für LMRA

// ===== LEGAL / COOKIE-CONSENT =====
function cscCookieAkzeptieren() {
  localStorage.setItem('csc_cookie_consent', '1');
  document.getElementById('cookie-banner').style.display = 'none';
}

function cscPruefeCookieConsent() {
  if (!localStorage.getItem('csc_cookie_consent')) {
    document.getElementById('cookie-banner').style.display = 'block';
  }
}

function cscShowLegalFooter(show) {
  const f = document.getElementById('legal-footer');
  if (f) f.style.display = show ? 'flex' : 'none';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Cookie-Consent beim Start prüfen
  cscPruefeCookieConsent();

  // Service Worker registrieren
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // FEATURE 7: Push-Benachrichtigungen anfragen (nach Login)
      window._swReg = reg;
    }).catch(() => {});
  }

  // Session prüfen
  const session = checkSession();
  if (session) {
    // Bereits eingeloggt → direkt zur App
    showScreen('home');
    document.getElementById('home-user-name').textContent = session.name;
    renderHome();
    cscShowLegalFooter(true);
    // URL-Parameter: ?bereich=xxx (von QR-Code)
    const params = new URLSearchParams(window.location.search);
    const bereichId = params.get('bereich');
    if (bereichId) openBereichById(bereichId);
    // Push-Benachrichtigungen aktivieren
    initPushNotifications();
  } else {
    // Nicht eingeloggt → Login-Screen zeigen
    showScreen('login');
  }
});

// FEATURE 7: Push-Benachrichtigungen initialisieren
async function initPushNotifications() {
  if (!('Notification' in window) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') {
    await subscribePush();
  } else if (Notification.permission !== 'denied') {
    // Beim ersten Mal fragen (nur wenn App schon bekannt ist)
    const asked = localStorage.getItem('csc_push_asked');
    if (!asked) {
      localStorage.setItem('csc_push_asked', '1');
      const perm = await Notification.requestPermission();
      if (perm === 'granted') await subscribePush();
    }
  }
}

async function subscribePush() {
  try {
    if (!window._swReg) return;
    // VAPID Public Key (öffentlich, sicher im Frontend)
    const VAPID_PUBLIC = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBuyAtnNfm_oM3Z2V';
    const sub = await window._swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    });
    console.log('[Push] Abonniert:', sub.endpoint.slice(0, 50) + '...');
    // Subscription in localStorage für Cron-Job
    localStorage.setItem('csc_push_subscription', JSON.stringify(sub));
  } catch(e) {
    console.log('[Push] Kein Push verfügbar:', e.message);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Benachrichtigung lokal senden (ohne Server — direkt im Browser)
function sendLocalNotification(title, body) {
  if (Notification.permission === 'granted' && window._swReg) {
    window._swReg.showNotification(title, { body, icon: './logo.png', badge: './logo.png' });
  }
}

// ===== SCREEN MANAGEMENT =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  window.scrollTo(0, 0);
}

// ===== HOME RENDER =====
function renderHome() {
  const container = document.getElementById('standort-liste');
  container.innerHTML = '';

  APP_CONFIG.standorte.forEach(standort => {
    const card = document.createElement('div');
    card.className = 'standort-card';

    // Accordion-Status aus localStorage (Standard: eingeklappt)
    const storageKey = `accordion-${standort.id}`;
    let offen = localStorage.getItem(storageKey) !== 'zu';

    if (isTablet()) {
      // TABLET: Ausklappbarer Sidebar-Section-Header
      const header = document.createElement('div');
      header.className = 'sidebar-section-header sidebar-accordion-header';
      header.innerHTML = `
        <span>🏢 ${standort.name}</span>
        <span class="accordion-pfeil" id="pfeil-${standort.id}">${offen ? '▾' : '▸'}</span>
      `;
      card.appendChild(header);

      const gruppenContainer = document.createElement('div');
      gruppenContainer.id = `accordion-body-${standort.id}`;
      gruppenContainer.style.display = offen ? 'block' : 'none';

      const gruppen = standort.gruppen || [];
      gruppen.forEach(g => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.id = `sidebar-item-${standort.id}-${g.id}`;
        item.onclick = () => openGruppeDetail(standort.id, g.id);
        item.innerHTML = `
          <span class="si-icon">${g.icon || '📁'}</span>
          <span class="si-name">${g.name}</span>
          <span class="si-ampel ampel-unbekannt" id="ampel-gruppe-${standort.id}-${g.id}">⚪</span>
        `;
        gruppenContainer.appendChild(item);
        renderAmpelGruppe(standort.id, g);
      });
      card.appendChild(gruppenContainer);

      // Toggle-Funktion
      header.onclick = () => {
        offen = !offen;
        localStorage.setItem(storageKey, offen ? 'auf' : 'zu');
        gruppenContainer.style.display = offen ? 'block' : 'none';
        const pfeil = document.getElementById(`pfeil-${standort.id}`);
        if (pfeil) pfeil.textContent = offen ? '▾' : '▸';
      };

    } else {
      // MOBILE: Ausklappbares Kachel-Grid
      const header = document.createElement('div');
      header.className = 'standort-header standort-accordion-header';
      header.innerHTML = `
        <span>🏢 ${standort.name}</span>
        <span class="accordion-pfeil" id="pfeil-mob-${standort.id}">${offen ? '▾' : '▸'}</span>
      `;
      card.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'gruppen-kachel-grid';
      grid.id = `accordion-body-mob-${standort.id}`;
      grid.style.display = offen ? 'grid' : 'none';

      const gruppen = standort.gruppen || [];
      gruppen.forEach(g => {
        const kachel = document.createElement('div');
        kachel.className = 'gruppen-kachel';
        kachel.id = `home-gruppe-${standort.id}-${g.id}`;
        kachel.onclick = () => openGruppe(standort.id, g.id);
        kachel.innerHTML = `
          <div class="kachel-ampel ampel-unbekannt" id="ampel-gruppe-${standort.id}-${g.id}">⚪</div>
          <div class="kachel-icon">${g.icon || '📁'}</div>
          <div class="kachel-name">${g.name}</div>
        `;
        grid.appendChild(kachel);
        renderAmpelGruppe(standort.id, g);
      });
      card.appendChild(grid);

      header.onclick = () => {
        offen = !offen;
        localStorage.setItem(storageKey, offen ? 'auf' : 'zu');
        grid.style.display = offen ? 'grid' : 'none';
        const pfeil = document.getElementById(`pfeil-mob-${standort.id}`);
        if (pfeil) pfeil.textContent = offen ? '▾' : '▸';
      };
    }

    container.appendChild(card);
  });

  // Mängel-Button laden
  renderMaengelButton();
  // Dashboard Statistik laden
  renderDashboard();
  // Offline-Queue automatisch hochladen + Sync-Button aktualisieren
  offlineQueueFlush().catch(() => {});
  updateSyncButton();
  // Beim Home-Screen: rote Warnung wenn PDFs ausstehen
  checkOfflineQueueWarnung();

  // Admin-Button: nur für Thomas & Fabian sichtbar
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
  const adminEmails = ['thomas@csc-hannover.de', 'fabian@csc-hannover.de'];
  const adminBtn = document.getElementById('admin-editor-btn');
  if (adminBtn) adminBtn.style.display = adminEmails.includes(session.email) ? 'block' : 'none';
}

// Ampel-Aggregat für eine Gruppe (schlechtester Status aller Bereiche)
async function renderAmpelGruppe(standortId, gruppe) {
  if (typeof window.fbGetAmpelAlle !== 'function') return;
  const badge = document.getElementById(`ampel-gruppe-${standortId}-${gruppe.id}`);
  if (!badge) return;

  let vals;
  // Leitern: dynamische bereichIds aus Firestore laden
  if (gruppe.id === 'leitern' && typeof window.fbGetAmpelLeitern === 'function') {
    const ampeln = await window.fbGetAmpelLeitern();
    vals = Object.values(ampeln);
    if (vals.length === 0) vals = ['unbekannt'];
  } else {
    const ampeln = await window.fbGetAmpelAlle(gruppe.bereiche);
    vals = Object.values(ampeln);
  }

  let status = 'unbekannt';
  if (vals.includes('rot'))        status = 'rot';
  else if (vals.includes('gelb'))  status = 'gelb';
  else if (vals.includes('gruen')) status = 'gruen';
  const label = { rot: '🔴', gelb: '🟡', gruen: '🟢', unbekannt: '⚪' };
  badge.textContent  = label[status] || '⚪';
  badge.className    = `ampel-badge ampel-${status}`;
}

// Mängel-Button im Home-Screen
async function renderMaengelButton() {
  const existing = document.getElementById('maengel-btn-container');
  if (existing) existing.remove();
  if (typeof window.fbGetOffeneMaengel !== 'function') return;
  const maengel = await window.fbGetOffeneMaengel();
  if (maengel.length === 0) return;
  const container = document.getElementById('standort-liste');
  const btn = document.createElement('div');
  btn.id = 'maengel-btn-container';
  btn.innerHTML = `
    <button class="btn-maengel" onclick="showMaengelScreen()">
      ⚠️ ${maengel.length} offene Mängel ansehen
    </button>
  `;
  container.insertBefore(btn, container.firstChild);
}

function iconClass(liste) {
  const map = { aufzug: 'icon-aufzug', brandschutztuer: 'icon-brandschutz', notbeleuchtung: 'icon-notbel', leiterkontrolle: 'icon-leiter', gfb_szp: 'icon-gruppe', gfb_glasreinigung: 'icon-gruppe', fusswegreinigung: 'icon-notbel', lmra_hubarbeitsbuehne: 'icon-gruppe' };
  return map[liste] || 'icon-default';
}
function listeIcon(liste) {
  const map = { aufzug: '🛗', brandschutztuer: '🚪', notbeleuchtung: '💡', leiterkontrolle: '🪜', gfb_szp: '🧗', gfb_glasreinigung: '🪟', fusswegreinigung: '🧹', lmra_hubarbeitsbuehne: '🏗️' };
  return map[liste] || '📋';
}
function listeTitel(listeId) {
  return APP_CONFIG.listen[listeId]?.titel || listeId;
}

// Erkennung ob Tablet-Layout aktiv ist
function isTablet() {
  return window.innerWidth >= 768;
}

// Detail-Panel auf Tablet befüllen (Bereiche einer Gruppe als Kacheln)
function openGruppeDetail(standortId, gruppeId) {
  const standort = APP_CONFIG.standorte.find(s => s.id === standortId);
  const gruppe   = standort?.gruppen?.find(g => g.id === gruppeId);
  if (!gruppe) return;
  currentStandort = standort;
  currentGruppe   = gruppe;

  // Sidebar: aktives Item markieren
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('aktiv'));
  const aktiv = document.getElementById(`sidebar-item-${standortId}-${gruppeId}`);
  if (aktiv) aktiv.classList.add('aktiv');

  // Detail-Panel befüllen
  const placeholder = document.getElementById('detail-placeholder');
  const content     = document.getElementById('detail-content');
  if (placeholder) placeholder.style.display = 'none';
  if (!content) return;
  content.style.display = 'block';

  content.innerHTML = `
    <div class="detail-panel-title">
      <span>${gruppe.icon || '📁'}</span>
      <span>${gruppe.name}</span>
    </div>
    <div class="detail-bereich-grid" id="detail-bereich-grid"></div>
  `;
  const grid = document.getElementById('detail-bereich-grid');

  // Nur ein Bereich → direkt öffnen, keine Zwischenkachel
  if (gruppe.bereiche.length === 1) {
    openBereich(standortId, gruppeId, gruppe.bereiche[0].id);
    return;
  }

  gruppe.bereiche.forEach(b => {
    const kachel = document.createElement('div');
    kachel.className = 'detail-bereich-kachel';
    kachel.onclick = () => openBereich(standortId, gruppeId, b.id);
    kachel.innerHTML = `
      <div class="dbk-icon">${listeIcon(b.liste)}</div>
      <div class="dbk-name">${b.name}</div>
      <div class="dbk-meta">${listeTitel(b.liste)}</div>
    `;
    grid.appendChild(kachel);
  });

  // Ganz zum Schluss nach oben scrollen — DOM ist jetzt vollständig
  const detailPanel = document.getElementById('home-detail');
  if (detailPanel) detailPanel.scrollTop = 0;
}


function openStandort(standortId) {
  const standort = APP_CONFIG.standorte.find(s => s.id === standortId);
  if (!standort) return;
  currentStandort = standort;
  document.getElementById('gruppen-titel').textContent = 'Prüfungen';
  const container = document.getElementById('gruppen-liste');
  container.innerHTML = '';

  const gruppen = standort.gruppen || [];
  gruppen.forEach(g => {
    const item = document.createElement('div');
    item.className = 'bereich-item gruppe-item';
    item.onclick = () => openGruppe(standortId, g.id);
    item.innerHTML = `
      <div class="bereich-icon icon-gruppe">${g.icon || '📁'}</div>
      <div class="bereich-info">
        <div class="bereich-name">${g.name}</div>
        <div class="bereich-liste-name">${g.bereiche.length} Bereiche</div>
      </div>
      <div class="bereich-arrow">›</div>
    `;
    container.appendChild(item);
  });
  showScreen('gruppen');
}

// ===== GRUPPE ÖFFNEN → auf Tablet: Detail-Panel, auf Mobile: Screen =====
function openGruppe(standortId, gruppeId) {
  if (isTablet()) {
    openGruppeDetail(standortId, gruppeId);
    return;
  }
  const standort = APP_CONFIG.standorte.find(s => s.id === standortId);
  const gruppe   = standort?.gruppen?.find(g => g.id === gruppeId);
  if (!gruppe) return;
  currentStandort = standort;
  currentGruppe   = gruppe;

  document.getElementById('bereiche-titel').textContent = `${gruppe.icon || ''} ${gruppe.name}`;
  const container = document.getElementById('bereiche-liste');
  container.innerHTML = '';

  gruppe.bereiche.forEach(b => {
    const item = document.createElement('div');
    item.className = 'bereich-item';
    item.onclick = () => openBereich(standortId, gruppeId, b.id);
    item.innerHTML = `
      <div class="bereich-icon ${iconClass(b.liste)}">${listeIcon(b.liste)}</div>
      <div class="bereich-info">
        <div class="bereich-name">${b.name}</div>
        <div class="bereich-liste-name bereich-letzter" id="letzter-${b.id}">${listeTitel(b.liste)}</div>
      </div>
      <div class="ampel-badge ampel-unbekannt" id="ampel-bereich-${b.id}">…</div>
    `;
    container.appendChild(item);
    // Ampel + letzte Prüfung asynchron laden
    renderAmpelBereich(b);
  });
  showScreen('bereiche');
}

// ===== AMPEL PRO BEREICH =====
async function renderAmpelBereich(b) {
  if (typeof window.fbGetAmpel !== 'function') return;
  const badge   = document.getElementById(`ampel-bereich-${b.id}`);
  const letzter = document.getElementById(`letzter-${b.id}`);
  if (!badge) return;

  // Leitern: schlechtester Status aller leiter_* aus Firestore
  if (b.id === 'leiter_sammel' && typeof window.fbGetAmpelLeitern === 'function') {
    const ampeln = await window.fbGetAmpelLeitern();
    const vals = Object.values(ampeln);
    let status = 'unbekannt';
    if (vals.includes('rot'))        status = 'rot';
    else if (vals.includes('gelb'))  status = 'gelb';
    else if (vals.length > 0)        status = 'gruen';
    const label = { rot: '🔴', gelb: '🟡', gruen: '🟢', unbekannt: '⚪' };
    badge.textContent = label[status] || '⚪';
    badge.className   = `ampel-badge ampel-${status}`;
    if (letzter) {
      const count = vals.length;
      letzter.textContent = count > 0 ? `${count} Leiter(n) geprüft` : 'Noch keine Prüfung';
    }
    // Prüfhistorie-Button (wie bei anderen Bereichen) — mit Guard gegen Doppel-Render
    const existingHistBtn = document.getElementById(`hist-btn-${b.id}`);
    if (!existingHistBtn) {
      const histBtn = document.createElement('button');
      histBtn.id = `hist-btn-${b.id}`;
      histBtn.className = 'btn-secondary';
      histBtn.style.cssText = 'width:100%;margin-top:6px;font-size:13px;padding:7px;';
      histBtn.textContent = '📋 Prüfhistorie';
      histBtn.onclick = () => showHistorieScreen(b.id, b.name, b.liste);
      const container = document.getElementById('bereiche-liste');
      const bereichItem = document.querySelector(`#ampel-bereich-${b.id}`)?.closest('.bereich-item');
      if (container && bereichItem && bereichItem.nextSibling) {
        container.insertBefore(histBtn, bereichItem.nextSibling);
      } else if (container) {
        container.appendChild(histBtn);
      }
    }
    // Fristenliste laden und anzeigen
    renderLeiternFristenliste(b.id);
    return;
  }

  const status = await window.fbGetAmpel(b.id, b.liste);
  const label  = { rot: '🔴', gelb: '🟡', gruen: '🟢', unbekannt: '⚪' };
  badge.textContent = label[status] || '⚪';
  badge.className   = `ampel-badge ampel-${status}`;

  // Letzte Prüfung anzeigen
  if (letzter && typeof window.fbGetLetztePruefung === 'function') {
    const lp = await window.fbGetLetztePruefung(b.id);
    if (lp) {
      const d = new Date(lp.datum);
      const tage = typeof window.fbRestTage === 'function'
        ? window.fbRestTage(lp.datum, b.liste) : null;
      const tageText = tage !== null
        ? (tage < 0 ? ` · <span style="color:#c00">überfällig ${Math.abs(tage)}d</span>`
           : tage <= 7 ? ` · <span style="color:#e67e00">fällig in ${tage}d</span>`
           : ` · fällig in ${tage}d`)
        : '';
      letzter.innerHTML = `Letzte Prüfung: ${d.toLocaleDateString('de-DE')}${tageText}`;
    }
  }

  // Prüfhistorie-Button unter dem Bereich-Item einfügen
  const existingBtn = document.getElementById(`hist-btn-${b.id}`);
  if (!existingBtn) {
    const histBtn = document.createElement('button');
    histBtn.id = `hist-btn-${b.id}`;
    histBtn.className = 'btn-secondary';
    histBtn.style.cssText = 'width:100%;margin-top:6px;font-size:13px;padding:7px;';
    histBtn.textContent = '📋 Prüfhistorie';
    histBtn.onclick = () => showHistorieScreen(b.id, b.name, b.liste);
    const container = document.getElementById('bereiche-liste');
    if (container) {
      // Button nach dem bereich-item einfügen (vor leitern-fristenliste)
      const bereichItem = document.querySelector(`#ampel-bereich-${b.id}`)?.closest('.bereich-item');
      if (bereichItem && bereichItem.nextSibling) {
        container.insertBefore(histBtn, bereichItem.nextSibling);
      } else {
        container.appendChild(histBtn);
      }
    }
  }
}

// ===== LEITERN FRISTENLISTE (unter dem Bereich-Item) =====
async function renderLeiternFristenliste(bereichId) {
  if (typeof window.fbGetAlleLeiternDaten !== 'function') return;
  // Container direkt nach dem bereich-item einfügen
  const existingList = document.getElementById('leitern-fristenliste');
  if (existingList) existingList.remove();

  const leitern = await window.fbGetAlleLeiternDaten();
  if (leitern.length === 0) return;

  const container = document.getElementById('bereiche-liste');
  if (!container) return;

  const listDiv = document.createElement('div');
  listDiv.id = 'leitern-fristenliste';
  listDiv.className = 'leitern-fristenliste';

  const ampelIcon = { rot: '🔴', gelb: '🟡', gruen: '🟢' };
  leitern.forEach(l => {
    const datum = new Date(l.datum);
    const faellig = new Date(l.faelligAm);
    const faelligStr = faellig.toLocaleDateString('de-DE');
    let fristText;
    if (l.restTage < 0) {
      fristText = `<span class="frist-ueberfaellig">Überfällig seit ${Math.abs(l.restTage)} Tagen</span>`;
    } else if (l.restTage <= 60) {
      fristText = `<span class="frist-bald">Fällig in ${l.restTage} Tagen (${faelligStr})</span>`;
    } else {
      fristText = `<span class="frist-ok">Nächste Prüfung: ${faelligStr}</span>`;
    }
    const row = document.createElement('div');
    row.className = 'leiter-frist-row';
    row.innerHTML = `
      <span class="leiter-frist-ampel">${ampelIcon[l.ampel] || '⚪'}</span>
      <span class="leiter-frist-nr">${l.bereichName}</span>
      <span class="leiter-frist-info">
        Geprüft: ${datum.toLocaleDateString('de-DE')} (${l.pruefer})<br>
        ${fristText}
      </span>
    `;
    listDiv.appendChild(row);
  });

  container.appendChild(listDiv);
}

// ===== PRÜFHISTORIE SCREEN =====
async function showHistorieScreen(bereichId, bereichName, listentyp) {
  const inhalt = document.getElementById('historie-inhalt');
  const titelEl = document.querySelector('#screen-historie .header-title');

  // Titel anpassen
  if (titelEl) titelEl.textContent = `📋 ${bereichName || 'Prüfhistorie'}`;

  inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Lade Protokolle…</div>';
  showScreen('historie');

  // Leitern: spezielle Funktion (alle leiter_* Einträge)
  const istLeitern = (bereichId === 'leiter_sammel' || listentyp === 'leiterkontrolle');

  let protokolle = [];
  if (istLeitern && typeof window.fbGetHistorieLeitern === 'function') {
    protokolle = await window.fbGetHistorieLeitern();
  } else if (typeof window.fbGetHistorieBereich === 'function') {
    protokolle = await window.fbGetHistorieBereich(bereichId);
  } else {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#c00">Firebase nicht verfügbar.</div>';
    return;
  }

  if (protokolle.length === 0) {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Noch keine Prüfprotokolle vorhanden.</div>';
    return;
  }

  inhalt.innerHTML = '';

  if (istLeitern) {
    // Leitern: nach Leiter-Nr. gruppieren
    const gruppen = {};
    protokolle.forEach(p => {
      const nr = p.leiterNr || p.bereichId;
      if (!gruppen[nr]) gruppen[nr] = [];
      gruppen[nr].push(p);
    });

    Object.keys(gruppen).sort().forEach(nr => {
      const eintraege = gruppen[nr];
      inhalt.appendChild(renderHistorieGruppe(`Leiter ${nr}`, eintraege));
    });
  } else {
    // Alle anderen Bereiche: einfache Liste ohne Untergruppierung
    inhalt.appendChild(renderHistorieGruppe(bereichName, protokolle));
  }
}

// Hilfsfunktion: rendert eine Gruppe mit Einträgen
function renderHistorieGruppe(titel, eintraege) {
  const gruppe = document.createElement('div');
  gruppe.style.cssText = 'margin-bottom:16px;';

  const letzter = eintraege[0];
  const ampel = letzter.hatMaengel ? '🔴' : '🟢';
  const header = document.createElement('div');
  header.style.cssText = 'font-weight:bold;font-size:15px;padding:8px 12px;background:#f0f4ff;border-radius:8px 8px 0 0;border-bottom:1px solid #dde;display:flex;align-items:center;gap:8px;';
  header.innerHTML = `${ampel} ${titel} <span style="font-weight:normal;font-size:13px;color:#666">(${eintraege.length} Protokoll${eintraege.length > 1 ? 'e' : ''})</span>`;
  gruppe.appendChild(header);

  eintraege.forEach((p, idx) => {
    const d = new Date(p.datum);
    const datumStr = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
    const icon = p.hatMaengel ? '🔴' : '🟢';

    const card = document.createElement('div');
    card.style.cssText = `padding:10px 12px;background:${idx % 2 === 0 ? '#fff' : '#fafafa'};border-left:3px solid ${p.hatMaengel ? '#c00' : '#2a9d2a'};border-bottom:1px solid #eee;`;

    let maengelHtml = '';
    if (p.hatMaengel && p.maengelText) {
      maengelHtml = `<div style="margin-top:4px;padding:6px 8px;background:#fff3f3;border-radius:4px;font-size:12px;color:#c00;">⚠️ ${p.maengelText}</div>`;
    }

    let driveHtml = '';
    if (p.driveFileId) {
      const driveUrl = `https://drive.google.com/file/d/${p.driveFileId}/view`;
      const fileId = p.driveFileId;
      const dlFilename = `${p.datum ? p.datum.replace(/\./g,'-') : 'Protokoll'}_${p.bereichId || titel}.pdf`;
      driveHtml = `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
        <a href="${driveUrl}" target="_blank" style="display:inline-block;padding:5px 12px;background:#1a73e8;color:#fff;border-radius:6px;font-size:12px;text-decoration:none;font-weight:500;">📄 Protokoll öffnen</a>
        <button onclick="downloadPdfFromDrive('${fileId}','${dlFilename}')" style="padding:5px 12px;background:#34a853;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">⬇️ PDF herunterladen</button>
      </div>`;
    }

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;font-weight:500;">${icon} ${datumStr}</span>
        <span style="font-size:12px;color:#666;">👤 ${p.pruefer || '—'}</span>
      </div>
      ${maengelHtml}
      ${driveHtml}
    `;
    gruppe.appendChild(card);
  });

  return gruppe;
}

// ===== MÄNGEL-SCREEN =====
async function showMaengelScreen() {
  const screen = document.getElementById('screen-maengel');
  if (!screen) return;
  const liste = document.getElementById('maengel-liste');
  liste.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Lade Mängel…</div>';
  showScreen('maengel');

  const maengel = typeof window.fbGetOffeneMaengel === 'function'
    ? await window.fbGetOffeneMaengel() : [];

  if (maengel.length === 0) {
    liste.innerHTML = '<div style="padding:20px;text-align:center;color:#2a9d2a">✅ Keine offenen Mängel!</div>';
    return;
  }

  liste.innerHTML = '';
  maengel.forEach(m => {
    const d = new Date(m.datum);
    const card = document.createElement('div');
    card.className = 'mangel-card';
    card.innerHTML = `
      <div class="mangel-header">
        <span class="mangel-bereich">${m.bereichName}</span>
        <span class="mangel-datum">${d.toLocaleDateString('de-DE')}</span>
      </div>
      <div class="mangel-text">${m.beschreibung}</div>
      <div class="mangel-meta">Prüfer: ${m.pruefer}</div>
      <button class="btn-erledigt" onclick="mangelErledigen('${m.id}', this)">
        ✅ Als erledigt markieren
      </button>
    `;
    liste.appendChild(card);
  });
}

async function mangelErledigen(mangelId, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  const ok = typeof window.fbMangelErledigt === 'function'
    ? await window.fbMangelErledigt(mangelId) : false;
  if (ok) {
    btn.closest('.mangel-card').style.opacity = '0.4';
    btn.textContent = '✅ Erledigt';
  } else {
    btn.textContent = '❌ Fehler';
    btn.disabled = false;
  }
}

// ===== BEREICH ÖFFNEN =====
function openBereich(standortId, gruppeId, bereichId) {
  const standort = APP_CONFIG.standorte.find(s => s.id === standortId);
  const gruppe   = standort?.gruppen?.find(g => g.id === gruppeId);
  const bereich  = gruppe?.bereiche.find(b => b.id === bereichId);
  if (!bereich) return;
  currentStandort = standort;
  currentGruppe   = gruppe;
  currentBereich  = bereich;
  currentListe    = APP_CONFIG.listen[bereich.liste];
  if (!currentListe) return;
  pruefErgebnisse = {};
  renderChecklist();
  showScreen('checklist');
  // Nach oben scrollen — sofort und nach kurzem Delay (DOM-Render)
  const clContent = document.getElementById('checklist-content');
  if (clContent) clContent.scrollTop = 0;
  setTimeout(() => { if (clContent) clContent.scrollTop = 0; }, 150);
  // Zurück-Button: auf Tablet → Home, auf Mobile → bereiche
  const backBtn = document.querySelector('#screen-checklist .btn-back');
  if (backBtn) {
    backBtn.onclick = () => isTablet() ? showScreen('home') : showScreen('bereiche');
  }
  // Canvas erst nach showScreen initialisieren — vorher ist offsetWidth = 0
  initSignaturePad();
}

// QR-Code: Bereich über ID finden (sucht in allen Gruppen aller Standorte)
function openBereichById(bereichId) {
  for (const standort of APP_CONFIG.standorte) {
    for (const gruppe of (standort.gruppen || [])) {
      const bereich = gruppe.bereiche.find(b => b.id === bereichId);
      if (bereich) {
        openBereich(standort.id, gruppe.id, bereichId);
        return;
      }
    }
  }
}

// ===== CHECKLISTE RENDERN =====
function renderChecklist() {
  const now = new Date();
  document.getElementById('checklist-titel').textContent = currentListe.titel;

  // Meta-Box
  document.getElementById('checklist-meta').innerHTML = `
    <div class="meta-bereich">${currentBereich.name}</div>
    <div class="meta-datum">📅 ${formatDatum(now)}</div>
    <div class="meta-kw">KW ${getKW(now)} · ${currentListe.intervall}</div>
  `;



  // Abschnitte (mit Editor-Anpassungen zusammenführen)
  const container = document.getElementById('checklist-abschnitte');
  container.innerHTML = '';
  const abschnitteAktuell = editorGetPunkte(currentBereich.liste) || currentListe.abschnitte;
  abschnitteAktuell.forEach(abschnitt => {
    const div = document.createElement('div');
    div.className = 'abschnitt';
    div.innerHTML = `<div class="abschnitt-titel">${abschnitt.titel}</div>`;
    abschnitt.punkte.forEach(punkt => {
      pruefErgebnisse[punkt.id] = null;
      const item = document.createElement('div');
      item.className = 'pruef-item';
      item.id = 'item-' + punkt.id;
      item.innerHTML = `
        <div class="pruef-text">${punkt.text}</div>
        <div class="toggle-group">
          <button class="toggle-btn ok-btn"  onclick="setPruefung('${punkt.id}','ok')"  title="i.O.">✓</button>
          <button class="toggle-btn nok-btn" onclick="setPruefung('${punkt.id}','nok')" title="n.i.O.">✗</button>
        </div>
      `;
      div.appendChild(item);
    });
    container.appendChild(div);
  });

  // Aufzug-Nr. Feld nur bei Aufzug-Checkliste einblenden
  const aufzugNrBox = document.getElementById('aufzug-nr-box');
  aufzugNrBox.style.display = (currentBereich.liste === 'aufzug') ? 'block' : 'none';

  // Leiter-Felder nur bei Leiterkontrolle einblenden
  const leiterFelderBox = document.getElementById('leiter-felder-box');
  leiterFelderBox.style.display = (currentBereich.liste === 'leiterkontrolle') ? 'block' : 'none';

  // GFB-Felder nur bei Gefährdungsbeurteilungen einblenden
  const gfbFelderBox = document.getElementById('gfb-felder-box');
  const isGFB = (currentBereich.liste === 'gfb_szp' || currentBereich.liste === 'gfb_glasreinigung');
  const isLMRA = (currentBereich.liste === 'lmra_hubarbeitsbuehne');
  gfbFelderBox.style.display = isGFB ? 'block' : 'none';

  // BA-Button bei GFB SZP und GFB Glasreinigung
  const baBtnBox = document.getElementById('gfb-ba-btn-box');
  if (baBtnBox) baBtnBox.style.display = isGFB ? 'block' : 'none';

  // Labels Unterschrift / Name je nach Typ anpassen
  document.getElementById('unterschrift-label').textContent = isGFB ? 'Unterschrift Aufsichtsführender:' : 'Unterschrift Prüfer:';
  document.getElementById('pruefer-label').textContent = isGFB ? 'Name Aufsichtsführender:' : (isLMRA ? 'Aufsichtsführender vor Ort:' : 'Name Prüfer:');
  document.getElementById('pruefer-name').placeholder = isGFB ? 'Name Aufsichtsführender …' : (isLMRA ? 'Name Aufsichtsführender …' : 'Oder Namen eingeben …');

  // Unterschrift-Box bei LMRA ausblenden (Unterschrift kommt auf Seite 12 der Unterweisungsliste)
  document.getElementById('unterschrift-label-box').style.display = isLMRA ? 'none' : 'block';

  // Prüfer-Box bei LMRA ausblenden (Aufsichtsführender wird in lmra-ma-box eingetragen)
  const prueferBox = document.querySelector('.pruefer-box');
  if (prueferBox) prueferBox.style.display = isLMRA ? 'none' : 'block';

  // Mitarbeiterliste nur bei GFB
  document.getElementById('gfb-ma-box').style.display = isGFB ? 'block' : 'none';
  document.getElementById('gfb-ma-liste').innerHTML = '';
  gfbMitarbeiter = [];

  // LMRA-Box: Einsatzdaten (oben) + Mitarbeiter (nach Checkboxen)
  const lmraEinsatzBox = document.getElementById('lmra-einsatz-box');
  if (lmraEinsatzBox) lmraEinsatzBox.style.setProperty('display', isLMRA ? 'block' : 'none', 'important');
  const lmraMaBox = document.getElementById('lmra-ma-box');
  if (lmraMaBox) lmraMaBox.style.setProperty('display', isLMRA ? 'block' : 'none', 'important');
  if (isLMRA) {
    document.getElementById('lmra-ma-liste').innerHTML = '';
    lmraMitarbeiter = [];
    // Datum + Uhrzeit auf jetzt vorbelegen
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const hh = String(today.getHours()).padStart(2,'0');
    const min = String(today.getMinutes()).padStart(2,'0');
    const datumInput = document.getElementById('lmra-datum');
    const uhrzeitInput = document.getElementById('lmra-uhrzeit');
    if (datumInput) datumInput.value = `${yyyy}-${mm}-${dd}`;
    if (uhrzeitInput) uhrzeitInput.value = `${hh}:${min}`;
    // Wind leeren — Feld entfernt, nur Safety
    const windInput = document.getElementById('lmra-wind');
    if (windInput) windInput.value = '';
    // Felder leer lassen — Vorlage nur auf Knopfdruck laden (📋 Vorlage-Button)
    // Zwei leere Mitarbeiter-Slots vorausfüllen (wird vor Ort eingetragen)
    setTimeout(() => {
      lmraMaHinzufuegen();
      lmraMaHinzufuegen();
    }, 80);
  }

  // LMRA: Aufsichtsführender-Unterschrift-Box ein/ausblenden
  const lmraAufBox = document.getElementById('lmra-aufsfuehr-sig-box');
  if (lmraAufBox) {
    lmraAufBox.style.display = isLMRA ? 'block' : 'none';
    if (isLMRA) {
      lmraAufCanvas = null; // Reset damit init neu läuft
      setTimeout(() => {
        lmraAufSigInit();
        lmraAufSigClear();
      }, 120);
    }
  }

  // Standort-Box: bei LMRA ausblenden (Objekt/Adresse ersetzt Standort)
  const standortBox = document.getElementById('standort-box');
  if (standortBox) standortBox.style.display = isLMRA ? 'none' : 'block';
  if (currentBereich && currentBereich.liste === 'gfb_glasreinigung') {
    setTimeout(() => {
      gfbMaHinzufuegen();
      const nameInput = document.getElementById('gfb-ma-name-0');
      if (nameInput) {
        nameInput.value = 'Dan';
        gfbMitarbeiter[0].name = 'Dan';
      }
    }, 80);
  }

  // Prüfer-Buttons je nach Typ anpassen
  const prueferButtons = document.querySelector('.pruefer-buttons');
  if (isLMRA) {
    // LMRA: Keine Vorauswahl — Aufsichtsführender wird vor Ort eingetragen
    prueferButtons.innerHTML = '';
    document.getElementById('pruefer-name').value = '';
    document.getElementById('pruefer-name').placeholder = 'Name Aufsichtsführender eintragen …';
  } else if (isGFB) {
    prueferButtons.innerHTML = `
      <button type="button" class="btn-pruefer" onclick="selectPruefer('Thomas Schmoldt')">Thomas Schmoldt</button>
      <button type="button" class="btn-pruefer" onclick="selectPruefer('Fabian Romeike')">Fabian Romeike</button>
    `;
  } else {
    prueferButtons.innerHTML = `
      <button type="button" class="btn-pruefer" onclick="selectPruefer('Thomas Schmoldt')">Thomas Schmoldt</button>
      <button type="button" class="btn-pruefer" onclick="selectPruefer('Klaus Strack')">Klaus Strack</button>
      <button type="button" class="btn-pruefer" onclick="selectPruefer('Katharina Schmoldt')">Katharina Schmoldt</button>
      <button type="button" class="btn-pruefer" onclick="selectPruefer('Fabian Romeike')">Fabian Romeike</button>
    `;
  }

  // Felder leeren / Standardwerte setzen
  document.getElementById('formular-standort').value = (currentStandort && currentStandort.objekt) ? currentStandort.objekt : 'Raschplatz 5';
  document.getElementById('aufzug-nr').value = '';
  document.getElementById('leiter-nr').value = '';
  document.getElementById('leiter-typ').value = '';
  document.getElementById('gfb-objekt').value = '';
  document.getElementById('gfb-auftraggeber').value = '';
  document.getElementById('gfb-ansprechpartner').value = '';
  document.getElementById('bemerkung').value = '';
  document.getElementById('pruefer-name').value = '';
  clearSignature();
  // Fotos zurücksetzen
  fotoListe = [];
  document.getElementById('foto-vorschau').innerHTML = '';
}

// ===== FOTO-FUNKTION =====
function fotoAufnehmen() {
  document.getElementById('foto-input').click();
}

function fotoHinzufuegen(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    // FEATURE 4: Foto-Komprimierung — Resize auf max 800px + JPEG 70%
    const img = new Image();
    img.onload = function() {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      cvs.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = cvs.toDataURL('image/jpeg', 0.70);
      const idx = fotoListe.length;
      fotoListe.push({ dataUrl, name: file.name });
      renderFotoVorschau(idx, dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderFotoVorschau(idx, dataUrl) {
  const container = document.getElementById('foto-vorschau');
  const item = document.createElement('div');
  item.className = 'foto-vorschau-item';
  item.id = 'foto-item-' + idx;
  item.innerHTML = `
    <img src="${dataUrl}" alt="Foto ${idx + 1}">
    <button class="foto-loeschen" onclick="fotoLoeschen(${idx})" title="Foto löschen">✕</button>
  `;
  container.appendChild(item);
}

function fotoLoeschen(idx) {
  fotoListe[idx] = null;
  const el = document.getElementById('foto-item-' + idx);
  if (el) el.remove();
}

// ===== PRÜFUNG SETZEN =====
function setPruefung(id, wert) {
  pruefErgebnisse[id] = wert;
  const item = document.getElementById('item-' + id);
  item.classList.remove('checked', 'nok');
  if (wert === 'ok')  item.classList.add('checked');
  if (wert === 'nok') item.classList.add('nok');
  const btns = item.querySelectorAll('.toggle-btn');
  btns[0].classList.toggle('active', wert === 'ok');
  btns[1].classList.toggle('active', wert === 'nok');
}

// ===== UNTERSCHRIFT PAD =====
function initSignaturePad() {
  const canvas = document.getElementById('sig-canvas');
  const ctx = canvas.getContext('2d');

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY
    };
  }
  function resizeCanvas() {
    const w = canvas.offsetWidth;
    canvas.width  = w * (window.devicePixelRatio || 1);
    canvas.height = 140 * (window.devicePixelRatio || 1);
  }
  resizeCanvas();

  canvas.addEventListener('mousedown',  e => { isDrawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; });
  canvas.addEventListener('mousemove',  e => { if (!isDrawing) return; draw(ctx, getPos(e)); });
  canvas.addEventListener('mouseup',    () => isDrawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); isDrawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); e.stopPropagation(); if (!isDrawing) return; draw(ctx, getPos(e)); }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.stopPropagation(); isDrawing = false; });

  function draw(ctx, pos) {
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#0047CC';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastX = pos.x; lastY = pos.y;
  }
  sigPad = { canvas, ctx };

  // FEATURE 8: Gespeicherte Unterschrift automatisch einfügen
  const hasSaved = !!localStorage.getItem('csc_gespeicherte_unterschrift');
  // Speichern/Laden-Buttons unter dem Canvas
  const sigContainer = document.getElementById('sig-container');
  let sigBtns = document.getElementById('sig-extra-btns');
  if (!sigBtns) {
    sigBtns = document.createElement('div');
    sigBtns.id = 'sig-extra-btns';
    sigBtns.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
    sigBtns.innerHTML = `
      <button type="button" class="btn-secondary" style="flex:1;font-size:12px;padding:6px"
        onclick="saveSignature()">💾 Unterschrift merken</button>
      <button type="button" id="btn-sig-load" class="btn-secondary"
        style="flex:1;font-size:12px;padding:6px;${hasSaved ? '' : 'opacity:0.4;cursor:default'}"
        onclick="loadSavedSignature()" ${hasSaved ? '' : 'disabled'}>
        ✍️ Gespeicherte laden
      </button>
    `;
    sigContainer.after(sigBtns);
  } else {
    // Laden-Button aktivieren/deaktivieren je nach gespeicherter Unterschrift
    const loadBtn = document.getElementById('btn-sig-load');
    if (loadBtn) { loadBtn.disabled = !hasSaved; loadBtn.style.opacity = hasSaved ? '1' : '0.4'; }
  }
  // Automatisch einfügen wenn gespeichert
  if (hasSaved) {
    setTimeout(() => loadSavedSignature(), 100);
  }
}

function clearSignature() {
  if (!sigPad) return;
  sigPad.ctx.clearRect(0, 0, sigPad.canvas.width, sigPad.canvas.height);
}

// FEATURE 8: Gespeicherte Unterschrift laden
function loadSavedSignature() {
  const saved = localStorage.getItem('csc_gespeicherte_unterschrift');
  if (!saved || !sigPad) return;
  const img = new Image();
  img.onload = () => {
    sigPad.ctx.clearRect(0, 0, sigPad.canvas.width, sigPad.canvas.height);
    sigPad.ctx.drawImage(img, 0, 0, sigPad.canvas.width, sigPad.canvas.height);
  };
  img.src = saved;
}

// Unterschrift im localStorage speichern
function saveSignature() {
  if (!sigPad || isSignatureEmpty()) { alert('Bitte zuerst unterschreiben.'); return; }
  const dataUrl = sigPad.canvas.toDataURL('image/png');
  localStorage.setItem('csc_gespeicherte_unterschrift', dataUrl);
  alert('✅ Unterschrift gespeichert! Sie wird bei zukünftigen Prüfungen automatisch eingetragen.');
}

function isSignatureEmpty() {
  const data = sigPad.canvas.toDataURL();
  const empty = document.createElement('canvas');
  empty.width  = sigPad.canvas.width;
  empty.height = sigPad.canvas.height;
  return data === empty.toDataURL();
}

// ===== PRÜFER AUSWÄHLEN =====
function selectPruefer(name) {
  document.getElementById('pruefer-name').value = name;
  document.querySelectorAll('.btn-pruefer').forEach(b => {
    b.classList.toggle('active', b.textContent === name);
  });
}



// ===== BA-MODAL: BETRIEBSANWEISUNG & RETTUNGSPLAN =====

const BA_INHALTE = {

  // ── SZP: BA Seilzugangs- und Positionierungstechnik (Tab "glas" bei SZP) ──
  szp: `
    <div style="background:#eef2f7;border-left:4px solid #1a3a5c;padding:8px 12px;border-radius:4px;margin-bottom:10px;">
      <strong style="color:#1a3a5c;">BETRIEBSANWEISUNG – SEILZUGANGS- UND POSITIONIERUNGSTECHNIKEN (SZP)</strong><br>
      <span style="font-size:11px;color:#555;font-style:italic;">Seilunterstützte Zugangs- und Positionierungstechniken – Rope Access · Gemäß DIN EN 363 · FISAT-Richtlinien · TRBS 2121 Teil 3 · BGR 198</span>
    </div>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">1 &nbsp;ANWENDUNGSBEREICH</div>
    <p style="font-size:12px;margin:4px 0 10px 0;color:#222;">Diese Betriebsanweisung gilt für alle Mitarbeiter, die Seilzugangs- und Positionierungstechniken (SZP / Rope Access) anwenden. SZP kommt zum Einsatz, wenn aufgrund der Gefährdungsbeurteilung andere Zugangsverfahren (Gerüst, Hebebühne) unwirtschaftlich oder nicht möglich sind.</p>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">2 &nbsp;GEFAHREN FÜR MENSCH UND UMWELT</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Absturz oder Herausfallen aus der Höhe – tödliche Verletzungsgefahr</li>
      <li>Pendelsturz – Anprallen an feste Gegenstände beim Abweichen vom Ablot</li>
      <li>Hängetrauma (orthostatischer Schock) – bereits nach wenigen Minuten lebensbedrohlich</li>
      <li>Falsche Benutzung des Auffangsystems oder Anschlageinrichtung</li>
      <li>Versagen von Ankerpunkten – unzureichende Tragfähigkeit oder Prüfung</li>
      <li>Materialfall: Werkzeuge oder Arbeitsmittel können auf Personen darunter fallen</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">3 &nbsp;SCHUTZMASSNAHMEN UND VERHALTENSREGELN</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Personen müssen körperlich und geistig für SZP geeignet sein – ärztliches Attest empfohlen</li>
      <li>Personen unter Einfluss von Alkohol, Drogen oder Medikamenten dürfen NICHT eingesetzt werden</li>
      <li>Mind. 2 ausgebildete SZP-Mitarbeiter (Level 1 mind.) auf jeder Baustelle</li>
      <li>Einsatz durch SZP-Level-3-Aufsichtsführenden überwachen lassen</li>
      <li>Trag- und Sicherungsseil an je ZWEI voneinander unabhängigen Ankerpunkten anschlagen</li>
      <li>Ankerpunkte vor Nutzung Sichtprüfung durchführen (Tragkraft mind. 12 kN / 1.200 kg)</li>
      <li><strong>Buddy-Check</strong> vor jeder Besteigung: Gurt, Knoten, Geräte gegenseitig überprüfen</li>
      <li>Sicht- und Rufkontakt im Team jederzeit gewährleisten</li>
      <li>Werkzeuge und Arbeitsmittel gegen Herabfallen sichern (Lanyards, Werkzeugpouches)</li>
      <li>Schutzhelm + Sicherheitsschuhe S3 Pflicht; Absperrung des Arbeitsbereichs</li>
      <li>Nur geprüfte, zugelassene Ausrüstung verwenden – Sachkundigenprüfung 1× jährlich</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">4 &nbsp;VERHALTEN BEI STÖRUNGEN UND MÄNGELN</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Jeden Mangel an Seilen, Geräten oder Ankerpunkten vor Benutzung dem Vorgesetzten melden</li>
      <li>Gefahrenbereich sofort verlassen bei erkennbaren Mängeln oder veränderten Bedingungen</li>
      <li>Ausrüstung NICHT benutzen nach einem Sturz – Sachkundige Prüfung vor Wiederverwendung!</li>
      <li>Bei Wetteränderung (Wind, Eis, Gewitter): Arbeiten sofort einstellen und sicher abseilen</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">5 &nbsp;ERSTE HILFE UND VERHALTEN IM NOTFALL</div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0 6px 0;">
      <div style="background:#c00;color:#fff;border-radius:6px;padding:4px 14px;font-size:20px;font-weight:900;letter-spacing:2px;">112</div>
      <span style="font-size:12px;font-weight:700;">NOTRUF</span>
    </div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Ruhe bewahren – Überblick verschaffen – Eigensicherung beachten</li>
      <li>Rettung gemäß Rettungsplan SZP (Rettung grundsätzlich nach <strong>UNTEN</strong> zum Boden)</li>
      <li>Notruf <strong>112</strong>: WER? WAS? WO? WIE VIELE?</li>
      <li>Erste-Hilfe-Maßnahmen einleiten</li>
      <li>Rettung aus hängender Situation innerhalb <strong>15–20 Minuten</strong> (Hängetrauma!)</li>
      <li>Auch ohne äußere Verletzungszeichen: <strong>Arzt aufsuchen!</strong></li>
      <li>Arbeitsunfälle sofort dem Aufsichtsführenden und der BG melden</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">6 &nbsp;INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Vor, nach und während jeder Benutzung: Sichtprüfung aller Ausrüstungsgegenstände</li>
      <li>Sachkundigenprüfung nach DGUV Grundsatz 312-906 alle <strong>12 Monate</strong></li>
      <li>Jeder SZP-Anwender: mind. FISAT Level 1 + gültiger Kursnachweis</li>
      <li>Aufsichtsführende in SZP: FISAT Level 3 oder gleichwertig</li>
      <li>Wiederholungsunterweisung gemäß TRBS 2121 Teil 3 und FISAT – alle <strong>12 Monate</strong></li>
      <li>Jeder Anwender: gültiger Erste-Hilfe-Kurs (mind. 8 Stunden)</li>
      <li>Unterweisungsnachweise und Prüfprotokolle mind. 2 Jahre aufbewahren</li>
    </ul>`,

  // ── SZP: Rettungsplan (Tab "rettung" – wird für SZP befüllt mit SZP-spezifischem Inhalt) ──
  rettung_szp: `
    <div style="background:#ffeaea;border-left:4px solid #c00;padding:10px 12px;border-radius:4px;margin-bottom:16px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#c00;letter-spacing:2px;">⚠  RETTUNGSPLAN  ⚠</div>
      <div style="font-size:13px;font-weight:700;color:#1a3a5c;margin-top:4px;">Seilzugangs- und Positionierungstechnik (SZP) – Rettung nach UNTEN</div>
      <div style="font-size:11px;color:#555;">Gemäß DGUV Vorschrift 1 · DIN EN 363 · FISAT-Richtlinien</div>
    </div>

    <div style="background:#c00;color:#fff;border-radius:8px;padding:12px 16px;text-align:center;margin-bottom:16px;font-size:22px;font-weight:900;letter-spacing:3px;">
      112
    </div>

    <div style="background:#fff3cd;border-left:4px solid #e6a817;padding:8px 12px;border-radius:4px;margin-bottom:14px;font-size:12px;">
      <strong>⚠ HÄNGETRAUMA-GEFAHR:</strong> Rettung muss innerhalb <strong>15–20 Minuten</strong> erfolgen – auch ohne Sturz, allein durch das Hängen im Gurt lebensbedrohlich!
    </div>

    <div style="font-size:12px;margin-bottom:10px;"><strong>Gefährdungen &amp; Maßnahmen:</strong></div>
    <ul style="margin:0 0 12px 16px;padding:0;font-size:12px;">
      <li>Hängetrauma: Rettung &lt; 20 Min. – gut angepasster Gurt – Beinschlaufen entlasten – Beine bewegen lassen</li>
      <li>Absturz des Retters: PSA in Rückhaltefunktion, Seillänge kurz halten</li>
      <li>Ankerpunktversagen bei 2 Personen: geeigneten AP wählen, separaten AP für Rettungsgerät vorsehen</li>
    </ul>

    <div style="font-size:12px;margin-bottom:6px;"><strong>Erforderliches Rettungsgerät:</strong></div>
    <ul style="margin:0 0 14px 16px;padding:0;font-size:12px;">
      <li>Abseilgerät + mitlaufendes Sicherungsgerät (Zulassung 2 Personen)</li>
      <li>Kantenschutz</li>
      <li>Erste-Hilfe-Verbandskasten</li>
      <li>Sachkundigenprüfung durchgeführt</li>
      <li>Rettung durch Teampartner</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:10px;">DURCHFÜHRUNG DER RETTUNG – SCHRITT FÜR SCHRITT</div>

    <div style="font-size:12px;">
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">1</span>
        <span>Teampartner (MA 1) sichert sich selbst – Verbindungsmittel kurz einstellen – Kontakt zum Abgestürzten aufnehmen. Verletzungen feststellen, beruhigen!</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">2</span>
        <span>Notruf <strong>112</strong>: WER? WAS ist passiert? WO genau? WIE VIELE Verletzte? – auf Rückfragen warten</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">3</span>
        <span>Geeigneten Anschlagpunkt für das Rettungsgerät auswählen (vorzugsweise separat von den Arbeitsseilen).</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">4</span>
        <span>Kantenschutz anbringen falls notwendig – dabei Eigensicherung beachten!</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">5</span>
        <span>Verletzte Person so anschlagen (2 Abseilgeräte am Ankerpunkt), dass ein Ablassen möglich ist.</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">6</span>
        <span>Abgestürzten aus hängender Position kontrolliert <strong>nach UNTEN zum Boden</strong> abseilen.</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">7</span>
        <span>Vor dem Abseilen: Hindernisse im Abseilweg prüfen!</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">8</span>
        <span>Übernahme der verletzten Person aus dem geöffneten System (Bodennähe) mit zwei Personen.</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">9</span>
        <span>Erste-Hilfe-Maßnahmen einleiten – je nach Verletzung handeln. Gerettete Person <strong>flach lagern</strong> (NICHT aufrecht setzen – Hängetraumaschutz).</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:11px;">10</span>
        <span>Auf den Notarzt warten – auch ohne äußere Verletzungszeichen ärztlich untersuchen lassen (Hängetrauma möglich)!</span>
      </div>
    </div>

    <div style="margin-top:14px;padding:10px;background:#eef2f7;border-radius:6px;font-size:12px;color:#1a3a5c;">
      <strong>Ersthelfer:</strong> Alle MA aus SZP &nbsp;·&nbsp; <strong>Verbandskasten:</strong> Am Einsatzort &nbsp;·&nbsp; <strong>Notruf:</strong> 112
    </div>`,

  psaga: `
    <div style="background:#eef2f7;border-left:4px solid #1a3a5c;padding:8px 12px;border-radius:4px;margin-bottom:10px;">
      <strong style="color:#1a3a5c;">BETRIEBSANWEISUNG – PSA GEGEN ABSTURZ (PSAgA)</strong><br>
      <span style="font-size:11px;color:#555;font-style:italic;">Persönliche Schutzausrüstung gegen Absturz – Auffanggurt, Verbindungsmittel, Auffangsystem</span>
    </div>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">1 &nbsp;ANWENDUNGSBEREICH</div>
    <p style="font-size:12px;margin:4px 0 10px 0;color:#222;">Diese Betriebsanweisung gilt für alle Mitarbeiter, die PSA gegen Absturz (PSAgA) verwenden. PSAgA kommt zum Einsatz, wenn aufgrund einer Gefährdungsbeurteilung Absturzgefahren vorliegen und bauliche oder technische Schutzmaßnahmen nicht ausreichend sind. Gilt für Rückhalte-, Arbeitspositionierungs- und Auffangsysteme gemäß DIN EN 358, DIN EN 361, DIN EN 363.</p>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">2 &nbsp;GEFAHREN FÜR MENSCH UND UMWELT</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Absturz aus der Höhe – tödliche Verletzungsgefahr</li>
      <li>Pendelsturz – Anprallen an feste Gegenstände</li>
      <li>Hängetrauma (orthostatischer Schock) – bereits nach wenigen Minuten lebensbedrohlich</li>
      <li>Materialversagen durch falsche Benutzung, fehlende Prüfung oder Beschädigung</li>
      <li>Versagen des Anschlagpunktes – ungeprüfte oder ungeeignete Ankerpunkte</li>
      <li>Veränderte oder manipulierte Ausrüstung – nie eigenmächtig verändern!</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">3 &nbsp;SCHUTZMASSNAHMEN UND VERHALTENSREGELN</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Personen müssen körperlich und geistig für diese Tätigkeiten geeignet sein (ärztliches Attest empfohlen)</li>
      <li>Personen unter Einfluss von Alkohol, Drogen oder beeinträchtigenden Medikamenten dürfen nicht eingesetzt werden</li>
      <li>Gurtpflicht ab <strong>2 m</strong> vor der Absturzkante – Anschlagen an geeigneten Haltepunkten (mind. 9 kN)</li>
      <li>Nur geprüfte, zugelassene PSAgA in betriebssicherem Zustand verwenden (Sachkundigenprüfung <strong>1× jährlich</strong>)</li>
      <li>Vor jeder Benutzung <strong>Sichtprüfung</strong> aller Ausrüstungsgegenstände durchführen</li>
      <li><strong>Buddy-Check:</strong> Gegenseitige Überprüfung von Gurt, Verbindungsmittel und Ankerpunkt</li>
      <li>Mindestens <strong>2 Personen</strong> auf jeder Baustelle – Teamarbeit, Sicht- und Rufkontakt halten</li>
      <li>Jegliche Arbeiten durch anwesende <strong>Aufsichtsperson</strong> überwachen lassen</li>
      <li>Absperrungen zum Schutz Dritter errichten (Absperrband + Hinweisschilder)</li>
      <li>Zusätzliche PSA je nach Tätigkeit tragen (Helm, S3-Schuhe, Schutzhandschuhe)</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">4 &nbsp;VERHALTEN BEI STÖRUNGEN / MÄNGELN</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Jeden Mangel an der PSAgA vor Nutzung dem Vorgesetzten melden</li>
      <li>PSAgA NICHT benutzen wenn: Funktionsweise beeinträchtigt / Sturz beansprucht / Beschädigungen sichtbar</li>
      <li>Nach einem Absturz: PSAgA außer Betrieb nehmen – Sachkundige Prüfung vor Wiederverwendung!</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">5 &nbsp;ERSTE HILFE UND VERHALTEN IM NOTFALL</div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0 6px 0;">
      <div style="background:#c00;color:#fff;border-radius:6px;padding:4px 14px;font-size:20px;font-weight:900;letter-spacing:2px;">112</div>
      <span style="font-size:12px;font-weight:700;">NOTRUF</span>
    </div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Ruhe bewahren – Überblick verschaffen</li>
      <li>Rettung gemäß Notfall-/Rettungsplan (Rettung nach <strong>UNTEN</strong>)</li>
      <li>Notruf <strong>112</strong>: WER? WAS? WO? WIE VIELE?</li>
      <li>Erste-Hilfe-Maßnahmen einleiten</li>
      <li>Rettung aus hängender Situation innerhalb <strong>15–20 Minuten</strong> (Hängetrauma!)</li>
      <li>Auch ohne äußere Verletzungszeichen: <strong>Arzt aufsuchen!</strong></li>
      <li>Arbeitsunfälle und Beinaheunfälle sofort dem Aufsichtsführenden und der BG melden</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">6 &nbsp;INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Vor, nach und während jeder Benutzung: Sichtprüfung des eingesetzten Materials</li>
      <li>Sachkundigenprüfung gemäß DGUV Grundsatz 312-906 alle <strong>12 Monate</strong> durch Sachkundige</li>
      <li>Material in nicht einwandfreiem Zustand sofort aussondern und kennzeichnen</li>
      <li>Unterweisung gemäß BGR 198 vor jedem Einsatz und mindestens <strong>1× jährlich</strong></li>
      <li>Jeder Anwender benötigt einen gültigen Erste-Hilfe-Kurs (mind. 8 Stunden)</li>
      <li>Prüfprotokoll und Unterweisungsnachweis aufbewahren (mind. 2 Jahre)</li>
    </ul>`,

  glas: `
    <div style="background:#eef2f7;border-left:4px solid #1a3a5c;padding:8px 12px;border-radius:4px;margin-bottom:10px;">
      <strong style="color:#1a3a5c;">BETRIEBSANWEISUNG – GLASREINIGUNG</strong><br>
      <span style="font-size:11px;color:#555;font-style:italic;">Reinigung von Glasflächen, Fenstern, Fassaden, Glasdächern und Lichthöfen – inkl. Höhenarbeit mittels SZP / PSAgA</span>
    </div>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">1 &nbsp;ANWENDUNGSBEREICH</div>
    <p style="font-size:12px;margin:4px 0 10px 0;color:#222;">Diese Betriebsanweisung gilt für alle Mitarbeiter der CSC GmbH, die Glasreinigungsarbeiten an Gebäuden ausführen. Dazu gehören Fenster- und Fassadenreinigung, Reinigung von Glasdächern, Atrien, Lichthöfen, Vordächern, Wintergärten und Brüstungsverglasungen, einschließlich Tätigkeiten mit Hebebühne, Leiter, Teleskopstange sowie Seilzugangs- und Positionierungstechniken (SZP) mit PSA gegen Absturz (PSAgA). Grundlage: ArbSchG, BetrSichV, DGUV Vorschrift 1, DGUV Vorschrift 38, DGUV Information 201-056, DGUV Regel 112-198/199, TRBS 2121 Teil 3, TRGS 401.</p>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">2 &nbsp;GEFAHREN FÜR MENSCH UND UMWELT</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Absturz von Leitern, Hebebühnen, Fensterbänken, Brüstungen – tödliche Verletzungsgefahr</li>
      <li>Hängetrauma (orthostatischer Schock) nach Sturz im Seil – innerhalb weniger Minuten lebensbedrohlich</li>
      <li>Glasbruch / Durchbruch durch nicht durchsturzsichere Verglasung (Glasdach, Lichtkuppeln)</li>
      <li>Schnittverletzungen durch scharfe Klingen am Glasschaber und Glasbruchstücke</li>
      <li>Augenverletzungen durch Spritzer von Reinigungsmitteln und Glassplitter</li>
      <li>Verätzungen, Hautreizungen durch alkalische und saure Reiniger</li>
      <li>Infektionsgefahr durch Vogelkot, Taubenexkremente, Schimmel an Fassaden</li>
      <li>Stromschlag durch beschädigte Elektrogeräte oder Nässe in Verbindung mit Strom</li>
      <li>Rutsch- und Stolpergefahr auf nassen, glatten Glas- und Steinflächen</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">3 &nbsp;SCHUTZMASSNAHMEN UND VERHALTENSREGELN</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li><strong>Schutzbrille EN 166</strong> bei Über-Kopf-Arbeit, Reinigern und Klingengebrauch verpflichtend</li>
      <li>Bei Sprühnebel / lösemittelhaltigen Reinigern: Atemschutz mind. <strong>FFP2</strong>; bei Vogelkot/Schimmel <strong>FFP3 + Einweganzug</strong></li>
      <li>Sicherheitsschuhe S3, Schutzhelm mit Kinnriemen (EN 397), Warnkleidung EN ISO 20471 Kl. 2</li>
      <li>Schutzhandschuhe nach SDB (Nitril/Butyl, schnittfest EN 388 für Klingenarbeiten)</li>
      <li>Werkzeuge gegen Herabfallen sichern: Lanyards, Werkzeugschnüre, Werkzeugpouches</li>
      <li>Bodenbereich absperren: Bauzaun oder Absperrband + Hinweisschilder; bei Publikumsverkehr Bodenposten</li>
      <li>Bei SZP/PSAgA: Gurtpflicht, Buddy-Check, mind. 2 Personen, Sicht- und Rufkontakt</li>
      <li>Wetterbedingungen prüfen: bei Wind &gt; 6 Bft, Gewitter, Eis, Schnee → <strong>Tätigkeit einstellen</strong></li>
      <li>Alleinarbeit verboten. Ausschließlich zugelassene Reinigungsmittel mit aktuellem Sicherheitsdatenblatt verwenden</li>
      <li>Personen unter Einfluss von Alkohol, Drogen oder Medikamenten dürfen nicht eingesetzt werden</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">4 &nbsp;VERHALTEN BEI STÖRUNGEN UND MÄNGELN</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Beschädigte Reinigungsgeräte, Klingen, Teleskopstangen oder PSAgA-Komponenten vor Nutzung dem Vorgesetzten melden</li>
      <li>Glasbruch oder Beschädigung am Objekt sofort stoppen, sichern und melden</li>
      <li>Bei Verunreinigung durch Chemikalien: Bereich sperren, Sicherheitsdatenblatt konsultieren</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">5 &nbsp;ERSTE HILFE UND VERHALTEN IM NOTFALL</div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0 6px 0;">
      <div style="background:#c00;color:#fff;border-radius:6px;padding:4px 14px;font-size:20px;font-weight:900;letter-spacing:2px;">112</div>
      <span style="font-size:12px;font-weight:700;">NOTRUF</span>
    </div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Ruhe bewahren – Eigensicherung beachten – Überblick verschaffen</li>
      <li>Notruf <strong>112</strong>: WER? WAS? WO? WIE VIELE? – WARTEN auf Rückfragen</li>
      <li>Bei Sturz im Seil: Rettung nach <strong>UNTEN</strong> zum Boden – innerhalb <strong>15–20 Minuten</strong> (Hängetrauma!)</li>
      <li>Bei Schnittverletzungen: starke Blutung mit Druckverband stillen; Glassplitter <strong>NICHT entfernen</strong></li>
      <li>Bei Augenkontakt mit Chemie: Augendusche / klares Wasser mind. <strong>15 Min.</strong> spülen</li>
      <li>Bei Hautkontakt mit Reinigungsmitteln: kontaminierte Kleidung entfernen, Haut spülen, SDB bereithalten</li>
      <li>Bei Einatmen von Aerosolen: betroffene Person an frische Luft, ruhig lagern</li>
      <li>Auch ohne äußere Verletzungszeichen ärztliche Untersuchung – insbesondere nach Sturz, Hängetrauma, Chemikalienkontakt</li>
      <li>Arbeitsunfälle und Beinaheunfälle umgehend dem Aufsichtsführenden und der BG BAU melden</li>
    </ul>

    <div style="background:#1a3a5c;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:4px;">6 &nbsp;INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG</div>
    <ul style="margin:4px 0 10px 16px;padding:0;font-size:12px;">
      <li>Vor, nach und während jeder Benutzung Sichtprüfung aller Arbeitsmittel und PSA</li>
      <li>PSAgA: jährliche Sachkundigenprüfung nach DGUV Grundsatz 312-906 / DGUV Regel 112-198</li>
      <li>Leitern und Hubarbeitsbühnen: regelmäßige Prüfung nach BetrSichV § 14 (jährlich durch befähigte Person)</li>
      <li>Reinigungsmittel: aktuelle Sicherheitsdatenblätter vorhalten; Gefahrstoffverzeichnis pflegen</li>
      <li>Unterweisung vor jedem Einsatz und mindestens <strong>1× jährlich</strong>; Nachweis aufbewahren (mind. 2 Jahre)</li>
    </ul>`,

  rettung: `
    <div style="background:#ffeaea;border-left:4px solid #c00;padding:10px 12px;border-radius:4px;margin-bottom:16px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#c00;letter-spacing:2px;">⚠  RETTUNGSPLAN  ⚠</div>
      <div style="font-size:13px;font-weight:700;color:#1a3a5c;margin-top:4px;">Glasreinigung / SZP – Rettung nach UNTEN</div>
      <div style="font-size:11px;color:#555;">Gemäß DGUV Vorschrift 1 · DIN EN 363</div>
    </div>

    <div style="background:#c00;color:#fff;border-radius:8px;padding:12px 16px;text-align:center;margin-bottom:16px;font-size:22px;font-weight:900;letter-spacing:3px;">
      112
    </div>

    <div style="font-size:13px;">
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">1</span>
        <span><strong>Ruhe bewahren</strong> – Eigensicherung beachten – Überblick verschaffen</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">2</span>
        <span>Notruf <strong>112</strong>: WER? WAS? WO? WIE VIELE? – auf Rückfragen warten</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;background:#fff3cd;padding:8px;border-radius:6px;">
        <span style="background:#e6a817;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">3</span>
        <span>Verunglückten Person aus hängender Lage retten – Rettung grundsätzlich <strong>nach UNTEN zum Boden</strong></span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;background:#ffeaea;padding:8px;border-radius:6px;">
        <span style="background:#c00;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">!</span>
        <span><strong>Hängetrauma-Gefahr:</strong> Rettung muss innerhalb <strong>15–20 Minuten</strong> erfolgen – auch ohne Sturz!</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">4</span>
        <span>Erste-Hilfe-Maßnahmen einleiten (Ersthelfer: alle MA aus SZP)</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">5</span>
        <span>Gerettete Person <strong>flach lagern</strong> (NICHT aufrecht setzen – Hängetraumaschutz)</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">6</span>
        <span>Auch ohne äußere Verletzungen: <strong>Arzt aufsuchen!</strong></span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:12px;">7</span>
        <span>Arbeitsunfall dem Aufsichtsführenden und der <strong>BG BAU melden</strong> (DGUV Vorschrift 1 § 24)</span>
      </div>
    </div>

    <div style="margin-top:14px;padding:10px;background:#eef2f7;border-radius:6px;font-size:12px;color:#1a3a5c;">
      <strong>Ersthelfer:</strong> Alle MA aus SZP &nbsp;·&nbsp; <strong>Verbandskasten:</strong> Am Einsatzort &nbsp;·&nbsp; <strong>Notruf:</strong> 112
    </div>`
};

let _baAktivTab = 'psaga';

function baModalOeffnen() {
  // Tab-Labels dynamisch je nach Listentyp setzen
  const isSZP = currentBereich && currentBereich.liste === 'gfb_szp';
  const tabGlas = document.getElementById('ba-tab-glas');
  const tabPsaga = document.getElementById('ba-tab-psaga');
  if (isSZP) {
    if (tabPsaga) tabPsaga.innerHTML = '⛑ BA PSAgA';
    if (tabGlas)  tabGlas.innerHTML  = '🧗 BA SZP';
  } else {
    if (tabPsaga) tabPsaga.innerHTML = '⛑ PSAgA';
    if (tabGlas)  tabGlas.innerHTML  = '🪟 Glasreinigung';
  }
  _baAktivTab = isSZP ? 'glas' : 'psaga'; // SZP: zuerst BA SZP; Glas: zuerst PSAgA
  baTabWechseln(_baAktivTab);
  document.getElementById('ba-modal-overlay').style.display = 'block';
}

function baModalSchliessen(e) {
  if (e && e.target !== document.getElementById('ba-modal-overlay')) return;
  document.getElementById('ba-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function baTabWechseln(tab) {
  _baAktivTab = tab;
  const tabs = ['psaga', 'glas', 'rettung'];
  tabs.forEach(t => {
    const btn = document.getElementById('ba-tab-' + t);
    if (!btn) return;
    if (t === tab) {
      btn.style.color = '#1a3a5c';
      btn.style.fontWeight = '700';
      btn.style.borderBottom = '3px solid #1a3a5c';
    } else {
      btn.style.color = '#666';
      btn.style.fontWeight = '400';
      btn.style.borderBottom = '3px solid transparent';
    }
  });
  const isSZP = currentBereich && currentBereich.liste === 'gfb_szp';
  const inhalt = document.getElementById('ba-modal-inhalt');
  if (inhalt) {
    if (isSZP) {
      // SZP: Tab "glas" → BA SZP, Tab "psaga" → BA PSAgA, Tab "rettung" → Rettungsplan SZP
      if (tab === 'glas') inhalt.innerHTML = BA_INHALTE.szp || '';
      else if (tab === 'rettung') inhalt.innerHTML = BA_INHALTE.rettung_szp || '';
      else inhalt.innerHTML = BA_INHALTE[tab] || '';
    } else {
      inhalt.innerHTML = BA_INHALTE[tab] || '';
    }
  }
}

// ===== GFB MITARBEITER =====
function gfbMaHinzufuegen() {
  const idx = gfbMitarbeiter.length;
  gfbMitarbeiter.push({ name: '', sigCanvas: null });

  const container = document.getElementById('gfb-ma-liste');
  const div = document.createElement('div');
  div.className = 'gfb-ma-eintrag';
  div.id = 'gfb-ma-' + idx;
  div.innerHTML = `
    <input type="text" id="gfb-ma-name-${idx}" placeholder="Name Mitarbeiter …" autocomplete="name"
      oninput="gfbMitarbeiter[${idx}].name = this.value">
    <div class="gfb-ma-sig-label">Unterschrift:</div>
    <div class="gfb-ma-sig-wrap">
      <canvas id="gfb-ma-canvas-${idx}" height="80"></canvas>
      <button type="button" class="btn-secondary gfb-ma-loeschen" onclick="gfbMaLoeschen(${idx})">✕ Entfernen</button>
    </div>
    <button type="button" class="btn-secondary btn-ma-sig-clear" onclick="gfbMaSigClear(${idx})">✕ Signatur löschen</button>
  `;
  container.appendChild(div);

  // Canvas initialisieren
  const canvas = document.getElementById('gfb-ma-canvas-' + idx);
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
  canvas.height = 80 * (window.devicePixelRatio || 1);
  gfbMitarbeiter[idx].sigCanvas = canvas;

  let drawing = false, lx = 0, ly = 0;
  function getP(e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
  }
  canvas.addEventListener('mousedown',  e => { drawing = true; const p = getP(e); lx = p.x; ly = p.y; });
  canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0047CC'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lx = p.x; ly = p.y; });
  canvas.addEventListener('mouseup',    () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); drawing = true; const p = getP(e); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); e.stopPropagation(); if (!drawing) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0047CC'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.stopPropagation(); drawing = false; });
}

function gfbMaLoeschen(idx) {
  gfbMitarbeiter[idx] = null;
  const el = document.getElementById('gfb-ma-' + idx);
  if (el) el.remove();
}

function gfbMaSigClear(idx) {
  const canvas = document.getElementById('gfb-ma-canvas-' + idx);
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ===== LMRA VORLAGE SPEICHERN / LADEN =====
function lmraVorlageSpeichern() {
  const vorlage = {
    objekt:          (document.getElementById('lmra-objekt')          || {}).value?.trim() || '',
    adresse:         (document.getElementById('lmra-adresse')         || {}).value?.trim() || '',
    auftraggeber:    (document.getElementById('lmra-auftraggeber')    || {}).value?.trim() || '',
    ansprechpartner: (document.getElementById('lmra-ansprechpartner') || {}).value?.trim() || '',
    telefon:         (document.getElementById('lmra-telefon')         || {}).value?.trim() || '',
  };
  if (!vorlage.objekt) { alert('Bitte zuerst Objekt eintragen.'); return; }
  localStorage.setItem('csc_lmra_vorlage', JSON.stringify(vorlage));
  const btn = document.querySelector('#lmra-ma-box .btn-secondary[onclick="lmraVorlageSpeichern()"]');
  if (btn) { btn.textContent = '✅ Vorlage gespeichert!'; setTimeout(() => { btn.textContent = '💾 Objekt als Vorlage speichern'; }, 2000); }
}

function lmraVorladeLaden() {
  const raw = localStorage.getItem('csc_lmra_vorlage');
  if (!raw) { alert('Keine gespeicherte Vorlage gefunden.'); return; }
  try {
    const v = JSON.parse(raw);
    if (document.getElementById('lmra-objekt'))          document.getElementById('lmra-objekt').value          = v.objekt          || '';
    if (document.getElementById('lmra-adresse'))         document.getElementById('lmra-adresse').value         = v.adresse         || '';
    if (document.getElementById('lmra-auftraggeber'))    document.getElementById('lmra-auftraggeber').value    = v.auftraggeber    || '';
    if (document.getElementById('lmra-ansprechpartner')) document.getElementById('lmra-ansprechpartner').value = v.ansprechpartner || '';
    if (document.getElementById('lmra-telefon'))         document.getElementById('lmra-telefon').value         = v.telefon         || '';
  } catch(e) { alert('Vorlage konnte nicht geladen werden.'); }
}

// ===== LMRA MITARBEITER =====
function lmraMaHinzufuegen() {
  const aktive = lmraMitarbeiter.filter(m => m !== null).length;
  if (aktive >= 7) {
    alert('Maximal 7 Mitarbeiter möglich.');
    return;
  }
  const idx = lmraMitarbeiter.length;
  lmraMitarbeiter.push({ name: '', sigCanvas: null, bedenken: false });

  // Add-Button ausblenden wenn 8 erreicht
  const addBtn = document.getElementById('lmra-ma-add-btn');
  if (addBtn && lmraMitarbeiter.filter(m => m !== null).length >= 8) {
    addBtn.style.display = 'none';
  }

  const container = document.getElementById('lmra-ma-liste');
  const div = document.createElement('div');
  div.className = 'gfb-ma-eintrag';
  div.id = 'lmra-ma-' + idx;
  div.innerHTML = `
    <input type="text" id="lmra-ma-name-${idx}" placeholder="Name Mitarbeiter …" autocomplete="name"
      oninput="lmraMitarbeiter[${idx}].name = this.value">
    <label style="display:flex;align-items:center;gap:10px;margin:8px 0;padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;cursor:pointer">
      <input type="checkbox" id="lmra-ma-cb-${idx}" style="width:22px;height:22px;cursor:pointer;accent-color:#16a34a"
        onchange="lmraMitarbeiter[${idx}].bedenken = this.checked">
      <span style="font-size:14px;font-weight:600;color:#15803d">✅ Ich habe keine Bedenken — die Arbeit ist aus meiner Sicht sicher.</span>
    </label>
    <div class="gfb-ma-sig-label">Unterschrift zur Bestätigung:</div>
    <div class="gfb-ma-sig-wrap">
      <canvas id="lmra-ma-canvas-${idx}" height="80"></canvas>
      <button type="button" class="btn-secondary gfb-ma-loeschen" onclick="lmraMaLoeschen(${idx})">✕ Entfernen</button>
    </div>
    <button type="button" class="btn-secondary btn-ma-sig-clear" onclick="lmraMaSigClear(${idx})">✕ Signatur löschen</button>
  `;
  container.appendChild(div);

  const canvas = document.getElementById('lmra-ma-canvas-' + idx);
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
  canvas.height = 80 * (window.devicePixelRatio || 1);
  lmraMitarbeiter[idx].sigCanvas = canvas;

  let drawing = false, lx = 0, ly = 0;
  function getP(e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
  }
  canvas.addEventListener('mousedown',  e => { drawing = true; const p = getP(e); lx = p.x; ly = p.y; });
  canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0047CC'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lx = p.x; ly = p.y; });
  canvas.addEventListener('mouseup',    () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); drawing = true; const p = getP(e); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); e.stopPropagation(); if (!drawing) return; const p = getP(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0047CC'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.stopPropagation(); drawing = false; });
}

function lmraMaLoeschen(idx) {
  lmraMitarbeiter[idx] = null;
  const el = document.getElementById('lmra-ma-' + idx);
  if (el) el.remove();
  // Add-Button wieder einblenden wenn unter 7
  const addBtn = document.getElementById('lmra-ma-add-btn');
  if (addBtn) addBtn.style.display = '';
}

function lmraMaSigClear(idx) {
  const canvas = document.getElementById('lmra-ma-canvas-' + idx);
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ===== LMRA AUFSICHTSFÜHRENDER UNTERSCHRIFT =====
let lmraAufCanvas = null;
let lmraAufCtx = null;

function lmraAufSigInit() {
  const canvas = document.getElementById('lmra-auf-canvas');
  if (!canvas || lmraAufCanvas === canvas) return;
  lmraAufCanvas = canvas;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = 140 * dpr;
  lmraAufCtx = canvas.getContext('2d');
  lmraAufCtx.scale(dpr, dpr);

  let drawing = false, lx = 0, ly = 0;
  function getP(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function draw(p) {
    lmraAufCtx.beginPath();
    lmraAufCtx.moveTo(lx, ly);
    lmraAufCtx.lineTo(p.x, p.y);
    lmraAufCtx.strokeStyle = '#1a3a5c';
    lmraAufCtx.lineWidth = 2.5;
    lmraAufCtx.lineCap = 'round';
    lmraAufCtx.stroke();
    lx = p.x; ly = p.y;
  }
  canvas.addEventListener('mousedown',  e => { drawing = true; const p = getP(e); lx = p.x; ly = p.y; });
  canvas.addEventListener('mousemove',  e => { if (!drawing) return; draw(getP(e)); });
  canvas.addEventListener('mouseup',    () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); drawing = true; const p = getP(e); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); e.stopPropagation(); if (!drawing) return; draw(getP(e)); }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.stopPropagation(); drawing = false; });
}

function lmraAufSigClear() {
  if (lmraAufCanvas) lmraAufCtx.clearRect(0, 0, lmraAufCanvas.width, lmraAufCanvas.height);
}

function lmraAufSigIsEmpty() {
  if (!lmraAufCanvas) return true;
  const empty = document.createElement('canvas');
  empty.width = lmraAufCanvas.width;
  empty.height = lmraAufCanvas.height;
  return lmraAufCanvas.toDataURL() === empty.toDataURL();
}

// ===== PRÜFUNG ABSCHLIESSEN =====
async function submitChecklist() {
  const offene = Object.values(pruefErgebnisse).filter(v => v === null).length;
  if (offene > 0) {
    if (!confirm(`${offene} Prüfpunkt(e) noch nicht bewertet. Trotzdem fortfahren?`)) return; // confirm() bleibt (kein LMRA-spezifisch)
  }
  const isLMRA2 = (currentBereich.liste === 'lmra_hubarbeitsbuehne');
  const isGFB2 = (currentBereich.liste === 'gfb_szp' || currentBereich.liste === 'gfb_glasreinigung');
  // Bei LMRA: eigenes Namensfeld lmra-aufsicht-name prüfen
  if (isLMRA2) {
    const aufsichtName = (document.getElementById('lmra-aufsicht-name') || {}).value?.trim();
    if (!aufsichtName) {
      showToast('Bitte Name des Aufsichtsführenden eingeben.');
      document.getElementById('lmra-aufsicht-name')?.focus();
      return;
    }
  } else if (!document.getElementById('pruefer-name').value.trim()) {
    showToast(isGFB2 ? 'Bitte Name des Aufsichtsführenden eingeben.' : 'Bitte Name des Prüfers eingeben.');
    return;
  }
  // LMRA: Mindestens ein Mitarbeiter mit Name + Unterschrift erforderlich
  if (currentBereich.liste === 'lmra_hubarbeitsbuehne') {
    const aktiveMaLMRA = lmraMitarbeiter.filter(m => m !== null && m.name.trim());
    if (aktiveMaLMRA.length === 0) {
      showToast('Bitte mindestens einen Mitarbeiter mit Name eintragen.');
      return;
    }
    // Checkbox-Pflicht
    const ohneBedenken = aktiveMaLMRA.filter(m => !m.bedenken);
    if (ohneBedenken.length > 0) {
      const namen = ohneBedenken.map(m => m.name).join(', ');
      if (!confirm(`Folgende Mitarbeiter haben "Ich habe keine Bedenken" nicht bestätigt:\n${namen}\n\nTrotzdem fortfahren?`)) return;
    }
    // Aufsichtsführender-Unterschrift Pflicht
    if (lmraAufSigIsEmpty()) {
      showToast('Bitte Unterschrift des Aufsichtsführenden eintragen.');
      document.getElementById('lmra-auf-sig-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
  // Leiter-Nr. Pflichtfeld
  if (currentBereich.liste === 'leiterkontrolle') {
    const leiterNrVal = document.getElementById('leiter-nr').value.trim();
    if (!leiterNrVal) {
      alert('Bitte Leiter-Nr. eingeben (z. B. L-01).');
      document.getElementById('leiter-nr').focus();
      return;
    }
  }

  showLoading(true);
  try {
    const pdfBlob = await generatePDF();
    let driveOk = false;
    let driveFileId = null;
    try {
      const driveResult = await uploadToDrive(pdfBlob);
      driveOk = true;
      driveFileId = driveResult?.id || null;
    } catch (driveErr) {
      console.warn('[Drive] Upload fehlgeschlagen:', driveErr.message);
      // PDF immer lokal herunterladen als Backup
      try {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        const now = new Date();
        a.href = url;
        a.download = `${formatDatumISO(now)}_${currentBereich.id}_BACKUP.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch(dlErr) { console.warn('[Backup-Download] fehlgeschlagen:', dlErr.message); }
      offlineQueueAdd(pdfBlob);
      // Fehlermeldung merken für showResult
      window._driveUploadFehler = driveErr.message === 'TOKEN_ABGELAUFEN'
        ? 'TOKEN_ABGELAUFEN'
        : 'UPLOAD_FEHLER';
    }

    // ── Firebase: Prüfung speichern ──────────────────────────
    const bemerkungText = document.getElementById('bemerkung').value.trim();
    // Bei LMRA: Name aus eigenem Feld, sonst aus pruefer-name
    const prueferName = isLMRA2
      ? (document.getElementById('lmra-aufsicht-name')?.value.trim() || '')
      : document.getElementById('pruefer-name').value.trim();
    if (typeof window.fbSavePruefung === 'function') {
      // Bei Leiterkontrolle: bereichId dynamisch je Leiter-Nr. (z. B. "leiter_L-01")
      const leiterNrSave = (currentBereich.liste === 'leiterkontrolle')
        ? document.getElementById('leiter-nr').value.trim() : null;
      const fbBereichId = leiterNrSave
        ? `leiter_${leiterNrSave.replace(/[^a-zA-Z0-9\-_]/g, '_')}`
        : currentBereich.id;
      const fbBereichName = leiterNrSave
        ? `Leiter ${leiterNrSave}` : currentBereich.name;
      await window.fbSavePruefung({
        bereichId:   fbBereichId,
        standortId:  currentStandort.id,
        standortName:currentStandort.name,
        bereichName: fbBereichName,
        listentyp:   currentBereich.liste,
        pruefer:     prueferName,
        datum:       new Date(),
        hatMaengel:  bemerkungText.length > 0,
        maengelText: bemerkungText,
        driveFileId: driveFileId,
        // LMRA-spezifische Zusatzfelder
        ...(currentBereich.liste === 'lmra_hubarbeitsbuehne' ? {
          lmraObjekt:          (document.getElementById('lmra-objekt')          || {}).value?.trim() || '',
          lmraAdresse:         (document.getElementById('lmra-adresse')         || {}).value?.trim() || '',
          lmraAuftraggeber:    (document.getElementById('lmra-auftraggeber')    || {}).value?.trim() || '',
          lmraAnsprechpartner: (document.getElementById('lmra-ansprechpartner') || {}).value?.trim() || '',
          lmraTelefon:         (document.getElementById('lmra-telefon')         || {}).value?.trim() || '',
          lmraDatum:           (document.getElementById('lmra-datum')           || {}).value?.trim() || '',
          lmraUhrzeit:         (document.getElementById('lmra-uhrzeit')         || {}).value?.trim() || '',
          lmraMitarbeiter:     lmraMitarbeiter.filter(m => m !== null && m.name.trim()).map(m => ({ name: m.name.trim(), bedenken: !!m.bedenken })),
        } : {}),
      });

      // FEATURE 10: Audit-Trail — PDF-Hash berechnen und in Firestore speichern
      try {
        const pdfArr = await pdfBlob.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', pdfArr);
        const pdfHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
        if (typeof window.fbSaveAuditHash === 'function') {
          await window.fbSaveAuditHash({
            bereichId: fbBereichId,
            listentyp: currentBereich.liste,
            pruefer: prueferName,
            datum: new Date(),
            pdfHash,
            driveFileId
          });
        }
      } catch(hashErr) { console.warn('[Audit] Hash berechnen fehlgeschlagen:', hashErr.message); }
    }
    // ─────────────────────────────────────────────────────────

    // ── E-Mail anbieten (nicht bei LMRA — PDF liegt in Drive) ────
    const session = checkSession();
    const isLMRAsubmit = (currentBereich.liste === 'lmra_hubarbeitsbuehne');
    if (!isLMRAsubmit && session && session.sendTo) {
      currentPdfBlob = pdfBlob;
      showResult(true, driveOk, session.sendTo);
    } else {
      showResult(true, driveOk, null);
    }
  } catch (err) {
    console.error(err);
    showResult(false, false, null, err.message);
  } finally {
    showLoading(false);
  }
}

// ===== PDF GENERIEREN =====
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const now = new Date();
  const isLMRApdf2 = (currentBereich.liste === 'lmra_hubarbeitsbuehne');
  const pruefer = isLMRApdf2
    ? (document.getElementById('lmra-aufsicht-name')?.value.trim() || '')
    : document.getElementById('pruefer-name').value.trim();
  const bemerkung = document.getElementById('bemerkung').value.trim();
  const formularStandort = document.getElementById('formular-standort').value.trim();
  const aufzugNr = document.getElementById('aufzug-nr').value.trim();
  const leiterNr  = document.getElementById('leiter-nr').value.trim();
  const leiterTyp = document.getElementById('leiter-typ').value.trim();
  const gfbObjekt = document.getElementById('gfb-objekt').value.trim();
  const gfbAuftraggeber = document.getElementById('gfb-auftraggeber').value.trim();
  const gfbAnsprechpartner = document.getElementById('gfb-ansprechpartner').value.trim();

  const PL = 15, PT = 15, PW = 180;
  let y = PT;

  // Header
  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('CSC Hannover', PL, 12);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(currentListe.titel, PL, 20);
  doc.text(`${currentStandort.name} · ${currentBereich.name}`, PL, 26);
  y = 36;

  // Meta
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Datum: ${formatDatum(now)}`, PL, y);
  doc.text(`KW ${getKW(now)}`, PL + 60, y);
  doc.text(`Prüfer: ${pruefer}`, PL + 100, y);
  y += 6;
  if (isLMRApdf2) {
    // LMRA: Objekt + Adresse aus lmra-einsatz-box
    const lmraObjVal  = (document.getElementById('lmra-objekt')?.value.trim()) || '';
    const lmraAdrVal  = (document.getElementById('lmra-adresse')?.value.trim()) || '';
    if (lmraObjVal) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Objekt: ${lmraObjVal}`, PL, y);
      doc.setFont('helvetica', 'normal');
      y += 6;
    }
    if (lmraAdrVal) {
      doc.text(`Adresse: ${lmraAdrVal}`, PL, y);
      y += 6;
    }
  } else if (formularStandort) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Standort: ${formularStandort}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  if (aufzugNr) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Aufzug-Nr.: ${aufzugNr}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  if (leiterNr) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Leiter-Nr.: ${leiterNr}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  if (leiterTyp) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Leiter-Typ / Inventar-Nr.: ${leiterTyp}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  if (gfbObjekt) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Objekt / Einsatzort: ${gfbObjekt}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  if (gfbAuftraggeber) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Auftraggeber / Kunde: ${gfbAuftraggeber}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  if (gfbAnsprechpartner) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Ansprechpartner vor Ort: ${gfbAnsprechpartner}`, PL, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }
  doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y);
  y += 6;

  // Bei GFB SZP: Abschnittstitel + Legende vor den Prüfpunkten
  const isGFBszpPage1 = (currentBereich.liste === 'gfb_szp' || currentBereich.liste === 'gfb_glasreinigung');
  if (isGFBszpPage1) {
    doc.setFillColor(238, 242, 247); doc.rect(PL, y - 3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('2  GEFÄHRDUNGSGRUPPEN-ANALYSE', PL + 2, y + 3); y += 12; doc.setTextColor(0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Legende: Spalte "Rel." = Relevant für diesen Einsatz (x = ja). Schutzmaßnahmen nach T-O-P-Prinzip (Technisch > Organisatorisch > Persönlich).', PL, y);
    y += 7;
  }

  // Abschnitte & Prüfpunkte (mit Editor-Anpassungen)
  const abschnitteAktuellPDF = editorGetPunkte(currentBereich.liste) || currentListe.abschnitte;
  abschnitteAktuellPDF.forEach(abschnitt => {
    doc.setFillColor(238, 242, 247);
    doc.rect(PL, y - 4, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.setTextColor(26, 58, 92);
    doc.text(abschnitt.titel.toUpperCase(), PL + 2, y + 1);
    y += 9;

    abschnitt.punkte.forEach(punkt => {
      const ergebnis = pruefErgebnisse[punkt.id];
      const ok  = ergebnis === 'ok';
      const nok = ergebnis === 'nok';

      if (y > 265) { doc.addPage(); y = PT; }

      if (nok) { doc.setFillColor(255, 235, 235); doc.rect(PL, y - 4, PW, 8, 'F'); }
      if (ok)  { doc.setFillColor(241, 248, 241); doc.rect(PL, y - 4, PW, 8, 'F'); }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
      const lines = doc.splitTextToSize(punkt.text, PW - 24);
      doc.text(lines, PL + 2, y);

      const statusX = PL + PW - 20;
      if (ok) {
        doc.setFillColor(46, 125, 50); doc.roundedRect(statusX, y - 4, 18, 7, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
        doc.text('i.O.', statusX + 4, y + 1);
      } else if (nok) {
        doc.setFillColor(198, 40, 40); doc.roundedRect(statusX, y - 4, 18, 7, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
        doc.text('n.i.O.', statusX + 2, y + 1);
      } else {
        doc.setDrawColor(180, 180, 180); doc.roundedRect(statusX, y - 4, 18, 7, 2, 2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
        doc.text('—', statusX + 7, y + 1);
      }

      y += Math.max(lines.length * 5, 8);
    });
    y += 4;
  });

  // Bemerkungen — nur wenn ausgefüllt
  if (bemerkung) {
    if (y > 240) { doc.addPage(); y = PT; }
    doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
    doc.text('BEMERKUNGEN / MÄNGEL', PL, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);
    const lines = doc.splitTextToSize(bemerkung, PW);
    doc.text(lines, PL, y); y += lines.length * 5 + 6;
  }

  // ===== GFB: Risikobewertung nach Gefährdungsgruppen =====
  const isGFBrisk = (currentBereich.liste === 'gfb_szp' || currentBereich.liste === 'gfb_glasreinigung');
  if (isGFBrisk) {
    // Seite Risikobewertung (wie Seite 4 im Original)
    doc.addPage(); y = PT;
    // Seitenheader (gleiche Funktion wird später nach isGFBpdf-Block definiert — hier inline)
    doc.setFillColor(26, 58, 92); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('GEFÄHRDUNGSBEURTEILUNG', PL, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA', PL, 17);
    doc.setFontSize(8);
    doc.text('Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DIN EN 363', PL, 21);
    doc.setTextColor(0); y = 28;

    // Abschnittstitel
    doc.setFillColor(238, 242, 247); doc.rect(PL, y - 3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('3  RISIKOBEWERTUNG UND MASSNAHMENPLANUNG', PL + 2, y + 3);
    y += 12; doc.setTextColor(0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Risiko = Eintrittswahrscheinlichkeit (E: 1–6) × Schadensschwere (S: A–F). Maßnahmen reduzieren das Risiko auf ein akzeptables Restrisiko.', PL, y);
    y += 7;

    // Tabellenkopf
    const cNr=8, cGef=50, cE=8, cS=8, cMass=60, cEn=8, cSn=8, cVer=22, cErl=18;
    const cols = [PL, PL+cNr, PL+cNr+cGef, PL+cNr+cGef+cE, PL+cNr+cGef+cE+cS,
                  PL+cNr+cGef+cE+cS+cMass, PL+cNr+cGef+cE+cS+cMass+cEn,
                  PL+cNr+cGef+cE+cS+cMass+cEn+cSn, PL+cNr+cGef+cE+cS+cMass+cEn+cSn+cVer];
    const rowH = 7;

    function risikoZeile(doc, zeile, nr, gef, e, s, mass, en, sn, ver, erl, isHeader) {
      if (zeile > 268) { doc.addPage(); zeile = PT + 8; }
      const bg = isHeader ? [26, 58, 92] : (nr % 2 === 0 ? [248, 249, 251] : [255, 255, 255]);
      doc.setFillColor(...bg); doc.rect(PL, zeile, PW, rowH, 'F');
      doc.setDrawColor(200, 200, 200); doc.rect(PL, zeile, PW, rowH, 'S');
      const tc = isHeader ? [255,255,255] : [0,0,0];
      doc.setTextColor(...tc);
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal'); doc.setFontSize(8);
      const massLines = doc.splitTextToSize(mass, cMass - 2);
      const hh = Math.max(massLines.length * 4.5, rowH);
      if (hh > rowH) {
        doc.setFillColor(...bg); doc.rect(PL, zeile, PW, hh, 'F');
        doc.setDrawColor(200,200,200); doc.rect(PL, zeile, PW, hh, 'S');
      }
      const cy = zeile + 5;
      doc.text(String(nr),   cols[0]+1, cy);
      doc.text(gef,          cols[1]+1, cy, { maxWidth: cGef-2 });
      doc.text(String(e),    cols[2]+1, cy);
      doc.text(String(s),    cols[3]+1, cy);
      doc.text(massLines,    cols[4]+1, cy);
      doc.text(String(en),   cols[5]+1, cy);
      doc.text(String(sn),   cols[6]+1, cy);
      doc.text(ver,          cols[7]+1, cy, { maxWidth: cVer-1 });
      doc.text(erl,          cols[8]+1, cy, { maxWidth: cErl-1 });
      return zeile + hh;
    }

    y = risikoZeile(doc, y, 'Nr.', 'Gefährdung (Tätigkeit)', 'E', 'S', 'Schutzmaßnahmen', 'E', 'S', 'Verantwortl.', 'Erl. bis', true);

    const risikoData = [
      [1, 'Absturz bei SZP-Einsatz', 4, 'F', 'PSAgA anlegen; Trag- + Sicherungsseil an 2 unabh. Ankerpunkten; Buddy-Check', 2, 'C', 'Aufsichtf.', 'vor Einsatz'],
      [2, 'Absturz / Stolpern auf Wegen', 3, 'D', 'Gurtpflicht ab 3 m vor Absturzkante; PSAgA; geeignetes Schuhwerk', 1, 'B', 'Aufsichtf.', 'vor Einsatz'],
      [3, 'Unkontrollierter Pendelabsturz', 3, 'E', 'Sicherungsseil kurzhalten; Pendelbogen prüfen; sichere Abseilroute', 2, 'C', 'Aufsichtf.', 'vor Einsatz'],
      [4, 'Infektionen / Hygiene', 2, 'C', 'Hygiene- und Schutzvorschriften einhalten; ggf. Einweganzug', 1, 'B', 'Teamführer', 'täglich'],
      [5, 'Hitzestress / Kälte', 3, 'C', 'Ausreichend Flüssigkeit; witterungsgerechte Kleidung; Pausenregelung', 2, 'B', 'Teamführer', 'täglich'],
      [6, 'Dritte im Gefahrenbereich', 4, 'D', 'Absperrband + Hinweisschilder; Bodenpersonal einweisen; Bereich sichern', 2, 'B', 'Aufsichtf.', 'vor Einsatz'],
      [7, 'Materialfall / Werkzeugfall', 3, 'E', 'Werkzeuge sichern (Lanyards); Schutzhelm für alle Personen im Bereich', 2, 'C', 'Aufsichtf.', 'vor Einsatz'],
      [8, 'Ankerpunkte ungeeignet', 3, 'F', 'Ankerpunkte vor Nutzung prüfen; Prüfberichte vorhanden; ggf. Nachrüstung', 1, 'C', 'Aufsichtf.', 'vor Einsatz'],
    ];
    risikoData.forEach(r => {
      y = risikoZeile(doc, y, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], false);
    });
    y += 8;

    // Seite: Notfall- und Rettungsplan Kurzform (Seite 5 im Original)
    doc.addPage(); y = PT;
    doc.setFillColor(26, 58, 92); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('GEFÄHRDUNGSBEURTEILUNG', PL, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA', PL, 17);
    doc.setFontSize(8); doc.text('Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DIN EN 363', PL, 21);
    doc.setTextColor(0); y = 28;

    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('4  NOTFALL- UND RETTUNGSPLAN', PL+2, y+3); y += 12; doc.setTextColor(0);

    // Felder-Tabelle 2-spaltig wie Original
    const nfFelder = [
      ['Notruf:', '112 (Feuerwehr / Rettungsdienst)', 'Polizei:', '110'],
      ['Sammelplatz bei Evakuierung:', 'Laut Plan und Hinweise im Objekt', 'Erste-Hilfe-Material vorhanden:', 'Ja x   Nein  '],
    ];
    nfFelder.forEach(([l1, v1, l2, v2]) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 58, 92);
      doc.text(l1, PL+2, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      if (v1) doc.text(v1, PL+52, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 58, 92);
      doc.text(l2, PL+100, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      if (v2) doc.text(v2, PL+148, y);
      y += 8;
    });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 58, 92);
    doc.text('Rettungsweg / Rettungsverfahren:', PL+2, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0); y += 6;
    const rvLines = doc.splitTextToSize('Rettung einer verletzten/hängenden Person grundsätzlich nach UNTEN zum Boden. Rettungsplan aushängen. Alle Teammitglieder kennen den Plan.', PW-4);
    doc.text(rvLines, PL+2, y); y += rvLines.length*5 + 8;

    // Abschnitt 5: Freigabe und Unterschriften ENTFERNT (rot markiert)
  }

  // Fotos — nur wenn vorhanden
  const aktiveFotos = fotoListe.filter(f => f !== null);
  if (aktiveFotos.length > 0) {
    if (y > 220) { doc.addPage(); y = PT; }
    doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
    doc.text('FOTOS', PL, y); y += 8;
    const fotoW = 55, fotoH = 42, fotoGap = 5;
    let col = 0;
    for (const foto of aktiveFotos) {
      if (y + fotoH > 275) { doc.addPage(); y = PT; col = 0; }
      const x = PL + col * (fotoW + fotoGap);
      try {
        doc.addImage(foto.dataUrl, 'JPEG', x, y, fotoW, fotoH);
      } catch(e) {
        doc.addImage(foto.dataUrl, 'PNG', x, y, fotoW, fotoH);
      }
      col++;
      if (col >= 3) { col = 0; y += fotoH + fotoGap; }
    }
    if (col > 0) y += fotoH + fotoGap;
    y += 4;
  }

  // Unterschrift — immer anzeigen
  if (y > 240) { doc.addPage(); y = PT; }
  doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y); y += 6;

  // ===== GFB: Rettungsplan + Betriebsanweisung SZP + PSAgA als eigene Seiten =====
  const isGFBpdf = (currentBereich.liste === 'gfb_szp' || currentBereich.liste === 'gfb_glasreinigung');
  if (isGFBpdf) {

    // Hilfsfunktion: Seitenheader wie im Original
    function gfbHeader(doc, untertitel) {
      doc.setFillColor(26, 58, 92);
      doc.rect(0, 0, 210, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('GEFÄHRDUNGSBEURTEILUNG', PL, 10);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(untertitel, PL, 17);
      doc.setFontSize(8);
      doc.text('Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DIN EN 363', PL, 21);
      doc.setTextColor(0);
    }

    // Hilfsfunktion: Abschnittstitel wie im Original
    function gfbAbschnitt(doc, nr, titel, y) {
      doc.setFillColor(238, 242, 247);
      doc.rect(PL, y - 3, PW, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
      doc.text(`${nr}  ${titel}`, PL + 2, y + 3);
      doc.setTextColor(0);
      return y + 11;
    }

    // Hilfsfunktion: Aufzählung mit Symbol
    function gfbListe(doc, items, symbol, y) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
      items.forEach(text => {
        if (y > 270) { doc.addPage(); y = PT + 8; }
        const lines = doc.splitTextToSize(text, PW - 12);
        doc.text(symbol, PL + 2, y);
        doc.text(lines, PL + 8, y);
        y += lines.length * 5 + 2;
      });
      return y + 4;
    }

    if (currentBereich.liste === 'gfb_szp') {

      // ══════════════════════════════════════
      // SEITE: RETTUNGSPLAN (wie Seite 6 im Original)
      // ══════════════════════════════════════
      doc.addPage(); y = PT;
      gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA');
      y = 26;

      // Titel Rettungsplan
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(200, 0, 0);
      doc.text('⚠  RETTUNGSPLAN  ⚠', 105, y + 8, { align: 'center' });
      y += 14;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
      doc.text('Seilzugangs- und Positionierungstechnik (SZP) – Rettung nach UNTEN', 105, y, { align: 'center' });
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      doc.text('Gemäß DGUV Vorschrift 1  •  DIN EN 363  •  FISAT-Richtlinien', 105, y, { align: 'center' });
      y += 8;

      // Notruf-Box
      doc.setFillColor(200, 0, 0);
      doc.rect(PL, y, 55, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('NOTRUF', PL + 27, y + 7, { align: 'center' });
      doc.setFontSize(16);
      doc.text('112', PL + 27, y + 15, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Feuerwehr / Rettungsdienst', PL + 27, y + 20, { align: 'center' });

      // Hängetrauma-Warnung rechts
      doc.setFillColor(255, 240, 180);
      doc.rect(PL + 60, y, PW - 60, 18, 'F');
      doc.setTextColor(150, 60, 0);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('RETTUNG MUSS INNERHALB', PL + 62, y + 7);
      doc.setFontSize(11);
      doc.text('VON 15 MINUTEN ERFOLGEN!', PL + 62, y + 13);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('(Hängetrauma-Risiko!)', PL + 62, y + 18);
      y += 24;
      doc.setTextColor(0);

      // Zweispaltig: Gefährdungen | Rettungsgerät
      const colW = (PW - 4) / 2;
      const col1x = PL, col2x = PL + colW + 4;

      // Spaltenheader
      doc.setFillColor(26, 58, 92);
      doc.rect(col1x, y, colW, 7, 'F');
      doc.rect(col2x, y, colW, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
      doc.text('GEFÄHRDUNGEN & MASSNAHMEN', col1x + 2, y + 5);
      doc.text('ERFORDERLICHES RETTUNGSGERÄT', col2x + 2, y + 5);
      y += 10; doc.setTextColor(0);

      const gefItems = [
        'Hängetrauma: Rettung < 20 Min. – gut angepasster Gurt – Beinschlaufen entlasten – Beine bewegen lassen',
        'Absturz des Retters: PSA in Rückhaltefunktion, Seillänge kurz halten',
        'Ankerpunktversagen bei 2 Personen: Geeigneten AP wählen, separaten AP für Rettungsgerät vorsehen',
      ];
      const retItems = [
        'Abseilgerät + mitlaufendes Sicherungsgerät (Zulassung 2 Personen)',
        'Kantenschutz',
        'Erste-Hilfe-Verbandskasten',
        'Sachkundigenprüfung durchgeführt',
        'Rettung durch Teampartner',
      ];

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      let y1 = y, y2 = y;
      gefItems.forEach(t => {
        const lines = doc.splitTextToSize('⚠  ' + t, colW - 4);
        doc.text(lines, col1x + 2, y1);
        y1 += lines.length * 4.5 + 2;
      });
      retItems.forEach(t => {
        const lines = doc.splitTextToSize('✔  ' + t, colW - 4);
        doc.text(lines, col2x + 2, y2);
        y2 += lines.length * 4.5 + 2;
      });
      y = Math.max(y1, y2) + 6;

      // Durchführung Schritt für Schritt
      doc.setFillColor(26, 58, 92);
      doc.rect(PL, y, PW, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text('DURCHFÜHRUNG DER RETTUNG – SCHRITT FÜR SCHRITT:', PL + 2, y + 5);
      y += 10; doc.setTextColor(0);

      const schritte = [
        'Teampartner (MA 1) sichert sich selbst – Verbindungsmittel am eigenen Gurt kurz einstellen – und nimmt Kontakt zum Abgestürzten auf. Verletzungen feststellen, beruhigen!',
        'NOTRUF 112 absetzen! Meldung: WER? WAS ist passiert? WO genau? WIE VIELE Verletzte?',
        'Geeigneten Anschlagpunkt für das Rettungsgerät auswählen (vorzugsweise separat von den Arbeitsseilen).',
        'Kantenschutz anbringen falls notwendig – dabei Eigensicherung beachten!',
        'Verletzte Person so anschlagen (2 Abseilgeräte am Ankerpunkt), dass ein Ablassen (vom Abseilpunkt aus) möglich ist.',
        'Abgestürzten aus hängender Position kontrolliert nach UNTEN zum Boden abseilen.',
        'Vor dem Abseilen: Hindernisse im Abseilweg prüfen!',
        'Übernahme der verletzten Person aus dem geöffneten System (Bodennähe) mit zwei Personen.',
        'Erste-Hilfe-Maßnahmen einleiten – je nach Verletzung handeln.',
        'Auf den Notarzt warten – auch ohne äußere Verletzungszeichen ärztlich untersuchen lassen (Hängetrauma möglich)!',
      ];

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      schritte.forEach((s, i) => {
        if (y > 268) { doc.addPage(); y = PT + 8; }
        const lines = doc.splitTextToSize(s, PW - 12);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(String(i + 1), PL + 2, y);
        doc.setFont('helvetica', 'normal');
        doc.text(lines, PL + 8, y);
        y += lines.length * 5 + 2;
      });

      // Felder-Box unten ENTFERNT (rot markiert)

      // ══════════════════════════════════════
      // SEITE: BETRIEBSANWEISUNG SZP (Seite 7–8 Original)
      // ══════════════════════════════════════
      doc.addPage(); y = PT;
      gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA');
      y = 28;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(26, 58, 92);
      doc.text('Seilzugangs- und Positionierungstechniken (SZP)', PL, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
      doc.text('Seilunterstützte Zugangs- und Positionierungstechniken – Rope Access', PL, y); y += 8;
      doc.setTextColor(0);

      y = gfbAbschnitt(doc, '1', 'ANWENDUNGSBEREICH', y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const aw1 = doc.splitTextToSize('Diese Betriebsanweisung gilt für alle Mitarbeiter, die Seilzugangs- und Positionierungstechniken (SZP / Rope Access) anwenden. SZP kommt zum Einsatz, wenn aufgrund der Gefährdungsbeurteilung andere Zugangsverfahren (Gerüst, Hebebühne) unwirtschaftlich oder nicht möglich sind. Gilt gemäß DIN EN 363, FISAT-Richtlinien, TRBS 2121 Teil 3, BGR 198.', PW - 4);
      doc.text(aw1, PL + 2, y); y += aw1.length * 5 + 6;

      y = gfbAbschnitt(doc, '2', 'GEFAHREN FÜR MENSCH UND UMWELT', y);
      y = gfbListe(doc, [
        'Absturz oder Herausfallen aus der Höhe – tödliche Verletzungsgefahr',
        'Pendelsturz – Anprallen an feste Gegenstände beim Abweichen vom Ablot',
        'Hängetrauma (orthostatischer Schock) – bereits nach wenigen Minuten lebensbedrohlich',
        'Falsche Benutzung des Auffangsystems oder Anschlageinrichtung',
        'Versagen von Ankerpunkten – unzureichende Tragfähigkeit oder Prüfung',
        'Materialfall: Werkzeuge oder Arbeitsmittel können auf Personen darunter fallen',
      ], '⚠', y);

      y = gfbAbschnitt(doc, '3', 'SCHUTZMASSNAHMEN UND VERHALTENSREGELN', y);
      y = gfbListe(doc, [
        'Personen müssen körperlich und geistig für SZP geeignet sein – ärztliches Attest empfohlen',
        'Personen unter Einfluss von Alkohol, Drogen oder beeinträchtigenden Medikamenten dürfen NICHT eingesetzt werden',
        'Mindestens 2 ausgebildete SZP-Mitarbeiter (Level 1 mind.) auf jeder Baustelle',
        'Jeder Einsatz durch SZP-Level-3-Aufsichtsführenden überwachen lassen – Anweisungen Folge leisten!',
        'Trag- und Sicherungsseil an je ZWEI voneinander unabhängigen Ankerpunkten anschlagen',
        'Ankerpunkte vor Nutzung Sichtprüfung durchführen (Tragkraft mind. 12 kN / 1.200 kg)',
        'Buddy-Check vor jeder Besteigung: Gurt, Knoten, Geräte gegenseitig überprüfen',
        'Sicht- und Rufkontakt im Team jederzeit gewährleisten',
        'Werkzeuge und Arbeitsmittel gegen Herabfallen sichern (Lanyards, Werkzeugpouches)',
        'Schutzhelm für alle Personen im Gefahrenbereich – Sicherheitsschuhe S3 Pflicht',
        'Absperrung des Arbeitsbereichs: Absperrband + Hinweisschilder + Bodenpersonal',
        'Nur geprüfte, zugelassene Ausrüstung verwenden – Sachkundigenprüfung 1× jährlich',
        'Pendelbogen vor dem Abseilen prüfen – sichere Abseilroute festlegen',
        'PSAgA vor Gefahrstoffen, extremen Temperaturen und mechanischer Beschädigung schützen',
      ], '✔', y);

      if (y > 240) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA'); y = 28; }
      y = gfbAbschnitt(doc, '4', 'VERHALTEN BEI STÖRUNGEN UND MÄNGELN', y);
      y = gfbListe(doc, [
        'Jeden Mangel an Seilen, Geräten oder Ankerpunkten vor Benutzung dem Vorgesetzten melden',
        'Gefahrenbereich sofort verlassen bei erkennbaren Mängeln oder veränderten Bedingungen',
        'Ausrüstung NICHT benutzen, wenn: Funktionsweise beeinträchtigt / nach Sturz / Beschädigungen sichtbar',
        'Nach einem Sturz: gesamte PSAgA außer Betrieb nehmen – Sachkundige Prüfung vor Wiederverwendung!',
        'Bei Wetteränderung (Wind, Eis, Gewitter): Arbeiten sofort einstellen und sicher abseilen',
      ], '', y);

      if (y > 220) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA'); y = 28; }
      y = gfbAbschnitt(doc, '5', 'ERSTE HILFE UND VERHALTEN IM NOTFALL', y);
      // Notruf-Box klein
      doc.setFillColor(200, 0, 0); doc.rect(PL, y, 30, 14, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('NOTRUF', PL + 15, y + 5, { align: 'center' });
      doc.setFontSize(14); doc.text('112', PL + 15, y + 12, { align: 'center' });
      doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const notfallItems = [
        'Ruhe bewahren – Überblick verschaffen – Eigensicherung beachten',
        'Rettung gemäß Rettungsplan SZP (Rettung grundsätzlich nach UNTEN zum Boden)',
        'Notruf 112 absetzen: WER? WAS? WO? WIE VIELE?',
        'Erste-Hilfe-Maßnahmen einleiten',
        'Rettung aus hängender Situation innerhalb 15–20 Minuten (Hängetrauma!)',
        'Auch ohne äußere Verletzungszeichen: ärztliche Untersuchung veranlassen!',
        'Arbeitsunfälle und Beinaheunfälle umgehend dem Aufsichtsführenden und der BG melden',
      ];
      let ny = y + 4;
      notfallItems.forEach(t => {
        const lines = doc.splitTextToSize('▶  ' + t, PW - 38);
        doc.text(lines, PL + 34, ny); ny += lines.length * 5 + 1;
      });
      y = Math.max(y + 16, ny) + 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('Ersthelfer: Alle MA    Telefon: Im Handy eingetragen', PL + 2, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text('Verbandskasten: Am Einsatzort', PL + 2, y); y += 8;

      y = gfbAbschnitt(doc, '6', 'INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG', y);
      y = gfbListe(doc, [
        'Vor, nach und während jeder Benutzung: Sichtprüfung aller Ausrüstungsgegenstände',
        'Sachkundigenprüfung nach DGUV Grundsatz 312-906 alle 12 Monate',
        'Jeder SZP-Anwender: mind. FISAT Level 1 (bestandene Prüfung) + gültiger Kursnachweis',
        'Für horizontale Zugangsverfahren: FISAT Level 2 erforderlich',
        'Aufsichtsführende in SZP: FISAT Level 3 oder gleichwertig',
        'Wiederholungsunterweisung gemäß TRBS 2121 Teil 3 und FISAT – alle 12 Monate',
        'Jeder Anwender: gültiger Erste-Hilfe-Kurs (mind. 8 Stunden)',
        'Material in nicht einwandfreiem Zustand sofort aussondern und kennzeichnen',
        'Unterweisungsnachweise und Prüfprotokolle mind. 2 Jahre aufbewahren',
      ], '◉', y);

      // Abschnitt 7 BA SZP ENTFERNT (rot markiert)

      // ══════════════════════════════════════
      // SEITE: BETRIEBSANWEISUNG PSAgA (Seite 9–10 Original)
      // ══════════════════════════════════════
      doc.addPage(); y = PT;
      gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA');
      y = 28;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(26, 58, 92);
      doc.text('PSA gegen Absturz (PSAgA)', PL, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
      doc.text('Persönliche Schutzausrüstung gegen Absturz – Auffanggurt, Verbindungsmittel, Auffangsystem', PL, y); y += 8;
      doc.setTextColor(0);

      y = gfbAbschnitt(doc, '1', 'ANWENDUNGSBEREICH', y);
      const aw2 = doc.splitTextToSize('Diese Betriebsanweisung gilt für alle Mitarbeiter, die PSA gegen Absturz (PSAgA) verwenden. PSAgA kommt zum Einsatz, wenn aufgrund einer Gefährdungsbeurteilung Absturzgefahren vorliegen und bauliche oder technische Schutzmaßnahmen nicht ausreichend sind. Gilt für Rückhalte-, Arbeitspositionierungs- und Auffangsysteme gemäß DIN EN 358, DIN EN 361, DIN EN 363.', PW - 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(aw2, PL + 2, y); y += aw2.length * 5 + 6;

      y = gfbAbschnitt(doc, '2', 'GEFAHREN FÜR MENSCH UND UMWELT', y);
      y = gfbListe(doc, [
        'Absturz aus der Höhe – tödliche Verletzungsgefahr',
        'Pendelsturz – Anprallen an feste Gegenstände',
        'Hängetrauma (orthostatischer Schock) – bereits nach wenigen Minuten lebensbedrohlich',
        'Materialversagen durch falsche Benutzung, fehlende Prüfung oder Beschädigung',
        'Versagen des Anschlagpunktes – ungeprüfte oder ungeeignete Ankerpunkte',
        'Veränderte oder manipulierte Ausrüstung – nie eigenmächtig verändern!',
      ], '⚠', y);

      y = gfbAbschnitt(doc, '3', 'SCHUTZMASSNAHMEN UND VERHALTENSREGELN', y);
      y = gfbListe(doc, [
        'Personen müssen körperlich und geistig für diese Tätigkeiten geeignet sein (ärztliches Attest empfohlen)',
        'Personen unter Einfluss von Alkohol, Drogen oder beeinträchtigenden Medikamenten dürfen nicht eingesetzt werden',
        'Gurtpflicht ab 3 m vor der Absturzkante – Anschlagen an geeigneten Haltepunkten (mind. 12 kN)',
        'Nur geprüfte, zugelassene PSAgA in betriebssicherem Zustand verwenden (Sachkundigenprüfung 1× jährlich)',
        'Vor jeder Benutzung Sichtprüfung aller Ausrüstungsgegenstände durchführen',
        'Buddy-Check: Gegenseitige Überprüfung von Gurt, Verbindungsmittel und Ankerpunkt',
        'Mindestens 2 Personen auf jeder Baustelle – Teamarbeit, Sicht- und Rufkontakt halten',
        'Jegliche Arbeiten durch anwesende Aufsichtsperson (SZP Level 3 / FISAT) überwachen lassen',
        'Anweisungen der Aufsichtsperson sind Folge zu leisten!',
        'Absperrungen zum Schutz Dritter errichten (Absperrband + Hinweisschilder)',
        'Zusätzliche PSA je nach Tätigkeit tragen (Helm, S3-Schuhe, Schutzhandschuhe)',
        'PSAgA vor Gefahrstoffen schützen: keine Säuren, Laugen, Öle, Lösungsmittel',
        'PSAgA nicht Temperaturen unter -10 °C (Kunststoff) oder über 60 °C (Textilfasern) aussetzen',
        'Lagerung: freihängend, trocken, dunkel, getrennt von Chemikalien und Werkzeugen',
      ], '✔', y);

      if (y > 230) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA'); y = 28; }
      y = gfbAbschnitt(doc, '4', 'VERHALTEN BEI STÖRUNGEN UND MÄNGELN', y);
      y = gfbListe(doc, [
        'Jeden Mangel an der PSAgA vor Nutzung dem Vorgesetzten melden',
        'Gefahrenbereich sofort verlassen bei erkennbaren Mängeln oder unsicheren Bedingungen',
        'PSAgA NICHT benutzen und weitere Benutzung ausschließen wenn: Funktionsweise beeinträchtigt ist / sie durch einen Sturz beansprucht wurde / Beschädigungen sichtbar sind',
        'Nach einem Absturz: PSAgA außer Betrieb nehmen – Sachkundige Prüfung vor Wiederverwendung!',
        'PSAgA erst wieder benutzen, wenn Sachkundiger sie geprüft und freigegeben hat',
      ], '', y);

      if (y > 220) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA'); y = 28; }
      y = gfbAbschnitt(doc, '5', 'ERSTE HILFE UND VERHALTEN IM NOTFALL', y);
      doc.setFillColor(200, 0, 0); doc.rect(PL, y, 30, 14, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('NOTRUF', PL + 15, y + 5, { align: 'center' });
      doc.setFontSize(14); doc.text('112', PL + 15, y + 12, { align: 'center' });
      doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      let ny2 = y + 4;
      [
        'Ruhe bewahren – Überblick verschaffen',
        'Rettung gemäß Notfall-/Rettungsplan (Rettung nach UNTEN)',
        'Notruf 112 absetzen: WER? WAS? WO? WIE VIELE?',
        'Erste-Hilfe-Maßnahmen einleiten',
        'Rettung aus hängender Situation innerhalb 15–20 Minuten (Hängetrauma!)',
        'Auch ohne äußere Verletzungszeichen: Arzt aufsuchen!',
        'Arbeitsunfälle und Beinaheunfälle sofort dem Aufsichtsführenden und der BG melden',
      ].forEach(t => {
        const lines = doc.splitTextToSize('▶  ' + t, PW - 38);
        doc.text(lines, PL + 34, ny2); ny2 += lines.length * 5 + 1;
      });
      y = Math.max(y + 16, ny2) + 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('Ersthelfer: Alle MA aus SZP   Telefon: bekannt / Handyeintrag', PL + 2, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.text('Verbandskasten: Am Einsatzort', PL + 2, y); y += 8;

      y = gfbAbschnitt(doc, '6', 'INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG', y);
      y = gfbListe(doc, [
        'Vor, nach und während jeder Benutzung: Sichtprüfung des eingesetzten Materials',
        'Sachkundigenprüfung gemäß DGUV Grundsatz 312-906 alle 12 Monate durch Sachkundige',
        'Material in nicht einwandfreiem Zustand sofort aussondern und kennzeichnen',
        'Unterweisung gemäß BGR 198 vor jedem Einsatz und mindestens 1× jährlich',
        'Jeder Anwender benötigt einen gültigen Erste-Hilfe-Kurs (mind. 8 Stunden)',
        'Prüfprotokoll und Unterweisungsnachweis aufbewahren (mind. 2 Jahre)',
      ], '◉', y);

      // Abschnitt 7 BA PSAgA ENTFERNT (rot markiert)

    } // end gfb_szp

    // ══════════════════════════════════════
    // GFB GLASREINIGUNG: Betriebsanweisungsseiten
    // ══════════════════════════════════════
    if (currentBereich.liste === 'gfb_glasreinigung') {

      // SEITE: BETRIEBSANWEISUNG PSA GEGEN ABSTURZ (PSAgA)
      doc.addPage(); y = PT;
      gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA');
      y = 28;

      doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
      doc.text('BETRIEBSANWEISUNG – PSA GEGEN ABSTURZ (PSAgA)', PL+2, y+3); y += 11; doc.setTextColor(0);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(80,80,80);
      doc.text('Persönliche Schutzausrüstung gegen Absturz – Auffanggurt, Verbindungsmittel, Auffangsystem', PL+2, y); y += 7; doc.setTextColor(0);

      y = gfbAbschnitt(doc, '1', 'ANWENDUNGSBEREICH', y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const baAnw1 = doc.splitTextToSize('Diese Betriebsanweisung gilt für alle Mitarbeiter, die PSA gegen Absturz (PSAgA) verwenden. PSAgA kommt zum Einsatz, wenn aufgrund einer Gefährdungsbeurteilung Absturzgefahren vorliegen und bauliche oder technische Schutzmaßnahmen nicht ausreichend sind. Gilt für Rückhalte-, Arbeitspositionierungs- und Auffangsysteme gemäß DIN EN 358, DIN EN 361, DIN EN 363.', PW-4);
      doc.text(baAnw1, PL+2, y); y += baAnw1.length * 4.5 + 4;

      y = gfbAbschnitt(doc, '2', 'GEFAHREN FÜR MENSCH UND UMWELT', y);
      y = gfbListe(doc, [
        'Absturz aus der Höhe – tödliche Verletzungsgefahr',
        'Pendelsturz – Anprallen an feste Gegenstände',
        'Hängetrauma (orthostatischer Schock) – bereits nach wenigen Minuten lebensbedrohlich',
        'Materialversagen durch falsche Benutzung, fehlende Prüfung oder Beschädigung',
        'Versagen des Anschlagpunktes – ungeprüfte oder ungeeignete Ankerpunkte',
        'Veränderte oder manipulierte Ausrüstung – nie eigenmächtig verändern!',
      ], '⚠', y);

      y = gfbAbschnitt(doc, '3', 'SCHUTZMASSNAHMEN UND VERHALTENSREGELN', y);
      y = gfbListe(doc, [
        'Personen müssen körperlich und geistig für diese Tätigkeiten geeignet sein (ärztliches Attest empfohlen)',
        'Personen unter Einfluss von Alkohol, Drogen oder beeinträchtigenden Medikamenten dürfen nicht eingesetzt werden',
        'Gurtpflicht ab 2 m vor der Absturzkante – Anschlagen an geeigneten Haltepunkten (mind. 9 kN)',
        'Nur geprüfte, zugelassene PSAgA in betriebssicherem Zustand verwenden (Sachkundigenprüfung 1× jährlich)',
        'Vor jeder Benutzung Sichtprüfung aller Ausrüstungsgegenstände durchführen',
        'Buddy-Check: Gegenseitige Überprüfung von Gurt, Verbindungsmittel und Ankerpunkt',
        'Mindestens 2 Personen auf jeder Baustelle – Teamarbeit, Sicht- und Rufkontakt halten',
        'Jegliche Arbeiten durch anwesende Aufsichtsperson überwachen lassen',
        'Absperrungen zum Schutz Dritter errichten (Absperrband + Hinweisschilder)',
        'Zusätzliche PSA je nach Tätigkeit tragen (Helm, S3-Schuhe, Schutzhandschuhe)',
      ], '✔', y);

      y = gfbAbschnitt(doc, '4', 'VERHALTEN BEI STÖRUNGEN / MÄNGELN', y);
      y = gfbListe(doc, [
        'Jeden Mangel an der PSAgA vor Nutzung dem Vorgesetzten melden',
        'PSAgA NICHT benutzen wenn: Funktionsweise beeinträchtigt / Sturz beansprucht / Beschädigungen sichtbar',
        'Nach einem Absturz: PSAgA außer Betrieb nehmen – Sachkundige Prüfung vor Wiederverwendung!',
      ], '✕', y);

      if (y > 215) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA'); y = 28; }

      y = gfbAbschnitt(doc, '5', 'ERSTE HILFE UND VERHALTEN IM NOTFALL', y);
      // Notruf-Box
      doc.setFillColor(200, 0, 0); doc.rect(PL, y, 40, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255,255,255);
      doc.text('112', PL+20, y+10, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
      doc.text('NOTRUF', PL+42, y+4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const notfallItems1 = [
        'Ruhe bewahren – Überblick verschaffen',
        'Rettung gemäß Notfall-/Rettungsplan (Rettung nach UNTEN)',
        'Notruf 112: WER? WAS? WO? WIE VIELE?',
        'Erste-Hilfe-Maßnahmen einleiten',
        'Rettung aus hängender Situation innerhalb 15–20 Minuten (Hängetrauma!)',
        'Auch ohne äußere Verletzungszeichen: Arzt aufsuchen!',
        'Arbeitsunfälle und Beinaheunfälle sofort dem Aufsichtsführenden und der BG melden',
      ];
      let yn = y + 16;
      notfallItems1.forEach(t => {
        const ls = doc.splitTextToSize(t, PW - 12);
        doc.text('▶', PL+2, yn); doc.text(ls, PL+8, yn); yn += ls.length * 4.5 + 1;
      });
      y = yn + 4;

      y = gfbAbschnitt(doc, '6', 'INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG', y);
      y = gfbListe(doc, [
        'Vor, nach und während jeder Benutzung: Sichtprüfung des eingesetzten Materials',
        'Sachkundigenprüfung gemäß DGUV Grundsatz 312-906 alle 12 Monate durch Sachkundige',
        'Material in nicht einwandfreiem Zustand sofort aussondern und kennzeichnen',
        'Unterweisung gemäß BGR 198 vor jedem Einsatz und mindestens 1× jährlich',
        'Jeder Anwender benötigt einen gültigen Erste-Hilfe-Kurs (mind. 8 Stunden)',
        'Prüfprotokoll und Unterweisungsnachweis aufbewahren (mind. 2 Jahre)',
      ], '◉', y);

      // SEITE: BETRIEBSANWEISUNG GLASREINIGUNG
      doc.addPage(); y = PT;
      gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA');
      y = 28;

      doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
      doc.text('BETRIEBSANWEISUNG – GLASREINIGUNG', PL+2, y+3); y += 11; doc.setTextColor(0);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(80,80,80);
      doc.text('Reinigung von Glasflächen, Fenstern, Fassaden, Glasdächern und Lichthöfen – inkl. Höhenarbeit mittels SZP / PSAgA', PL+2, y); y += 7; doc.setTextColor(0);

      y = gfbAbschnitt(doc, '1', 'ANWENDUNGSBEREICH', y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const baAnw2 = doc.splitTextToSize('Diese Betriebsanweisung gilt für alle Mitarbeiter der CSC GmbH, die Glasreinigungsarbeiten an Gebäuden ausführen. Dazu gehören Fenster- und Fassadenreinigung, Reinigung von Glasdächern, Atrien, Lichthöfen, Vordächern, Wintergärten und Brüstungsverglasungen, einschließlich Tätigkeiten mit Hebebühne, Leiter, Teleskopstange sowie Seilzugangs- und Positionierungstechniken (SZP) mit PSA gegen Absturz (PSAgA). Grundlage: ArbSchG, BetrSichV, DGUV Vorschrift 1, DGUV Vorschrift 38, DGUV Information 201-056, DGUV Regel 112-198/199, TRBS 2121 Teil 3, TRGS 401.', PW-4);
      doc.text(baAnw2, PL+2, y); y += baAnw2.length * 4.5 + 4;

      y = gfbAbschnitt(doc, '2', 'GEFAHREN FÜR MENSCH UND UMWELT', y);
      y = gfbListe(doc, [
        'Absturz von Leitern, Hebebühnen, Fensterbänken, Brüstungen – tödliche Verletzungsgefahr',
        'Hängetrauma (orthostatischer Schock) nach Sturz im Seil – innerhalb weniger Minuten lebensbedrohlich',
        'Glasbruch / Durchbruch durch nicht durchsturzsichere Verglasung (Glasdach, Lichtkuppeln)',
        'Schnittverletzungen durch scharfe Klingen am Glasschaber und Glasbruchstücke',
        'Augenverletzungen durch Spritzer von Reinigungsmitteln und Glassplitter',
        'Verätzungen, Hautreizungen durch alkalische und saure Reiniger',
        'Infektionsgefahr durch Vogelkot, Taubenexkremente, Schimmel an Fassaden',
        'Stromschlag durch beschädigte Elektrogeräte oder Nässe in Verbindung mit Strom',
        'Rutsch- und Stolpergefahr auf nassen, glatten Glas- und Steinflächen',
      ], '⚠', y);

      if (y > 195) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA'); y = 28; }

      y = gfbAbschnitt(doc, '3', 'SCHUTZMASSNAHMEN UND VERHALTENSREGELN', y);
      y = gfbListe(doc, [
        'Schutzbrille EN 166 bei Über-Kopf-Arbeit, Reinigern und Klingengebrauch verpflichtend',
        'Bei Sprühnebel / lösemittelhaltigen Reinigern: Atemschutz mind. FFP2; bei Vogelkot/Schimmel FFP3 + Einweganzug',
        'Sicherheitsschuhe S3, Schutzhelm mit Kinnriemen (EN 397), Warnkleidung EN ISO 20471 Kl. 2',
        'Schutzhandschuhe nach SDB (Nitril/Butyl, schnittfest EN 388 für Klingenarbeiten)',
        'Werkzeuge gegen Herabfallen sichern: Lanyards, Werkzeugschnüre, Werkzeugpouches',
        'Bodenbereich absperren: Bauzaun oder Absperrband + Hinweisschilder; bei Publikumsverkehr Bodenposten',
        'Bei SZP/PSAgA: Gurtpflicht, Buddy-Check, mind. 2 Personen, Sicht- und Rufkontakt',
        'Wetterbedingungen prüfen: bei Wind > 6 Bft, Gewitter, Eis, Schnee → Tätigkeit einstellen',
        'Alleinarbeit verboten. Ausschließlich zugelassene Reinigungsmittel mit aktuellem Sicherheitsdatenblatt verwenden',
        'Personen unter Einfluss von Alkohol, Drogen oder Medikamenten dürfen nicht eingesetzt werden',
      ], '✔', y);

      if (y > 210) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA'); y = 28; }

      y = gfbAbschnitt(doc, '4', 'VERHALTEN BEI STÖRUNGEN UND MÄNGELN', y);
      y = gfbListe(doc, [
        'Beschädigte Reinigungsgeräte, Klingen, Teleskopstangen oder PSAgA-Komponenten vor Nutzung dem Vorgesetzten melden',
        'Glasbruch oder Beschädigung am Objekt sofort stoppen, sichern und melden',
        'Bei Verunreinigung durch Chemikalien: Bereich sperren, Sicherheitsdatenblatt konsultieren',
      ], '✕', y);

      y = gfbAbschnitt(doc, '5', 'ERSTE HILFE UND VERHALTEN IM NOTFALL', y);
      doc.setFillColor(200, 0, 0); doc.rect(PL, y, 40, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255,255,255);
      doc.text('112', PL+20, y+10, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
      doc.text('NOTRUF', PL+42, y+4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const notfallItems2 = [
        'Ruhe bewahren – Eigensicherung beachten – Überblick verschaffen',
        'Notruf 112: WER? WAS? WO? WIE VIELE? – WARTEN auf Rückfragen',
        'Bei Sturz im Seil: Rettung nach UNTEN zum Boden – innerhalb 15–20 Minuten (Hängetrauma!)',
        'Bei Schnittverletzungen: starke Blutung mit Druckverband stillen; Glassplitter NICHT entfernen',
        'Bei Augenkontakt mit Chemie: Augendusche / klares Wasser mind. 15 Min. spülen',
        'Bei Hautkontakt mit Reinigungsmitteln: kontaminierte Kleidung entfernen, Haut spülen, SDB bereithalten',
        'Bei Einatmen von Aerosolen: betroffene Person an frische Luft, ruhig lagern',
        'Auch ohne äußere Verletzungszeichen ärztliche Untersuchung – insbesondere nach Sturz, Hängetrauma, Chemikalienkontakt',
        'Arbeitsunfälle und Beinaheunfälle umgehend dem Aufsichtsführenden und der BG BAU melden',
      ];
      let yn2 = y + 16;
      notfallItems2.forEach(t => {
        if (yn2 > 275) { doc.addPage(); yn2 = PT + 8; gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA'); yn2 = 28; }
        const ls = doc.splitTextToSize(t, PW - 12);
        doc.text('▶', PL+2, yn2); doc.text(ls, PL+8, yn2); yn2 += ls.length * 4.5 + 1;
      });
      y = yn2 + 4;

      if (y > 215) { doc.addPage(); y = PT + 8; gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA'); y = 28; }
      y = gfbAbschnitt(doc, '6', 'INSTANDHALTUNG, PRÜFUNG UND UNTERWEISUNG', y);
      y = gfbListe(doc, [
        'Vor, nach und während jeder Benutzung Sichtprüfung aller Arbeitsmittel und PSA',
        'PSAgA: jährliche Sachkundigenprüfung nach DGUV Grundsatz 312-906 / DGUV Regel 112-198',
        'Leitern und Hubarbeitsbühnen: regelmäßige Prüfung nach BetrSichV § 14 (jährlich durch befähigte Person)',
        'Reinigungsmittel: aktuelle Sicherheitsdatenblätter vorhalten; Gefahrstoffverzeichnis pflegen',
        'Unterweisung vor jedem Einsatz und mindestens 1× jährlich; Nachweis aufbewahren (mind. 2 Jahre)',
      ], '◉', y);

      // ══════════════════════════════════════
      // SEITE: RETTUNGSPLAN GLASREINIGUNG
      // ══════════════════════════════════════
      doc.addPage(); y = PT;
      gfbHeader(doc, 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA');
      y = 26;

      // Titel
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(200, 0, 0);
      doc.text('⚠  RETTUNGSPLAN  ⚠', 105, y + 8, { align: 'center' });
      y += 14;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
      doc.text('Glasreinigung / SZP – Rettung nach UNTEN zum Boden', 105, y, { align: 'center' });
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      doc.text('Gemäß DGUV Vorschrift 1  •  DIN EN 363  •  DGUV Regel 112-198', 105, y, { align: 'center' });
      y += 10;

      // Notruf-Box links + Hängetrauma-Warnung rechts
      doc.setFillColor(200, 0, 0);
      doc.rect(PL, y, 55, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('NOTRUF', PL + 27, y + 7, { align: 'center' });
      doc.setFontSize(16);
      doc.text('112', PL + 27, y + 15, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Feuerwehr / Rettungsdienst', PL + 27, y + 20, { align: 'center' });

      doc.setFillColor(255, 240, 180);
      doc.rect(PL + 60, y, PW - 60, 18, 'F');
      doc.setTextColor(150, 60, 0);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('RETTUNG MUSS INNERHALB', PL + 62, y + 7);
      doc.setFontSize(11);
      doc.text('VON 15 MINUTEN ERFOLGEN!', PL + 62, y + 13);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('(Hängetrauma-Risiko!)', PL + 62, y + 18);
      y += 24;
      doc.setTextColor(0);

      // Zweispaltig: Gefährdungen | Rettungsgerät
      const gColW = (PW - 4) / 2;
      const gCol1x = PL, gCol2x = PL + gColW + 4;

      doc.setFillColor(26, 58, 92);
      doc.rect(gCol1x, y, gColW, 7, 'F');
      doc.rect(gCol2x, y, gColW, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
      doc.text('GEFÄHRDUNGEN & MASSNAHMEN', gCol1x + 2, y + 5);
      doc.text('ERFORDERLICHES RETTUNGSGERÄT', gCol2x + 2, y + 5);
      y += 10; doc.setTextColor(0);

      const gGefItems = [
        'Hängetrauma: Rettung < 15 Min. – gut angepasster Gurt – Beinschlaufen entlasten',
        'Absturz des Retters: PSA in Rückhaltefunktion, Seillänge kurz halten',
        'Ankerpunktversagen bei 2 Personen: geeigneten AP wählen, separat für Rettungsgerät',
      ];
      const gRetItems = [
        'Abseilgerät (Zulassung 2 Personen)',
        'Auffanggurt + Verbindungsmittel',
        'Kantenschutz',
        'Erste-Hilfe-Verbandskasten',
        'Rettung durch Teampartner',
      ];

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      let gy1 = y, gy2 = y;
      gGefItems.forEach(t => {
        const lines = doc.splitTextToSize('⚠  ' + t, gColW - 4);
        doc.text(lines, gCol1x + 2, gy1);
        gy1 += lines.length * 4.5 + 2;
      });
      gRetItems.forEach(t => {
        const lines = doc.splitTextToSize('✔  ' + t, gColW - 4);
        doc.text(lines, gCol2x + 2, gy2);
        gy2 += lines.length * 4.5 + 2;
      });
      y = Math.max(gy1, gy2) + 6;

      // Schritt-für-Schritt
      doc.setFillColor(26, 58, 92);
      doc.rect(PL, y, PW, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text('DURCHFÜHRUNG DER RETTUNG – SCHRITT FÜR SCHRITT:', PL + 2, y + 5);
      y += 10; doc.setTextColor(0);

      const gSchritte = [
        'Teampartner (MA 1) sichert sich selbst – Verbindungsmittel kurz einstellen – Kontakt zur verunglückten Person aufnehmen. Verletzungen feststellen, beruhigen!',
        'NOTRUF 112 absetzen! Meldung: WER? WAS ist passiert? WO genau? WIE VIELE Verletzte?',
        'Geeigneten Anschlagpunkt für das Rettungsgerät auswählen (vorzugsweise separat von den Arbeitsseilen).',
        'Kantenschutz anbringen falls notwendig – dabei Eigensicherung beachten!',
        'Verunglückte Person so anschlagen (Abseilgerät am Ankerpunkt), dass ein Ablassen möglich ist.',
        'Abgestürzten aus hängender Position kontrolliert nach UNTEN zum Boden abseilen.',
        'Vor dem Abseilen: Hindernisse im Abseilweg prüfen!',
        'Übernahme der verletzten Person aus dem geöffneten System (Bodennähe) mit zwei Personen.',
        'Erste-Hilfe-Maßnahmen einleiten – je nach Verletzung handeln.',
        'Auf den Notarzt warten – auch ohne äußere Verletzungszeichen ärztlich untersuchen lassen (Hängetrauma möglich)!',
      ];

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      gSchritte.forEach((s, i) => {
        if (y > 268) { doc.addPage(); y = PT + 8; }
        const lines = doc.splitTextToSize(s, PW - 12);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(String(i + 1), PL + 2, y);
        doc.setFont('helvetica', 'normal');
        doc.text(lines, PL + 8, y);
        y += lines.length * 5 + 2;
      });

      // Ersthelfer-Box
      y += 4;
      doc.setFillColor(238, 242, 247); doc.rect(PL, y, PW, 10, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(26, 58, 92);
      doc.text('Ersthelfer: Alle MA    ·    Verbandskasten: Am Einsatzort    ·    Notruf: 112', PL + 2, y + 6);
      doc.setTextColor(0);

    } // end gfb_glasreinigung

  } // end isGFBpdf

  // ===== GFB: Unterweisungsliste (Seite 11–12 im Original) =====
  if (isGFBpdf) {
    const isGlas = (currentBereich.liste === 'gfb_glasreinigung');
    const uwUntertitel = isGlas
      ? 'Glasreinigung – inkl. Höhenarbeit mittels SZP / PSAgA'
      : 'Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA';
    const uwNorm = isGlas
      ? 'Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DGUV Information 201-056'
      : 'Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DIN EN 363';
    // Seite 11: Einsatz- und Objektdaten + Unterweisungsthemen
    doc.addPage(); y = PT;
    doc.setFillColor(26, 58, 92); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('GEFÄHRDUNGSBEURTEILUNG', PL, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(uwUntertitel, PL, 17);
    doc.setFontSize(8); doc.text(uwNorm, PL, 21);
    doc.setTextColor(0); y = 28;

    // Abschnitt 1: Einsatz- und Objektdaten
    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('1  EINSATZ- UND OBJEKTDATEN', PL+2, y+3); y += 12; doc.setTextColor(0);

    const uwFelder = [
      ['Unternehmen:', 'CSC GmbH', 'Datum der Unterweisung:', formatDatum(now).split(' ')[0]],
      ['Objekt / Einsatzort:', gfbObjekt || '', 'Unterweisender (Aufsichtsführender):', pruefer],
      ['Art der Unterweisung:', isGlas ? 'Gefährdungsbeurteilung Glasreinigung' : 'Gefährdungsbeurteilung SZP', 'Bezug zu Gefährdungsbeurteilung:', isGlas ? 'GFB Glasreinigung' : 'GFB SZP'],
    ];
    uwFelder.forEach(([l1, v1, l2, v2]) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 58, 92);
      doc.text(l1, PL+2, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      doc.text(v1, PL+45, y, { maxWidth: 45 });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 58, 92);
      doc.text(l2, PL+100, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      doc.text(v2, PL+148, y, { maxWidth: 37 });
      y += 8;
    });

    // Erstunterweisung / Wiederholung
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 58, 92);
    doc.text('X  Erstunterweisung', PL+2, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
    doc.text('☐  Wiederholung', PL+60, y); y += 10;

    // Abschnitt 2: Unterweisungsthemen
    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('2  UNTERWEISUNGSTHEMEN UND INHALTE', PL+2, y+3); y += 12; doc.setTextColor(0);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const uwEinleit = doc.splitTextToSize('Die nachfolgenden Sicherheitsthemen wurden besprochen und sind von den Unterwiesenen gelesen und verstanden worden.', PW-4);
    doc.text(uwEinleit, PL+2, y); y += uwEinleit.length*5+4;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const uwBestText = isGlas ? 'Ich wurde gemäß der Gefährdungsbeurteilung, den Betriebsanweisungen PSAgA und Glasreinigung sowie dem Notfall- und Rettungsplan unterwiesen.' : 'Ich wurde gemäß der Gefährdungsbeurteilung/Objektsicherheitsbeurteilung, dem Notfall- und Rettungsplan sowie der Betriebsanweisung SZP unterwiesen.';
    const uwBest = doc.splitTextToSize(uwBestText, PW-4);
    doc.text(uwBest, PL+2, y); y += uwBest.length*5+2;
    doc.setFont('helvetica', 'normal');
    doc.text('Diese habe ich gelesen und verstanden. Alle Fragen wurden beantwortet.', PL+2, y); y += 8;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Besprochene Themen:', PL+2, y); y += 7;

    const uwThemenSZP = [
      'Rettung einer verletzten Person grundsätzlich nach UNTEN zum Boden (Rettungsplan bekannt)',
      'Es wird grundsätzlich im Team gearbeitet – Sicht- und Rufkontakt jederzeit halten',
      'Ausrüstung vor jedem Einsatz auf Betriebssicherheit prüfen (Sichtprüfung)',
      'Gurtpflicht ab 3 m vor der Absturzkante (Anschlagen an Haltepunkten)',
      'Trag- und Sicherungsseil an je zwei unabhängigen Ankerpunkten befestigen',
      'Buddy-Check vor jeder Besteigung: gegenseitige Überprüfung von Gurt, Knoten und Gerät',
      'Erste-Hilfe-Ausrüstung (Koffer) mitführen – Standort bekannt',
      'Beachten aller einschlägigen Richtlinien bei Arbeiten mittels PSAgA (DIN EN 363 etc.)',
      'Tragen entsprechender Arbeitsschutzkleidung: Sicherheitsschuhe S3 und Helm (Pflicht)',
      'Weitere Schutzkleidung wird entsprechend der Arbeiten bereitgestellt',
      'Absperrung des Arbeitsbereichs durch Absperrband und Hinweisschilder',
      'Werkzeuge und Arbeitsmittel gegen Herabfallen sichern (Lanyards, Werkzeugpouches)',
      'Kommunikation: Kommunikationsregeln und mittel festgelegt und bekannt',
      'Verhalten bei Unterbrechung der Arbeiten: Arbeitsmittel sichern, alle Beteiligten informieren',
      'Notrufnummern und betriebsinterne Notfallnummer bekannt (112 / 110)',
      'Sammelplatz und Evakuierungsplan bekannt',
    ];
    const uwThemenGlas = [
      'Betriebsanweisung PSA gegen Absturz (PSAgA) gelesen und verstanden',
      'Betriebsanweisung Glasreinigung gelesen und verstanden',
      'Gurtpflicht ab 2 m vor der Absturzkante – Anschlagen an geeigneten Haltepunkten (mind. 9 kN)',
      'Buddy-Check: gegenseitige Überprüfung von Gurt, Verbindungsmittel und Ankerpunkt',
      'Rettung nach Sturz im Seil grundsätzlich nach UNTEN – innerhalb 15–20 Minuten (Hängetrauma!)',
      'Alleinarbeit verboten – mindestens 2 Personen, Sicht- und Rufkontakt jederzeit halten',
      'Sichtprüfung aller PSAgA und Arbeitsmittel vor jedem Einsatz (Gurt, Seile, Karabiner)',
      'Bodenbereich unterhalb des Arbeitsplatzes absperren (Absperrband + Hinweisschilder)',
      'Werkzeuge und Klingen gegen Herabfallen sichern (Lanyards, Werkzeugpouches)',
      'Schutzbrille bei Über-Kopf-Arbeit und Klingengebrauch verpflichtend tragen',
      'Atemschutz mind. FFP2 bei Sprühnebel; FFP3 + Schutzanzug bei Vogelkot/Schimmel',
      'Sicherheitsschuhe S3, Helm mit Kinnriemen, Schutzhandschuhe (schnittfest für Klingen)',
      'Ausschließlich Reinigungsmittel mit aktuellem Sicherheitsdatenblatt (SDB) verwenden',
      'Wetterbedingungen prüfen: bei Wind > 6 Bft, Gewitter, Eis oder Schnee → Stopp',
      'Notrufnummern bekannt (112 / 110); Ersthelfer und Verbandskasten-Standort bekannt',
      'Arbeitsunfälle und Beinaheunfälle sofort dem Aufsichtsführenden und der BG BAU melden',
    ];
    const uwThemen = isGlas ? uwThemenGlas : uwThemenSZP;
    uwThemen.forEach((t, i) => {
      if (y > 268) { doc.addPage(); y = PT + 8; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26,58,92);
      doc.text(String(i+1), PL+2, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      const lines = doc.splitTextToSize(t, PW-12);
      doc.text(lines, PL+10, y);
      y += lines.length*5+1;
    });
    y += 6;

    // Seite 12: Unterschriftenliste der Unterweisenen
    doc.addPage(); y = PT;
    doc.setFillColor(26, 58, 92); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('GEFÄHRDUNGSBEURTEILUNG', PL, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(uwUntertitel, PL, 17);
    doc.setFontSize(8); doc.text(uwNorm, PL, 21);
    doc.setTextColor(0); y = 28;

    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('3  UNTERSCHRIFTENLISTE DER UNTERWEISENEN', PL+2, y+3); y += 12; doc.setTextColor(0);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const uwHinweis = doc.splitTextToSize('Mit ihrer Unterschrift bestätigen die Mitarbeiter, dass sie an der Unterweisung teilgenommen haben, die Inhalte verstanden haben und sich verpflichten, die Sicherheitsregeln einzuhalten.', PW-4);
    doc.text(uwHinweis, PL+2, y); y += uwHinweis.length*4+6;

    // Tabellenkopf Unterschriftenliste
    const uwC = [PL, PL+10, PL+70, PL+110, PL+130];
    const uwH = 7;
    doc.setFillColor(26,58,92); doc.rect(PL, y, PW, uwH, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255,255,255);
    doc.text('Nr.', uwC[0]+1, y+5);
    doc.text('Nachname, Vorname', uwC[1]+1, y+5);
    doc.text('SZP-Qualifikation / Level', uwC[2]+1, y+5);
    doc.text('Datum', uwC[3]+1, y+5);
    doc.text('Unterschrift', uwC[4]+1, y+5);
    y += uwH;

    // Mitarbeiter aus der Mitarbeiterliste eintragen
    const aktiveMaUW = gfbMitarbeiter.filter(m => m !== null);
    const maxRows = Math.max(aktiveMaUW.length + 2, 5);
    for (let i = 0; i < maxRows; i++) {
      if (y > 268) break;
      const ma = aktiveMaUW[i] || null;
      const bg = i % 2 === 0 ? [255,255,255] : [248,249,251];
      doc.setFillColor(...bg); doc.rect(PL, y, PW, uwH*2, 'F');
      doc.setDrawColor(200,200,200); doc.rect(PL, y, PW, uwH*2, 'S');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
      doc.text(String(i+1), uwC[0]+1, y+5);
      if (ma && ma.name) doc.text(ma.name, uwC[1]+1, y+5);
      // Unterschrift des MA
      if (ma && ma.sigCanvas) {
        const empty = document.createElement('canvas');
        empty.width = ma.sigCanvas.width; empty.height = ma.sigCanvas.height;
        if (ma.sigCanvas.toDataURL() !== empty.toDataURL()) {
          doc.addImage(ma.sigCanvas.toDataURL('image/png'), 'PNG', uwC[4]+1, y+1, 50, 11);
        }
      }
      y += uwH*2;
    }
    y += 8;

    // Abschnitt 4: Bestätigung des Unterweisenden
    if (y > 220) { doc.addPage(); y = PT + 8; }
    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('4  BESTÄTIGUNG DES UNTERWEISENDEN', PL+2, y+3); y += 12; doc.setTextColor(0);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Unterweisender (Name, Vorname): `, PL+2, y);
    doc.setFont('helvetica', 'bold'); doc.text(pruefer, PL+62, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.text(isGlas ? 'Funktion / Qualifikation: ' : 'Funktion / SZP-Level: ', PL+2, y);
    doc.setFont('helvetica', 'bold'); doc.text(isGlas ? 'Aufsichtsführender' : '3', PL+44, y);
    doc.setFont('helvetica', 'normal'); doc.text(`Datum: ${formatDatum(now).split(' ')[0]}`, PL+100, y); y += 10;

    // Unterschrift Unterweisender — aus dem Unterschriftsfeld der App
    if (!isSignatureEmpty()) {
      const sigData = sigPad.canvas.toDataURL('image/png');
      doc.addImage(sigData, 'PNG', PL, y, 70, 20); y += 22;
    } else {
      doc.setDrawColor(100); doc.line(PL, y + 18, PL + 70, y + 18); y += 22;
    }
    doc.setFontSize(8); doc.setTextColor(100,100,100);
    doc.text('Unterschrift des Unterweisenden', PL, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const bestTextStr = isGlas ? 'Hiermit bestätige ich, dass alle oben genannten Mitarbeiter über die Betriebsanweisungen PSAgA und Glasreinigung sowie alle aufgeführten Sicherheitsthemen unterwiesen wurden. Die Unterweisung erfolgte gemäß ArbSchG § 12, DGUV Vorschrift 1 § 4 sowie der betrieblichen Gefährdungsbeurteilung Glasreinigung.' : 'Hiermit bestätige ich, dass alle oben genannten Mitarbeiter über die aufgeführten Sicherheitsthemen unterwiesen wurden. Die Unterweisung erfolgte gemäß ArbSchG § 12, DGUV Vorschrift 1 § 4 sowie der betrieblichen Gefährdungsbeurteilung SZP.';
    const bestText = doc.splitTextToSize(bestTextStr, PW/2);
    doc.text(bestText, PL+80, y - bestText.length*4 - 6); y += 4;
    doc.setTextColor(80,80,80);
    doc.text('Aufbewahrung: Mindestens 1 Jahr nach der Unterweisung.', PL, y);
    doc.setTextColor(0); y += 10;
  }

  // Unterschrift Prüfer / Aufsichtsführender — immer im PDF
  const isLMRApdf = (currentBereich.liste === 'lmra_hubarbeitsbuehne');
  if (isLMRApdf) {
    // ===== LMRA: Einsatzdaten + Mitarbeiter — neue Seite =====
    doc.addPage(); y = PT;

    // Einsatzdaten
    const lmraObjektVal         = (document.getElementById('lmra-objekt')          || {}).value?.trim() || '';
    const lmraAdresseVal        = (document.getElementById('lmra-adresse')         || {}).value?.trim() || '';
    const lmraAuftraggeberVal   = (document.getElementById('lmra-auftraggeber')    || {}).value?.trim() || '';
    const lmraAnsprechpartnerVal= (document.getElementById('lmra-ansprechpartner') || {}).value?.trim() || '';
    const lmraTelefonVal        = (document.getElementById('lmra-telefon')         || {}).value?.trim() || '';
    const lmraDatumVal          = (document.getElementById('lmra-datum')           || {}).value?.trim() || '';
    const lmraUhrzeitVal        = (document.getElementById('lmra-uhrzeit')         || {}).value?.trim() || '';
    let lmraDatumAnzeige = lmraDatumVal;
    if (lmraDatumVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [yy, mm2, dd2] = lmraDatumVal.split('-');
      lmraDatumAnzeige = `${dd2}.${mm2}.${yy}`;
    }

    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('EINSATZDATEN', PL+2, y+3); y += 12; doc.setTextColor(0);

    const lmraFelder = [
      ['Unternehmen:', 'CSC GmbH',                    'Aufsichtsführender:', pruefer],
      ['Objekt / Einsatzort:', lmraObjektVal || '—',  'Datum:', lmraDatumAnzeige || formatDatum(now).split(' ')[0]],
      ['Adresse:', lmraAdresseVal || '—',             'Uhrzeit:', lmraUhrzeitVal || '—'],
      ['Auftraggeber:', lmraAuftraggeberVal || '—',   'Ansprechpartner:', lmraAnsprechpartnerVal || '—'],
      ['Telefon:', lmraTelefonVal || '—',             '', ''],
    ];
    lmraFelder.forEach(([l1, v1, l2, v2]) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 58, 92);
      doc.text(l1, PL+2, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      doc.text(v1, PL+40, y, { maxWidth: 50 });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 58, 92);
      doc.text(l2, PL+95, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      doc.text(v2 || '—', PL+135, y, { maxWidth: 50 });
      y += 8;
    });
    y += 4;

    // Mitarbeiter-Unterschriften
    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('MITARBEITER-BESTÄTIGUNGEN', PL+2, y+3); y += 12; doc.setTextColor(0);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text('Ich habe die LMRA absolviert und alle Punkte verstanden. Die Arbeit ist aus meiner Sicht sicher.', PL, y, { maxWidth: PW });
    y += 10; doc.setTextColor(0);

    const aktiveMaLMRA2 = lmraMitarbeiter.filter(m => m !== null && m.name.trim());
    for (const ma of aktiveMaLMRA2) {
      if (y > 250) { doc.addPage(); y = PT; }
      doc.setDrawColor(200, 200, 200); doc.line(PL, y, PL+PW, y); y += 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
      doc.text(ma.name, PL, y+5);
      // Checkbox-Status
      const cbText = ma.bedenken ? '✓ Keine Bedenken' : '✗ Nicht bestätigt';
      const cbColor = ma.bedenken ? [22, 163, 74] : [192, 57, 43];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...cbColor);
      doc.text(cbText, PL, y+13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      doc.text('Unterschrift:', PL+90, y+3);
      // Unterschrift-Canvas
      if (ma.sigCanvas) {
        const empty2 = document.createElement('canvas');
        empty2.width = ma.sigCanvas.width; empty2.height = ma.sigCanvas.height;
        const isEmpty2 = ma.sigCanvas.toDataURL() === empty2.toDataURL();
        if (!isEmpty2) {
          const sigDataMA = ma.sigCanvas.toDataURL('image/png');
          doc.addImage(sigDataMA, 'PNG', PL+90, y, 80, 22);
        } else {
          doc.setDrawColor(180); doc.line(PL+90, y+18, PL+170, y+18);
        }
      }
      y += 28;
    }

    // Aufsichtsführender-Unterschrift am Ende (eigener Canvas)
    if (y > 230) { doc.addPage(); y = PT; }
    doc.setDrawColor(200, 200, 200); doc.line(PL, y, PL+PW, y); y += 6;

    // Bestätigungstext
    doc.setFillColor(26, 58, 92); doc.rect(PL, y, PW, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text('BESTÄTIGUNG AUFSICHTSFÜHRENDER', PL+2, y+6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Ich bestätige, die LMRA mit allen Mitarbeitern absolviert zu haben. Alle Gefährdungen wurden besprochen.', PL+2, y+13);
    doc.setTextColor(0); y += 22;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
    doc.text('Unterschrift Aufsichtsführender:', PL, y); y += 4;
    doc.setTextColor(0);
    if (!lmraAufSigIsEmpty()) {
      const sigDataAuf = lmraAufCanvas.toDataURL('image/png');
      doc.addImage(sigDataAuf, 'PNG', PL, y, 90, 28); y += 32;
    } else {
      doc.setDrawColor(100); doc.line(PL, y+24, PL+90, y+24); y += 32;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);
    doc.text(pruefer || '___________________________', PL, y); y += 10;

  } else if (!isGFBpdf) {
    if (y > 240) { doc.addPage(); y = PT; }
    doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
    doc.text('UNTERSCHRIFT PRÜFER', PL, y); y += 4;
    if (!isSignatureEmpty()) {
      const sigData = sigPad.canvas.toDataURL('image/png');
      doc.addImage(sigData, 'PNG', PL, y, 80, 25);
      y += 28;
    } else {
      doc.setDrawColor(100, 100, 100);
      doc.line(PL, y + 20, PL + 80, y + 20);
      y += 28;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);
    doc.text(pruefer || '___________________________', PL, y);
    y += 10;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`CSC Hannover · ${currentListe.titel} · ${formatDatum(now)}`, PL, 292);
    doc.text(`Seite ${i} / ${pageCount}`, 195, 292, { align: 'right' });
  }

  return doc.output('blob');
}

// ===== GOOGLE DRIVE UPLOAD =====
async function uploadToDrive(pdfBlob) {
  const token = await getDriveToken();
  if (!token) throw new Error('Kein Google Drive Token.');

  const now = new Date();
  // Bei LMRA: Uhrzeit in Dateinamen einbauen (mehrere LMRAs pro Tag möglich)
  let filename;
  if (currentBereich && currentBereich.liste === 'lmra_hubarbeitsbuehne') {
    const hh = String(now.getHours()).padStart(2,'0');
    const min = String(now.getMinutes()).padStart(2,'0');
    filename = `${formatDatumISO(now)}_${hh}${min}_${currentBereich.id}.pdf`;
  } else {
    filename = `${formatDatumISO(now)}_${currentBereich.id}_KW${getKW(now)}.pdf`;
  }

  const unterordner = APP_CONFIG.googleDriveUnterordner || {};
  const folderId = unterordner[currentBereich.liste] || APP_CONFIG.googleDriveFolderId;

  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', pdfBlob);

  // Timeout nach 15 Sekunden — verhindert ewiges Hängen
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: form,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Bei 401 (Token abgelaufen): sprechende Fehlermeldung
    if (res.status === 401) throw new Error('TOKEN_ABGELAUFEN');
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const result = await res.json();
  console.log('Drive upload OK:', result.id);

  // Auch lokal als Download anbieten
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();

  return result;
}

async function downloadPdfFromDrive(fileId, filename) {
  const token = localStorage.getItem('drive_access_token');
  if (!token) {
    alert('Kein Drive-Token vorhanden. Bitte einmal neu einloggen.');
    return;
  }
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) {
        alert('Drive-Token abgelaufen. Bitte öffne das Protokoll über den blauen Button und lade es dort herunter.');
      } else {
        alert(`Fehler beim Laden des PDFs: HTTP ${res.status}`);
      }
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'Protokoll.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch(e) {
    alert('PDF-Download fehlgeschlagen: ' + e.message);
  }
}

async function getDriveToken() {
  // Automatischer Token von GitHub Pages (alle 45 Min erneuert, Base64-kodiert)
  try {
    const res = await fetch('https://pruefung.sibeda.de/csc-token/token.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data.t) {
        // Dekodieren: Base64 → umgekehrter String → Token
        const decoded = atob(data.t).split('').reverse().join('');
        return decoded;
      }
    }
  } catch (e) {
    // Fallback auf localStorage
  }
  return localStorage.getItem('drive_access_token') || null;
}

// ===== QR SCANNER =====
function startQRScan() {
  showScreen('qr');
  qrScanner = new Html5Qrcode('qr-reader');
  qrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      stopQRScan();
      handleQRResult(decodedText);
    },
    () => {}
  ).catch(err => {
    alert('Kamera konnte nicht gestartet werden: ' + err);
    showScreen('home');
  });
}

function stopQRScan() {
  if (qrScanner) {
    qrScanner.stop().catch(() => {});
    qrScanner = null;
  }
  showScreen('home');
}

function handleQRResult(text) {
  try {
    const url = new URL(text);
    // Gerät-QR erkennen
    const geraetId = url.searchParams.get('geraet');
    if (geraetId) {
      stopQRScan();
      showGeraeteScreen().then(() => geraetDetailAnzeigen(geraetId));
      return;
    }
    // Bereichs-QR
    const bereichId = url.searchParams.get('bereich');
    if (bereichId) { openBereichById(bereichId); return; }
  } catch {}
  openBereichById(text);
}

// ===== RESULT =====
// ===== PDF per E-Mail senden (FEATURE 2: Gmail API mit echtem Anhang) =====
let currentPdfBlob = null;

async function emailPDF(toAddress) {
  if (!currentPdfBlob) return;
  const now = new Date();
  const filename = `${formatDatumISO(now)}_${currentBereich ? currentBereich.id : 'pruefung'}_KW${getKW(now)}.pdf`;
  const bereichName = currentBereich ? currentBereich.name : 'Prüfung';
  const subject = `CSC Prüfbericht: ${bereichName} vom ${formatDatumISO(now)}`;
  const body = `Anbei das Prüfprotokoll für ${bereichName} vom ${formatDatum(now)}.\n\nCSC Hannover Prüf-App`;

  // Gmail API: PDF als Base64-Anhang
  try {
    const token = await getDriveToken();
    if (!token) throw new Error('Kein Token');

    const pdfBase64 = await blobToBase64(currentPdfBlob);
    const boundary = 'csc_boundary_' + Date.now();
    const emailLines = [
      `From: me`,
      `To: ${toAddress}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
      ``,
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${filename}"`,
      ``,
      pdfBase64.replace(/^data:application\/pdf;base64,/, ''),
      ``,
      `--${boundary}--`
    ].join('\r\n');

    const emailB64 = btoa(unescape(encodeURIComponent(emailLines)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: emailB64 })
    });

    if (res.ok) {
      alert(`✅ E-Mail mit PDF-Anhang wurde an ${toAddress} gesendet!`);
    } else {
      const err = await res.json();
      throw new Error(err.error?.message || 'Gmail-Fehler');
    }
  } catch(e) {
    console.warn('[Gmail] E-Mail senden fehlgeschlagen:', e.message);
    // Fallback: lokaler Download + mailto
    const url = URL.createObjectURL(currentPdfBlob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    const subjEnc = encodeURIComponent(subject);
    const bodyEnc = encodeURIComponent(body + '\n\n(PDF bitte manuell anhängen)');
    setTimeout(() => { window.location.href = `mailto:${toAddress}?subject=${subjEnc}&body=${bodyEnc}`; }, 800);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function showResult(success, driveOk, emailTo, errMsg) {
  const icon = document.getElementById('result-icon');
  const text = document.getElementById('result-text');
  const sub  = document.getElementById('result-sub');
  const emailBtn    = document.getElementById('result-email-btn');
  const weitereBtn  = document.getElementById('result-weitere-leiter-btn');
  // „Weitere Leiter prüfen"-Button nur bei Leiterkontrolle
  if (weitereBtn) {
    if (success && currentBereich && currentBereich.liste === 'leiterkontrolle') {
      weitereBtn.style.display = 'block';
    } else {
      weitereBtn.style.display = 'none';
    }
  }
  if (success) {
    icon.textContent = '✅';
    text.textContent = 'Prüfung gespeichert!';
    if (driveOk) {
      sub.textContent = `PDF in Google Drive abgelegt · ${formatDatum(new Date())}`;
      window._driveUploadFehler = null;
    } else {
      // Drive-Upload fehlgeschlagen — deutliche Warnung
      const fehlerTyp = window._driveUploadFehler || 'UPLOAD_FEHLER';
      icon.textContent = '⚠️';
      text.textContent = 'Prüfung lokal gespeichert – Drive-Upload fehlgeschlagen!';
      if (fehlerTyp === 'TOKEN_ABGELAUFEN') {
        sub.innerHTML = `<span style="color:#c00;font-weight:700;">🔴 Google Drive Verbindung abgelaufen!</span><br>
Das PDF wurde auf diesem Gerät gespeichert (Downloads-Ordner).<br>
<strong>Bitte Thomas Schmoldt informieren</strong> – der Upload wird automatisch nachgeholt.<br><br>
<button onclick="offlineQueueFlush(true)" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:10px 20px;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px;">🔄 Jetzt erneut versuchen</button>`;
      } else {
        sub.innerHTML = `<span style="color:#c00;font-weight:700;">🔴 Kein Internet oder Drive-Fehler!</span><br>
Das PDF wurde auf diesem Gerät gespeichert (Downloads-Ordner).<br>
Sobald wieder online: auf den Button unten tippen.<br><br>
<button onclick="offlineQueueFlush(true)" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:10px 20px;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px;">🔄 Jetzt erneut versuchen</button>`;
      }
      window._driveUploadFehler = null;
    }
    // E-Mail-Button
    if (emailBtn) {
      if (emailTo) {
        emailBtn.style.display = 'block';
        emailBtn.textContent = `📧 Per E-Mail senden (${emailTo})`;
        emailBtn.onclick = () => emailPDF(emailTo);
      } else {
        emailBtn.style.display = 'none';
      }
    }
  } else {
    icon.textContent = '⚠️';
    text.textContent = 'Fehler beim Hochladen';
    sub.textContent  = errMsg || 'PDF wurde lokal heruntergeladen.';
    if (emailBtn) emailBtn.style.display = 'none';
  }
  showScreen('result');
}

// ===== WEITERE LEITER PRÜFEN (nach Abschluss direkt neu starten) =====
function weitereLeiterPruefen() {
  if (!currentStandort || !currentGruppe || !currentBereich) {
    showScreen('home');
    return;
  }
  // Formular neu laden (gleicher Bereich, gleicher Prüfer bleibt)
  pruefErgebnisse = {};
  renderChecklist();
  // Leiter-Nr. leeren — muss für die nächste Leiter neu eingegeben werden
  const leiterNrInput = document.getElementById('leiter-nr');
  if (leiterNrInput) leiterNrInput.value = '';
  const leiterTypInput = document.getElementById('leiter-typ');
  if (leiterTypInput) leiterTypInput.value = '';
  showScreen('checklist');
  initSignaturePad();
}

// ===== OFFLINE QUEUE =====
function offlineQueueAdd(pdfBlob) {
  // PDF als Data-URL in localStorage speichern
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
      const now = new Date();
      const filename = `${formatDatumISO(now)}_${currentBereich ? currentBereich.id : 'pruefung'}_KW${getKW(now)}.pdf`;
      const folderId = (APP_CONFIG.googleDriveUnterordner || {})[currentBereich?.liste] || APP_CONFIG.googleDriveFolderId;
      queue.push({ dataUrl: e.target.result, filename, folderId, ts: Date.now() });
      // Max 5 in Queue
      while (queue.length > 5) queue.shift();
      localStorage.setItem('offline_queue', JSON.stringify(queue));
      console.log('[Offline] PDF in Queue gespeichert:', filename);

      // FEATURE 9: Auch in Firestore speichern (geräteübergreifend)
      const session = checkSession();
      if (session && typeof window.fbOfflineQueueAdd === 'function') {
        window.fbOfflineQueueAdd(session.email, filename, e.target.result, folderId).catch(() => {});
      }
    } catch(err) { console.warn('[Offline] Queue-Fehler:', err); }
  };
  reader.readAsDataURL(pdfBlob);
  // Lokal herunterladen als Backup
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  const now2 = new Date();
  a.href = url;
  a.download = `${formatDatumISO(now2)}_${currentBereich ? currentBereich.id : 'pruefung'}_KW${getKW(now2)}.pdf`;
  a.click();
}

async function offlineQueueFlush(mitFeedback = false) {
  // localStorage-Queue laden
  let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');

  // Firestore-Queue zusätzlich laden (geräteübergreifend)
  const session = checkSession();
  let firestoreQueue = [];
  if (session && typeof window.fbOfflineQueueLade === 'function') {
    try {
      firestoreQueue = await window.fbOfflineQueueLade(session.email);
      console.log('[Sync] Firestore-Queue geladen:', firestoreQueue.length, 'Einträge');
    } catch(e) { console.warn('[Sync] Firestore-Queue Ladefehler:', e); }
  }

  // Deduplizieren: Firestore-Einträge die noch nicht in localStorage sind, hinzufügen
  const localFilenames = new Set(queue.map(i => i.filename));
  for (const fi of firestoreQueue) {
    if (!localFilenames.has(fi.filename)) {
      queue.push({ dataUrl: fi.dataUrl, filename: fi.filename, folderId: fi.folderId, ts: fi.ts, firestoreId: fi.id });
    }
  }

  if (queue.length === 0) {
    if (mitFeedback) zeigeSyncStatus('✅ Keine ausstehenden Protokolle — alles bereits auf Drive.', 'gruen');
    updateSyncButton();
    return;
  }
  if (mitFeedback) zeigeSyncStatus(`⏳ Lade ${queue.length} Protokoll(e) zu Drive hoch…`, 'grau');
  const token = await getDriveToken();
  if (!token) {
    if (mitFeedback) zeigeSyncStatus('❌ Token nicht verfügbar. Bitte kurz warten und nochmal versuchen.', 'rot');
    return;
  }
  const remaining = [];
  let ok = 0;
  for (const item of queue) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const byteStr = atob(item.dataUrl.split(',')[1]);
      const arr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: item.filename, parents: [item.folderId] })], { type: 'application/json' }));
      form.append('file', blob);
      let res;
      try {
        res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form, signal: controller.signal
        });
      } finally { clearTimeout(timer); }
      if (res.ok) {
        ok++;
        console.log('[Sync] Upload OK:', item.filename);
        // Firestore-Eintrag löschen wenn erfolgreich
        if (item.firestoreId && typeof window.fbOfflineQueueDelete === 'function') {
          window.fbOfflineQueueDelete(item.firestoreId).catch(() => {});
        }
      } else { remaining.push(item); }
    } catch(e) { remaining.push(item); }
  }
  // Nur localStorage-Einträge (ohne firestoreId) als "verbleibend" speichern
  const remainingLocal = remaining.filter(i => !i.firestoreId);
  localStorage.setItem('offline_queue', JSON.stringify(remainingLocal));
  updateSyncButton();
  if (mitFeedback) {
    if (ok > 0 && remaining.length === 0)
      zeigeSyncStatus(`✅ ${ok} Protokoll(e) erfolgreich zu Google Drive hochgeladen!`, 'gruen');
    else if (ok > 0)
      zeigeSyncStatus(`⚠️ ${ok} hochgeladen, ${remaining.length} fehlgeschlagen. Nochmal versuchen.`, 'gelb');
    else
      zeigeSyncStatus('❌ Upload fehlgeschlagen. Internetverbindung prüfen und nochmal versuchen.', 'rot');
  }
}

function zeigeSyncStatus(text, farbe) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const farben = { gruen: '#16a34a', rot: '#dc2626', gelb: '#d97706', grau: '#6b7280' };
  el.textContent = text;
  el.style.color = farben[farbe] || '#374151';
  el.style.display = 'block';
  if (farbe === 'gruen') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function updateSyncButton() {
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  const btn = document.getElementById('drive-sync-btn');
  const badge = document.getElementById('sync-badge');
  if (!btn) return;
  if (queue.length > 0) {
    btn.style.background = '#fee2e2';
    btn.style.borderColor = '#ef4444';
    btn.style.color = '#991b1b';
    if (badge) { badge.textContent = queue.length; badge.style.display = 'inline'; }
  } else {
    btn.style.background = '#f0fdf4';
    btn.style.borderColor = '#bbf7d0';
    btn.style.color = '#16a34a';
    if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
  }
}

function checkOfflineQueueWarnung() {
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  const existingBanner = document.getElementById('offline-queue-warnung');
  if (existingBanner) existingBanner.remove();
  if (queue.length === 0) return;

  const banner = document.createElement('div');
  banner.id = 'offline-queue-warnung';
  banner.style.cssText = `
    background: #fee2e2;
    border: 2px solid #ef4444;
    border-radius: 8px;
    padding: 14px 16px;
    margin: 12px 0;
    color: #7f1d1d;
    font-size: 15px;
    line-height: 1.5;
  `;
  banner.innerHTML = `
    <strong>⚠️ ${queue.length} Prüf-Protokoll(e) nicht in Google Drive gespeichert!</strong><br>
    Die PDFs liegen nur auf diesem Gerät. Bitte jetzt auf <strong>🔄 Sync</strong> tippen um sie hochzuladen.
    <br><br>
    <button onclick="offlineQueueFlush(true)" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:15px;font-weight:700;cursor:pointer;">🔄 Jetzt synchronisieren</button>
  `;

  // Vor dem ersten Standort-Card einfügen
  const container = document.getElementById('standort-container') || document.getElementById('home-screen');
  if (container) container.insertBefore(banner, container.firstChild);
}

// ===== DASHBOARD STATISTIK (Home-Screen) =====
async function renderDashboard() {
  const el = document.getElementById('dashboard-stats');
  if (!el || typeof window.fbGetAmpelAlle !== 'function') return;
  let total = 0, gruen = 0, gelb = 0, rot = 0;
  for (const s of APP_CONFIG.standorte) {
    for (const g of (s.gruppen || [])) {
      for (const b of (g.bereiche || [])) {
        total++;
        const status = await window.fbGetAmpel(b.id, b.liste);
        if (status === 'gruen') gruen++;
        else if (status === 'gelb') gelb++;
        else if (status === 'rot') rot++;
      }
    }
  }
  const geprüft = gruen + gelb + rot;
  el.innerHTML = `
    <div class="dashboard-stats-grid">
      <div class="dashboard-stat-kachel">
        <div class="stat-wert stat-blau">${total}</div>
        <div class="stat-label">📋 Bereiche gesamt</div>
      </div>
      <div class="dashboard-stat-kachel">
        <div class="stat-wert stat-gruen">${gruen}</div>
        <div class="stat-label">✅ Aktuell geprüft</div>
      </div>
      <div class="dashboard-stat-kachel">
        <div class="stat-wert stat-gelb">${gelb}</div>
        <div class="stat-label">🟡 Bald fällig</div>
      </div>
      <div class="dashboard-stat-kachel">
        <div class="stat-wert stat-rot">${rot}</div>
        <div class="stat-label">🔴 Überfällig</div>
      </div>
    </div>
    <div class="dashboard-row" style="border-top:1px solid #ddd;padding-top:6px">
      <span>📊 Geprüft diesen Monat</span><strong>${geprüft} / ${total}</strong>
    </div>
  `;

  // FEATURE 6: Fälligkeits-Übersicht (nächste 14 Tage)
  if (typeof window.fbGetFaelligkeitenUebersicht === 'function') {
    const faellig = await window.fbGetFaelligkeitenUebersicht();
    if (faellig.length > 0) {
      const ampelIcon = r => r < 0 ? '🔴' : r <= 7 ? '🟡' : '🔵';
      const ampelColor = r => r < 0 ? '#c0392b' : r <= 7 ? '#e6a817' : '#1a3a5c';
      const tageText = r => r < 0 ? `Überfällig seit ${Math.abs(r)} Tagen` : r === 0 ? 'Heute fällig!' : `In ${r} Tagen`;

      // Nach Kategorie gruppieren
      const KATEGORIE_LABEL = {
        aufzug: '🛗 Aufzug',
        brandschutztuer: '🚪 Brandschutz',
        notbeleuchtung: '💡 Notbeleuchtung',
        leiterkontrolle: '🪜 Leitern',
        gfb_szp: '🧗 GFU/SZP',
        gfb_glasreinigung: '🪟 GFU/Glasreinigung',
        fusswegreinigung: '🧹 Fußweg-Reinigung',
      };
      const gruppen = {};
      faellig.forEach(f => {
        const kat = f.listentyp || 'sonstige';
        if (!gruppen[kat]) gruppen[kat] = [];
        gruppen[kat].push(f);
      });

      let html = `<div style="margin-top:10px;padding-top:10px;border-top:2px solid #e0e0e0">
        <div style="font-weight:700;color:#1a3a5c;font-size:13px;margin-bottom:8px">📅 Nächste Fälligkeiten (14 Tage)</div>`;

      let katIdx = 0;
      Object.entries(gruppen).forEach(([kat, items]) => {
        const katLabel = KATEGORIE_LABEL[kat] || `📋 ${kat}`;
        const katId = `faellig-kat-${katIdx++}`;
        // Schlechtester Status in der Gruppe
        const hatRot = items.some(f => f.restTage < 0);
        const hatGelb = items.some(f => f.restTage >= 0 && f.restTage <= 7);
        const ampelKat = hatRot ? '🔴' : hatGelb ? '🟡' : '🔵';
        html += `
        <div style="margin:6px 0 2px">
          <div onclick="(function(el){var c=document.getElementById('${katId}');var open=c.style.display!=='none';c.style.display=open?'none':'block';el.querySelector('.fk-arrow').textContent=open?'▶':'▼';})(this)"
            style="display:flex;align-items:center;justify-content:space-between;
                   background:#1a3a5c;color:#fff;border-radius:8px;padding:7px 12px;
                   cursor:pointer;user-select:none;font-size:12px;font-weight:700">
            <span>${ampelKat} ${katLabel} <span style="font-weight:400;opacity:.8">(${items.length})</span></span>
            <span class="fk-arrow" style="font-size:10px;margin-left:8px">▶</span>
          </div>
          <div id="${katId}" style="display:none;padding:4px 0 0">`;
        items.forEach(f => {
          const farbe = ampelColor(f.restTage);
          const bg = f.restTage < 0 ? '#fef2f2' : f.restTage <= 7 ? '#fffbeb' : '#eff6ff';
          const border = f.restTage < 0 ? '#fca5a5' : f.restTage <= 7 ? '#fde68a' : '#bfdbfe';
          html += `<div onclick="openBereichById('${f.bereichId}')"
            style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;
                   margin-bottom:4px;border-radius:8px;background:${bg};border:1px solid ${border};
                   cursor:pointer;transition:opacity .15s"
            onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
            <span style="font-size:12px;font-weight:600;color:#1a3a5c">
              ${ampelIcon(f.restTage)} ${f.bereichName || f.bereichId}
            </span>
            <span style="font-size:11px;font-weight:700;color:${farbe};white-space:nowrap;margin-left:8px">
              ${tageText(f.restTage)} ›
            </span>
          </div>`;
        });
        html += `</div></div>`;
      });

      html += '</div>';
      el.insertAdjacentHTML('beforeend', html);
    }
  }
}

// ===== LOADING =====
function showLoading(visible) {
  document.getElementById('loading').classList.toggle('hidden', !visible);
}

// ===== DATUM HELFER =====
function formatDatum(d) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function formatDatumISO(d) {
  return d.toISOString().slice(0, 10);
}
function getKW(d) {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
}

// ===== CHECKLISTEN-EDITOR (Admin: Thomas & Fabian) =====

const EDITOR_STORAGE_KEY = 'csc_editor_anpassungen';

// FEATURE 1: Editor-Anpassungen laden — zuerst Firestore, dann localStorage als Fallback
async function editorLadeAnpassungenAsync() {
  const session = checkSession();
  if (session && typeof window.fbEditorLade === 'function') {
    const fsData = await window.fbEditorLade(session.email);
    if (Object.keys(fsData).length > 0) {
      // Auch in localStorage cachen für Offline-Nutzung
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(fsData));
      return fsData;
    }
  }
  try { return JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || '{}'); }
  catch(e) { return {}; }
}

// Synchron (für sofortige Nutzung während Render) — aus localStorage-Cache
function editorLadeAnpassungen() {
  try { return JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || '{}'); }
  catch(e) { return {}; }
}

// FEATURE 1: Anpassungen speichern — gleichzeitig in localStorage und Firestore
function editorSpeichereAnpassungen(data) {
  localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(data));
  // Async in Firestore speichern
  const session = checkSession();
  if (session && typeof window.fbEditorSpeichere === 'function') {
    window.fbEditorSpeichere(session.email, data).catch(() => {});
  }
}

// FEATURE 1: Editor öffnen → Anpassungen aus Firestore laden
function openEditor() {
  showScreen('editor');
  const container = document.getElementById('editor-inhalt');
  container.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Lade Einstellungen…</div>';
  editorLadeAnpassungenAsync().then(() => renderEditorHome());
}

// Gibt die aktuellen Punkte einer Liste zurück (Original + Anpassungen zusammengeführt)
function editorGetPunkte(listeKey) {
  const anpassungen = editorLadeAnpassungen();
  const liste = APP_CONFIG.listen[listeKey];
  if (!liste) return [];
  // Tiefe Kopie der Original-Abschnitte
  const abschnitte = JSON.parse(JSON.stringify(liste.abschnitte));
  const ueberschreib = anpassungen[listeKey] || {};
  // Überschreibungen anwenden
  abschnitte.forEach(abs => {
    abs.punkte = abs.punkte
      .map(p => ({ ...p, text: ueberschreib[p.id]?.text ?? p.text, geloescht: ueberschreib[p.id]?.geloescht ?? false }))
      .filter(p => !p.geloescht);
    // Neue Punkte (id beginnt mit 'custom_') hinzufügen
    const neuePunkte = Object.entries(ueberschreib)
      .filter(([k, v]) => k.startsWith('custom_') && v.abschnitt === abs.titel && !v.geloescht)
      .map(([k, v]) => ({ id: k, text: v.text }));
    abs.punkte.push(...neuePunkte);
  });
  return abschnitte;
}

// Übersicht aller bearbeitbaren Listen
function renderEditorHome() {
  const container = document.getElementById('editor-inhalt');
  const LISTEN_LABELS = {
    aufzug:           '🛗 Aufzug',
    brandschutztuer:  '🚪 Brandschutztüren',
    notbeleuchtung:   '💡 Notbeleuchtung',
    leiterkontrolle:  '🪜 Leitern',
    gfb_szp:          '🧗 GFB Seil-Zugangs-Technik',
    gfb_glasreinigung:'🪟 GFB Glasreinigung',
    fusswegreinigung: '🧹 Fußweg-Reinigung',
  };
  container.innerHTML = `
    <div style="padding:8px 0 16px 0;color:#555;font-size:13px">
      Hier kannst du Prüfpunkte bearbeiten, löschen oder neue hinzufügen.<br>
      Änderungen gelten nur auf diesem Gerät.
    </div>
  `;
  Object.entries(LISTEN_LABELS).forEach(([key, label]) => {
    const anpassungen = editorLadeAnpassungen();
    const hatAnpassungen = Object.keys(anpassungen[key] || {}).length > 0;
    const btn = document.createElement('div');
    btn.className = 'bereich-item';
    btn.style.cssText = 'cursor:pointer;margin-bottom:10px';
    btn.onclick = () => renderEditorListe(key);
    btn.innerHTML = `
      <div class="bereich-info">
        <div class="bereich-name">${label}</div>
        <div class="bereich-liste-name" style="color:${hatAnpassungen ? '#e67e00' : '#888'}">
          ${hatAnpassungen ? '⚠️ Angepasst' : 'Original'}
        </div>
      </div>
      <div style="font-size:20px;color:#1a3a5c">›</div>
    `;
    container.appendChild(btn);
  });

  // Reset-Button
  const resetDiv = document.createElement('div');
  resetDiv.style.cssText = 'margin-top:24px;padding-top:16px;border-top:1px solid #eee';
  resetDiv.innerHTML = `
    <button class="btn-secondary" style="width:100%;color:#c00;border-color:#c00;font-size:13px"
      onclick="editorAllesZuruecksetzen()">
      🔄 Alle Änderungen zurücksetzen (Original wiederherstellen)
    </button>
  `;
  container.appendChild(resetDiv);
}

// Einzelne Liste bearbeiten
function renderEditorListe(listeKey) {
  const liste = APP_CONFIG.listen[listeKey];
  if (!liste) return;
  const anpassungen = editorLadeAnpassungen();
  const ueberschreib = anpassungen[listeKey] || {};
  const container = document.getElementById('editor-inhalt');
  container.innerHTML = '';

  // Zurück-Button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn-secondary';
  backBtn.style.cssText = 'margin-bottom:16px;font-size:13px;padding:7px 14px';
  backBtn.textContent = '‹ Alle Listen';
  backBtn.onclick = () => renderEditorHome();
  container.appendChild(backBtn);

  // Titel
  const titelDiv = document.createElement('div');
  titelDiv.style.cssText = 'font-size:16px;font-weight:700;color:#1a3a5c;margin-bottom:16px';
  titelDiv.textContent = liste.titel;
  container.appendChild(titelDiv);

  // Abschnitte
  liste.abschnitte.forEach(abs => {
    const absDiv = document.createElement('div');
    absDiv.style.cssText = 'margin-bottom:20px';

    // Abschnittstitel
    const absHeader = document.createElement('div');
    absHeader.style.cssText = 'background:#1a3a5c;color:#fff;padding:8px 12px;border-radius:8px 8px 0 0;font-weight:600;font-size:14px';
    absHeader.textContent = abs.titel;
    absDiv.appendChild(absHeader);

    // Punkte
    abs.punkte.forEach(p => {
      const istGeloescht = ueberschreib[p.id]?.geloescht === true;
      const aktuellerText = ueberschreib[p.id]?.text ?? p.text;
      if (istGeloescht) return; // gelöschte nicht anzeigen

      const punktDiv = document.createElement('div');
      punktDiv.id = `editor-punkt-${p.id}`;
      punktDiv.style.cssText = 'background:#f8f9fa;border:1px solid #ddd;border-top:none;padding:10px 12px;display:flex;gap:8px;align-items:flex-start';
      punktDiv.innerHTML = `
        <div style="flex:1">
          <div id="editor-text-${p.id}" style="font-size:13px;color:#333;line-height:1.4">${aktuellerText}</div>
          <div style="display:none" id="editor-input-wrap-${p.id}">
            <textarea id="editor-input-${p.id}" rows="3"
              style="width:100%;box-sizing:border-box;margin-top:6px;padding:8px;border:2px solid #1a3a5c;border-radius:6px;font-size:13px;resize:vertical"
            >${aktuellerText}</textarea>
            <div style="display:flex;gap:6px;margin-top:6px">
              <button class="btn-primary" style="flex:1;font-size:12px;padding:7px"
                onclick="editorPunktSpeichern('${listeKey}','${p.id}')">💾 Speichern</button>
              <button class="btn-secondary" style="flex:1;font-size:12px;padding:7px"
                onclick="editorPunktAbbrechen('${p.id}')">Abbrechen</button>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="btn-secondary" style="font-size:11px;padding:5px 8px"
            onclick="editorPunktBearbeiten('${p.id}')">✏️</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 8px;color:#c00;border-color:#c00"
            onclick="editorPunktLoeschen('${listeKey}','${p.id}','${abs.titel}')">🗑</button>
        </div>
      `;
      absDiv.appendChild(punktDiv);
    });

    // Neuen Punkt hinzufügen
    // Auch neue custom-Punkte dieses Abschnitts anzeigen
    const neuePunkte = Object.entries(ueberschreib)
      .filter(([k, v]) => k.startsWith('custom_') && v.abschnitt === abs.titel && !v.geloescht);
    neuePunkte.forEach(([k, v]) => {
      const punktDiv = document.createElement('div');
      punktDiv.id = `editor-punkt-${k}`;
      punktDiv.style.cssText = 'background:#f0fff4;border:1px solid #aed;border-top:none;padding:10px 12px;display:flex;gap:8px;align-items:flex-start';
      punktDiv.innerHTML = `
        <div style="flex:1">
          <div id="editor-text-${k}" style="font-size:13px;color:#333;line-height:1.4">✨ ${v.text}</div>
          <div style="display:none" id="editor-input-wrap-${k}">
            <textarea id="editor-input-${k}" rows="3"
              style="width:100%;box-sizing:border-box;margin-top:6px;padding:8px;border:2px solid #1a3a5c;border-radius:6px;font-size:13px;resize:vertical"
            >${v.text}</textarea>
            <div style="display:flex;gap:6px;margin-top:6px">
              <button class="btn-primary" style="flex:1;font-size:12px;padding:7px"
                onclick="editorPunktSpeichern('${listeKey}','${k}')">💾 Speichern</button>
              <button class="btn-secondary" style="flex:1;font-size:12px;padding:7px"
                onclick="editorPunktAbbrechen('${k}')">Abbrechen</button>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="btn-secondary" style="font-size:11px;padding:5px 8px"
            onclick="editorPunktBearbeiten('${k}')">✏️</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 8px;color:#c00;border-color:#c00"
            onclick="editorPunktLoeschen('${listeKey}','${k}','${abs.titel}')">🗑</button>
        </div>
      `;
      absDiv.appendChild(punktDiv);
    });

    // "+ Neuen Punkt hinzufügen"-Bereich
    const addDiv = document.createElement('div');
    addDiv.style.cssText = 'border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;padding:8px 12px;background:#fff';
    const safeAbsTitel = abs.titel.replace(/'/g, "\\'");
    addDiv.innerHTML = `
      <div id="add-wrap-${listeKey}-${abs.titel.replace(/\s+/g,'_')}" style="display:none">
        <textarea id="add-input-${listeKey}-${abs.titel.replace(/\s+/g,'_')}" rows="2"
          placeholder="Neuen Prüfpunkt eingeben…"
          style="width:100%;box-sizing:border-box;padding:8px;border:2px solid #1a3a5c;border-radius:6px;font-size:13px;resize:vertical"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-primary" style="flex:1;font-size:12px;padding:7px"
            onclick="editorPunktHinzufuegen('${listeKey}','${safeAbsTitel}')">✅ Hinzufügen</button>
          <button class="btn-secondary" style="flex:1;font-size:12px;padding:7px"
            onclick="document.getElementById('add-wrap-${listeKey}-${abs.titel.replace(/\s+/g,'_')}').style.display='none'">Abbrechen</button>
        </div>
      </div>
      <button class="btn-secondary" id="add-btn-${listeKey}-${abs.titel.replace(/\s+/g,'_')}"
        style="width:100%;font-size:12px;padding:7px;margin-top:2px"
        onclick="document.getElementById('add-wrap-${listeKey}-${abs.titel.replace(/\s+/g,'_')}').style.display='block';this.style.display='none'">
        ＋ Neuen Punkt hinzufügen
      </button>
    `;
    absDiv.appendChild(addDiv);
    container.appendChild(absDiv);
  });
}

function editorPunktBearbeiten(punktId) {
  document.getElementById(`editor-text-${punktId}`).style.display = 'none';
  document.getElementById(`editor-input-wrap-${punktId}`).style.display = 'block';
}

function editorPunktAbbrechen(punktId) {
  document.getElementById(`editor-text-${punktId}`).style.display = 'block';
  document.getElementById(`editor-input-wrap-${punktId}`).style.display = 'none';
}

function editorPunktSpeichern(listeKey, punktId) {
  const neuerText = document.getElementById(`editor-input-${punktId}`).value.trim();
  if (!neuerText) { alert('Bitte Text eingeben.'); return; }
  const anpassungen = editorLadeAnpassungen();
  if (!anpassungen[listeKey]) anpassungen[listeKey] = {};
  anpassungen[listeKey][punktId] = { ...(anpassungen[listeKey][punktId] || {}), text: neuerText, geloescht: false };
  editorSpeichereAnpassungen(anpassungen);
  // Anzeige aktualisieren
  document.getElementById(`editor-text-${punktId}`).textContent = neuerText;
  document.getElementById(`editor-text-${punktId}`).style.display = 'block';
  document.getElementById(`editor-input-wrap-${punktId}`).style.display = 'none';
}

function editorPunktLoeschen(listeKey, punktId, abschnittTitel) {
  if (!confirm('Diesen Prüfpunkt wirklich löschen?')) return;
  const anpassungen = editorLadeAnpassungen();
  if (!anpassungen[listeKey]) anpassungen[listeKey] = {};
  anpassungen[listeKey][punktId] = { ...(anpassungen[listeKey][punktId] || {}), geloescht: true, abschnitt: abschnittTitel };
  editorSpeichereAnpassungen(anpassungen);
  const el = document.getElementById(`editor-punkt-${punktId}`);
  if (el) el.remove();
}

function editorPunktHinzufuegen(listeKey, abschnittTitel) {
  const inputKey = `${listeKey}-${abschnittTitel.replace(/\s+/g,'_')}`;
  const neuerText = document.getElementById(`add-input-${inputKey}`).value.trim();
  if (!neuerText) { alert('Bitte Text eingeben.'); return; }
  const anpassungen = editorLadeAnpassungen();
  if (!anpassungen[listeKey]) anpassungen[listeKey] = {};
  const customId = `custom_${Date.now()}`;
  anpassungen[listeKey][customId] = { text: neuerText, abschnitt: abschnittTitel, geloescht: false };
  editorSpeichereAnpassungen(anpassungen);
  // Seite neu rendern damit der neue Punkt erscheint
  renderEditorListe(listeKey);
}

function editorAllesZuruecksetzen() {
  if (!confirm('Wirklich alle Änderungen zurücksetzen und Original-Prüfpunkte wiederherstellen?')) return;
  localStorage.removeItem(EDITOR_STORAGE_KEY);
  renderEditorHome();
}

// ===== ALLE PROTOKOLLE — Übersicht mit Filter =====

// Gecachte Protokolle für Filter
let _alleProtokolleCache = [];

const LISTENTYP_LABEL = {
  aufzug:          '🛗 Aufzug',
  brandschutztuer: '🚪 Brandschutz',
  notbeleuchtung:  '💡 Notbeleuchtung',
  leiterkontrolle: '🪜 Leitern',
  gfb_szp:         '🧗 GFB SZP',
  gfb_glasreinigung:'🪟 GFB Glasreinigung',
  fusswegreinigung: '🧹 Fußweg-Reinigung',
};

async function showAlleProtokolleScreen() {
  showScreen('protokolle');

  const inhalt  = document.getElementById('protokolle-inhalt');
  const selObjekt = document.getElementById('filter-objekt');
  const selMA     = document.getElementById('filter-mitarbeiter');

  inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Lade Protokolle…</div>';

  if (typeof window.fbGetAlleProtokolle !== 'function') {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#c00">Firebase nicht verfügbar.</div>';
    return;
  }

  const protokolle = await window.fbGetAlleProtokolle();
  _alleProtokolleCache = protokolle;

  if (protokolle.length === 0) {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Noch keine Protokolle vorhanden.</div>';
    return;
  }

  // Filter-Dropdowns befüllen
  const objekte     = [...new Set(protokolle.map(p => p.standortName || p.standortId).filter(Boolean))].sort();
  const pruefpunkte = [...new Set(protokolle.map(p => p.listentyp).filter(Boolean))].sort();
  const mitarbeiter = [...new Set(protokolle.map(p => p.pruefer).filter(Boolean))].sort();

  const selPruefpunkt = document.getElementById('filter-pruefpunkt');

  // Objekte
  selObjekt.innerHTML = '<option value="">🏢 Alle Objekte</option>';
  objekte.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = `🏢 ${o}`;
    selObjekt.appendChild(opt);
  });

  // Prüfpunkte (Listentypen)
  if (selPruefpunkt) {
    selPruefpunkt.innerHTML = '<option value="">🔧 Alle Prüfpunkte</option>';
    pruefpunkte.forEach(lt => {
      const opt = document.createElement('option');
      opt.value = lt;
      opt.textContent = LISTENTYP_LABEL[lt] || lt;
      selPruefpunkt.appendChild(opt);
    });
  }

  // Mitarbeiter
  selMA.innerHTML = '<option value="">👤 Alle Mitarbeiter</option>';
  mitarbeiter.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `👤 ${m}`;
    selMA.appendChild(opt);
  });

  filterProtokolle();
}

function filterProtokolle() {
  const inhalt    = document.getElementById('protokolle-inhalt');
  const anzahlEl  = document.getElementById('protokolle-anzahl');
  const selObjekt = document.getElementById('filter-objekt');
  const selPruefpunkt = document.getElementById('filter-pruefpunkt');
  const selMA     = document.getElementById('filter-mitarbeiter');

  if (!inhalt || !_alleProtokolleCache.length) return;

  const filterObjekt     = selObjekt     ? selObjekt.value     : '';
  const filterPruefpunkt = selPruefpunkt ? selPruefpunkt.value : '';
  const filterMA         = selMA         ? selMA.value         : '';

  let gefiltert = _alleProtokolleCache;
  if (filterObjekt)     gefiltert = gefiltert.filter(p => (p.standortName || p.standortId) === filterObjekt);
  if (filterPruefpunkt) gefiltert = gefiltert.filter(p => p.listentyp === filterPruefpunkt);
  if (filterMA)         gefiltert = gefiltert.filter(p => p.pruefer === filterMA);

  // Aktive Filter optisch hervorheben
  [selObjekt, selPruefpunkt, selMA].forEach(sel => {
    if (!sel) return;
    sel.style.borderColor = sel.value ? '#1a73e8' : '#c8d8f0';
    sel.style.background  = sel.value ? '#eef4ff' : '#fff';
  });

  anzahlEl.textContent = `${gefiltert.length} Protokoll${gefiltert.length !== 1 ? 'e' : ''} gefunden`;

  if (gefiltert.length === 0) {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Keine Protokolle für diesen Filter.</div>';
    return;
  }

  inhalt.innerHTML = '';

  // Nach Objekt + Bereich gruppieren
  const gruppen = {};
  gefiltert.forEach(p => {
    const key = `${p.standortName || p.standortId || 'Unbekanntes Objekt'}|||${p.bereichName || p.bereichId}`;
    if (!gruppen[key]) gruppen[key] = [];
    gruppen[key].push(p);
  });

  Object.keys(gruppen).sort().forEach(key => {
    const [objektName, bereichName] = key.split('|||');
    const eintraege = gruppen[key];
    const letzter = eintraege[0];
    const listenLabel = LISTENTYP_LABEL[letzter.listentyp] || letzter.listentyp || 'Prüfung';

    const gruppe = document.createElement('div');
    gruppe.style.cssText = 'margin-bottom:16px;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07);';

    const header = document.createElement('div');
    header.style.cssText = 'font-weight:bold;font-size:14px;padding:10px 14px;background:#1a3a5c;color:#fff;display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = `
      <span>${listenLabel} — ${bereichName}</span>
      <span style="font-size:11px;font-weight:normal;opacity:0.85;">${objektName}</span>
    `;
    gruppe.appendChild(header);

    eintraege.forEach((p, idx) => {
      const d     = new Date(p.datum);
      const datum = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
      const icon  = p.hatMaengel ? '🔴' : '🟢';

      const card = document.createElement('div');
      card.style.cssText = `padding:10px 14px;background:${idx % 2 === 0 ? '#fff' : '#fafafa'};border-left:3px solid ${p.hatMaengel ? '#c00' : '#2a9d2a'};border-bottom:1px solid #eee;`;

      let maengelHtml = '';
      if (p.hatMaengel && p.maengelText) {
        maengelHtml = `<div style="margin-top:4px;padding:5px 8px;background:#fff3f3;border-radius:4px;font-size:12px;color:#c00;">⚠️ ${p.maengelText}</div>`;
      }

      let driveHtml = '';
      if (p.driveFileId) {
        const driveUrl  = `https://drive.google.com/file/d/${p.driveFileId}/view`;
        const dlName    = `${p.datum ? p.datum.replace(/\./g,'-') : 'Protokoll'}_${p.bereichId}.pdf`;
        driveHtml = `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
          <a href="${driveUrl}" target="_blank" style="display:inline-block;padding:5px 12px;background:#1a73e8;color:#fff;border-radius:6px;font-size:12px;text-decoration:none;font-weight:500;">📄 Öffnen</a>
          <button onclick="downloadPdfFromDrive('${p.driveFileId}','${dlName}')" style="padding:5px 12px;background:#34a853;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">⬇️ PDF</button>
        </div>`;
      }

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:14px;font-weight:500;">${icon} ${datum}</span>
          <span style="font-size:12px;color:#666;">👤 ${p.pruefer || '—'}</span>
        </div>
        ${maengelHtml}
        ${driveHtml}
      `;
      gruppe.appendChild(card);
    });

    inhalt.appendChild(gruppe);
  });
}

function filterZuruecksetzen() {
  const selObjekt     = document.getElementById('filter-objekt');
  const selPruefpunkt = document.getElementById('filter-pruefpunkt');
  const selMA         = document.getElementById('filter-mitarbeiter');
  [selObjekt, selPruefpunkt, selMA].forEach(sel => {
    if (!sel) return;
    sel.value = '';
    sel.style.borderColor = '#c8d8f0';
    sel.style.background  = '#fff';
  });
  filterProtokolle();
}


// ============================================================
//  GERÄTE-VERWALTUNG
// ============================================================

let _geraeteCache = [];
let _geraeteLoaded = false;

// QR-Code-URL für ein Gerät (wird beim Scan erkannt)
function geraetQrUrl(geraetId) {
  return 'https://thomasschmoldt1967-cpu.github.io/csc-pruefapp/?geraet=' + geraetId;
}

// Screen öffnen
async function showGeraeteScreen() {
  showScreen('geraete');
  await ladeGeraete();
  geraeteFilterBefuellen();
  renderGeraeteListe();
}

// Geräte aus Firestore laden
async function ladeGeraete() {
  _geraeteCache = await window.fbGetAlleGeraete();
  _geraeteLoaded = true;
}

// Filter-Dropdowns befüllen
function geraeteFilterBefuellen() {
  const selObjekt = document.getElementById('geraet-filter-objekt');
  const selTyp    = document.getElementById('geraet-filter-typ');
  if (!selObjekt || !selTyp) return;

  // Objekte aus Daten
  const objekte = [...new Set(_geraeteCache.map(g => g.objekt).filter(Boolean))].sort();
  selObjekt.innerHTML = '<option value="">📍 Alle Objekte</option>' +
    objekte.map(o => `<option value="${o}">${o}</option>`).join('');

  // Typen aus config.js
  selTyp.innerHTML = '<option value="">🔧 Alle Typen</option>' +
    GERAETETYPEN.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Liste rendern (mit Filtern)
function renderGeraeteListe() {
  const container = document.getElementById('geraete-liste');
  const anzDiv    = document.getElementById('geraet-anzahl');
  if (!container) return;

  const filterObjekt = document.getElementById('geraet-filter-objekt')?.value || '';
  const filterTyp    = document.getElementById('geraet-filter-typ')?.value || '';

  let liste = _geraeteCache.filter(g => {
    if (filterObjekt && g.objekt !== filterObjekt) return false;
    if (filterTyp    && g.typ    !== filterTyp)    return false;
    return true;
  });

  // Sortierung: zuerst defekt/wartung, dann alphabetisch
  const zustandPrio = { defekt: 0, wartung: 1, reparatur: 2, ok: 3, ausgemustert: 4 };
  liste.sort((a, b) => {
    const pa = zustandPrio[a.zustand] ?? 9;
    const pb = zustandPrio[b.zustand] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.name || '').localeCompare(b.name || '');
  });

  if (anzDiv) anzDiv.textContent = liste.length + ' Gerät' + (liste.length !== 1 ? 'e' : '');

  if (liste.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">Keine Geräte vorhanden.<br><small>Tippe auf „+ Neu" um ein Gerät anzulegen.</small></div>';
    return;
  }

  container.innerHTML = '';
  liste.forEach(g => {
    const zustandInfo = GERAET_ZUSTAND.find(z => z.value === g.zustand) || { label: '—', color: '#999' };
    const pruefFaellig = g.naechstePruefung && new Date(g.naechstePruefung) < new Date()
      ? '<span style="color:#dc2626;font-size:11px;font-weight:700;">⚠️ Prüfung überfällig!</span>' : '';

    const karte = document.createElement('div');
    karte.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;cursor:pointer;';
    karte.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;color:#1a3a5c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.name || '—'}</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">${g.typ || ''} ${g.hersteller ? '· ' + g.hersteller : ''} ${g.modell ? g.modell : ''}</div>
          <div style="font-size:12px;color:#888;margin-top:2px;">📍 ${g.objekt || '—'} ${g.lagerort ? '· ' + g.lagerort : ''}</div>
          ${pruefFaellig}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${zustandInfo.color}22;color:${zustandInfo.color};">${zustandInfo.label}</span>
          ${g.kosten ? `<div style="font-size:12px;color:#1a3a5c;margin-top:4px;font-weight:600;">${parseFloat(g.kosten).toLocaleString('de-DE', {style:'currency',currency:'EUR'})}</div>` : ''}
        </div>
      </div>
    `;
    karte.onclick = () => geraetDetailAnzeigen(g.id);
    container.appendChild(karte);
  });
}

// Detail-Modal öffnen
async function geraetDetailAnzeigen(geraetId) {
  const g = _geraeteCache.find(x => x.id === geraetId) || await window.fbGetGeraet(geraetId);
  if (!g) return;

  const overlay = document.getElementById('geraet-detail-overlay');
  const titel   = document.getElementById('geraet-detail-titel');
  const inhalt  = document.getElementById('geraet-detail-inhalt');
  if (!overlay) return;

  const zustandInfo = GERAET_ZUSTAND.find(z => z.value === g.zustand) || { label: '—', color: '#999' };
  const qrUrl = geraetQrUrl(g.id);

  titel.textContent = g.name || 'Gerät';

  const pruefDatum = g.naechstePruefung
    ? new Date(g.naechstePruefung).toLocaleDateString('de-DE')
    : '—';
  const anschDatum = g.anschaffungsdatum
    ? new Date(g.anschaffungsdatum).toLocaleDateString('de-DE')
    : '—';

  inhalt.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <!-- Zustand Badge -->
      <div style="text-align:center;">
        <span style="display:inline-block;padding:6px 20px;border-radius:20px;font-size:14px;font-weight:700;background:${zustandInfo.color}22;color:${zustandInfo.color};">${zustandInfo.label}</span>
      </div>

      <!-- Stammdaten -->
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        ${geraetDetailZeile('Typ', g.typ)}
        ${geraetDetailZeile('Hersteller', g.hersteller)}
        ${geraetDetailZeile('Modell', g.modell)}
        ${geraetDetailZeile('Seriennummer', g.seriennr)}
        ${geraetDetailZeile('Objekt / Standort', g.objekt)}
        ${geraetDetailZeile('Lagerort / Raum', g.lagerort)}
        ${geraetDetailZeile('Nächste Prüfung', pruefDatum)}
        ${geraetDetailZeile('Anschaffungsdatum', anschDatum)}
        ${g.kosten ? geraetDetailZeile('Anschaffungskosten', parseFloat(g.kosten).toLocaleString('de-DE', {style:'currency',currency:'EUR'})) : ''}
        ${g.bemerkung ? geraetDetailZeile('Bemerkungen', g.bemerkung) : ''}
      </table>

      <!-- QR-Code -->
      <div style="text-align:center;padding:16px;background:#f8f9fb;border-radius:10px;">
        <div style="font-size:12px;font-weight:600;color:#666;margin-bottom:8px;">QR-Code für dieses Gerät</div>
        <div id="geraet-qr-box-${g.id}" style="display:inline-block;background:#fff;padding:8px;border-radius:8px;border:1px solid #e2e8f0;"></div>
        <div style="font-size:10px;color:#999;margin-top:6px;word-break:break-all;">${g.id}</div>
        <div style="margin-top:10px;">
          <button onclick="geraetQrDrucken('${g.id}','${(g.name||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${(g.seriennr||'').replace(/'/g,"\\'")}','${(g.objekt||'').replace(/'/g,"\\'")}','${(g.typ||'').replace(/'/g,"\\'")}')"
            style="padding:10px 20px;background:#1a3a5c;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            🖨️ QR-Code drucken
          </button>
        </div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button onclick="geraetBearbeiten('${g.id}')" style="flex:1;padding:12px;background:#1a3a5c;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">✏️ Bearbeiten</button>
        <button onclick="geraetLoeschen('${g.id}','${(g.name||'').replace(/'/g,'')}')" style="padding:12px 16px;background:#fee2e2;color:#dc2626;border:none;border-radius:10px;font-size:14px;cursor:pointer;">🗑️</button>
      </div>
    </div>
  `;

  overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';

  // QR-Code rendern (QRCode.js aus CDN, ist in der App noch nicht — wir nutzen eine API)
  const qrBox = document.getElementById('geraet-qr-box-' + g.id);
  if (qrBox) {
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`;
    img.style.cssText = 'width:160px;height:160px;display:block;';
    img.alt = 'QR-Code';
    qrBox.appendChild(img);
  }
}

function geraetDetailZeile(label, wert) {
  if (!wert) return '';
  return `<tr>
    <td style="padding:5px 0;color:#666;width:44%;vertical-align:top;">${label}</td>
    <td style="padding:5px 0;color:#1a3a5c;font-weight:600;">${wert}</td>
  </tr>`;
}

function geraetDetailSchliessen(event) {
  if (event && event.target !== document.getElementById('geraet-detail-overlay')) return;
  document.getElementById('geraet-detail-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

// Formular: Neues Gerät
function geraetNeu() {
  document.getElementById('geraet-form-titel').textContent = 'Gerät anlegen';
  document.getElementById('geraet-edit-id').value = '';
  ['geraet-name','geraet-hersteller','geraet-modell','geraet-seriennr',
   'geraet-objekt','geraet-lagerort','geraet-naechste-pruefung',
   'geraet-kosten','geraet-anschaffung','geraet-bemerkung'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Typ-Dropdown befüllen
  const selTyp = document.getElementById('geraet-typ');
  selTyp.innerHTML = GERAETETYPEN.map(t => `<option value="${t}">${t}</option>`).join('');

  // Zustand-Dropdown befüllen
  const selZustand = document.getElementById('geraet-zustand');
  selZustand.innerHTML = GERAET_ZUSTAND.map(z =>
    `<option value="${z.value}">${z.label}</option>`).join('');

  document.getElementById('geraet-form-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

// Formular: Gerät bearbeiten
async function geraetBearbeiten(geraetId) {
  const g = _geraeteCache.find(x => x.id === geraetId) || await window.fbGetGeraet(geraetId);
  if (!g) return;

  geraetDetailSchliessen({ target: null }); // Detail schließen ohne Event-Check
  document.getElementById('geraet-detail-overlay').style.display = 'none';
  document.body.style.overflow = '';

  document.getElementById('geraet-form-titel').textContent = 'Gerät bearbeiten';
  document.getElementById('geraet-edit-id').value = g.id;

  // Typ-Dropdown
  const selTyp = document.getElementById('geraet-typ');
  selTyp.innerHTML = GERAETETYPEN.map(t => `<option value="${t}" ${t===g.typ?'selected':''}>${t}</option>`).join('');

  // Zustand-Dropdown
  const selZustand = document.getElementById('geraet-zustand');
  selZustand.innerHTML = GERAET_ZUSTAND.map(z =>
    `<option value="${z.value}" ${z.value===g.zustand?'selected':''}>${z.label}</option>`).join('');

  // Felder befüllen
  const felder = {
    'geraet-name': g.name, 'geraet-hersteller': g.hersteller, 'geraet-modell': g.modell,
    'geraet-seriennr': g.seriennr, 'geraet-objekt': g.objekt, 'geraet-lagerort': g.lagerort,
    'geraet-naechste-pruefung': g.naechstePruefung, 'geraet-kosten': g.kosten,
    'geraet-anschaffung': g.anschaffungsdatum, 'geraet-bemerkung': g.bemerkung
  };
  Object.entries(felder).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  });

  document.getElementById('geraet-form-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

// Formular schließen
function geraetFormSchliessen(event) {
  if (event && event.target !== document.getElementById('geraet-form-overlay')) return;
  document.getElementById('geraet-form-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

// Gerät speichern
async function geraetSpeichern() {
  const name = document.getElementById('geraet-name').value.trim();
  if (!name) { alert('Bitte Bezeichnung angeben!'); return; }

  const geraetId = document.getElementById('geraet-edit-id').value || null;

  const daten = {
    name,
    typ:              document.getElementById('geraet-typ').value,
    hersteller:       document.getElementById('geraet-hersteller').value.trim(),
    modell:           document.getElementById('geraet-modell').value.trim(),
    seriennr:         document.getElementById('geraet-seriennr').value.trim(),
    objekt:           document.getElementById('geraet-objekt').value.trim(),
    lagerort:         document.getElementById('geraet-lagerort').value.trim(),
    zustand:          document.getElementById('geraet-zustand').value,
    naechstePruefung: document.getElementById('geraet-naechste-pruefung').value || null,
    kosten:           document.getElementById('geraet-kosten').value || null,
    anschaffungsdatum:document.getElementById('geraet-anschaffung').value || null,
    bemerkung:        document.getElementById('geraet-bemerkung').value.trim(),
    angelegtVon:      window.currentUser?.name || '',
    angelegtAm:       geraetId ? undefined : new Date().toISOString(),
  };

  const btn = document.querySelector('#geraet-form-overlay button[onclick="geraetSpeichern()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichern...'; }

  try {
    const newId = await window.fbSaveGeraet(geraetId, daten);
    // Cache aktualisieren
    if (geraetId) {
      const idx = _geraeteCache.findIndex(x => x.id === geraetId);
      if (idx >= 0) _geraeteCache[idx] = { id: geraetId, ...daten };
    } else {
      _geraeteCache.push({ id: newId, ...daten });
    }

    geraetFormSchliessen({ target: null });
    document.getElementById('geraet-form-overlay').style.display = 'none';
    document.body.style.overflow = '';
    geraeteFilterBefuellen();
    renderGeraeteListe();
  } catch(e) {
    alert('Fehler beim Speichern: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Speichern'; }
  }
}

// Gerät löschen
async function geraetLoeschen(geraetId, name) {
  if (!confirm('Gerät „' + name + '" wirklich löschen?')) return;
  await window.fbDeleteGeraet(geraetId);
  _geraeteCache = _geraeteCache.filter(x => x.id !== geraetId);
  document.getElementById('geraet-detail-overlay').style.display = 'none';
  document.body.style.overflow = '';
  geraeteFilterBefuellen();
  renderGeraeteListe();
}

// QR-Scan-Handler: Gerät-URL erkennen
// Wird in handleQRResult() aufgerufen — dort ?geraet=ID erkennen


// QR-Code Drucken — öffnet Druckfenster mit QR + Gerätedaten
function geraetQrDrucken(geraetId, name, seriennr, objekt, typ) {
  const qrUrl = geraetQrUrl(geraetId);
  const qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrUrl);

  const zeilen = [
    ['Bezeichnung', name || '—'],
    seriennr ? ['Seriennummer', seriennr] : null,
    objekt   ? ['Standort',     objekt]   : null,
    typ      ? ['Typ',          typ]      : null,
  ].filter(Boolean);

  const tabelleHTML = zeilen.map(([label, wert]) => `
    <tr>
      <td style="font-size:11px;color:#555;padding:3px 8px 3px 0;white-space:nowrap;">${label}</td>
      <td style="font-size:11px;font-weight:700;color:#1a3a5c;padding:3px 0;">${wert}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>QR-Code: ${name}</title>
    <style>
      @page { size: A5; margin: 10mm; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; }
      .card {
        display: flex; flex-direction: column; align-items: center;
        border: 2px solid #1a3a5c; border-radius: 12px;
        padding: 20px 24px; max-width: 340px; margin: 0 auto;
        page-break-inside: avoid;
      }
      .logo-text {
        font-size: 13px; font-weight: 700; color: #1a3a5c;
        letter-spacing: 1px; margin-bottom: 12px;
      }
      .qr-img { width: 200px; height: 200px; display: block; }
      .name {
        font-size: 15px; font-weight: 700; color: #1a3a5c;
        margin: 12px 0 6px; text-align: center;
      }
      table { border-collapse: collapse; width: 100%; margin-top: 4px; }
      .hint {
        font-size: 10px; color: #999; margin-top: 10px; text-align: center;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head><body>
    <div class="card">
      <div class="logo-text">CSC Hannover · Prüf-App</div>
      <img class="qr-img" src="${qrImgUrl}" alt="QR-Code">
      <div class="name">${name}</div>
      <table>${tabelleHTML}</table>
      <div class="hint">QR-Code scannen → Gerätedaten in App anzeigen</div>
    </div>
    <script>
      window.onload = function() {
        var img = document.querySelector('.qr-img');
        if (img.complete) { window.print(); }
        else { img.onload = function() { window.print(); }; }
      };
    <\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    // Fallback: Blob-URL
    const blob = new Blob([html], { type: 'text/html' });
    window.location.href = URL.createObjectURL(blob);
  }
}

// ===== LMRA-PROTOKOLL HISTORIE =====
async function showLmraHistorieScreen() {
  showScreen('lmra-historie');
  const inhalt = document.getElementById('lmra-historie-inhalt');
  inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Lade LMRA-Protokolle…</div>';

  if (typeof window.fbGetAlleProtokolle !== 'function') {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Firebase nicht verfügbar.</div>';
    return;
  }

  const alle = await window.fbGetAlleProtokolle();
  const lmras = alle.filter(p => p.listentyp === 'lmra_hubarbeitsbuehne');

  if (lmras.length === 0) {
    inhalt.innerHTML = '<div style="padding:20px;text-align:center;color:#888">Noch keine LMRA-Protokolle vorhanden.</div>';
    return;
  }

  // Nach Datum sortieren (neueste zuerst)
  lmras.sort((a, b) => {
    const da = a.datum?.toDate ? a.datum.toDate() : new Date(a.datum);
    const db = b.datum?.toDate ? b.datum.toDate() : new Date(b.datum);
    return db - da;
  });

  let html = `<div style="padding:12px">
    <div style="font-size:13px;color:#666;margin-bottom:12px">${lmras.length} LMRA-Protokoll${lmras.length !== 1 ? 'e' : ''} gespeichert</div>`;

  lmras.forEach(p => {
    const datum = p.datum?.toDate ? p.datum.toDate() : new Date(p.datum);
    const datumStr = datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const zeitStr  = datum.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const objekt   = p.lmraObjekt || p.standortName || '—';
    const adresse  = p.lmraAdresse || '';
    const auftrg   = p.lmraAuftraggeber || '';
    const uhrzeit  = p.lmraUhrzeit || zeitStr;
    const wind     = p.lmraWind ? `${p.lmraWind} m/s` : '—';
    const windWarn = p.lmraWind && parseFloat(p.lmraWind) > 12.5;
    const maListe  = Array.isArray(p.lmraMitarbeiter) ? p.lmraMitarbeiter : [];
    const maText   = maListe.map(m => typeof m === 'object' ? `${m.name}${m.bedenken ? ' ✓' : ' ✗'}` : m).join(', ') || '—';
    const driveLink = p.driveFileId
      ? `<a href="https://drive.google.com/file/d/${p.driveFileId}/view" target="_blank"
           style="font-size:12px;color:#1a3a5c;text-decoration:none;border:1px solid #c8d8f0;padding:3px 8px;border-radius:6px">📄 PDF öffnen</a>`
      : '';

    html += `
    <div style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div style="font-weight:700;font-size:15px;color:#1a3a5c">🏗️ ${objekt}</div>
          ${adresse ? `<div style="font-size:12px;color:#666;margin-top:2px">📍 ${adresse}</div>` : ''}
          ${auftrg  ? `<div style="font-size:12px;color:#666">🤝 ${auftrg}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:600;color:#374151">${datumStr}</div>
          <div style="font-size:12px;color:#666">🕐 ${uhrzeit}</div>
        </div>
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;font-size:12px">
        <span style="background:#f3f4f6;padding:3px 8px;border-radius:6px">👤 ${p.pruefer || '—'}</span>
        <span style="background:${windWarn ? '#fee2e2' : '#f3f4f6'};color:${windWarn ? '#dc2626' : '#374151'};padding:3px 8px;border-radius:6px">💨 ${wind}${windWarn ? ' ⚠️' : ''}</span>
      </div>
      <div style="margin-top:6px;font-size:12px;color:#374151">
        <span style="font-weight:600">Mitarbeiter:</span> ${maText}
      </div>
      ${driveLink ? `<div style="margin-top:8px">${driveLink}</div>` : ''}
    </div>`;
  });

  html += '</div>';
  inhalt.innerHTML = html;
}
