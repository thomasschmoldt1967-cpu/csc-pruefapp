/* ============================================================
   CSC Prüf-App — Hauptlogik
   ============================================================ */

// ===== LOGIN / AUTH =====
const CSC_USERS = [
  { name: 'Thomas Schmoldt',    email: 'thomas@csc-hannover.de',    hash: 'd5651848baa6169aa41a065d20fb0f5c2329acf84cb6544369a9b5e1d18323ef' },
  { name: 'Katharina Schmoldt', email: 'katharina@csc-hannover.de', hash: 'c9437b3ac9f18eaf498d5576175325b5fae93eb137a5774d59c276a39d3c604f' },
  { name: 'Fabian Romyke',      email: 'fabian@csc-hannover.de',    hash: 'eeb9f5bdc61ca39d968cab3e00d217a704418facfea9ad384302a8baa39b8bbd' },
  { name: 'Klaus Stark',        email: 'klaus@csc-hannover.de',     hash: '78b673ed23e33cde5e839668445f6bbde2a41046f9ce716d3236b3f44d652114' },
];
const SESSION_KEY   = 'csc_session';
const SESSION_HOURS = 24; // Session gültig für 24 Stunden

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

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pw    = document.getElementById('login-password').value;
  const err   = document.getElementById('login-fehler');
  err.style.display = 'none';

  if (!email || !pw) { err.textContent = '⚠️ Bitte E-Mail und Passwort eingeben.'; err.style.display = 'block'; return; }

  const pwHash = await sha256(pw);
  const user = CSC_USERS.find(u => u.email === email && u.hash === pwHash);

  if (!user) {
    err.textContent = '❌ E-Mail oder Passwort falsch.';
    err.style.display = 'block';
    document.getElementById('login-password').value = '';
    return;
  }

  // Session speichern
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    name:    user.name,
    email:   user.email,
    expires: Date.now() + SESSION_HOURS * 3600 * 1000
  }));

  // Zur App weiterleiten
  showScreen('home');
  document.getElementById('home-user-name').textContent = user.name;
  renderHome();

  // QR-Parameter verarbeiten falls vorhanden
  const params = new URLSearchParams(window.location.search);
  const bereichId = params.get('bereich');
  if (bereichId) openBereichById(bereichId);
}

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-fehler').style.display = 'none';
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

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Service Worker registrieren
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Session prüfen
  const session = checkSession();
  if (session) {
    // Bereits eingeloggt → direkt zur App
    showScreen('home');
    document.getElementById('home-user-name').textContent = session.name;
    renderHome();
    // URL-Parameter: ?bereich=xxx (von QR-Code)
    const params = new URLSearchParams(window.location.search);
    const bereichId = params.get('bereich');
    if (bereichId) openBereichById(bereichId);
  } else {
    // Nicht eingeloggt → Login-Screen zeigen
    showScreen('login');
  }
});

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
    card.innerHTML = `
      <div class="standort-header" onclick="openStandort('${standort.id}')">
        🏢 ${standort.name}
      </div>
    `;
    // Gruppen als Ordner-Vorschau
    const preview = document.createElement('div');
    const gruppen = standort.gruppen || [];
    gruppen.forEach(g => {
      const item = document.createElement('div');
      item.className = 'bereich-item gruppe-item';
      item.id = `home-gruppe-${standort.id}-${g.id}`;
      item.onclick = () => openGruppe(standort.id, g.id);
      item.innerHTML = `
        <div class="bereich-icon icon-gruppe">${g.icon || '📁'}</div>
        <div class="bereich-info">
          <div class="bereich-name">${g.name}</div>
          <div class="bereich-liste-name">${g.bereiche.length} Bereiche</div>
        </div>
        <div class="ampel-badge ampel-unbekannt" id="ampel-gruppe-${standort.id}-${g.id}">…</div>
      `;
      preview.appendChild(item);
      // Ampel für Gruppe asynchron laden
      renderAmpelGruppe(standort.id, g);
    });
    card.appendChild(preview);
    container.appendChild(card);
  });

  // Mängel-Button laden
  renderMaengelButton();
}

// Ampel-Aggregat für eine Gruppe (schlechtester Status aller Bereiche)
async function renderAmpelGruppe(standortId, gruppe) {
  if (typeof window.fbGetAmpelAlle !== 'function') return;
  const badge = document.getElementById(`ampel-gruppe-${standortId}-${gruppe.id}`);
  if (!badge) return;
  const ampeln = await window.fbGetAmpelAlle(gruppe.bereiche);
  const vals = Object.values(ampeln);
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
  const map = { aufzug: 'icon-aufzug', brandschutztuer: 'icon-brandschutz', notbeleuchtung: 'icon-notbel', leiterkontrolle: 'icon-leiter', gfb_szp: 'icon-gruppe', gfb_glasreinigung: 'icon-gruppe' };
  return map[liste] || 'icon-default';
}
function listeIcon(liste) {
  const map = { aufzug: '🛗', brandschutztuer: '🚪', notbeleuchtung: '💡', leiterkontrolle: '🪜', gfb_szp: '🧗', gfb_glasreinigung: '🪟' };
  return map[liste] || '📋';
}
function listeTitel(listeId) {
  return APP_CONFIG.listen[listeId]?.titel || listeId;
}

