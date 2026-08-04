'use strict';

/**
 * Invoice PDF Generator — clean professional design
 *
 * Layout:
 *  1. Header bar   — company name (Flow Marine) left, INVOICE + number right
 *  2. Meta strip   — status pill, invoice date, due date
 *  3. Billing row  — Bill To (agent + invoice.billTo contact details) left |
 *                     Shipment details (Type/POL/POD/Voyage/Round) right
 *  4. Invoice Overview — three stat boxes: Total Amount / Total Paid /
 *     Remaining, plus Notes if present. NO per-booking line items table.
 *  5. Payments Received — full-width table, one row per payment (Date /
 *     Method / Reference / Amount)
 *  6. Footer
 *
 * Sprint 047: Bill To is now invoice-level data (invoice.billTo — phone,
 * mobile, email, job code, tax id, address, office), always editable
 * regardless of the invoice's lock status; only non-empty fields render.
 * The old per-booking line items table and the old static bank-wire-
 * details block are both gone — replaced by the Overview stat boxes and
 * the real Payments Received table (invoice.payments, fetched by
 * invoice.service.js#getByIdForPdf).
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
    info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: 'Flow Marine' },
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

  // Sprint 047 — Bill To (invoice.billTo) contact details, entered directly
  // on the invoice. Mobile/Email fall back to the agent's own contact when
  // not set on the invoice, so older invoices (no billTo yet) still show
  // something; every other field is invoice-only, no fallback exists.
  const billTo = invoice.billTo || {};
  const btPhone   = billTo.phone   || null;
  const btMobile  = billTo.mobile  || contact.mobile || null;
  const btEmail   = billTo.email   || contact.email  || null;
  const btJobCode = billTo.jobCode || null;
  const btTaxId   = billTo.taxId   || null;
  const btAddress = billTo.address || null;
  const btOffice  = billTo.office  || null;

  // Shipment summary strip: for a single-booking invoice this is that
  // booking's own POL/POD; Voyage/Round always resolve from whatever the
  // line items actually agree on (every line item snapshot carries its own
  // voyageNumber/roundNumber regardless of invoiceType), not gated by
  // invoiceType — a Round invoice can still show its one shared Voyage if
  // every booking happens to share it, and vice versa.
  const polName  = first.polName  || '--';
  const podName  = first.podName  || '--';

  const uniqueBy = (key) => [...new Set(lineItems.map(li => li[key]).filter(Boolean))];
  const uniqueVoyageNums = uniqueBy('voyageNumber');
  const uniqueRoundNums  = uniqueBy('roundNumber');
  const voyNum = uniqueVoyageNums.length === 1
    ? `${uniqueVoyageNums[0]} — ${lineItems.find(li => li.voyageNumber === uniqueVoyageNums[0])?.voyageName || '(unnamed)'}`
    : uniqueVoyageNums.length > 1 ? `${uniqueVoyageNums.length} voyages` : '--';
  const roundNum = uniqueRoundNums.length === 1
    ? `${uniqueRoundNums[0]} — ${lineItems.find(li => li.roundNumber === uniqueRoundNums[0])?.roundName || '(unnamed)'}`
    : uniqueRoundNums.length > 1 ? `${uniqueRoundNums.length} rounds` : '--';

  // ════════════════════════════════════════════════════════════════════════════
  // 1. HEADER BAR
  // ════════════════════════════════════════════════════════════════════════════
  fillBox(doc, 0, 0, PW, 72, C.accent);

  // Company name + tagline
  t(doc, 'FLOW MARINE',                  ML, 18, { font: 'Helvetica-Bold', size: 20, color: C.white });
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

  // Bill To content — Sprint 047: agent name/code always shown; every Bill
  // To field (phone/mobile/email/job code/tax id/office/address) renders
  // only when actually set, so an invoice with no Bill To details filled in
  // yet doesn't show a wall of placeholders.
  const billStartY = y;
  const billLines = [
    { text: agentName,                     size: 9.5, font: 'Helvetica-Bold', color: C.black },
    ...(agentCode  ? [{ text: agentCode                 }] : []),
    ...(btPhone    ? [{ text: `Tel: ${btPhone}`         }] : []),
    ...(btMobile   ? [{ text: `Mob: ${btMobile}`        }] : []),
    ...(btEmail    ? [{ text: btEmail                   }] : []),
    ...(btJobCode  ? [{ text: `Job Code: ${btJobCode}`  }] : []),
    ...(btTaxId    ? [{ text: `Tax ID: ${btTaxId}`      }] : []),
    ...(btOffice   ? [{ text: `Office: ${btOffice}`     }] : []),
    ...(btAddress  ? [{ text: btAddress, wrap: true     }] : []),
  ];
  let by = billStartY;
  billLines.forEach((line) => {
    t(doc, line.text, ML, by, {
      size: line.size || 8, font: line.font || 'Helvetica', color: line.color || C.mid,
      width: LW, wrap: !!line.wrap,
    });
    by += line.wrap ? 22 : 12;
  });
  const billToHeight = by - billStartY;

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
  const shipmentHeight = 70;

  y += Math.max(billToHeight, shipmentHeight) + 6;
  hLine(doc, ML, y, PW - MR);
  y += 18;

  const TP = 5; // cell padding x, reused by both tables below

  // ════════════════════════════════════════════════════════════════════════════
  // 4. INVOICE OVERVIEW — Total Amount / Total Paid / Remaining
  //    Sprint 047: NO per-booking line items table at all — this is the
  //    entire financial summary of the invoice.
  // ════════════════════════════════════════════════════════════════════════════
  const OB_GAP = 8;
  const OB_W   = (CW - OB_GAP * 2) / 3;
  const OB_H   = 46;

  const overview = [
    { label: 'TOTAL AMOUNT', value: fmtMoney(totalAmount, currency), bg: C.bg,     fg: C.dark,    lc: C.muted },
    { label: 'TOTAL PAID',   value: fmtMoney(paidAmount, currency),  bg: C.bg,     fg: '#1A7A4A', lc: C.muted },
    { label: 'REMAINING',    value: fmtMoney(balance, currency),     bg: C.accent, fg: C.white,   lc: '#CFE3EE' },
  ];
  overview.forEach((box, i) => {
    const bx = ML + i * (OB_W + OB_GAP);
    fillBox(doc, bx, y, OB_W, OB_H, box.bg);
    t(doc, box.label, bx + 12, y + 10, { font: 'Helvetica-Bold', size: 7, color: box.lc });
    t(doc, box.value, bx + 12, y + 23, { font: 'Helvetica-Bold', size: 13, color: box.fg, width: OB_W - 24 });
  });
  y += OB_H + 20;

  // Notes
  if (invoice.notes) {
    t(doc, 'Note:', ML, y, { size: 7.5, color: C.muted });
    t(doc, invoice.notes, ML + 34, y, { size: 8, color: C.mid, width: CW - 34, wrap: true });
    y += 24;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. PAYMENTS RECEIVED — one row per payment (date, method, reference,
  //    amount). Replaces the old per-booking line items table entirely and
  //    the old static bank-wire-details block.
  // ════════════════════════════════════════════════════════════════════════════
  t(doc, 'PAYMENTS RECEIVED', ML, y, { font: 'Helvetica-Bold', size: 7, color: C.accent });
  y += 14;

  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  if (!payments.length) {
    t(doc, 'No payments recorded yet.', ML, y, { size: 8, color: C.muted });
    y += 20;
  } else {
    const PC = [
      { label: 'Date',      w: 85,  align: 'left'  },
      { label: 'Method',    w: 110, align: 'left'  },
      { label: 'Reference', w: 0,   align: 'left'  }, // fills remaining
      { label: 'Amount',    w: 110, align: 'right' },
    ];
    const fixedPW = PC[0].w + PC[1].w + PC[3].w;
    PC[2].w = CW - fixedPW;
    let px = ML;
    PC.forEach((col) => { col.x = px; px += col.w; });

    const PTH = 18; // table header height
    const PTR = 20; // table row height

    fillBox(doc, ML, y, CW, PTH, C.accent);
    PC.forEach((col) => {
      t(doc, col.label, col.x + TP, y + 5, {
        font: 'Helvetica-Bold', size: 7.5, color: C.white,
        width: col.w - TP * 2, align: col.align,
      });
    });
    y += PTH;

    payments.forEach((p, idx) => {
      const bg = idx % 2 === 0 ? C.altRow : C.white;
      fillBox(doc, ML, y, CW, PTR, bg);
      t(doc, fmtDate(p.paymentDate),       PC[0].x + TP, y + 6, { size: 8, color: C.dark, width: PC[0].w - TP*2 });
      t(doc, p.method || '--',             PC[1].x + TP, y + 6, { size: 8, color: C.dark, width: PC[1].w - TP*2 });
      t(doc, p.reference || '--',          PC[2].x + TP, y + 6, { size: 8, color: C.mid,  width: PC[2].w - TP*2 });
      t(doc, fmtMoney(p.amount, currency), PC[3].x + TP, y + 6, { font: 'Helvetica-Bold', size: 8, color: C.black, width: PC[3].w - TP*2, align: 'right' });
      hLine(doc, ML, y + PTR, PW - MR, C.border, 0.4);
      y += PTR;
    });
  }

  y += 16;

  // ════════════════════════════════════════════════════════════════════════════
  // 6. FOOTER
  // ════════════════════════════════════════════════════════════════════════════
  const FY = PH - 50;
  hLine(doc, ML, FY, PW - MR, C.border);

  t(doc, 'Thank you for your business.', ML, FY + 10, { size: 8, color: C.mid });
  t(doc, `Generated: ${fmtDate(new Date())}`, PW - MR, FY + 10, {
    size: 7.5, color: C.muted, align: 'right', width: 130,
  });

  t(doc, 'Flow Marine  |  Shipping & Logistics Operations', ML, FY + 24, {
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
