'use strict';

/**
 * Invoice PDF Generator — clean professional design
 *
 * Layout:
 *  1. Header bar   — company name left, INVOICE + number right
 *  2. Meta strip   — status pill, invoice date, due date
 *  3. Billing row  — Bill To (agent) left | Shipment details right
 *  4. Line items table
 *  5. Totals block (right) + Payment info (left)
 *  6. Footer
 *
 * Design principles:
 *  - One accent colour (#0D4A6B) — used only for header bar, table header, total row, left stripe
 *  - No heavy coloured cells in the body — clean white / very pale blue alternating
 *  - All data rendered at readable font sizes (8–9.5pt body, 7–7.5pt labels)
 *  - ASCII-safe characters only (no Unicode arrows, multiplication signs, etc.)
 */

const PDFDocument = require('pdfkit');

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  accent:  '#0D4A6B',   // deep navy-teal
  altRow:  '#EBF4FA',   // very pale blue — alternate row tint
  black:   '#111111',
  dark:    '#2C2C2C',
  mid:     '#555555',
  muted:   '#888888',
  border:  '#D0D9E0',
  bg:      '#F7FAFC',
  white:   '#FFFFFF',
};

// ─── Page geometry ────────────────────────────────────────────────────────────
const PW  = 595.28;   // A4 width  (pts)
const PH  = 841.89;   // A4 height (pts)
const ML  = 45;       // margin left
const MR  = 45;       // margin right
const CW  = PW - ML - MR;   // usable content width

// ─── Low-level helpers ────────────────────────────────────────────────────────
const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const fillBox = (doc, x, y, w, h, color) =>
  doc.save().rect(x, y, w, h).fill(rgb(color)).restore();

const hLine = (doc, x1, y, x2, color = C.border, lw = 0.5) =>
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(rgb(color)).stroke().restore();

/**
 * Draw text with sane defaults.
 * `wrap: true` enables multi-line; default is single-line with ellipsis.
 */