// ===== STANDORT ÖFFNEN → zeigt Gruppen-Screen =====
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

// ===== GRUPPE ÖFFNEN → zeigt Bereiche-Screen =====
function openGruppe(standortId, gruppeId) {
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

  // Abschnitte
  const container = document.getElementById('checklist-abschnitte');
  container.innerHTML = '';
  currentListe.abschnitte.forEach(abschnitt => {
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
  gfbFelderBox.style.display = isGFB ? 'block' : 'none';

  // Labels Unterschrift / Name je nach Typ anpassen
  document.getElementById('unterschrift-label').textContent = isGFB ? 'Unterschrift Aufsichtsführender:' : 'Unterschrift Prüfer:';
  document.getElementById('pruefer-label').textContent = isGFB ? 'Name Aufsichtsführender:' : 'Name Prüfer:';
  document.getElementById('pruefer-name').placeholder = isGFB ? 'Name Aufsichtsführender …' : 'Oder Namen eingeben …';

  // Unterschrift-Box bei GFB ausblenden (Unterschrift kommt auf Seite 12 der Unterweisungsliste)
  document.getElementById('unterschrift-label-box').style.display = 'block';

  // Mitarbeiterliste nur bei GFB
  document.getElementById('gfb-ma-box').style.display = isGFB ? 'block' : 'none';
  document.getElementById('gfb-ma-liste').innerHTML = '';
  gfbMitarbeiter = [];

  // Prüfer-Buttons je nach Typ anpassen
  const prueferButtons = document.querySelector('.pruefer-buttons');
  if (isGFB) {
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
  document.getElementById('formular-standort').value = 'Raschplatz 5';
  document.getElementById('aufzug-nr').value = '';
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
    const dataUrl = e.target.result;
    const idx = fotoListe.length;
    fotoListe.push({ dataUrl, name: file.name });
    renderFotoVorschau(idx, dataUrl);
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
}

function clearSignature() {
  if (!sigPad) return;
  sigPad.ctx.clearRect(0, 0, sigPad.canvas.width, sigPad.canvas.height);
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

// ===== PRÜFUNG ABSCHLIESSEN =====
async function submitChecklist() {
  const offene = Object.values(pruefErgebnisse).filter(v => v === null).length;
  if (offene > 0) {
    if (!confirm(`${offene} Prüfpunkt(e) noch nicht bewertet. Trotzdem fortfahren?`)) return;
  }
  if (!document.getElementById('pruefer-name').value.trim()) {
    const isGFB = (currentBereich.liste === 'gfb_szp' || currentBereich.liste === 'gfb_glasreinigung');
    alert(isGFB ? 'Bitte Name des Aufsichtsführenden eingeben.' : 'Bitte Name des Prüfers eingeben.');
    return;
  }

  showLoading(true);
  try {
    const pdfBlob = await generatePDF();
    await uploadToDrive(pdfBlob);

    // ── Firebase: Prüfung speichern ──────────────────────────
    const bemerkungText = document.getElementById('bemerkung').value.trim();
    const prueferName   = document.getElementById('pruefer-name').value.trim();
    if (typeof window.fbSavePruefung === 'function') {
      await window.fbSavePruefung({
        bereichId:   currentBereich.id,
        standortId:  currentStandort.id,
        standortName:currentStandort.name,
        bereichName: currentBereich.name,
        listentyp:   currentBereich.liste,
        pruefer:     prueferName,
        datum:       new Date(),
        hatMaengel:  bemerkungText.length > 0,
        maengelText: bemerkungText
      });
    }
    // ─────────────────────────────────────────────────────────

    showResult(true);
  } catch (err) {
    console.error(err);
    showResult(false, err.message);
  } finally {
    showLoading(false);
  }
}

// ===== PDF GENERIEREN =====
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const now = new Date();
  const pruefer = document.getElementById('pruefer-name').value.trim();
  const bemerkung = document.getElementById('bemerkung').value.trim();
  const formularStandort = document.getElementById('formular-standort').value.trim();
  const aufzugNr = document.getElementById('aufzug-nr').value.trim();
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
  if (formularStandort) {
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

  // Abschnitte & Prüfpunkte
  currentListe.abschnitte.forEach(abschnitt => {
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
  } // end isGFBpdf

  // ===== GFB: Unterweisungsliste (Seite 11–12 im Original) =====
  if (isGFBpdf) {
    // Seite 11: Einsatz- und Objektdaten + Unterweisungsthemen
    doc.addPage(); y = PT;
    doc.setFillColor(26, 58, 92); doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('GEFÄHRDUNGSBEURTEILUNG', PL, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA', PL, 17);
    doc.setFontSize(8); doc.text('Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DIN EN 363', PL, 21);
    doc.setTextColor(0); y = 28;

    // Abschnitt 1: Einsatz- und Objektdaten
    doc.setFillColor(238, 242, 247); doc.rect(PL, y-3, PW, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 58, 92);
    doc.text('1  EINSATZ- UND OBJEKTDATEN', PL+2, y+3); y += 12; doc.setTextColor(0);

    const uwFelder = [
      ['Unternehmen:', 'CSC GmbH', 'Datum der Unterweisung:', formatDatum(now).split(' ')[0]],
      ['Objekt / Einsatzort:', gfbObjekt || '', 'Unterweisender (Aufsichtsführender):', pruefer],
      ['Art der Unterweisung:', 'Gefährdungsbeurteilung SZP', 'Bezug zu Gefährdungsbeurteilung:', 'GFB SZP'],
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
    const uwBest = doc.splitTextToSize('Ich wurde gemäß der Gefährdungsbeurteilung/Objektsicherheitsbeurteilung, dem Notfall- und Rettungsplan sowie der Betriebsanweisung SZP unterwiesen.', PW-4);
    doc.text(uwBest, PL+2, y); y += uwBest.length*5+2;
    doc.setFont('helvetica', 'normal');
    doc.text('Diese habe ich gelesen und verstanden. Alle Fragen wurden beantwortet.', PL+2, y); y += 8;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Besprochene Themen:', PL+2, y); y += 7;

    const uwThemen = [
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
    doc.text('Seilunterstützte Zugangs- und Positionierungstechniken (SZP) / PSAgA', PL, 17);
    doc.setFontSize(8); doc.text('Erstellt gemäß ArbSchG § 5 / DGUV Vorschrift 1 § 3 / DIN EN 363', PL, 21);
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
    doc.setFont('helvetica', 'normal'); doc.text('Funktion / SZP-Level: ', PL+2, y);
    doc.setFont('helvetica', 'bold'); doc.text('3', PL+44, y);
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
    const bestText = doc.splitTextToSize('Hiermit bestätige ich, dass alle oben genannten Mitarbeiter über die aufgeführten Sicherheitsthemen unterwiesen wurden. Die Unterweisung erfolgte gemäß ArbSchG § 12, DGUV Vorschrift 1 § 4 sowie der betrieblichen Gefährdungsbeurteilung SZP.', PW/2);
    doc.text(bestText, PL+80, y - bestText.length*4 - 6); y += 4;
    doc.setTextColor(80,80,80);
    doc.text('Aufbewahrung: Mindestens 1 Jahr nach der Unterweisung.', PL, y);
    doc.setTextColor(0); y += 10;
  }

  // Unterschrift Prüfer / Aufsichtsführender — immer im PDF
  if (!isGFBpdf) {
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
  if (!token) throw new Error('Kein Google Drive Token. Bitte in App-Einstellungen einrichten.');

  const now = new Date();
  const filename = `${formatDatumISO(now)}_${currentBereich.id}_KW${getKW(now)}.pdf`;

  // Unterordner je Prüfungstyp wählen, Fallback auf Hauptordner
  const unterordner = APP_CONFIG.googleDriveUnterordner || {};
  const folderId = unterordner[currentBereich.liste] || APP_CONFIG.googleDriveFolderId;

  const metadata = {
    name: filename,
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', pdfBlob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Upload fehlgeschlagen');
  }
  const result = await res.json();
  console.log('Drive upload OK:', result.id);

  // Auch lokal als Download anbieten
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();

  return result;
}

async function getDriveToken() {
  // Automatischer Token von GitHub Pages (alle 45 Min erneuert, Base64-kodiert)
  try {
    const res = await fetch('https://thomasschmoldt1967-cpu.github.io/csc-pruefapp/token.json?t=' + Date.now());
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
    const bereichId = url.searchParams.get('bereich');
    if (bereichId) { openBereichById(bereichId); return; }
  } catch {}
  openBereichById(text);
}

// ===== RESULT =====
function showResult(success, errMsg) {
  const icon = document.getElementById('result-icon');
  const text = document.getElementById('result-text');
  const sub  = document.getElementById('result-sub');
  if (success) {
    icon.textContent = '✅';
    text.textContent = 'Prüfung gespeichert!';
    sub.textContent  = `PDF in Google Drive abgelegt · ${formatDatum(new Date())}`;
  } else {
    icon.textContent = '⚠️';
    text.textContent = 'Fehler beim Hochladen';
    sub.textContent  = errMsg || 'PDF wurde lokal heruntergeladen.';
  }
  showScreen('result');
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
