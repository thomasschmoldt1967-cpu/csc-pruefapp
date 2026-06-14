/* ============================================================
   CSC Prüf-App — Hauptlogik
   ============================================================ */

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
  renderHome();

  // Service Worker registrieren
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // URL-Parameter: ?bereich=xxx (von QR-Code)
  const params = new URLSearchParams(window.location.search);
  const bereichId = params.get('bereich');
  if (bereichId) openBereichById(bereichId);
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
      item.onclick = () => openGruppe(standort.id, g.id);
      item.innerHTML = `
        <div class="bereich-icon icon-gruppe">${g.icon || '📁'}</div>
        <div class="bereich-info">
          <div class="bereich-name">${g.name}</div>
          <div class="bereich-liste-name">${g.bereiche.length} Bereiche</div>
        </div>
        <div class="bereich-arrow">›</div>
      `;
      preview.appendChild(item);
    });
    card.appendChild(preview);
    container.appendChild(card);
  });
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
        <div class="bereich-liste-name">${listeTitel(b.liste)}</div>
      </div>
      <div class="bereich-arrow">›</div>
    `;
    container.appendChild(item);
  });
  showScreen('bereiche');
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
    alert('Bitte Name des Prüfers eingeben.');
    return;
  }

  showLoading(true);
  try {
    const pdfBlob = await generatePDF();
    await uploadToDrive(pdfBlob);
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

      // Felder-Box unten (Objekt, Ansprechpartner etc.)
      y += 4;
      if (y > 240) { doc.addPage(); y = PT + 8; }
      doc.setDrawColor(180, 180, 180);
      doc.rect(PL, y, PW, 28, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(26, 58, 92);
      doc.text('Objekt / Einsatzort:', PL + 2, y + 5);
      doc.text('Ansprechpartner vor Ort:', PL + 2, y + 12);
      doc.text('Betrieb. Notfallnummer:', PL + 2, y + 19);
      doc.text('Nächstes Krankenhaus:', col2x, y + 5);
      doc.text('Ersthelfer vor Ort:', col2x, y + 12);
      doc.text('Sammelplatz Evakuierung:', col2x, y + 19);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
      if (gfbObjekt) doc.text(gfbObjekt, PL + 40, y + 5);
      if (gfbAnsprechpartner) doc.text(gfbAnsprechpartner, PL + 48, y + 12);
      doc.text('Alle MA aus SZP', col2x + 32, y + 12);
      doc.text('Laut Plan im Objekt', col2x + 48, y + 19);
      y += 32;

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

      // Freigabe / Unterschrift Betriebsanweisung SZP
      if (y > 240) { doc.addPage(); y = PT + 8; }
      y = gfbAbschnitt(doc, '7', 'FREIGABE / UNTERSCHRIFTEN', y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`Datum: ${formatDatum(now).split(' ')[0]}`, PL + 2, y); y += 5;
      doc.text('Nächster Überprüfungstermin: (1 Jahr)', PL + 2, y); y += 8;
      doc.setDrawColor(100); doc.line(PL, y + 12, PL + 70, y + 12);
      doc.setFontSize(8);
      doc.text('Unterschrift Unternehmer / Geschäftsleitung', PL, y + 15); y += 20;
      doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      doc.text('Diese Betriebsanweisung ist gemäß ArbSchG § 9 und BetrSichV auszuhängen.', PL, y);
      y += 5;
      doc.text('Sie ist vor jedem Einsatz zu lesen und einzuhalten. Bei Rückfragen Vorgesetzten ansprechen.', PL, y);
      y += 10; doc.setTextColor(0);

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
        'PSAgA NICHT benutzen wenn: Funktionsweise beeinträchtigt / nach Sturz beansprucht / Beschädigungen sichtbar',
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

      if (y > 240) { doc.addPage(); y = PT + 8; }
      y = gfbAbschnitt(doc, '7', 'FREIGABE / UNTERSCHRIFTEN', y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`Datum: ${formatDatum(now).split(' ')[0]}`, PL + 2, y); y += 5;
      doc.text('Nächster Überprüfungstermin: (1 Jahr)', PL + 2, y); y += 8;
      doc.setDrawColor(100); doc.line(PL, y + 12, PL + 70, y + 12);
      doc.setFontSize(8);
      doc.text('Unterschrift Unternehmer / Geschäftsleitung', PL, y + 15); y += 20;
      doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      doc.text('Diese Betriebsanweisung ist gemäß ArbSchG § 9 und BetrSichV auszuhängen.', PL, y); y += 5;
      doc.text('Sie ist vor jedem Einsatz zu lesen und einzuhalten. Bei Rückfragen Vorgesetzten ansprechen.', PL, y);
      y += 10; doc.setTextColor(0);

    } // end gfb_szp
  } // end isGFBpdf

  // Unterschrift Aufsichtsführender / Prüfer
  const sigLabel = isGFBpdf ? 'UNTERSCHRIFT AUFSICHTSFÜHRENDER' : 'UNTERSCHRIFT PRÜFER';
  if (y > 240) { doc.addPage(); y = PT; }
  doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y); y += 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
  doc.text(sigLabel, PL, y); y += 4;
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

  // ===== GFB: Mitarbeiter-Unterschriften =====
  if (isGFBpdf) {
    const aktiveMa = gfbMitarbeiter.filter(m => m !== null);
    if (aktiveMa.length > 0) {
      if (y > 230) { doc.addPage(); y = PT; }
      doc.setDrawColor(220, 220, 220); doc.line(PL, y, PL + PW, y); y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 92);
      doc.text('UNTERSCHRIFTEN MITARBEITER', PL, y); y += 8;

      aktiveMa.forEach((ma, i) => {
        if (y > 250) { doc.addPage(); y = PT; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
        doc.text(`${i + 1}.  ${ma.name || '___________________________'}`, PL, y);

        // Signatur des Mitarbeiters
        if (ma.sigCanvas) {
          const empty = document.createElement('canvas');
          empty.width = ma.sigCanvas.width; empty.height = ma.sigCanvas.height;
          if (ma.sigCanvas.toDataURL() !== empty.toDataURL()) {
            doc.addImage(ma.sigCanvas.toDataURL('image/png'), 'PNG', PL + 90, y - 6, 60, 16);
          } else {
            doc.setDrawColor(150); doc.line(PL + 90, y + 8, PL + 150, y + 8);
          }
        }
        y += 20;
      });
    }
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