const t = (doc, text, x, y, opts = {}) => {
  const {
    font  = 'Helvetica',
    size  = 8.5,
    color = C.dark,
    align = 'left',
    width = null,
    wrap  = false,
  } = opts;
  doc.save()
    .font(font).fontSize(size).fillColor(rgb(color))
    .text(String(text ?? ''), x, y, {
      width,
      align,
      lineBreak: wrap,
      ellipsis:  !wrap,
    })
    .restore();
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '--';

const fmtNum = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtMoney = (n, cur = 'USD') => `${cur} ${fmtNum(n)}`;

const statusColor = (s) => ({
  Draft:            C.muted,
  Issued:           C.accent,
  'Partially Paid': '#8A6D1A',
  Paid:             '#1A7A4A',
  Overdue:          '#8B1A1A',
  Cancelled:        C.muted,
}[s] || C.mid);

// ─── Main generator ───────────────────────────────────────────────────────────
const generateInvoicePdf = (invoice) => {
  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: 'Flow Dubai' },
  });

  const bufs = [];
  doc.on('data', (c) => bufs.push(c));

  // ── Unpack invoice data (Sprint 033) ──────────────────────────────────────
  // Line items are historical SNAPSHOTS taken at invoice-creation time — the
  // PDF never reads a live Booking/Voyage/Round document, so a re-downloaded
  // PDF for an old invoice always matches what was originally generated.
  const agent   = invoice.agentId || {};
  const contact = Array.isArray(agent.contacts) && agent.contacts[0]
    ? agent.contacts[0] : {};
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const first = lineItems[0] || {};

  const invNum      = invoice.invoiceNumber || '--';
  const invType     = invoice.invoiceType || 'Booking';
  const invDate     = fmtDate(invoice.invoiceDate);
  const dueDate     = fmtDate(invoice.dueDate);
  const currency    = (invoice.currency || 'USD').toUpperCase();
  const totalAmount = Number(invoice.totalAmount || 0);
  const paidAmount  = Number(invoice.paidAmount || 0);
  const balance     = Math.max(0, totalAmount - paidAmount);
  const status      = invoice.status || 'Draft';

  const agentName  = agent.agentName  || '--';
  const agentCode  = agent.agentCode  || '';
  const agentMob   = contact.mobile   || '--';
  const agentEmail = contact.email    || '--';

  // Shipment summary strip: for a single-booking invoice this is that
  // booking's own POL/POD/voyage/round; for a Voyage/Round invoice it
  // summarizes the scope (one voyage/round, N bookings).
  const polName  = first.polName  || '--';
  const podName  = first.podName  || '--';
  const voyNumRaw   = invType === 'Voyage' ? first.voyageNumber : (lineItems.length === 1 ? first.voyageNumber : null);
  const roundNumRaw = invType === 'Round'  ? first.roundNumber  : (lineItems.length === 1 ? first.roundNumber  : null);
  const voyNum   = voyNumRaw   ? `${voyNumRaw} — ${first.voyageName || '(unnamed)'}`   : '--';
  const roundNum = roundNumRaw ? `${roundNumRaw} — ${first.roundName || '(unnamed)'}` : '--';
  const bkNum    = lineItems.length === 1 ? first.bookingNumber : `${lineItems.length} bookings`;

  // ════════════════════════════════════════════════════════════════════════════
  // 1. HEADER BAR
  // ════════════════════════════════════════════════════════════════════════════
  fillBox(doc, 0, 0, PW, 72, C.accent);

  // Company name + tagline
  t(doc, 'FLOW DUBAI',                   ML, 18, { font: 'Helvetica-Bold', size: 20, color: C.white });
  t(doc, 'Shipping & Logistics Operations', ML, 42, { size: 8, color: '#AACCDD' });

  // "INVOICE" right
  t(doc, 'INVOICE', PW - MR - 160, 16, {
    font: 'Helvetica-Bold', size: 24, color: C.white, width: 160, align: 'right',
  });
  // Invoice number right, below
  t(doc, invNum, PW - MR - 160, 44, {
    size: 9, color: '#AACCDD', width: 160, align: 'right',
  });

  let y = 92;

  // ════════════════════════════════════════════════════════════════════════════
  // 2. META STRIP — status | invoice date | due date
  // ════════════════════════════════════════════════════════════════════════════
  const sc = statusColor(status);

  // Status pill
  doc.save()
    .roundedRect(ML, y, 64, 18, 4)
    .lineWidth(1)
    .fillAndStroke(rgb(C.altRow), rgb(sc))
    .restore();
  t(doc, status.toUpperCase(), ML, y + 5, {
    font: 'Helvetica-Bold', size: 7.5, color: sc, width: 64, align: 'center',
  });

  // Dates
  const DX = PW - MR - 220;
  t(doc, 'Invoice Date', DX,       y,      { size: 7,   color: C.muted });
  t(doc, invDate,        DX,       y + 10, { font: 'Helvetica-Bold', size: 8.5, color: C.dark });
  t(doc, 'Due Date',     DX + 112, y,      { size: 7,   color: C.muted });
  t(doc, dueDate,        DX + 112, y + 10, { font: 'Helvetica-Bold', size: 8.5, color: C.dark });

  y += 32;
  hLine(doc, ML, y, PW - MR);
  y += 16;

  // ════════════════════════════════════════════════════════════════════════════
  // 3. BILLING + SHIPMENT INFO
  // ════════════════════════════════════════════════════════════════════════════
  const LW = CW * 0.46;   // left column width
  const RX = ML + LW + 24; // right column x
  const RW = CW - LW - 24; // right column width

  // Section labels
  t(doc, 'BILL TO',          ML, y, { font: 'Helvetica-Bold', size: 7,   color: C.accent });
  t(doc, 'SHIPMENT DETAILS', RX, y, { font: 'Helvetica-Bold', size: 7,   color: C.accent });
  y += 14;

  // Bill To content
  const billStartY = y;
  t(doc, agentName, ML, y, { font: 'Helvetica-Bold', size: 9.5, color: C.black, width: LW });
  y += 13;
  if (agentCode) {
    t(doc, agentCode, ML, y, { size: 8, color: C.mid, width: LW });
    y += 12;
  }
  t(doc, agentMob,   ML, y, { size: 8, color: C.mid, width: LW });
  y += 12;
  t(doc, agentEmail, ML, y, { size: 8, color: C.mid, width: LW });

  // Shipment info (label + value pairs), drawn at same starting Y
  const sRow = (label, value, ry) => {
    t(doc, label,  RX,       ry, { size: 7.5, color: C.muted, width: 56 });
    t(doc, value,  RX + 60,  ry, { size: 8, color: C.dark, font: 'Helvetica-Bold', width: RW - 62 });
  };

  sRow('Type',    invType,                                billStartY);
  sRow('POL',     polName,                                billStartY + 14);
  sRow('POD',     podName,                                billStartY + 28);
  sRow('Voyage',  voyNum,                                  billStartY + 42);
  sRow('Round',   roundNum,                                billStartY + 56);

  y += 20;
  hLine(doc, ML, y, PW - MR);
  y += 18;

  // ════════════════════════════════════════════════════════════════════════════
  // 4. LINE ITEMS TABLE (Sprint 033 — one row per invoiced booking, rendered
  //    entirely from each line item's own historical snapshot, never a live
  //    Booking read — see INVOICE LINE ITEM SNAPSHOT)
  // ════════════════════════════════════════════════════════════════════════════
  const TC = [
    { label: '#',                  w: 22,  align: 'center' },
    { label: 'Booking / Container',w: 118, align: 'left'   },
    { label: 'Voyage / Round',     w: 100, align: 'left'   },
    { label: 'Shipper / Consignee',w: 118, align: 'left'   },
    { label: 'Amount',             w: 0,   align: 'right'  }, // fills remaining
  ];

  const fixedW = TC.slice(0,-1).reduce((s, c) => s + c.w, 0);
  TC[TC.length - 1].w = CW - fixedW;

  let cx = ML;
  TC.forEach((col) => { col.x = cx; cx += col.w; });

  const TH = 20;   // table header height
  const TR = 28;   // table row height
  const TP = 5;    // cell padding x

  fillBox(doc, ML, y, CW, TH, C.accent);
  TC.forEach((col) => {
    t(doc, col.label, col.x + TP, y + 6, {
      font: 'Helvetica-Bold', size: 7.5, color: C.white,
      width: col.w - TP * 2, align: col.align,
    });
  });
  y += TH;

  lineItems.forEach((li, idx) => {
    const bg = idx % 2 === 0 ? C.altRow : C.white;
    fillBox(doc, ML, y, CW, TR, bg);

    t(doc, String(idx + 1), TC[0].x + TP, y + 8, { size: 8, color: C.muted, width: TC[0].w - TP*2, align: 'center' });

    t(doc, li.bookingNumber || '--',   TC[1].x + TP, y + 5,  { font: 'Helvetica-Bold', size: 8, color: C.black, width: TC[1].w - TP*2 });
    t(doc, li.containerNumber || '--', TC[1].x + TP, y + 16, { size: 7.5, color: C.muted, width: TC[1].w - TP*2 });

    const liVoyage = li.voyageNumber ? `${li.voyageNumber} (${li.voyageName || '(unnamed)'})` : '--';
    const liRound  = li.roundNumber  ? `${li.roundNumber} (${li.roundName || '(unnamed)'})`  : '--';
    t(doc, liVoyage, TC[2].x + TP, y + 5,  { size: 8, color: C.dark, width: TC[2].w - TP*2 });
    t(doc, liRound,  TC[2].x + TP, y + 16, { size: 7.5, color: C.muted, width: TC[2].w - TP*2 });

    t(doc, li.shipper || '--',            TC[3].x + TP, y + 5,  { size: 8, color: C.dark,  width: TC[3].w - TP*2 });
    t(doc, `> ${li.consignee || '--'}`,   TC[3].x + TP, y + 16, { size: 7.5, color: C.muted, width: TC[3].w - TP*2 });

    t(doc, fmtNum(li.freightAmount), TC[4].x + TP, y + 9, { font: 'Helvetica-Bold', size: 8.5, color: C.black, width: TC[4].w - TP*2, align: 'right' });
    if (li.orphaned) {
      t(doc, 'Booking cancelled after invoicing', TC[4].x + TP, y + 19, { size: 6.5, color: '#8B1A1A', width: TC[4].w - TP*2, align: 'right' });
    }

    hLine(doc, ML, y + TR, PW - MR, C.border, 0.4);
    y += TR;
  });

  // Notes row
  if (invoice.notes) {
    const NH = 22;
    fillBox(doc, ML, y, CW, NH, C.white);
    t(doc, 'Note:', ML + TP,    y + 7, { size: 7.5, color: C.muted });
    t(doc, invoice.notes, ML + 40, y + 7, { size: 8, color: C.mid, width: CW - 46 });
    hLine(doc, ML, y + NH, PW - MR, C.border, 0.4);
    y += NH;
  }

  y += 16;

  // ════════════════════════════════════════════════════════════════════════════
  // 5. TOTALS (right) + PAYMENT INFO (left)
  // ════════════════════════════════════════════════════════════════════════════
  const TBW  = 210;           // totals block width
  const TBX  = PW - MR - TBW; // totals block x
  const TLBW = 100;            // label column inside totals
  const TVBW = TBW - TLBW - 8;// value column inside totals
  const ROTH = 22;             // row height for subtotals

  const totals = [
    { label: 'Subtotal',  value: fmtMoney(totalAmount, currency) },
    { label: 'Paid',      value: fmtMoney(paidAmount, currency) },
  ];

  const totalsStartY = y;

  totals.forEach((row, i) => {
    const ry = y + i * ROTH;
    fillBox(doc, TBX, ry, TBW, ROTH, i % 2 === 0 ? C.bg : C.white);
    t(doc, row.label, TBX + 10, ry + 7, { size: 8, color: C.muted });
    t(doc, row.value, TBX + TLBW, ry + 7, { size: 8.5, color: C.dark, width: TVBW, align: 'right' });
    hLine(doc, TBX, ry + ROTH, TBX + TBW, C.border);
  });

  y += totals.length * ROTH;

  // BALANCE DUE — accent background (Sprint 033: reflects exact remaining
  // balance after Payment.allocations, not the full invoice total once any
  // payment has been recorded)
  const TDUEH = 26;
  fillBox(doc, TBX, y, TBW, TDUEH, C.accent);
  t(doc, 'BALANCE DUE', TBX + 10, y + 8, { font: 'Helvetica-Bold', size: 8, color: C.white });
  t(doc, fmtMoney(balance, currency), TBX + TLBW, y + 8, {
    font: 'Helvetica-Bold', size: 9.5, color: C.white, width: TVBW, align: 'right',
  });

  // Payment info — left side, aligned to top of totals block
  const payW = TBX - ML - 20;
  let py = totalsStartY;

  t(doc, 'PAYMENT INFORMATION', ML, py, { font: 'Helvetica-Bold', size: 7, color: C.accent });
  py += 14;

  const pRow = (label, value) => {
    t(doc, label, ML,       py, { size: 7.5, color: C.muted, width: 80 });
    t(doc, value, ML + 84,  py, { size: 8,   color: C.dark,  width: payW - 84 });
    py += 13;
  };

  pRow('Bank Name',   'Emirates NBD');
  pRow('Account',     'AE12 3456 7890 1234 5678');
  pRow('SWIFT / BIC', 'EBILAEAD');
  pRow('Reference',   invNum);

  y += TDUEH;

  // ════════════════════════════════════════════════════════════════════════════
  // 6. FOOTER
  // ════════════════════════════════════════════════════════════════════════════
  const FY = PH - 50;
  hLine(doc, ML, FY, PW - MR, C.border);

  t(doc, 'Thank you for your business.', ML, FY + 10, { size: 8, color: C.mid });
  t(doc, `Generated: ${fmtDate(new Date())}`, PW - MR, FY + 10, {
    size: 7.5, color: C.muted, align: 'right', width: 130,
  });

  t(doc, 'Flow Dubai  |  Shipping & Logistics Operations  |  Dubai, UAE', ML, FY + 24, {
    size: 7, color: C.muted,
  });
  t(doc, `Invoice ${invNum}`, PW - MR, FY + 24, {
    size: 7, color: C.muted, align: 'right', width: 130,
  });

  // Thin left accent stripe — subtle branding touch
  fillBox(doc, 0, 0, 3, PH, C.accent);

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);
  });
};

module.exports = { generateInvoicePdf };
