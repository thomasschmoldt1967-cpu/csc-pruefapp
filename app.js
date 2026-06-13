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
  const map = { aufzug: 'icon-aufzug', brandschutztuer: 'icon-brandschutz', notbeleuchtung: 'icon-notbel', leiterkontrolle: 'icon-leiter' };
  return map[liste] || 'icon-default';
}
function listeIcon(liste) {
  const map = { aufzug: '🛗', brandschutztuer: '🚪', notbeleuchtung: '💡', leiterkontrolle: '🪜' };
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

  // Felder leeren / Standardwerte setzen
  document.getElementById('formular-standort').value = 'Raschplatz 5';
  document.getElementById('aufzug-nr').value = '';
  document.getElementById('leiter-typ').value = '';
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
