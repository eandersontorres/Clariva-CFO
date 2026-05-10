import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, fetchTransactions, upsertTransactions, fetchCategories, upsertCategory, deleteCategory, fetchBudgets, upsertBudget, fetchBills, upsertBill, deleteBill, fetchProjects, upsertProject, deleteProject, fetchKitchenPurchases, fetchKitchenSnapshots, fetchKitchenVendors, fetchKitchenStaff, purchasesToTransactions, snapshotsToTransactions } from "./lib/supabase.js";
import { UNCATEGORIZED } from "./lib/constants.js";

const TENANT_ID = import.meta.env.VITE_TENANT_ID || "demo";

// ─── STYLES ────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0a;
    --surface: #111111;
    --surface2: #181818;
    --surface3: #1f1f1f;
    --border: rgba(201,168,76,0.1);
    --border2: rgba(201,168,76,0.2);
    --text: #E8E0D4;
    --text2: #a09880;
    --text3: #5a5245;
    --accent: #C9A84C;
    --accent2: #a8893a;
    --accentBg: rgba(201,168,76,0.08);
    --accentBorder: rgba(201,168,76,0.25);
    --red: #c0614a;
    --redBg: rgba(192,97,74,0.08);
    --yellow: #d4a843;
    --yellowBg: rgba(212,168,67,0.08);
    --blue: #6a9abf;
    --blueBg: rgba(106,154,191,0.08);
    --purple: #9b8ea8;
    --purpleBg: rgba(155,142,168,0.08);
    --sidebar: 220px;
    --radius: 10px;
    --radius2: 6px;
  }

  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; letter-spacing: 0.01em; }
  #root { height: 100%; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }

  .layout { display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: var(--sidebar);
    background: #0d0d0d;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow-y: auto;
  }
  .sidebar-logo {
    padding: 18px 16px 16px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
  }
  .logo-icon {
    width: 34px; height: 34px; flex-shrink: 0;
    background: var(--accentBg);
    border: 1px solid var(--accentBorder);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
  }
  .logo-text { display: flex; flex-direction: column; }
  .logo-mark { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 15px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); line-height: 1; }
  .logo-sub { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase; margin-top: 4px; line-height: 1; }
  .sidebar-section { padding: 16px 10px 8px; }
  .sidebar-section-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); opacity: 0.6; padding: 0 8px 8px; font-family: 'DM Mono', monospace; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: var(--radius2);
    cursor: pointer; transition: all 0.15s;
    font-size: 13px; color: var(--text2); font-weight: 400;
    margin-bottom: 1px;
  }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active { background: var(--accentBg); color: var(--accent); border-left: 2px solid var(--accent); }
  .nav-item.active .nav-icon { color: var(--accent); }
  .nav-icon { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.7; }
  .nav-item.active .nav-icon { opacity: 1; }
  .nav-badge { margin-left: auto; background: var(--red); color: #fff; font-size: 10px; border-radius: 99px; padding: 1px 6px; font-family: 'DM Mono', monospace; }
  .sidebar-footer { margin-top: auto; padding: 14px 12px; border-top: 1px solid var(--border); }
  .entity-pill { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius2); padding: 8px 10px; font-size: 11px; color: var(--text2); }
  .entity-pill strong { display: block; color: var(--accent); font-size: 12px; font-family: 'Cormorant Garamond', serif; letter-spacing: 0.06em; }

  /* MAIN */
  .main { flex: 1; overflow-y: auto; background: var(--bg); }
  .page { padding: 28px 32px; max-width: 1300px; }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
  .page-title { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; color: var(--text); letter-spacing: 0.02em; }
  .page-subtitle { font-size: 12px; color: var(--text3); margin-top: 3px; font-family: 'DM Mono', monospace; }

  /* BUTTONS */
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius2); font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; font-family: 'DM Sans', sans-serif; }
  .btn-primary { background: var(--accent); color: #0a0a0a; font-family: 'DM Mono', monospace; letter-spacing: 0.06em; font-size: 12px; }
  .btn-primary:hover { background: var(--accent2); }
  .btn-outline { background: transparent; color: var(--text2); border: 1px solid var(--border2); }
  .btn-outline:hover { background: var(--surface2); color: var(--text); }
  .btn-ghost { background: transparent; color: var(--text3); border: none; padding: 6px 10px; }
  .btn-ghost:hover { color: var(--text); background: var(--surface2); }
  .btn-danger { background: var(--redBg); color: var(--red); border: 1px solid rgba(240,94,94,0.2); }
  .btn-sm { padding: 5px 11px; font-size: 12px; }

  /* CARDS */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .card-sm { padding: 14px 16px; }

  /* KPI GRID */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
  .kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
  .kpi-label { font-size: 11px; color: var(--text3); font-family: 'DM Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
  .kpi-value { font-family: 'DM Mono', monospace; font-size: 24px; font-weight: 400; color: var(--text); margin: 6px 0 4px; letter-spacing: -0.01em; }
  .kpi-delta { font-size: 11px; font-family: 'DM Mono', monospace; }
  .kpi-delta.pos { color: var(--accent); }
  .kpi-delta.neg { color: var(--red); }
  .kpi-accent { border-top: 2px solid var(--accent); border-left: 2px solid var(--accent); }
  .kpi-red { border-top: 2px solid var(--red); }
  .kpi-blue { border-top: 2px solid var(--blue); }
  .kpi-yellow { border-top: 2px solid var(--yellow); }

  /* TABLES */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text3); font-family: 'DM Mono', monospace; font-weight: 400; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 11px 12px; font-size: 13px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface2); }
  .mono { font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: -0.01em; }
  .amount-pos { color: var(--accent); font-family: 'DM Mono', monospace; font-size: 13px; }
  .amount-neg { color: var(--red); font-family: 'DM Mono', monospace; font-size: 13px; }
  .amount-neutral { color: var(--text); font-family: 'DM Mono', monospace; font-size: 13px; }

  /* TAGS / BADGES */
  .tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 99px; font-size: 10px; font-family: 'DM Mono', monospace; font-weight: 400; border: 1px solid transparent; white-space: nowrap; }
  .tag-green { background: var(--accentBg); color: var(--accent); border-color: var(--accentBorder); }
  .tag-red { background: var(--redBg); color: var(--red); border-color: rgba(240,94,94,0.2); }
  .tag-yellow { background: var(--yellowBg); color: var(--yellow); border-color: rgba(240,200,74,0.2); }
  .tag-blue { background: var(--blueBg); color: var(--blue); border-color: rgba(74,159,240,0.2); }
  .tag-purple { background: var(--purpleBg); color: var(--purple); border-color: rgba(164,127,240,0.2); }
  .tag-gray { background: var(--surface2); color: var(--text2); border-color: var(--border2); }

  /* FORMS */
  .input { background: var(--surface2); border: 1px solid var(--border2); border-radius: var(--radius2); padding: 8px 12px; color: var(--text); font-size: 13px; font-family: 'DM Sans', sans-serif; outline: none; transition: border 0.15s; width: 100%; }
  .input:focus { border-color: var(--accent); }
  .input::placeholder { color: var(--text3); }
  select.input { cursor: pointer; }
  .label { font-size: 11px; color: var(--text2); margin-bottom: 5px; display: block; font-family: 'DM Mono', monospace; letter-spacing: 0.05em; }
  .form-group { margin-bottom: 14px; }
  .form-row { display: grid; gap: 12px; }
  .form-row-2 { grid-template-columns: 1fr 1fr; }
  .form-row-3 { grid-template-columns: 1fr 1fr 1fr; }

  /* MODAL */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px); }
  .modal { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--border); }
  .modal-title { font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 600; letter-spacing: 0.04em; }
  .modal-body { padding: 20px; }
  .modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; }

  /* UPLOAD ZONE */
  .upload-zone { border: 2px dashed var(--border2); border-radius: var(--radius); padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--accent); background: var(--accentBg); }
  .upload-icon { font-size: 32px; margin-bottom: 12px; }
  .upload-title { font-family: 'Cormorant Garamond', serif; font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .upload-sub { font-size: 12px; color: var(--text3); font-family: 'DM Mono', monospace; }

  /* PROGRESS BAR */
  .progress-bar { height: 4px; background: var(--surface3); border-radius: 99px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s; }

  /* CHART BARS */
  .bar-chart { display: flex; align-items: flex-end; gap: 6px; height: 120px; padding: 0 4px; }
  .bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .bar { width: 100%; border-radius: 4px 4px 0 0; min-height: 4px; transition: height 0.3s; position: relative; cursor: pointer; }
  .bar:hover { filter: brightness(1.2); }
  .bar-label { font-size: 9px; color: var(--text3); font-family: 'DM Mono', monospace; white-space: nowrap; }
  .bar-income { background: var(--accent); }
  .bar-expense { background: var(--red); }
  .bar-net { background: var(--blue); }

  /* DIVIDER */
  .divider { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

  /* TABS */
  .tabs { display: flex; gap: 2px; background: var(--surface2); border-radius: var(--radius2); padding: 3px; margin-bottom: 20px; width: fit-content; }
  .tab { padding: 7px 16px; border-radius: 5px; font-size: 13px; cursor: pointer; color: var(--text2); transition: all 0.15s; font-weight: 400; }
  .tab.active { background: var(--surface3); color: var(--text); font-weight: 500; }

  /* FLEX UTILS */
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-8 { gap: 8px; }
  .gap-12 { gap: 12px; }
  .gap-16 { gap: 16px; }
  .gap-20 { gap: 20px; }
  .mt-4 { margin-top: 4px; }
  .mt-8 { margin-top: 8px; }
  .mt-12 { margin-top: 12px; }
  .mt-16 { margin-top: 16px; }
  .mt-20 { margin-top: 20px; }
  .mb-16 { margin-bottom: 16px; }
  .text-right { text-align: right; }

  /* GRID */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }

  /* RECONCILE */
  .recon-row { display: grid; grid-template-columns: 1fr 20px 1fr; gap: 12px; align-items: center; margin-bottom: 10px; }
  .recon-arrow { color: var(--accent); text-align: center; font-size: 14px; }
  .recon-card { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius2); padding: 10px 12px; font-size: 12px; }
  .recon-card .desc { color: var(--text); margin-bottom: 3px; }
  .recon-card .meta { color: var(--text3); font-family: 'DM Mono', monospace; font-size: 11px; }

  /* EMPTY STATE */
  .empty { text-align: center; padding: 60px 20px; color: var(--text3); }
  .empty-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }
  .empty-title { font-family: 'Syne', sans-serif; font-size: 15px; color: var(--text2); margin-bottom: 6px; }
  .empty-sub { font-size: 12px; font-family: 'DM Mono', monospace; }

  /* COLOR DOTS */
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  /* SELECT CAT */
  .cat-select { background: var(--surface3); border: 1px solid var(--border); border-radius: var(--radius2); padding: 4px 8px; color: var(--text2); font-size: 11px; font-family: 'DM Mono', monospace; cursor: pointer; outline: none; }
  .cat-select:focus { border-color: var(--accent); }
  .cat-select.auto-cat { border-color: var(--accentBorder); background: var(--accentBg); color: var(--text); }
  .auto-cat-badge { font-size: 11px; cursor: help; opacity: 0.85; line-height: 1; }

  /* P&L REPORT */
  .pl-section { margin-bottom: 8px; }
  .pl-header { background: var(--surface2); padding: 10px 14px; border-radius: var(--radius2); font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .pl-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px 8px 24px; border-bottom: 1px solid var(--border); }
  .pl-row:hover { background: var(--surface2); }
  .pl-row-name { font-size: 13px; color: var(--text2); }
  .pl-total { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--surface3); border-radius: var(--radius2); margin: 4px 0; }
  .pl-total-label { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; }
  .pl-net { background: var(--accentBg); border: 1px solid var(--accentBorder); padding: 14px 18px; border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  .pl-net-label { font-family: 'Cormorant Garamond', serif; font-size: 18px; font-weight: 600; color: var(--text); letter-spacing: 0.04em; }

  /* BUDGET */
  .budget-row { display: grid; grid-template-columns: 1fr 130px 130px 130px 100px; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .budget-header { font-size: 10px; color: var(--text3); font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; padding: 0 0 8px; }
  .budget-progress { }

  /* CATEGORY COLOR SWATCH */
  .swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }

  /* TOAST */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); padding: 12px 18px; font-size: 13px; z-index: 9999; display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

// ─── SAMPLE DATA ─────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "1", name: "Food & Beverage", type: "expense", color: "#f05e5e", taxLine: "COGS" },
  { id: "2", name: "Payroll", type: "expense", color: "#f0c84a", taxLine: "Wages" },
  { id: "3", name: "Rent & Utilities", type: "expense", color: "#4a9ff0", taxLine: "Rent" },
  { id: "4", name: "Marketing", type: "expense", color: "#a47ff0", taxLine: "Advertising" },
  { id: "5", name: "Equipment", type: "expense", color: "#f0904a", taxLine: "Depreciation" },
  { id: "6", name: "Insurance", type: "expense", color: "#4af0d0", taxLine: "Insurance" },
  { id: "7", name: "Office & Supplies", type: "expense", color: "#90a0b0", taxLine: "Office" },
  { id: "8", name: "Revenue - Dining", type: "income", color: "#00d4a0", taxLine: "Gross Receipts" },
  { id: "9", name: "Revenue - Delivery", type: "income", color: "#00b890", taxLine: "Gross Receipts" },
  { id: UNCATEGORIZED, name: "Uncategorized", type: "expense", color: "#555b6b", taxLine: "" },
];

const SAMPLE_TRANSACTIONS = [
  { id: "t1", date: "2025-01-03", description: "SYSCO FOODS", amount: -2340.50, category: "1", account: "Checking ••4821", reconciled: true },
  { id: "t2", date: "2025-01-05", description: "SQUARE INC PAYMENT", amount: 8450.00, category: "8", account: "Checking ••4821", reconciled: true },
  { id: "t3", date: "2025-01-07", description: "ATMOS ENERGY GAS", amount: -287.40, category: "3", account: "Checking ••4821", reconciled: false },
  { id: "t4", date: "2025-01-08", description: "META ADS", amount: -450.00, category: "4", account: "Credit ••7742", reconciled: false },
  { id: "t5", date: "2025-01-10", description: "US FOODS INC", amount: -1890.00, category: "1", account: "Checking ••4821", reconciled: true },
  { id: "t6", date: "2025-01-12", description: "SQUARE INC PAYMENT", amount: 9100.00, category: "8", account: "Checking ••4821", reconciled: true },
  { id: "t7", date: "2025-01-14", description: "DOORDASH TRANSFER", amount: 1240.00, category: "9", account: "Checking ••4821", reconciled: false },
  { id: "t8", date: "2025-01-15", description: "RENT - ROUND ROCK PROP", amount: -3500.00, category: "3", account: "Checking ••4821", reconciled: true },
  { id: "t9", date: "2025-01-17", description: "GUSTO PAYROLL", amount: -5200.00, category: "2", account: "Checking ••4821", reconciled: true },
  { id: "t10", date: "2025-01-19", description: "AMAZON BUSINESS", amount: -234.80, category: "7", account: "Credit ••7742", reconciled: false },
  { id: "t11", date: "2025-01-20", description: "SYSCO FOODS", amount: -1980.00, category: "1", account: "Checking ••4821", reconciled: false },
  { id: "t12", date: "2025-01-22", description: "SQUARE INC PAYMENT", amount: 7800.00, category: "8", account: "Checking ••4821", reconciled: false },
  { id: "t13", date: "2025-01-25", description: "GOOGLE ADS", amount: -320.00, category: "4", account: "Credit ••7742", reconciled: false },
  { id: "t14", date: "2025-01-28", description: "LIBERTY MUTUAL INS", amount: -890.00, category: "6", account: "Checking ••4821", reconciled: false },
  { id: "t15", date: "2025-01-29", description: "DOORDASH TRANSFER", amount: 980.00, category: "9", account: "Checking ••4821", reconciled: false },
];

const SAMPLE_BUDGETS = [
  { id: "b1", categoryId: "1", monthly: 8000, annual: 96000 },
  { id: "b2", categoryId: "2", monthly: 16000, annual: 192000 },
  { id: "b3", categoryId: "3", monthly: 4000, annual: 48000 },
  { id: "b4", categoryId: "4", monthly: 1000, annual: 12000 },
  { id: "b5", categoryId: "6", monthly: 900, annual: 10800 },
  { id: "b6", categoryId: "7", monthly: 500, annual: 6000 },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtShort = (s) => new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ─── BANK STATEMENT PARSERS (inlined) ───────────────────────────────────────

function parseCSVLine(line) {
  const cols = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

// ─── AUTO-CATEGORIZATION ──────────────────────────────────────────────────────
function normalizeDescription(s) {
  if (!s) return '';
  return s
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .slice(0, 3)
    .join(' ');
}

function getCategoryHistory(transactions) {
  const counts = new Map();
  for (const t of transactions) {
    if (!t.category || t.category === UNCATEGORIZED || !t.description) continue;
    const norm = normalizeDescription(t.description);
    if (!norm) continue;
    if (!counts.has(norm)) counts.set(norm, new Map());
    const inner = counts.get(norm);
    inner.set(t.category, (inner.get(t.category) || 0) + 1);
  }
  const out = new Map();
  for (const [norm, inner] of counts) {
    let best = null, bestN = 0;
    for (const [cat, n] of inner) {
      if (n > bestN) { best = cat; bestN = n; }
    }
    if (best) out.set(norm, best);
  }
  return out;
}

function suggestCategory(desc, history) {
  const norm = normalizeDescription(desc);
  return norm ? history.get(norm) : null;
}

function applyAutoCategorize(imported, allTransactions) {
  const history = getCategoryHistory(allTransactions);
  return imported.map(t => {
    if (t.category && t.category !== UNCATEGORIZED) return t;
    const suggested = suggestCategory(t.description, history);
    return suggested ? { ...t, category: suggested, autoCategorized: true } : t;
  });
}

function expandDateRangeIfNeeded(imported, dateRange, setDateRange) {
  if (!imported || imported.length === 0) return;
  const dates = imported.map(t => t.date).filter(Boolean).sort();
  if (dates.length === 0) return;
  const minD = dates[0];
  const maxD = dates[dates.length - 1];
  const newStart = minD < dateRange.start ? minD : dateRange.start;
  const newEnd = maxD > dateRange.end ? maxD : dateRange.end;
  if (newStart !== dateRange.start || newEnd !== dateRange.end) {
    setDateRange({ start: newStart, end: newEnd });
  }
}

function parseBoACSV(text) {
  const lines = text.split('\n').map(l => l.replace('\r', '')).filter(l => l.trim());
  const txns = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 3) continue;
    const first = cols[0].toLowerCase();
    if (first === 'date' || first === 'posted date' || first.startsWith('account')) continue;
    let date = cols[0], desc = cols[1] || '', amtStr = cols[2] || '';
    if (cols.length >= 5) { desc = cols[2] || cols[1]; amtStr = cols[4]; }
    const amount = parseFloat(amtStr.replace(/[$,\s]/g, ''));
    if (isNaN(amount)) continue;
    let parsedDate;
    try { const d = new Date(date); if (isNaN(d.getTime())) continue; parsedDate = d.toISOString().split('T')[0]; }
    catch { continue; }
    txns.push({ id: 'csv_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2,5), date: parsedDate, description: desc.toUpperCase().trim().slice(0, 80), amount, account: 'Imported · BoA', category_id: null, category: UNCATEGORIZED, reconciled: false, source: 'csv' });
  }
  return txns;
}

function parseOFX(text) {
  const txns = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const block of blocks) {
    const get = (tag) => { const m = block.match(new RegExp('<' + tag + '>([^<\n]+)', 'i')); return m ? m[1].trim() : ''; };
    const dtPosted = get('DTPOSTED');
    const name = get('NAME') || get('MEMO') || get('PAYEE') || 'UNKNOWN';
    const amtStr = get('TRNAMT');
    const fitid = get('FITID');
    if (!dtPosted || !amtStr) continue;
    const amount = parseFloat(amtStr);
    if (isNaN(amount)) continue;
    txns.push({ id: fitid ? 'ofx_' + fitid : 'ofx_' + Date.now() + '_' + Math.random().toString(36).slice(2,5), date: dtPosted.slice(0,4) + '-' + dtPosted.slice(4,6) + '-' + dtPosted.slice(6,8), description: name.toUpperCase().trim().slice(0, 80), amount, account: 'Imported · BoA', category_id: null, category: UNCATEGORIZED, reconciled: false, source: 'ofx' });
  }
  return txns;
}


// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; };
const firstOfYear  = () => { const d = new Date(); d.setMonth(0); d.setDate(1); return d.toISOString().split("T")[0]; };
const monthAgo     = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0]; };
const quarterStart = () => {
  const d = new Date(); const q = Math.floor(d.getMonth() / 3);
  d.setMonth(q * 3); d.setDate(1); return d.toISOString().split("T")[0];
};
const lastMonthStart = () => { const d = new Date(); d.setMonth(d.getMonth()-1); d.setDate(1); return d.toISOString().split("T")[0]; };
const lastMonthEnd   = () => { const d = new Date(); d.setDate(0); return d.toISOString().split("T")[0]; };

const DATE_PRESETS = [
  { label: "This Month",    start: firstOfMonth,  end: today },
  { label: "Last Month",    start: lastMonthStart, end: lastMonthEnd },
  { label: "This Quarter",  start: quarterStart,  end: today },
  { label: "This Year",     start: firstOfYear,   end: today },
  { label: "Last 90 Days",  start: () => { const d = new Date(); d.setDate(d.getDate()-90); return d.toISOString().split("T")[0]; }, end: today },
  { label: "All Time",      start: () => "2020-01-01", end: today },
];

// ─── DATE RANGE PICKER ────────────────────────────────────────────────────────
function DateRangePicker({ dateRange, setDateRange }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activePreset = DATE_PRESETS.find(p => p.start() === dateRange.start && p.end() === dateRange.end);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn btn-outline btn-sm"
        style={{ gap: 8, fontFamily: "DM Mono, monospace", fontSize: 12, minWidth: 220 }}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style={{ color: "var(--accent)" }}>{activePreset ? activePreset.label : "Custom"}</span>
        <span style={{ color: "var(--text3)" }}>·</span>
        <span>{dateRange.start} → {dateRange.end}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 500,
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: "var(--radius)", padding: 8, minWidth: 220,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
        }}>
          {DATE_PRESETS.map(p => (
            <div
              key={p.label}
              onClick={() => { setDateRange({ start: p.start(), end: p.end() }); setCustom(false); setOpen(false); }}
              style={{
                padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                background: activePreset?.label === p.label ? "var(--accentBg)" : "transparent",
                color: activePreset?.label === p.label ? "var(--accent)" : "var(--text2)",
                transition: "all 0.1s"
              }}
              onMouseEnter={e => { if (activePreset?.label !== p.label) e.currentTarget.style.background = "var(--surface2)"; }}
              onMouseLeave={e => { if (activePreset?.label !== p.label) e.currentTarget.style.background = "transparent"; }}
            >
              {p.label}
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0", padding: "8px 12px 4px" }}>
            <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Custom Range</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" className="input" style={{ fontSize: 12, padding: "5px 8px", flex: 1 }}
                value={dateRange.start} onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))} />
              <span style={{ color: "var(--text3)", fontSize: 11 }}>→</span>
              <input type="date" className="input" style={{ fontSize: 12, padding: "5px 8px", flex: 1 }}
                value={dateRange.end} onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: "100%", marginTop: 8, justifyContent: "center" }} onClick={() => setOpen(false)}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KITCHEN SYNC BUTTON ──────────────────────────────────────────────────────
function KitchenSyncButton({ tenantId, categories, dateRange, onSync, showToast }) {
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const sync = async () => {
    setLoading(true);
    showToast("Syncing from Clariva Kitchen...", "info");
    try {
      const [purchases, snapshots, vendors] = await Promise.all([
        fetchKitchenPurchases(tenantId, dateRange),
        fetchKitchenSnapshots(tenantId, dateRange),
        fetchKitchenVendors(tenantId),
      ]);

      // Build vendor map
      const vendorMap = {};
      vendors.forEach(v => { vendorMap[v.id] = v.name; });

      // Find category IDs
      const foodBevCat = categories.find(c => c.name === "Food & Beverage" || c.tax_line === "COGS");
      const diningCat  = categories.find(c => c.name === "Revenue - Dining" || c.tax_line === "Gross Receipts");

      const expTxns = purchasesToTransactions(purchases, vendorMap, foodBevCat?.id);
      const incTxns = snapshotsToTransactions(snapshots, diningCat?.id);

      const all = [...expTxns, ...incTxns].map(t => ({ ...t, category: t.category_id || UNCATEGORIZED }));

      if (all.length === 0) {
        showToast("No new data from Kitchen in this date range.", "info");
      } else {
        onSync(all);
        setLastSync(new Date().toLocaleTimeString());
        showToast(all.length + " records synced from Kitchen! (" + expTxns.length + " expenses · " + incTxns.length + " income)", "success");
      }
    } catch (err) {
      showToast("Sync failed: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="btn btn-outline btn-sm"
      onClick={sync}
      disabled={loading}
      style={{ gap: 8, borderColor: "var(--accentBorder)", color: loading ? "var(--text3)" : "var(--accent)" }}
      title="Pull invoices + Square revenue from Clariva Kitchen"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
      {loading ? "Syncing..." : "Sync Kitchen"}
      {lastSync && <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono" }}>{lastSync}</span>}
    </button>
  );
}

// ─── ICONS (inline SVG) ───────────────────────────────────────────────────────
const Icon = ({ name, size = 16, color = "currentColor" }) => {
  const icons = {
    dashboard: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    transactions: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    categories: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    pl: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    cashflow: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    budget: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
    reconcile: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    tax: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
    upload: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
    close: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    filter: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    info: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    insights: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    projects: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3zM3 9h18M9 21V9"/></svg>,
    bills: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
    bank: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>,
  };
  return icons[name] || null;
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ message, type = "info", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  const icons = { info: "ℹ️", success: "✅", error: "❌" };
  return (
    <div className="toast">
      <span>{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ transactions, categories, budgets, dateRange = {} }) {
  const totalIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const netIncome = totalIncome - totalExpense;
  const uncat = transactions.filter(t => t.category === UNCATEGORIZED).length;

  // Expense by category
  const expByCat = {};
  transactions.filter(t => t.amount < 0).forEach(t => {
    expByCat[t.category] = (expByCat[t.category] || 0) + Math.abs(t.amount);
  });
  const catItems = Object.entries(expByCat)
    .map(([cid, amt]) => ({ cat: categories.find(c => c.id === cid), amt }))
    .filter(x => x.cat)
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 6);

  // Monthly bars — group by week
  const weeks = ["Wk1", "Wk2", "Wk3", "Wk4"];
  const weeklyIncome = [8450, 9100, 7800, 980];
  const weeklyExpense = [2627.9, 7090, 2214.8, 1210];
  const maxBar = Math.max(...weeklyIncome, ...weeklyExpense);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-subtitle">{dateRange ? dateRange.start + " → " + dateRange.end : ""} · TorresBee</div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm"><Icon name="download" size={13} /> Export</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card kpi-accent">
          <div className="kpi-label">Total Income</div>
          <div className="kpi-value">{fmt(totalIncome)}</div>
          <div className="kpi-delta pos">▲ 8.3% vs Dec</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-label">Total Expenses</div>
          <div className="kpi-value">{fmt(totalExpense)}</div>
          <div className="kpi-delta neg">▲ 3.1% vs Dec</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label">Net Income</div>
          <div className="kpi-value" style={{ color: netIncome >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt(netIncome)}</div>
          <div className="kpi-delta pos">▲ 12.4% vs Dec</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-label">Uncategorized</div>
          <div className="kpi-value" style={{ color: uncat > 0 ? "var(--yellow)" : "var(--accent)" }}>{uncat}</div>
          <div className="kpi-delta" style={{ color: uncat > 0 ? "var(--yellow)" : "var(--text3)" }}>
            {uncat > 0 ? "⚠ needs review" : "✓ all categorized"}
          </div>
        </div>
      </div>

      <div className="grid-2 mt-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="flex items-center justify-between mb-16">
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13 }}>Weekly Cash Flow</div>
          </div>
          <div className="bar-chart">
            {weeks.map((w, i) => (
              <div key={w} className="bar-item">
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", flex: 1, width: "100%", height: "100%" }}>
                  <div className="bar bar-income" style={{ height: `${(weeklyIncome[i] / maxBar) * 100}%`, flex: 1 }} title={`Income: ${fmt(weeklyIncome[i])}`} />
                  <div className="bar bar-expense" style={{ height: `${(weeklyExpense[i] / maxBar) * 100}%`, flex: 1 }} title={`Expense: ${fmt(weeklyExpense[i])}`} />
                </div>
                <div className="bar-label">{w}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-16 mt-12" style={{ justifyContent: "center" }}>
            <div className="flex items-center gap-8"><div className="dot" style={{ background: "var(--accent)" }} /><span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono" }}>Income</span></div>
            <div className="flex items-center gap-8"><div className="dot" style={{ background: "var(--red)" }} /><span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono" }}>Expense</span></div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Expenses by Category</div>
          {catItems.map(({ cat, amt }) => (
            <div key={cat.id} className="flex items-center gap-12" style={{ marginBottom: 12 }}>
              <div className="swatch" style={{ background: cat.color }} />
              <div style={{ flex: 1 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text2)" }}>{cat.name}</span>
                  <span className="mono" style={{ fontSize: 11 }}>{fmt(amt)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(amt / totalExpense) * 100}%`, background: cat.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-16">
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13 }}>Recent Transactions</div>
          <span style={{ fontSize: 12, color: "var(--text3)", fontFamily: "DM Mono" }}>{transactions.length} total</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {transactions.slice(0, 8).map(t => {
                const cat = categories.find(c => c.id === t.category);
                return (
                  <tr key={t.id}>
                    <td className="mono" style={{ color: "var(--text3)" }}>{fmtShort(t.date)}</td>
                    <td>{t.description}</td>
                    <td>{cat ? <span className="tag" style={{ background: cat.color + "18", color: cat.color, border: `1px solid ${cat.color}30` }}>{cat.name}</span> : <span className="tag tag-gray">—</span>}</td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--text3)" }}>{t.account}</td>
                    <td className={t.amount >= 0 ? "amount-pos text-right" : "amount-neg text-right"}>{fmt(t.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
function Transactions({ transactions, allTransactions, setTransactions, saveTransactions, categories, dateRange, setDateRange, showToast }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();

  const filtered = transactions.filter(t => {
    if (filter === "income" && t.amount < 0) return false;
    if (filter === "expense" && t.amount > 0) return false;
    if (filter === "uncat" && t.category !== UNCATEGORIZED) return false;
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const [parsing, setParsing] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.toLowerCase();

    // PDF → AI extraction (server-side via /api/parse-statement, supports up to 20MB)
    if (ext.endsWith(".pdf")) {
      setParsing(true);
      showToast("Reading PDF with AI... 10-20 seconds", "info");
      try {
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result.split(",")[1]);
          reader.onerror = () => rej(new Error("Read failed"));
          reader.readAsDataURL(file);
        });
        const apiRes = await fetch("/api/parse-statement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: base64, filename: file.name }),
        });
        if (!apiRes.ok) {
          const err = await apiRes.json().catch(() => ({ error: `Server error ${apiRes.status}` }));
          showToast(err.error || `Server error ${apiRes.status}`, "error");
          return;
        }
        const { transactions: rawImported } = await apiRes.json();
        if (!rawImported || rawImported.length === 0) {
          showToast("No transactions found in PDF.", "error");
          return;
        }
        const imported = applyAutoCategorize(rawImported, allTransactions || transactions);
        expandDateRangeIfNeeded(imported, dateRange, setDateRange);
        setTransactions(prev => [...imported, ...prev]);
        if (saveTransactions) saveTransactions(imported);
        const autoCount = imported.filter(t => t.autoCategorized).length;
        showToast(imported.length + " transactions extracted" + (autoCount ? ` · ${autoCount} auto-categorized` : ""), "success");
      } catch (err) {
        showToast("PDF import failed: " + err.message, "error");
      } finally {
        setParsing(false);
      }
      return;
    }

    // CSV / OFX → direct parse
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      let rawParsed = [];
      if (ext.endsWith(".ofx") || ext.endsWith(".qfx")) {
        rawParsed = parseOFX(text);
      } else {
        rawParsed = parseBoACSV(text);
      }
      if (rawParsed.length === 0) { showToast("No transactions found in file. Check the format.", "error"); return; }
      const parsed = applyAutoCategorize(rawParsed, allTransactions || transactions);
      expandDateRangeIfNeeded(parsed, dateRange, setDateRange);
      setTransactions(prev => [...parsed, ...prev]);
      if (saveTransactions) saveTransactions(parsed);
      const autoCount = parsed.filter(t => t.autoCategorized).length;
      showToast(parsed.length + " transactions imported" + (autoCount ? ` · ${autoCount} auto-categorized` : ""), "success");
    };
    reader.readAsText(file);
  };

  const updateCategory = (id, catId) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, category: catId, autoCategorized: false } : t);
      if (saveTransactions) { const changed = updated.filter(t => t.id === id); saveTransactions(changed); }
      return updated;
    });
  };

  const toggleReconcile = (id) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, reconciled: !t.reconciled } : t);
      if (saveTransactions) { const changed = updated.filter(t => t.id === id); saveTransactions(changed); }
      return updated;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-subtitle">{transactions.length} transactions · {transactions.filter(t => t.category === UNCATEGORIZED).length} uncategorized</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => fileRef.current.click()}>
          <Icon name="upload" size={13} /> Import Statement
        </button>
        <input type="file" ref={fileRef} accept=".pdf,.csv,.ofx,.qfx" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Upload drop zone */}
      <div
        className={`upload-zone mb-16 ${drag ? "drag" : ""}`}
        style={{ padding: "20px", textAlign: "left", display: "flex", alignItems: "center", gap: 16 }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current.click()}
      >
        <div style={{ fontSize: 24 }}><Icon name="bank" size={28} color="var(--accent)" /></div>
        <div>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14 }}>
            {parsing ? "🤖 AI extracting transactions from PDF..." : "Drop your Bank of America statement here"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "DM Mono", marginTop: 3 }}>
            {parsing ? "This usually takes 10–20 seconds" : "PDF · CSV · OFX/QFX · Drag & drop or click to browse"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono", textAlign: "right" }}>
          BoA Online → Statements → Download<br /><span style={{color:"var(--accent)"}}>PDF recommended</span> · CSV or OFX also work
        </div>
      </div>

      <div className="flex items-center gap-12 mb-16">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {["all", "income", "expense", "uncat"].map(f => (
            <div key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "income" ? "Income" : f === "expense" ? "Expenses" : "Uncategorized"}
            </div>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 240 }} placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Reconciled</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><div className="empty"><div className="empty-icon">🔍</div><div className="empty-title">No transactions found</div></div></td></tr>
              ) : filtered.map(t => (
                <tr key={t.id}>
                  <td className="mono" style={{ color: "var(--text3)", whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                  <td style={{ maxWidth: 280 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {t.autoCategorized && <span className="auto-cat-badge" title="Auto-categorized from history — change to confirm">✨</span>}
                      <select className={`cat-select${t.autoCategorized ? " auto-cat" : ""}`} value={t.category} onChange={e => updateCategory(t.id, e.target.value)}>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--text3)" }}>{t.account}</td>
                  <td>
                    <div
                      style={{ width: 20, height: 20, borderRadius: 4, border: `1.5px solid ${t.reconciled ? "var(--accent)" : "var(--border2)"}`, background: t.reconciled ? "var(--accentBg)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      onClick={() => toggleReconcile(t.id)}
                    >
                      {t.reconciled && <Icon name="check" size={12} color="var(--accent)" />}
                    </div>
                  </td>
                  <td className={t.amount >= 0 ? "amount-pos text-right" : "amount-neg text-right"}>{fmt(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
function Categories({ categories, setCategories, saveCategory, deleteCategory: deleteCategoryDB, transactions, showToast }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", type: "expense", color: "#f05e5e", taxLine: "" });
  const [editing, setEditing] = useState(null);

  const COLORS = ["#f05e5e", "#f0c84a", "#4a9ff0", "#a47ff0", "#00d4a0", "#f0904a", "#4af0d0", "#90a0b0", "#e06090", "#60c0e0"];
  const TAX_LINES = ["COGS", "Wages", "Rent", "Advertising", "Depreciation", "Insurance", "Office", "Utilities", "Repairs", "Travel", "Meals", "Gross Receipts", "Other Income", ""];

  const openAdd = () => { setEditing(null); setForm({ name: "", type: "expense", color: "#f05e5e", taxLine: "" }); setModal(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ name: c.name, type: c.type, color: c.color, taxLine: c.taxLine }); setModal(true); };

  const save = () => {
    if (!form.name.trim()) return;
    const updated = { id: editing || Date.now().toString(), ...form };
    if (editing) {
      setCategories(prev => prev.map(c => c.id === editing ? updated : c));
      showToast("Category updated", "success");
    } else {
      setCategories(prev => [...prev, updated]);
      showToast("Category created", "success");
    }
    if (saveCategory) saveCategory(updated);
    setModal(false);
  };

  const remove = (id) => {
    if (id === UNCATEGORIZED) { showToast("Cannot delete Uncategorized", "error"); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    if (deleteCategoryDB) deleteCategoryDB(id);
    showToast("Category deleted", "info");
  };

  const txnCount = (cid) => transactions.filter(t => t.category === cid).length;
  const txnTotal = (cid) => transactions.filter(t => t.category === cid).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Chart of Accounts</div>
          <div className="page-subtitle">{categories.length} categories configured</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><Icon name="plus" size={13} /> New Category</button>
      </div>

      <div className="grid-2">
        {["income", "expense"].map(type => (
          <div key={type}>
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              {type === "income" ? "💰 Income" : "💸 Expenses"}
            </div>
            {categories.filter(c => c.type === type).map(c => (
              <div key={c.id} className="card card-sm flex items-center gap-12" style={{ marginBottom: 8 }}>
                <div className="swatch" style={{ background: c.color, width: 14, height: 14, borderRadius: 4 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono", marginTop: 2 }}>
                    {txnCount(c.id)} txns · {c.taxLine || "no tax line"} · {fmt(Math.abs(txnTotal(c.id)))}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ padding: "4px 6px" }} onClick={() => openEdit(c)}><Icon name="edit" size={13} /></button>
                {c.id !== UNCATEGORIZED && <button className="btn btn-ghost" style={{ padding: "4px 6px", color: "var(--red)" }} onClick={() => remove(c.id)}><Icon name="trash" size={13} /></button>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editing ? "Edit Category" : "New Category"}</div>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setModal(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Category Name</label>
                <input className="input" placeholder="e.g. Food & Beverage" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="label">Type</label>
                  <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Tax Line (Schedule C)</label>
                  <select className="input" value={form.taxLine} onChange={e => setForm(f => ({ ...f, taxLine: e.target.value }))}>
                    {TAX_LINES.map(l => <option key={l} value={l}>{l || "— none —"}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Color</label>
                <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                  {COLORS.map(c => (
                    <div key={c} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: "pointer", border: form.color === c ? "2px solid white" : "2px solid transparent", transition: "border 0.15s" }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{editing ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── P&L REPORT ───────────────────────────────────────────────────────────────
function PLReport({ transactions, categories, dateRange = {} }) {
  const [period, setPeriod] = useState("monthly");
  const [expanded, setExpanded] = useState({ income: true, expense: true });

  const incomeCats = categories.filter(c => c.type === "income");
  const expenseCats = categories.filter(c => c.type === "expense" && c.id !== UNCATEGORIZED);

  const getAmount = (catId) => transactions.filter(t => t.category === catId).reduce((s, t) => s + t.amount, 0);

  const totalIncome = incomeCats.reduce((s, c) => s + Math.max(0, getAmount(c.id)), 0);
  const totalCOGS = expenseCats.filter(c => c.taxLine === "COGS").reduce((s, c) => s + Math.abs(Math.min(0, getAmount(c.id))), 0);
  const grossProfit = totalIncome - totalCOGS;
  const totalOpex = expenseCats.filter(c => c.taxLine !== "COGS").reduce((s, c) => s + Math.abs(Math.min(0, getAmount(c.id))), 0);
  const netIncome = grossProfit - totalOpex;

  const toggle = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Profit & Loss</div>
          <div className="page-subtitle">{dateRange ? dateRange.start + " → " + dateRange.end : "January 2025"} · TorresBee</div>
        </div>
        <div className="flex gap-8">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {["monthly", "quarterly", "annual"].map(p => (
              <div key={p} className={`tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)} style={{ fontSize: 12 }}>{p.charAt(0).toUpperCase() + p.slice(1)}</div>
            ))}
          </div>
          <button className="btn btn-outline btn-sm"><Icon name="download" size={13} /> Export</button>
        </div>
      </div>

      <div className="grid-2">
        <div>
          {/* Income */}
          <div className="pl-section">
            <div className="pl-header" onClick={() => toggle("income")}>
              <span>Income</span>
              <span className="mono" style={{ color: "var(--accent)" }}>{fmt(totalIncome)}</span>
            </div>
            {expanded.income && incomeCats.map(c => {
              const amt = Math.max(0, getAmount(c.id));
              return (
                <div key={c.id} className="pl-row">
                  <div className="flex items-center gap-8">
                    <div className="swatch" style={{ background: c.color }} />
                    <span className="pl-row-name">{c.name}</span>
                  </div>
                  <span className="mono" style={{ color: "var(--accent)" }}>{fmt(amt)}</span>
                </div>
              );
            })}
          </div>

          <div className="pl-total">
            <span className="pl-total-label">Total Revenue</span>
            <span className="mono" style={{ color: "var(--accent)" }}>{fmt(totalIncome)}</span>
          </div>

          {/* COGS */}
          <div className="pl-section mt-12">
            <div className="pl-header" style={{ background: "var(--redBg)" }} onClick={() => toggle("cogs")}>
              <span>Cost of Goods Sold</span>
              <span className="mono" style={{ color: "var(--red)" }}>({fmt(totalCOGS)})</span>
            </div>
            {expanded.cogs && expenseCats.filter(c => c.taxLine === "COGS").map(c => {
              const amt = Math.abs(Math.min(0, getAmount(c.id)));
              return (
                <div key={c.id} className="pl-row">
                  <div className="flex items-center gap-8">
                    <div className="swatch" style={{ background: c.color }} />
                    <span className="pl-row-name">{c.name}</span>
                  </div>
                  <span className="mono" style={{ color: "var(--red)" }}>({fmt(amt)})</span>
                </div>
              );
            })}
          </div>

          <div className="pl-total" style={{ background: "var(--surface3)" }}>
            <span className="pl-total-label">Gross Profit</span>
            <span className="mono" style={{ color: grossProfit >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt(grossProfit)}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono", textAlign: "right", marginTop: 4 }}>
            Gross Margin: {totalIncome > 0 ? ((grossProfit / totalIncome) * 100).toFixed(1) : 0}%
          </div>
        </div>

        <div>
          {/* Operating Expenses */}
          <div className="pl-section">
            <div className="pl-header" style={{ background: "var(--surface2)" }} onClick={() => toggle("opex")}>
              <span>Operating Expenses</span>
              <span className="mono" style={{ color: "var(--red)" }}>({fmt(totalOpex)})</span>
            </div>
            {expanded.opex && expenseCats.filter(c => c.taxLine !== "COGS").map(c => {
              const amt = Math.abs(Math.min(0, getAmount(c.id)));
              if (amt === 0) return null;
              return (
                <div key={c.id} className="pl-row">
                  <div className="flex items-center gap-8">
                    <div className="swatch" style={{ background: c.color }} />
                    <span className="pl-row-name">{c.name}</span>
                  </div>
                  <span className="mono" style={{ color: "var(--red)" }}>({fmt(amt)})</span>
                </div>
              );
            })}
          </div>

          <div className="pl-total">
            <span className="pl-total-label">Total OpEx</span>
            <span className="mono" style={{ color: "var(--red)" }}>({fmt(totalOpex)})</span>
          </div>

          {/* Net */}
          <div className="pl-net mt-16">
            <div>
              <div className="pl-net-label">Net Income</div>
              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono", marginTop: 4 }}>
                Net Margin: {totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div style={{ fontFamily: "DM Mono", fontSize: 28, fontWeight: 500, color: netIncome >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt(netIncome)}</div>
          </div>

          {/* Quick stats */}
          <div className="mt-16" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Food Cost %", value: totalIncome > 0 ? ((totalCOGS / totalIncome) * 100).toFixed(1) + "%" : "—", ok: totalIncome > 0 && (totalCOGS / totalIncome) < 0.35 },
              { label: "Labor %", value: totalIncome > 0 ? ((Math.abs(getAmount("2")) / totalIncome) * 100).toFixed(1) + "%" : "—", ok: totalIncome > 0 && Math.abs(getAmount("2")) / totalIncome < 0.30 },
              { label: "Rent %", value: totalIncome > 0 ? ((Math.abs(getAmount("3")) / totalIncome) * 100).toFixed(1) + "%" : "—", ok: true },
              { label: "Prime Cost %", value: totalIncome > 0 ? (((totalCOGS + Math.abs(getAmount("2"))) / totalIncome) * 100).toFixed(1) + "%" : "—", ok: totalIncome > 0 && (totalCOGS + Math.abs(getAmount("2"))) / totalIncome < 0.60 },
            ].map(s => (
              <div key={s.label} className="card card-sm" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "DM Mono", fontSize: 18, fontWeight: 500, color: s.ok ? "var(--accent)" : "var(--yellow)" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CASH FLOW ────────────────────────────────────────────────────────────────
function CashFlow({ transactions, categories, dateRange = {} }) {
  const operating = transactions.filter(t => ["1","2","3","4","6","7","8","9"].includes(t.category));
  const opInflow = operating.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const opOutflow = Math.abs(operating.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const netOperating = opInflow - opOutflow;
  const netInvesting = -234.80; // equipment sample
  const netFinancing = 0;
  const netChange = netOperating + netInvesting + netFinancing;
  const beginBalance = 12400.00;
  const endBalance = beginBalance + netChange;

  const sections = [
    { label: "Operating Activities", items: [
      { name: "Cash from customers", value: opInflow },
      { name: "Payments to suppliers", value: -transactions.filter(t=>t.category==="1").reduce((s,t)=>s+t.amount,0) },
      { name: "Payroll & wages", value: -Math.abs(transactions.filter(t=>t.category==="2").reduce((s,t)=>s+t.amount,0)) },
      { name: "Rent & utilities", value: -Math.abs(transactions.filter(t=>t.category==="3").reduce((s,t)=>s+t.amount,0)) },
      { name: "Other operating", value: -Math.abs(transactions.filter(t=>["4","6","7"].includes(t.category)).reduce((s,t)=>s+t.amount,0)) },
    ], net: netOperating, color: "var(--accent)" },
    { label: "Investing Activities", items: [
      { name: "Equipment purchases", value: netInvesting },
    ], net: netInvesting, color: "var(--blue)" },
    { label: "Financing Activities", items: [
      { name: "No financing activity", value: 0 },
    ], net: netFinancing, color: "var(--purple)" },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Cash Flow Statement</div>
          <div className="page-subtitle">January 2025 · Direct Method</div>
        </div>
        <button className="btn btn-outline btn-sm"><Icon name="download" size={13} /> Export</button>
      </div>

      <div className="grid-2">
        <div>
          {sections.map(s => (
            <div key={s.label} className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 14, color: s.color }}>{s.label}</div>
              {s.items.map(item => (
                <div key={item.name} className="flex items-center justify-between" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, color: "var(--text2)" }}>{item.name}</span>
                  <span className="mono" style={{ color: item.value >= 0 ? "var(--accent)" : "var(--red)", fontSize: 13 }}>{fmt(item.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10 }}>
                <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13 }}>Net {s.label.split(" ")[0]}</span>
                <span className="mono" style={{ color: s.net >= 0 ? "var(--accent)" : "var(--red)", fontWeight: 600, fontSize: 14 }}>{fmt(s.net)}</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Cash Summary</div>
            {[
              { label: "Beginning Cash Balance", value: beginBalance, color: "var(--text)" },
              { label: "Net Operating Cash", value: netOperating, color: netOperating >= 0 ? "var(--accent)" : "var(--red)" },
              { label: "Net Investing Cash", value: netInvesting, color: netInvesting >= 0 ? "var(--accent)" : "var(--red)" },
              { label: "Net Financing Cash", value: netFinancing, color: "var(--text2)" },
              { label: "Net Change in Cash", value: netChange, color: netChange >= 0 ? "var(--accent)" : "var(--red)" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>{r.label}</span>
                <span className="mono" style={{ color: r.color }}>{fmt(r.value)}</span>
              </div>
            ))}
            <div className="pl-net" style={{ marginTop: 12 }}>
              <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 14 }}>Ending Cash Balance</span>
              <span className="mono" style={{ fontSize: 22, color: "var(--accent)" }}>{fmt(endBalance)}</span>
            </div>
          </div>

          <div className="card">
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Cash Flow Health</div>
            {[
              { label: "Operating Cash Ratio", value: netOperating >= 0 ? "Positive ✓" : "Negative ⚠", ok: netOperating >= 0 },
              { label: "Cash Burn Rate", value: fmt(opOutflow / 30) + "/day", ok: true },
              { label: "Runway (at current burn)", value: Math.round(endBalance / (opOutflow / 30)) + " days", ok: true },
              { label: "Collections Efficiency", value: ((opInflow / (opInflow + Math.abs(netInvesting))) * 100).toFixed(0) + "%", ok: true },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>{r.label}</span>
                <span style={{ fontSize: 12, fontFamily: "DM Mono", color: r.ok ? "var(--accent)" : "var(--yellow)" }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BUDGET ───────────────────────────────────────────────────────────────────
function Budget({ transactions, categories, budgets, setBudgets, saveBudget, showToast }) {
  const [period, setPeriod] = useState("monthly");

  const getActual = (catId) => Math.abs(transactions.filter(t => t.category === catId && t.amount < 0).reduce((s, t) => s + t.amount, 0));

  const getBudget = (catId) => {
    const b = budgets.find(b => b.categoryId === catId);
    return b ? (period === "monthly" ? b.monthly : b.annual) : 0;
  };

  const updateBudget = (catId, value) => {
    const num = parseFloat(value) || 0;
    setBudgets(prev => {
      const existing = prev.find(b => b.categoryId === catId);
      if (existing) return prev.map(b => b.categoryId === catId ? { ...b, [period === "monthly" ? "monthly" : "annual"]: num, [period === "monthly" ? "annual" : "monthly"]: period === "monthly" ? num * 12 : num / 12 } : b);
      return [...prev, { id: Date.now().toString(), categoryId: catId, monthly: period === "monthly" ? num : num / 12, annual: period === "monthly" ? num * 12 : num }];
    });
  };

  const expCats = categories.filter(c => c.type === "expense" && c.id !== UNCATEGORIZED);
  const totalBudget = expCats.reduce((s, c) => s + getBudget(c.id), 0);
  const totalActual = expCats.reduce((s, c) => s + getActual(c.id), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Budget</div>
          <div className="page-subtitle">Set spending targets and track variance</div>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {["monthly", "annual"].map(p => (
            <div key={p} className={`tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)} style={{ fontSize: 12 }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </div>
          ))}
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 20 }}>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label">Total Budget</div>
          <div className="kpi-value">{fmt(totalBudget)}</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-label">Total Actual</div>
          <div className="kpi-value">{fmt(totalActual)}</div>
        </div>
        <div className="kpi-card" style={{ borderTop: `2px solid ${totalBudget - totalActual >= 0 ? "var(--accent)" : "var(--red)"}` }}>
          <div className="kpi-label">Variance</div>
          <div className="kpi-value" style={{ color: totalBudget - totalActual >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt(totalBudget - totalActual)}</div>
          <div className="kpi-delta" style={{ color: totalBudget - totalActual >= 0 ? "var(--accent)" : "var(--red)" }}>
            {totalBudget - totalActual >= 0 ? "▼ under budget" : "▲ over budget"}
          </div>
        </div>
      </div>

      <div className="card">
        {/* Header */}
        <div className="budget-row budget-header" style={{ padding: "0 0 10px", borderBottom: "1px solid var(--border2)" }}>
          <span>Category</span>
          <span style={{ textAlign: "right" }}>{period === "monthly" ? "Monthly Budget" : "Annual Budget"}</span>
          <span style={{ textAlign: "right" }}>Actual</span>
          <span style={{ textAlign: "right" }}>Variance</span>
          <span style={{ textAlign: "right" }}>Used %</span>
        </div>

        {expCats.map(c => {
          const budget = getBudget(c.id);
          const actual = getActual(c.id);
          const variance = budget - actual;
          const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
          const over = actual > budget && budget > 0;

          return (
            <div key={c.id} className="budget-row" style={{ gridTemplateColumns: "1fr 130px 130px 130px 100px" }}>
              <div className="flex items-center gap-10">
                <div className="swatch" style={{ background: c.color }} />
                <div>
                  <div style={{ fontSize: 13 }}>{c.name}</div>
                  <div className="progress-bar" style={{ marginTop: 5, width: 100 }}>
                    <div className="progress-fill" style={{ width: `${pct}%`, background: over ? "var(--red)" : c.color }} />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <input
                  className="input"
                  style={{ textAlign: "right", fontFamily: "DM Mono", fontSize: 12, padding: "5px 8px" }}
                  value={budget || ""}
                  placeholder="0.00"
                  onChange={e => updateBudget(c.id, e.target.value)}
                  onBlur={(e) => { if (saveBudget) saveBudget({ categoryId: c.id, monthly: getBudget(c.id), annual: getBudget(c.id)*12, year: new Date().getFullYear() }); showToast("Budget saved", "success"); }}
                />
              </div>
              <div className="text-right mono" style={{ color: "var(--text2)" }}>{fmt(actual)}</div>
              <div className="text-right mono" style={{ color: variance >= 0 ? "var(--accent)" : "var(--red)" }}>
                {variance >= 0 ? "+" : ""}{fmt(variance)}
              </div>
              <div className="text-right">
                <span className={`tag ${over ? "tag-red" : pct > 80 ? "tag-yellow" : "tag-green"}`}>
                  {budget > 0 ? ((actual / budget) * 100).toFixed(0) + "%" : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAX SUMMARY ──────────────────────────────────────────────────────────────
function TaxSummary({ transactions, categories, dateRange = {} }) {
  const byTaxLine = {};
  categories.forEach(c => {
    const total = transactions.filter(t => t.category === c.id).reduce((s, t) => s + t.amount, 0);
    if (total !== 0 && c.taxLine) {
      if (!byTaxLine[c.taxLine]) byTaxLine[c.taxLine] = { income: 0, expense: 0 };
      if (total > 0) byTaxLine[c.taxLine].income += total;
      else byTaxLine[c.taxLine].expense += Math.abs(total);
    }
  });

  const totalRevenue = Object.values(byTaxLine).reduce((s, v) => s + v.income, 0);
  const totalDeductions = Object.values(byTaxLine).reduce((s, v) => s + v.expense, 0);
  const netTaxable = totalRevenue - totalDeductions;
  const estTax = netTaxable > 0 ? netTaxable * 0.25 : 0; // rough estimate

  const exportCSV = () => {
    const rows = [["Tax Line", "Income", "Deductible Expense"]];
    Object.entries(byTaxLine).forEach(([line, v]) => rows.push([line, v.income.toFixed(2), v.expense.toFixed(2)]));
    rows.push(["TOTAL REVENUE", totalRevenue.toFixed(2), ""]);
    rows.push(["TOTAL DEDUCTIONS", "", totalDeductions.toFixed(2)]);
    rows.push(["NET TAXABLE INCOME", netTaxable.toFixed(2), ""]);
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "tax_summary_2025.csv"; a.click();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Tax Summary</div>
          <div className="page-subtitle">Schedule C · Fiscal Year 2025</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={exportCSV}><Icon name="download" size={13} /> Export CSV</button>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="kpi-card kpi-accent">
          <div className="kpi-label">Gross Receipts</div>
          <div className="kpi-value">{fmt(totalRevenue)}</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-label">Total Deductions</div>
          <div className="kpi-value">{fmt(totalDeductions)}</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label">Net Taxable Income</div>
          <div className="kpi-value" style={{ color: netTaxable >= 0 ? "var(--text)" : "var(--accent)" }}>{fmt(netTaxable)}</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-label">Est. Tax Liability (25%)</div>
          <div className="kpi-value">{fmt(estTax)}</div>
          <div className="kpi-delta" style={{ color: "var(--text3)" }}>Consult your CPA</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Deductions by Schedule C Line</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Schedule C Line</th><th style={{ textAlign: "right" }}>Income</th><th style={{ textAlign: "right" }}>Deductible Expense</th><th style={{ textAlign: "right" }}>Net</th></tr></thead>
            <tbody>
              {Object.entries(byTaxLine).map(([line, v]) => (
                <tr key={line}>
                  <td style={{ fontWeight: 500 }}>{line}</td>
                  <td className="text-right"><span className="mono" style={{ color: v.income > 0 ? "var(--accent)" : "var(--text3)" }}>{v.income > 0 ? fmt(v.income) : "—"}</span></td>
                  <td className="text-right"><span className="mono" style={{ color: v.expense > 0 ? "var(--red)" : "var(--text3)" }}>{v.expense > 0 ? fmt(v.expense) : "—"}</span></td>
                  <td className="text-right"><span className="mono" style={{ color: v.income - v.expense >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt(v.income - v.expense)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ background: "var(--yellowBg)", borderColor: "rgba(240,200,74,0.2)" }}>
        <div className="flex items-center gap-10">
          <Icon name="info" size={18} color="var(--yellow)" />
          <div>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, color: "var(--yellow)" }}>Tax Disclaimer</div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>This summary is for bookkeeping purposes only and does not constitute tax advice. The estimated tax liability uses a simplified 25% flat rate. Always consult a licensed CPA for accurate tax filing.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RECONCILIATION ───────────────────────────────────────────────────────────
function Reconciliation({ transactions, categories, showToast }) {
  const unreconciled = transactions.filter(t => !t.reconciled && t.amount < 0);

  // Mock invoices from Clariva Kitchen
  const mockInvoices = [
    { id: "inv1", vendor: "SYSCO FOODS", date: "2025-01-03", amount: 2340.50, status: "pending" },
    { id: "inv2", vendor: "US FOODS INC", date: "2025-01-10", amount: 1890.00, status: "pending" },
    { id: "inv3", vendor: "SYSCO FOODS", date: "2025-01-20", amount: 1980.00, status: "pending" },
  ];

  // Find matching transactions
  const findMatch = (inv) => unreconciled.find(t => Math.abs(Math.abs(t.amount) - inv.amount) < 1 && Math.abs(new Date(t.date) - new Date(inv.date)) < 3 * 86400000);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Reconciliation</div>
          <div className="page-subtitle">Match bank transactions with vendor invoices</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 20 }}>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-label">Unreconciled</div>
          <div className="kpi-value">{unreconciled.length}</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-label">Pending Invoices</div>
          <div className="kpi-value">{mockInvoices.length}</div>
        </div>
        <div className="kpi-card kpi-accent">
          <div className="kpi-label">Auto-Matched</div>
          <div className="kpi-value">{mockInvoices.filter(i => findMatch(i)).length}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Invoice ↔ Bank Match</div>
        {mockInvoices.map(inv => {
          const match = findMatch(inv);
          return (
            <div key={inv.id} className="recon-row">
              <div className="recon-card">
                <div className="desc">📄 {inv.vendor}</div>
                <div className="meta">{fmtDate(inv.date)} · Invoice · {fmt(inv.amount)}</div>
              </div>
              <div className="recon-arrow">{match ? "⇆" : "?"}</div>
              <div className="recon-card" style={{ borderColor: match ? "var(--accentBorder)" : "var(--border)" }}>
                {match ? (
                  <>
                    <div className="desc" style={{ color: "var(--accent)" }}>🏦 {match.description}</div>
                    <div className="meta">{fmtDate(match.date)} · {match.account} · {fmt(Math.abs(match.amount))}</div>
                  </>
                ) : (
                  <div style={{ color: "var(--text3)", fontSize: 12, fontFamily: "DM Mono" }}>No match found — review manually</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Unreconciled Transactions</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
            <tbody>
              {unreconciled.length === 0 ? (
                <tr><td colSpan={5}><div className="empty" style={{ padding: 30 }}><div className="empty-icon">✅</div><div className="empty-title">All clear!</div></div></td></tr>
              ) : unreconciled.map(t => {
                const cat = categories.find(c => c.id === t.category);
                return (
                  <tr key={t.id}>
                    <td className="mono" style={{ color: "var(--text3)" }}>{fmtDate(t.date)}</td>
                    <td>{t.description}</td>
                    <td>{cat && <span className="tag" style={{ background: cat.color + "18", color: cat.color, border: `1px solid ${cat.color}30` }}>{cat.name}</span>}</td>
                    <td className="amount-neg text-right">{fmt(t.amount)}</td>
                    <td><button className="btn btn-sm" style={{ background: "var(--accentBg)", color: "var(--accent)", border: "1px solid var(--accentBorder)", fontSize: 11 }} onClick={() => showToast("Marked as reconciled", "success")}>Mark reconciled</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ─── BILLS & PAYMENTS (Accounts Payable) ─────────────────────────────────────
function Bills({ transactions, setTransactions, bills, setBills, saveBill, deleteB, categories, dateRange, showToast, saveTransactions }) {
  // bills/setBills come from parent App state

  const [modal, setModal] = useState(null); // null | "add" | "pay" | "view"
  const [selected, setSelected] = useState(null);
  const [payForm, setPayForm] = useState({ date: "", method: "Bank Transfer", notes: "" });
  const [addForm, setAddForm] = useState({ vendor: "", amount: "", dueDate: "", category: "", notes: "" });
  const [filterStatus, setFilterStatus] = useState("all");

  const METHODS = ["Bank Transfer", "Check", "ACH", "Credit Card", "Cash", "Zelle", "Wire Transfer"];

  // Sync new Kitchen purchases into bills
  useEffect(() => {
    const kitchenTxns = transactions.filter(t => t.source === "kitchen_purchase");
    const existingTxnIds = new Set(bills.map(b => b.txnId));
    const newBills = kitchenTxns
      .filter(t => !existingTxnIds.has(t.id))
      .map(t => ({
        id: "bill_" + t.id,
        txnId: t.id,
        vendor: t.description,
        amount: Math.abs(t.amount),
        dueDate: t.date,
        issueDate: t.date,
        status: "due",
        category: t.category,
        paidDate: null,
        paidMethod: null,
        notes: t.notes || "",
        source: "kitchen",
      }));
    if (newBills.length > 0) setBills(prev => [...prev, ...newBills]);
  }, [transactions]);

  const isOverdue = (b) => b.status !== "paid" && b.dueDate < today();

  const filtered = bills.filter(b => {
    if (filterStatus === "unpaid") return b.status !== "paid";
    if (filterStatus === "paid") return b.status === "paid";
    if (filterStatus === "overdue") return isOverdue(b);
    return true;
  });

  const totalDue = bills.filter(b => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
  const totalOverdue = bills.filter(b => isOverdue(b)).reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter(b => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const paidCount = bills.filter(b => b.status === "paid").length;

  const openPay = (bill) => {
    setSelected(bill);
    setPayForm({ date: today(), method: "Bank Transfer", notes: "" });
    setModal("pay");
  };

  const confirmPay = () => {
    if (!payForm.date) return;

    // Mark bill as paid
    setBills(prev => prev.map(b => b.id === selected.id
      ? { ...b, status: "paid", paidDate: payForm.date, paidMethod: payForm.method, notes: payForm.notes }
      : b
    ));

    // Create ledger transaction for this payment
    const cat = categories.find(c => c.id === selected.category);
    const newTxn = {
      id: "payment_" + selected.id + "_" + Date.now(),
      date: payForm.date,
      description: "PAYMENT — " + selected.vendor,
      amount: -selected.amount,
      category: selected.category || UNCATEGORIZED,
      account: payForm.method,
      reconciled: true,
      source: "bill_payment",
      notes: payForm.notes || ("Bill paid via " + payForm.method),
    };
    setTransactions(prev => {
      // Remove old kitchen_purchase txn and replace with payment txn
      const without = prev.filter(t => t.id !== selected.txnId);
      return [newTxn, ...without];
    });

    if (saveBill) saveBill({ ...selected, status: "paid", paidDate: payForm.date, paidMethod: payForm.method, notes: payForm.notes });
    if (saveTransactions) saveTransactions([newTxn]);
    showToast("Bill paid! " + fmt(selected.amount) + " to " + selected.vendor, "success");
    setModal(null);
    setSelected(null);
  };

  const addBill = () => {
    if (!addForm.vendor || !addForm.amount || !addForm.dueDate) return;
    const newBill = {
      id: "bill_manual_" + Date.now(),
      txnId: null,
      vendor: addForm.vendor.toUpperCase(),
      amount: parseFloat(addForm.amount),
      dueDate: addForm.dueDate,
      issueDate: today(),
      status: "due",
      category: addForm.category || UNCATEGORIZED,
      paidDate: null,
      paidMethod: null,
      notes: addForm.notes,
      source: "manual",
    };
    setBills(prev => [newBill, ...prev]);
    if (saveBill) saveBill(newBill);
    setAddForm({ vendor: "", amount: "", dueDate: "", category: "", notes: "" });
    setModal(null);
    showToast("Bill added — " + newBill.vendor, "success");
  };

  const statusTag = (b) => {
    if (b.status === "paid") return <span className="tag tag-green">Paid</span>;
    if (isOverdue(b)) return <span className="tag tag-red">Overdue</span>;
    const days = Math.ceil((new Date(b.dueDate) - new Date()) / 86400000);
    if (days <= 7) return <span className="tag tag-yellow">Due in {days}d</span>;
    return <span className="tag tag-blue">Due {fmtShort(b.dueDate)}</span>;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Bills & Payments</div>
          <div className="page-subtitle">Accounts Payable · {bills.length} bills</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal("add")}>
          <Icon name="plus" size={13} /> Add Bill
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 20 }}>
        <div className="kpi-card kpi-red" style={{ cursor: "pointer" }} onClick={() => setFilterStatus("unpaid")}>
          <div className="kpi-label">Total Due</div>
          <div className="kpi-value" style={{ color: "var(--red)" }}>{fmt(totalDue)}</div>
          <div className="kpi-delta neg">{bills.filter(b => b.status !== "paid").length} unpaid bills</div>
        </div>
        <div className="kpi-card" style={{ borderTop: "2px solid var(--red)", cursor: "pointer" }} onClick={() => setFilterStatus("overdue")}>
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value" style={{ color: totalOverdue > 0 ? "var(--red)" : "var(--text3)" }}>{fmt(totalOverdue)}</div>
          <div className="kpi-delta neg">{bills.filter(b => isOverdue(b)).length} bills overdue</div>
        </div>
        <div className="kpi-card kpi-accent" style={{ cursor: "pointer" }} onClick={() => setFilterStatus("paid")}>
          <div className="kpi-label">Paid</div>
          <div className="kpi-value">{fmt(totalPaid)}</div>
          <div className="kpi-delta pos">{paidCount} bills paid</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label">Next 7 Days</div>
          <div className="kpi-value">
            {fmt(bills.filter(b => {
              if (b.status === "paid") return false;
              const d = Math.ceil((new Date(b.dueDate) - new Date()) / 86400000);
              return d >= 0 && d <= 7;
            }).reduce((s, b) => s + b.amount, 0))}
          </div>
          <div className="kpi-delta" style={{ color: "var(--text3)" }}>upcoming</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-12 mb-16">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[
            { k: "all", l: "All" },
            { k: "unpaid", l: "Unpaid" },
            { k: "overdue", l: "Overdue" },
            { k: "paid", l: "Paid" },
          ].map(({ k, l }) => (
            <div key={k} className={"tab" + (filterStatus === k ? " active" : "")} onClick={() => setFilterStatus(k)}>{l}</div>
          ))}
        </div>
      </div>

      {/* Bills table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Source</th>
                <th>Category</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty">
                    <div className="empty-icon">✅</div>
                    <div className="empty-title">No bills in this view</div>
                    <div className="empty-sub">Use "Sync Kitchen" to import invoices or add manually</div>
                  </div>
                </td></tr>
              ) : filtered.map(bill => {
                const cat = categories.find(c => c.id === bill.category);
                return (
                  <tr key={bill.id} style={{ opacity: bill.status === "paid" ? 0.6 : 1 }}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{bill.vendor}</div>
                      {bill.paidMethod && <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono", marginTop: 2 }}>via {bill.paidMethod}</div>}
                    </td>
                    <td>
                      <span className={"tag " + (bill.source === "kitchen" ? "tag-blue" : "tag-gray")}>
                        {bill.source === "kitchen" ? "🍳 Kitchen" : "Manual"}
                      </span>
                    </td>
                    <td>
                      {cat
                        ? <span className="tag" style={{ background: cat.color + "18", color: cat.color, border: "1px solid " + cat.color + "30" }}>{cat.name}</span>
                        : <span className="tag tag-gray">—</span>
                      }
                    </td>
                    <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>{fmtShort(bill.issueDate)}</td>
                    <td className="mono" style={{ fontSize: 12, color: isOverdue(bill) && bill.status !== "paid" ? "var(--red)" : "var(--text3)" }}>
                      {bill.status === "paid" ? fmtShort(bill.paidDate) : fmtDate(bill.dueDate)}
                    </td>
                    <td>{statusTag(bill)}</td>
                    <td className="text-right">
                      <span className="mono" style={{ color: bill.status === "paid" ? "var(--text3)" : "var(--red)", fontSize: 13 }}>
                        {fmt(bill.amount)}
                      </span>
                    </td>
                    <td>
                      {bill.status !== "paid" ? (
                        <button
                          className="btn btn-sm"
                          style={{ background: "var(--accentBg)", color: "var(--accent)", border: "1px solid var(--accentBorder)", whiteSpace: "nowrap" }}
                          onClick={() => openPay(bill)}
                        >
                          <Icon name="check" size={12} /> Pay Bill
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono" }}>Paid {fmtShort(bill.paidDate)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PAY BILL MODAL ── */}
      {modal === "pay" && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Pay Bill</div>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setModal(null)}><Icon name="close" size={16} /></button>
            </div>
            <div className="modal-body">
              {/* Bill summary */}
              <div className="card card-sm" style={{ background: "var(--surface2)", marginBottom: 20 }}>
                <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{selected.vendor}</div>
                <div className="flex items-center justify-between mt-4">
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Amount Due</span>
                  <span className="mono" style={{ fontSize: 20, color: "var(--red)" }}>{fmt(selected.amount)}</span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Due Date</span>
                  <span className="mono" style={{ fontSize: 12 }}>{fmtDate(selected.dueDate)}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Payment Date</label>
                <input type="date" className="input" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Payment Method</label>
                <select className="input" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Notes (optional)</label>
                <input className="input" placeholder="e.g. Check #1042, reference number..." value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="card card-sm" style={{ background: "var(--accentBg)", border: "1px solid var(--accentBorder)", marginTop: 4 }}>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                  This will mark the bill as <strong style={{ color: "var(--accent)" }}>Paid</strong> and create a ledger transaction of <strong style={{ color: "var(--accent)" }}>{fmt(selected.amount)}</strong> under <strong style={{ color: "var(--accent)" }}>{payForm.method}</strong> on {payForm.date ? fmtDate(payForm.date) : "—"}.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmPay} disabled={!payForm.date}>
                <Icon name="check" size={13} /> Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD BILL MODAL ── */}
      {modal === "add" && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Add Bill</div>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setModal(null)}><Icon name="close" size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Vendor / Payee</label>
                <input className="input" placeholder="e.g. SYSCO FOODS" value={addForm.vendor} onChange={e => setAddForm(f => ({ ...f, vendor: e.target.value }))} />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="label">Amount</label>
                  <input type="number" className="input" placeholder="0.00" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={addForm.dueDate} onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Category</label>
                <select className="input" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— Select category —</option>
                  {categories.filter(c => c.type === "expense").map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <input className="input" placeholder="Invoice #, PO number, etc." value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={addBill} disabled={!addForm.vendor || !addForm.amount || !addForm.dueDate}>
                <Icon name="plus" size={13} /> Add Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── CFO INSIGHTS ─────────────────────────────────────────────────────────────
function Insights({ transactions, categories, budgets, dateRange = {} }) {
  const [period, setPeriod] = useState("weekly");
  const totalIncome  = transactions.filter(t => t.amount > 0).reduce((s,t) => s+t.amount, 0);
  const totalExpense = Math.abs(transactions.filter(t => t.amount < 0).reduce((s,t) => s+t.amount, 0));
  const netIncome    = totalIncome - totalExpense;
  const netMargin    = totalIncome > 0 ? (netIncome/totalIncome)*100 : 0;
  const getCat = (id) => Math.abs(transactions.filter(t => t.category === id).reduce((s,t) => s+t.amount, 0));
  const foodCost = getCat("1"), labor = getCat("2"), rent = getCat("3");
  const marketing = getCat("4"), insurance = getCat("6");
  const foodCostPct  = totalIncome > 0 ? (foodCost/totalIncome)*100 : 0;
  const laborPct     = totalIncome > 0 ? (labor/totalIncome)*100 : 0;
  const primeCost    = foodCostPct + laborPct;
  const rentPct      = totalIncome > 0 ? (rent/totalIncome)*100 : 0;
  const marketingPct = totalIncome > 0 ? (marketing/totalIncome)*100 : 0;
  const burnRate     = totalExpense / 30;
  const estimatedCash = Math.max(netIncome * 3, 5000);
  const runway = burnRate > 0 ? Math.round(estimatedCash / burnRate) : 999;
  const getBudgetAmt = (id) => { const b = budgets.find(b => b.categoryId === id); return b ? b.monthly : 0; };

  const alerts = [];
  if (foodCostPct > 35)  alerts.push({ level:"critical", icon:"🚨", title:"Food Cost Critical",    msg:`At ${foodCostPct.toFixed(1)}% — benchmark 28-35%. Losing ${fmt(foodCost - totalIncome*0.32)} vs target.`,  action:"Review portion sizes, supplier contracts, and menu pricing immediately." });
  if (foodCostPct > 28 && foodCostPct <= 35) alerts.push({ level:"warn", icon:"⚠️", title:"Food Cost Elevated", msg:`At ${foodCostPct.toFixed(1)}% — approaching danger zone.`, action:"Audit top 10 menu items for margin. Consider 3-5% price increase on low-margin items." });
  if (laborPct > 35)     alerts.push({ level:"critical", icon:"🚨", title:"Labor Cost Critical",   msg:`At ${laborPct.toFixed(1)}% — overspending by ${fmt(labor - totalIncome*0.30)}.`,  action:"Review scheduling. Cut overtime. Cross-train staff for multiple roles." });
  if (primeCost > 65)    alerts.push({ level:"critical", icon:"🚨", title:"Prime Cost Danger",     msg:`Prime cost ${primeCost.toFixed(1)}% — must stay below 65%.`,  action:"Emergency review: reduce food cost AND labor simultaneously." });
  if (netMargin < 5 && totalIncome > 0) alerts.push({ level:"warn", icon:"⚠️", title:"Thin Net Margin", msg:`Net margin ${netMargin.toFixed(1)}% — target 5-10%.`, action:"Focus on revenue growth and cut top 3 expense lines by 10% each." });
  if (runway < 30)       alerts.push({ level:"critical", icon:"🚨", title:"Cash Flow Risk",        msg:`Runway only ${runway} days.`, action:"Accelerate collections, defer non-essential purchases, review all subscriptions." });
  if (runway < 60 && runway >= 30) alerts.push({ level:"warn", icon:"⚠️", title:"Monitor Cash",   msg:`Cash runway ~${runway} days. Watch closely.`, action:"Build 90-day cash forecast. Identify upcoming large expenses." });
  if (marketingPct < 1 && totalIncome > 10000) alerts.push({ level:"info", icon:"💡", title:"Marketing Underinvestment", msg:`Only ${marketingPct.toFixed(1)}% on marketing — should be 2-4%.`, action:"Increase digital spend: Google My Business, Instagram, loyalty programs." });

  const benchmarks = [
    { name:"Food Cost %",  value:foodCostPct,  target:32, unit:"%", lower:true,  good:foodCostPct<=32,  warn:foodCostPct<=35 },
    { name:"Labor Cost %", value:laborPct,     target:30, unit:"%", lower:true,  good:laborPct<=30,     warn:laborPct<=35 },
    { name:"Prime Cost %", value:primeCost,    target:60, unit:"%", lower:true,  good:primeCost<=60,    warn:primeCost<=65 },
    { name:"Net Margin %", value:netMargin,    target:8,  unit:"%", lower:false, good:netMargin>=8,     warn:netMargin>=5 },
    { name:"Rent %",       value:rentPct,      target:6,  unit:"%", lower:true,  good:rentPct<=6,       warn:rentPct<=10 },
    { name:"Marketing %",  value:marketingPct, target:3,  unit:"%", lower:false, good:marketingPct>=2,  warn:marketingPct>=1 },
  ];

  const actionItems = {
    daily:[
      { icon:"📊", title:"Review yesterday's sales vs target", detail:`Target daily: ${fmt(totalIncome/30)}. Track variance every morning at 9am.` },
      { icon:"🍽️", title:"Check food waste log", detail:"Every $1 waste = $3-4 revenue needed to compensate. Review with kitchen lead." },
      { icon:"💵", title:"Verify POS deposits hit bank", detail:"Square settlements appear within 1-2 business days. Flag any missing deposits immediately." },
      { icon:"👥", title:"Review labor vs covers", detail:"Track covers-per-labor-hour. Optimal for casual dining: 15-20 covers per server." },
    ],
    weekly:[
      { icon:"📈", title:"Week-over-week revenue", detail:"Compare same day last week. Flag any day >15% below prior week." },
      { icon:"🧾", title:"Process all vendor invoices", detail:"Clear bill queue. Pay within terms to protect supplier relationships and avoid late fees." },
      { icon:"🏪", title:"Inventory spot-check (top 10 items)", detail:"Check top 10 highest-cost ingredients. Calculate theoretical vs actual usage." },
      { icon:"💳", title:"Reconcile all card statements", detail:"Match all card charges to receipts. Catch duplicate charges and fraudulent transactions." },
      { icon:"📣", title:"Review marketing performance", detail:"Check Google Ads CTR, Meta reach, DoorDash volume vs prior week." },
    ],
    monthly:[
      { icon:"📋", title:"Full P&L review", detail:`Current net margin: ${netMargin.toFixed(1)}%. Target: 8%+. Identify top 3 categories to optimize.` },
      { icon:"💰", title:"Food cost deep dive", detail:`Food cost at ${foodCostPct.toFixed(1)}%. Run theoretical vs actual. Investigate any >2% variance.` },
      { icon:"👔", title:"Labor efficiency review", detail:`Labor at ${laborPct.toFixed(1)}%. Review scheduling per day-part. Identify overstaffed shifts.` },
      { icon:"🏦", title:"30-day cash flow forecast", detail:`Burn rate: ${fmt(burnRate)}/day. Project next month including all upcoming bills.` },
      { icon:"📊", title:"Budget vs actual variance", detail:"For each category >10% over budget, require written explanation and corrective action." },
      { icon:"🤝", title:"Supplier price review", detail:"Review top 5 suppliers for price creep. Renegotiate any contract >$2,000/month." },
    ],
    quarterly:[
      { icon:"🎯", title:"Menu repricing analysis", detail:"Items with <60% gross margin: reprice, reposition, or remove." },
      { icon:"📉", title:"Year-over-year trend", detail:"Compare revenue, food cost%, labor% vs same quarter last year. Flag structural shifts." },
      { icon:"💡", title:"Marketing ROI review", detail:`Spending ${fmt(marketing)} on marketing. Calculate customer acquisition cost and repeat rate.` },
      { icon:"🔄", title:"Menu engineering", detail:"Classify all items: Stars / Plowhorses / Puzzles / Dogs. Eliminate or redesign Dogs." },
      { icon:"📜", title:"Review all vendor contracts", detail:"Get 2-3 quotes on top 5 product categories. Use competing quotes to negotiate." },
      { icon:"🏛️", title:"Tax planning with CPA", detail:"Quarterly estimated taxes due. Review deductions. Ensure proper expense categorization." },
    ],
    annual:[
      { icon:"🏆", title:"Annual P&L vs prior year", detail:"Full year performance review. Set benchmarks for next year based on industry data." },
      { icon:"💼", title:"Compensation & benefits review", detail:"Review all wages vs market. Plan merit increases. Calculate total cost of employment." },
      { icon:"🏗️", title:"CapEx planning", detail:"Equipment replacement schedule. Create 3-year capital expenditure plan." },
      { icon:"📱", title:"Technology stack audit", detail:"Review all SaaS subscriptions. Cut unused tools. Negotiate annual vs monthly pricing." },
      { icon:"🌱", title:"Growth strategy review", detail:"Catering? Second location? Ghost kitchen? Model each with 3-year pro forma." },
      { icon:"🧮", title:"Annual tax preparation", detail:`Net taxable income: ${fmt(netIncome)}. Maximize Schedule C deductions.` },
    ],
  };

  const alertColor = { critical:"var(--red)", warn:"var(--yellow)", info:"var(--blue)" };
  const alertBg    = { critical:"var(--redBg)", warn:"var(--yellowBg)", info:"var(--blueBg)" };
  const PERIODS = [{id:"daily",label:"Daily"},{id:"weekly",label:"Weekly"},{id:"monthly",label:"Monthly"},{id:"quarterly",label:"Quarterly"},{id:"annual",label:"Annual"}];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">CFO Insights</div>
          <div className="page-subtitle">{dateRange.start} → {dateRange.end} · TorresBee Restaurant</div>
        </div>
      </div>

      {/* Scorecard */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:16,fontWeight:600,marginBottom:16,letterSpacing:"0.04em"}}>Restaurant Health Scorecard</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {benchmarks.map(b => {
            const status = b.good?"good":b.warn?"warn":"bad";
            const color  = status==="good"?"var(--accent)":status==="warn"?"var(--yellow)":"var(--red)";
            const pct    = b.lower ? Math.min((b.value/Math.max(b.target*1.5,1))*100,100) : Math.min((b.value/15)*100,100);
            return (
              <div key={b.name} style={{background:"var(--surface2)",borderRadius:"var(--radius2)",padding:"14px 16px",borderLeft:"3px solid "+color}}>
                <div className="flex items-center justify-between" style={{marginBottom:8}}>
                  <span style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono",textTransform:"uppercase",letterSpacing:"0.08em"}}>{b.name}</span>
                  <span style={{fontSize:10,color,fontFamily:"DM Mono",fontWeight:500}}>{status==="good"?"✓ ON TARGET":status==="warn"?"⚠ WATCH":"✗ ACTION"}</span>
                </div>
                <div className="flex items-center justify-between" style={{marginBottom:8}}>
                  <span style={{fontFamily:"DM Mono",fontSize:22,fontWeight:400,color}}>{b.value.toFixed(1)}{b.unit}</span>
                  <span style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono"}}>target: {b.target}{b.unit}</span>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{width:pct+"%",background:color}}/></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 ? (
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:16,fontWeight:600,marginBottom:12,letterSpacing:"0.04em"}}>🔔 Active Alerts ({alerts.length})</div>
          {alerts.map((a,i) => (
            <div key={i} style={{background:alertBg[a.level],border:"1px solid "+alertColor[a.level]+"40",borderRadius:"var(--radius2)",padding:"14px 16px",marginBottom:10,borderLeft:"4px solid "+alertColor[a.level]}}>
              <div className="flex items-center gap-8" style={{marginBottom:6}}><span style={{fontSize:16}}>{a.icon}</span><span style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,color:alertColor[a.level]}}>{a.title}</span></div>
              <div style={{fontSize:13,color:"var(--text2)",marginBottom:6}}>{a.msg}</div>
              <div style={{fontSize:12,color:"var(--text3)",fontFamily:"DM Mono"}}>→ {a.action}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{background:"var(--accentBg)",border:"1px solid var(--accentBorder)",borderRadius:"var(--radius2)",padding:"14px 18px",marginBottom:20,display:"flex",gap:12,alignItems:"center"}}>
          <span style={{fontSize:20}}>✅</span>
          <div><div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,color:"var(--accent)"}}>All KPIs Within Target</div><div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>No critical alerts. Keep monitoring.</div></div>
        </div>
      )}

      {/* Cash + Levers */}
      <div className="grid-2" style={{marginBottom:20}}>
        <div className="card">
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:15,fontWeight:600,marginBottom:14,letterSpacing:"0.04em"}}>Cash Flow Forecast</div>
          {[
            {label:"Daily Burn Rate",value:fmt(burnRate),note:"expenses/day"},
            {label:"Estimated Cash",value:fmt(estimatedCash),note:"current position"},
            {label:"Runway",value:runway+" days",note:runway<60?"⚠ low":"✓ healthy",warn:runway<60},
            {label:"Break-even Revenue",value:fmt(totalExpense),note:"needed to cover costs"},
            {label:"Surplus / Deficit",value:(totalIncome>totalExpense?"+":"")+fmt(totalIncome-totalExpense),note:totalIncome>totalExpense?"surplus":"deficit",warn:totalIncome<totalExpense},
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between" style={{padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:12,color:"var(--text2)"}}>{r.label}</span>
              <div style={{textAlign:"right"}}><span style={{fontFamily:"DM Mono",fontSize:13,color:r.warn?"var(--yellow)":"var(--accent)"}}>{r.value}</span><span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono",marginLeft:6}}>{r.note}</span></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:15,fontWeight:600,marginBottom:14,letterSpacing:"0.04em"}}>Revenue Growth Levers</div>
          {[
            {lever:"Price increase 3%",impact:fmt(totalIncome*0.03),diff:"Low",note:"minimal customer impact"},
            {lever:"Reduce food waste 20%",impact:fmt(foodCost*0.20),diff:"Medium",note:"training + systems"},
            {lever:"Add 2 covers/table/day",impact:fmt(totalIncome*0.08),diff:"Medium",note:"table turn optimization"},
            {lever:"Launch catering (5%)",impact:fmt(totalIncome*0.05),diff:"High",note:"new revenue stream"},
            {lever:"Optimize labor schedule",impact:fmt(labor*0.08),diff:"Low",note:"8% labor reduction"},
          ].map(r => (
            <div key={r.lever} className="flex items-center justify-between" style={{padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
              <div><div style={{fontSize:12,color:"var(--text2)"}}>{r.lever}</div><div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono",marginTop:2}}>{r.note}</div></div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                <div style={{fontFamily:"DM Mono",fontSize:13,color:"var(--accent)"}}>+{r.impact}</div>
                <span className={"tag "+(r.diff==="Low"?"tag-green":r.diff==="Medium"?"tag-yellow":"tag-blue")} style={{marginTop:3}}>{r.diff}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action checklist */}
      <div className="card" style={{marginBottom:16}}>
        <div className="flex items-center justify-between" style={{marginBottom:16}}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:15,fontWeight:600,letterSpacing:"0.04em"}}>CFO Action Checklist</div>
          <div className="tabs" style={{marginBottom:0}}>
            {PERIODS.map(p => <div key={p.id} className={"tab"+(period===p.id?" active":"")} onClick={()=>setPeriod(p.id)} style={{fontSize:12}}>{p.label}</div>)}
          </div>
        </div>
        {(actionItems[period]||[]).map((item,i) => (
          <div key={i} style={{display:"flex",gap:14,padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
            <div style={{fontSize:22,flexShrink:0,width:32,textAlign:"center"}}>{item.icon}</div>
            <div style={{flex:1}}><div style={{fontFamily:"Syne,sans-serif",fontWeight:600,fontSize:13,marginBottom:4}}>{item.title}</div><div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>{item.detail}</div></div>
          </div>
        ))}
      </div>

      {/* Benchmarks */}
      <div className="card">
        <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:15,fontWeight:600,marginBottom:14,letterSpacing:"0.04em"}}>Industry Benchmarks — Full Service Restaurant (US)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            {label:"Food Cost",range:"28–35%",yours:foodCostPct.toFixed(1)+"%",ok:foodCostPct<=35},
            {label:"Labor Cost",range:"25–35%",yours:laborPct.toFixed(1)+"%",ok:laborPct<=35},
            {label:"Prime Cost",range:"55–65%",yours:primeCost.toFixed(1)+"%",ok:primeCost<=65},
            {label:"Rent",range:"5–10%",yours:rentPct.toFixed(1)+"%",ok:rentPct<=10},
            {label:"Marketing",range:"2–4%",yours:marketingPct.toFixed(1)+"%",ok:marketingPct>=1},
            {label:"Net Profit",range:"5–10%",yours:netMargin.toFixed(1)+"%",ok:netMargin>=5},
            {label:"Utilities",range:"3–5%",yours:"—",ok:true},
            {label:"Insurance",range:"1–3%",yours:totalIncome>0?((insurance/totalIncome)*100).toFixed(1)+"%":"—",ok:true},
          ].map(b => (
            <div key={b.label} style={{background:"var(--surface2)",borderRadius:"var(--radius2)",padding:"12px 14px"}}>
              <div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>{b.label}</div>
              <div style={{fontFamily:"DM Mono",fontSize:16,color:b.ok?"var(--accent)":"var(--red)"}}>{b.yours}</div>
              <div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono",marginTop:3}}>Target: {b.range}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PROJECTS & PROJECTIONS ───────────────────────────────────────────────────
function Projects({ transactions, projects, setProjects, saveProject, deleteProjectDB, dateRange = {} }) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const YEAR = new Date().getFullYear();

  const CATEGORIES_PROJ = ["Revenue Growth","Marketing","Operations","Technology","Expansion","Cost Reduction","Staff & HR","Other"];
  const IMPACT_OPTS = ["High","Medium","Low"];
  const STATUS_OPTS  = ["Idea","Planning","In Progress","On Hold","Done"];

  // projects/setProjects come from parent App state (passed as props)

  const [modal, setModal]  = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState("timeline"); // timeline | list | board
  const [filterMonth, setFilterMonth] = useState("all");

  const empty = { title:"", category:"Revenue Growth", month:new Date().getMonth()+1, year:YEAR, status:"Idea", impact:"High", investment:"", projectedRevenue:"", notes:"", cashRequired:"", roi:"" };
  const [form, setForm] = useState(empty);

  // Financials
  const totalIncomePeriod = transactions.filter(t => t.amount > 0).reduce((s,t) => s+t.amount, 0);
  const totalExpense      = Math.abs(transactions.filter(t => t.amount < 0).reduce((s,t) => s+t.amount, 0));
  const net               = totalIncomePeriod - totalExpense;
  const monthlyFree       = Math.max(net * 0.3, 0); // 30% of net for projects
  const totalInvestment   = projects.reduce((s,p) => s + (parseFloat(p.investment)||0), 0);
  const totalProjRevenue  = projects.reduce((s,p) => s + (parseFloat(p.projectedRevenue)||0), 0);

  const openAdd  = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (p) => { setEditing(p.id); setForm({...p}); setModal(true); };

  const save = () => {
    if (!form.title) return;
    const inv = parseFloat(form.investment)||0;
    const rev = parseFloat(form.projectedRevenue)||0;
    const roi = inv > 0 ? Math.round(((rev - inv)/inv)*100) : 0;
    const proj = { ...form, id: editing || "p_"+Date.now(), investment: inv, projectedRevenue: rev, cashRequired: inv, roi };
    setProjects(prev => editing ? prev.map(p => p.id===editing ? proj : p) : [...prev, proj]);
    if (saveProject) saveProject(proj);
    setModal(false);
  };

  const remove = (id) => { setProjects(prev => prev.filter(p => p.id !== id)); if (deleteProjectDB) deleteProjectDB(id); };

  const statusColors = { "Idea":"tag-gray", "Planning":"tag-blue", "In Progress":"tag-green", "On Hold":"tag-yellow", "Done":"tag-green" };
  const impactColors = { High:"var(--accent)", Medium:"var(--blue)", Low:"var(--text3)" };

  const filtered = filterMonth === "all" ? projects : projects.filter(p => p.month === parseInt(filterMonth));

  // Group by month for timeline
  const byMonth = {};
  MONTHS.forEach((_,i) => { byMonth[i+1] = projects.filter(p => p.month === i+1 && p.year === YEAR); });

  // Cumulative investment timeline
  const cumulativeByMonth = MONTHS.map((_,i) => {
    const m = i+1;
    return projects.filter(p => p.month <= m && p.year === YEAR).reduce((s,p) => s+(parseFloat(p.investment)||0), 0);
  });
  const maxCumul = Math.max(...cumulativeByMonth, 1);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Projects & Projections</div>
          <div className="page-subtitle">{YEAR} · Future investments based on cash flow</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><Icon name="plus" size={13}/> New Project</button>
      </div>

      {/* Financial capacity */}
      <div className="kpi-grid" style={{gridTemplateColumns:"repeat(4,1fr)",marginBottom:20}}>
        <div className="kpi-card kpi-accent">
          <div className="kpi-label">Monthly Free Cash</div>
          <div className="kpi-value">{fmt(monthlyFree)}</div>
          <div className="kpi-delta pos">30% of net income</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label">Total Investment</div>
          <div className="kpi-value">{fmt(totalInvestment)}</div>
          <div className="kpi-delta" style={{color:"var(--text3)"}}>{projects.length} projects</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-label">Projected Revenue</div>
          <div className="kpi-value">{fmt(totalProjRevenue)}</div>
          <div className="kpi-delta pos">from all projects</div>
        </div>
        <div className="kpi-card" style={{borderTop:"2px solid var(--accent)"}}>
          <div className="kpi-label">Blended ROI</div>
          <div className="kpi-value" style={{color:totalInvestment>0&&totalProjRevenue>totalInvestment?"var(--accent)":"var(--text3)"}}>
            {totalInvestment > 0 ? Math.round(((totalProjRevenue-totalInvestment)/totalInvestment)*100)+"%" : "—"}
          </div>
          <div className="kpi-delta" style={{color:"var(--text3)"}}>net return</div>
        </div>
      </div>

      {/* View toggle + filter */}
      <div className="flex items-center gap-12 mb-16">
        <div className="tabs" style={{marginBottom:0}}>
          {["timeline","list","board"].map(v => <div key={v} className={"tab"+(viewMode===v?" active":"")} onClick={()=>setViewMode(v)} style={{fontSize:12}}>{v.charAt(0).toUpperCase()+v.slice(1)}</div>)}
        </div>
        {viewMode==="list" && (
          <select className="input" style={{maxWidth:160,fontSize:12}} value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}>
            <option value="all">All Months</option>
            {MONTHS.map((m,i) => <option key={i} value={i+1}>{m} {YEAR}</option>)}
          </select>
        )}
      </div>

      {/* ── TIMELINE VIEW ── */}
      {viewMode==="timeline" && (
        <div className="card" style={{padding:"20px 24px"}}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:15,fontWeight:600,marginBottom:20,letterSpacing:"0.04em"}}>{YEAR} Investment Roadmap</div>

          {/* Mini bar chart */}
          <div style={{display:"flex",gap:4,alignItems:"flex-end",height:60,marginBottom:24}}>
            {MONTHS.map((m,i) => {
              const mProjects = byMonth[i+1]||[];
              const mInvest = mProjects.reduce((s,p)=>s+(parseFloat(p.investment)||0),0);
              const h = maxCumul > 0 ? Math.max((mInvest/maxCumul)*100,mInvest>0?8:0) : 0;
              return (
                <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:"100%",height:h+"%",background:mInvest>0?"var(--accent)":"var(--surface3)",borderRadius:"3px 3px 0 0",minHeight:mInvest>0?4:2,transition:"height 0.3s"}} title={mInvest>0?fmt(mInvest):""}/>
                  <div style={{fontSize:9,color:"var(--text3)",fontFamily:"DM Mono"}}>{m}</div>
                </div>
              );
            })}
          </div>

          {/* Month lanes */}
          {MONTHS.map((m,i) => {
            const mProjects = byMonth[i+1]||[];
            if (mProjects.length === 0) return null;
            return (
              <div key={m} style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"var(--accentBg)",border:"1px solid var(--accentBorder)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontFamily:"DM Mono",fontSize:11,color:"var(--accent)",fontWeight:500}}>{m}</span>
                  </div>
                  <div style={{flex:1,height:1,background:"var(--border)"}}/>
                  <span style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono"}}>{mProjects.length} project{mProjects.length>1?"s":""} · {fmt(mProjects.reduce((s,p)=>s+(parseFloat(p.investment)||0),0))}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10,paddingLeft:50}}>
                  {mProjects.map(p => (
                    <div key={p.id} style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius2)",padding:"14px 16px",borderLeft:"3px solid "+impactColors[p.impact]}}>
                      <div className="flex items-center justify-between" style={{marginBottom:8}}>
                        <div style={{fontFamily:"Syne,sans-serif",fontWeight:600,fontSize:13}}>{p.title}</div>
                        <span className={"tag "+statusColors[p.status]} style={{fontSize:9}}>{p.status}</span>
                      </div>
                      <div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono",marginBottom:10}}>{p.category}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div style={{background:"var(--surface3)",borderRadius:4,padding:"6px 8px"}}>
                          <div style={{fontSize:9,color:"var(--text3)",fontFamily:"DM Mono",marginBottom:2}}>INVEST</div>
                          <div style={{fontFamily:"DM Mono",fontSize:13,color:"var(--red)"}}>{fmt(p.investment)}</div>
                        </div>
                        <div style={{background:"var(--surface3)",borderRadius:4,padding:"6px 8px"}}>
                          <div style={{fontSize:9,color:"var(--text3)",fontFamily:"DM Mono",marginBottom:2}}>PROJ REV</div>
                          <div style={{fontFamily:"DM Mono",fontSize:13,color:"var(--accent)"}}>{p.projectedRevenue>0?fmt(p.projectedRevenue):"—"}</div>
                        </div>
                      </div>
                      {p.notes && <div style={{fontSize:11,color:"var(--text3)",marginTop:10,lineHeight:1.5}}>{p.notes}</div>}
                      <div className="flex gap-8" style={{marginTop:10}}>
                        <button className="btn btn-ghost btn-sm" style={{padding:"3px 8px",fontSize:11}} onClick={()=>openEdit(p)}><Icon name="edit" size={11}/></button>
                        <button className="btn btn-ghost btn-sm" style={{padding:"3px 8px",fontSize:11,color:"var(--red)"}} onClick={()=>remove(p.id)}><Icon name="trash" size={11}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {projects.length === 0 && (
            <div className="empty"><div className="empty-icon">🚀</div><div className="empty-title">No projects yet</div><div className="empty-sub">Add your first project to start planning</div></div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode==="list" && (
        <div className="card" style={{padding:0}}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Category</th><th>Month</th><th>Status</th><th>Impact</th><th style={{textAlign:"right"}}>Investment</th><th style={{textAlign:"right"}}>Proj Revenue</th><th style={{textAlign:"right"}}>ROI</th><th/></tr></thead>
              <tbody>
                {filtered.length===0 ? <tr><td colSpan={9}><div className="empty" style={{padding:40}}><div className="empty-icon">📋</div><div className="empty-title">No projects</div></div></td></tr>
                : filtered.sort((a,b)=>a.month-b.month).map(p => (
                  <tr key={p.id}>
                    <td><div style={{fontWeight:500,fontSize:13}}>{p.title}</div>{p.notes&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.notes}</div>}</td>
                    <td><span className="tag tag-gray" style={{fontSize:10}}>{p.category}</span></td>
                    <td className="mono" style={{color:"var(--text3)",fontSize:12}}>{MONTHS[p.month-1]} {p.year}</td>
                    <td><span className={"tag "+statusColors[p.status]}>{p.status}</span></td>
                    <td><span style={{fontFamily:"DM Mono",fontSize:12,color:impactColors[p.impact],fontWeight:500}}>{p.impact}</span></td>
                    <td className="text-right"><span className="mono" style={{color:"var(--red)"}}>{fmt(p.investment)}</span></td>
                    <td className="text-right"><span className="mono" style={{color:"var(--accent)"}}>{p.projectedRevenue>0?fmt(p.projectedRevenue):"—"}</span></td>
                    <td className="text-right"><span className="mono" style={{color:p.roi>0?"var(--accent)":"var(--text3)"}}>{p.roi>0?p.roi+"%":"—"}</span></td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" style={{padding:"3px 6px"}} onClick={()=>openEdit(p)}><Icon name="edit" size={12}/></button>
                        <button className="btn btn-ghost btn-sm" style={{padding:"3px 6px",color:"var(--red)"}} onClick={()=>remove(p.id)}><Icon name="trash" size={12}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BOARD VIEW ── */}
      {viewMode==="board" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14}}>
          {STATUS_OPTS.map(status => {
            const statusProjects = projects.filter(p => p.status===status);
            return (
              <div key={status}>
                <div style={{fontFamily:"DM Mono",fontSize:10,textTransform:"uppercase",letterSpacing:"0.12em",color:"var(--text3)",marginBottom:10,padding:"0 4px"}}>{status} · {statusProjects.length}</div>
                {statusProjects.map(p => (
                  <div key={p.id} style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:"var(--radius2)",padding:"12px 14px",marginBottom:8,cursor:"pointer",borderLeft:"3px solid "+impactColors[p.impact]}} onClick={()=>openEdit(p)}>
                    <div style={{fontFamily:"Syne,sans-serif",fontWeight:600,fontSize:12,marginBottom:6}}>{p.title}</div>
                    <div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono",marginBottom:8}}>{MONTHS[p.month-1]} · {p.category}</div>
                    <div className="flex items-center justify-between">
                      <span style={{fontFamily:"DM Mono",fontSize:12,color:"var(--red)"}}>{fmt(p.investment)}</span>
                      {p.projectedRevenue>0&&<span style={{fontFamily:"DM Mono",fontSize:11,color:"var(--accent)"}}>+{fmt(p.projectedRevenue)}</span>}
                    </div>
                  </div>
                ))}
                {statusProjects.length===0&&<div style={{border:"1px dashed var(--border)",borderRadius:"var(--radius2)",padding:"20px",textAlign:"center",fontSize:11,color:"var(--text3)",fontFamily:"DM Mono"}}>empty</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Cash availability note */}
      <div className="card" style={{marginTop:16,background:"var(--surface2)"}}>
        <div className="flex items-center gap-12">
          <Icon name="info" size={18} color="var(--accent)"/>
          <div>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:600,fontSize:13,color:"var(--accent)"}}>Cash Availability Analysis</div>
            <div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>
              Based on current net income of <strong style={{color:"var(--accent)"}}>{fmt(net)}</strong>, you have approximately <strong style={{color:"var(--accent)"}}>{fmt(monthlyFree)}/month</strong> available for investments (30% of net).
              Total planned investment of <strong style={{color:totalInvestment>monthlyFree*12?"var(--red)":"var(--accent)"}}>{fmt(totalInvestment)}</strong> {totalInvestment>monthlyFree*12?"exceeds":"is within"} your 12-month capacity of <strong style={{color:"var(--accent)"}}>{fmt(monthlyFree*12)}</strong>.
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-header">
              <div className="modal-title">{editing?"Edit Project":"New Project"}</div>
              <button className="btn btn-ghost" style={{padding:4}} onClick={()=>setModal(false)}><Icon name="close" size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Project Title</label>
                <input className="input" placeholder="e.g. Launch Catering Service" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES_PROJ.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Impact</label>
                  <select className="input" value={form.impact} onChange={e=>setForm(f=>({...f,impact:e.target.value}))}>
                    {IMPACT_OPTS.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="label">Target Month</label>
                  <select className="input" value={form.month} onChange={e=>setForm(f=>({...f,month:parseInt(e.target.value)}))}>
                    {MONTHS.map((m,i)=><option key={i} value={i+1}>{m} {YEAR}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {STATUS_OPTS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="label">Investment Required ($)</label>
                  <input type="number" className="input" placeholder="0.00" value={form.investment} onChange={e=>setForm(f=>({...f,investment:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Projected Monthly Revenue ($)</label>
                  <input type="number" className="input" placeholder="0.00" value={form.projectedRevenue} onChange={e=>setForm(f=>({...f,projectedRevenue:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Notes & Strategy</label>
                <textarea className="input" rows={3} placeholder="What's the plan? Who's responsible? What resources are needed?" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{resize:"vertical"}}/>
              </div>
              {form.investment > 0 && form.projectedRevenue > 0 && (
                <div style={{background:"var(--accentBg)",border:"1px solid var(--accentBorder)",borderRadius:"var(--radius2)",padding:"12px 14px"}}>
                  <div style={{fontSize:12,color:"var(--text2)"}}>
                    Expected ROI: <strong style={{color:"var(--accent)"}}>{Math.round(((parseFloat(form.projectedRevenue)-parseFloat(form.investment))/parseFloat(form.investment))*100)}%</strong>
                    {" · "}Payback: <strong style={{color:"var(--accent)"}}>{parseFloat(form.projectedRevenue)>0?Math.ceil(parseFloat(form.investment)/parseFloat(form.projectedRevenue))+" months":"—"}</strong>
                    {" · "}Available cash: <strong style={{color:monthlyFree>=parseFloat(form.investment)?"var(--accent)":"var(--red)"}}>{monthlyFree>=parseFloat(form.investment)?"✓ within budget":"⚠ exceeds monthly free cash"}</strong>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!form.title}>{editing?"Save":"Add Project"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [transactions, setTransactions] = useState(SAMPLE_TRANSACTIONS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [budgets, setBudgets] = useState(SAMPLE_BUDGETS);
  const [bills, setBills] = useState([]);
  const YEAR_NOW = new Date().getFullYear();
  const [projects, setProjects] = useState([
    { id:"p1", title:"Launch Catering Service", category:"Revenue Growth", month:5, year:YEAR_NOW, status:"Planning", impact:"High", investment:2500, projectedRevenue:8000, notes:"Target corporate clients in Round Rock tech corridor.", cashRequired:2500, roi:220 },
    { id:"p2", title:"Google Ads Campaign", category:"Marketing", month:5, year:YEAR_NOW, status:"Idea", impact:"High", investment:800, projectedRevenue:4000, notes:"Target 'Brazilian restaurant Round Rock' keywords. Budget $200/week.", cashRequired:800, roi:400 },
    { id:"p3", title:"Install Inventory System", category:"Operations", month:6, year:YEAR_NOW, status:"Idea", impact:"Medium", investment:1200, projectedRevenue:0, notes:"Reduce food waste 15-20%. Estimated monthly savings: $400.", cashRequired:1200, roi:0 },
    { id:"p4", title:"QR Code Menu + Online Ordering", category:"Technology", month:7, year:YEAR_NOW, status:"Idea", impact:"Medium", investment:500, projectedRevenue:2000, notes:"Reduce labor on order taking. Increase check average.", cashRequired:500, roi:300 },
  ]);
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [dateRange, setDateRange] = useState({ start: firstOfMonth(), end: today() });

  // ── Core load function ─────────────────────────────────────
  const loadAll = useCallback(async (showSpinner = true) => {
    if (TENANT_ID === "demo") return;
    if (showSpinner) setSyncing(true);
    try {
      const [txns, cats, bgts, bls, projs] = await Promise.all([
        fetchTransactions(TENANT_ID, dateRange),
        fetchCategories(TENANT_ID),
        fetchBudgets(TENANT_ID),
        fetchBills(TENANT_ID),
        fetchProjects(TENANT_ID),
      ]);
      if (txns.length > 0)  setTransactions(txns.map(t => ({ ...t, category: t.category_id || UNCATEGORIZED })));
      if (cats.length > 0)  setCategories(cats.map(c => ({ ...c, taxLine: c.tax_line || "" })));
      if (bgts.length > 0)  setBudgets(bgts.map(b => ({ ...b, categoryId: b.category_id })));
      if (bls.length > 0)   setBills(bls.map(b => ({ ...b, dueDate: b.due_date, issueDate: b.issue_date, txnId: b.txn_id, category: b.category_id, paidDate: b.paid_date, paidMethod: b.paid_method })));
      if (projs.length > 0) setProjects(projs.map(p => ({ ...p, projectedRevenue: p.projected_revenue })));
    } catch (err) {
      console.error("loadAll failed:", err);
    } finally {
      if (showSpinner) setSyncing(false);
      setLastSync(new Date());
    }
  }, [dateRange]);

  // ── 1. Initial load + reload when dateRange changes ────────
  useEffect(() => { loadAll(true); }, [dateRange]);

  // ── 2. Polling every 30 seconds (silent refresh) ───────────
  useEffect(() => {
    if (TENANT_ID === "demo") return;
    const interval = setInterval(() => loadAll(false), 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // ── 3. Refresh when tab becomes visible (user returns) ─────
  useEffect(() => {
    if (TENANT_ID === "demo") return;
    const onVisible = () => { if (document.visibilityState === "visible") loadAll(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadAll]);

  // ── 4. Supabase real-time subscriptions ────────────────────
  useEffect(() => {
    if (TENANT_ID === "demo") return;
    const channel = supabase
      .channel("clariva-cfo-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "r7_ledger_transactions", filter: `tenant_id=eq.${TENANT_ID}` },
        () => loadAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "r7_ledger_accounts", filter: `tenant_id=eq.${TENANT_ID}` },
        () => loadAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "r7_ledger_budgets", filter: `tenant_id=eq.${TENANT_ID}` },
        () => loadAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "r7_ledger_bills", filter: `tenant_id=eq.${TENANT_ID}` },
        () => loadAll(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "r7_ledger_projects", filter: `tenant_id=eq.${TENANT_ID}` },
        () => loadAll(false))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { console.log("Clariva CFO: real-time active"); setRealtimeActive(true); }
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setRealtimeActive(false);
      });
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  // ── Save helpers ────────────────────────────────────────────
  const saveTransactions = async (txns) => {
    if (TENANT_ID === "demo") return;
    await upsertTransactions(txns, TENANT_ID);
  };

  const saveCategory = async (cat) => {
    if (TENANT_ID === "demo") return;
    await upsertCategory(cat, TENANT_ID);
  };

  const saveBudget = async (budget) => {
    if (TENANT_ID === "demo") return;
    await upsertBudget(budget, TENANT_ID);
  };

  const saveBill = async (bill) => {
    if (TENANT_ID === "demo") return;
    await upsertBill(bill, TENANT_ID);
  };

  const saveProject = async (project) => {
    if (TENANT_ID === "demo") return;
    await upsertProject(project, TENANT_ID);
  };

  // ── Kitchen sync handler ────────────────────────────────────
  const handleKitchenSync = async (imported) => {
    const existingIds = new Set(transactions.map(t => t.id));
    const newOnes = imported.filter(t => !existingIds.has(t.id));
    if (newOnes.length > 0) {
      setTransactions(prev => [...newOnes, ...prev]);
      await saveTransactions(newOnes);
    }
  };

  const showToast = (message, type = "info") => setToast({ message, type, id: Date.now() });

  // ── Filter transactions by date range ──────────────────────
  const filteredByDate = transactions.filter(t => t.date >= dateRange.start && t.date <= dateRange.end);
  const uncat = filteredByDate.filter(t => t.category === UNCATEGORIZED || !t.category).length;

  const NAV = [
    { id: "dashboard", label: "Overview", icon: "dashboard" },
    { id: "insights", label: "CFO Insights", icon: "insights" },
    { id: "projects", label: "Projects", icon: "projects" },
    { id: "transactions", label: "Transactions", icon: "transactions", badge: uncat > 0 ? uncat : null },
    { id: "categories", label: "Chart of Accounts", icon: "categories" },
    { id: "pl", label: "Profit & Loss", icon: "pl" },
    { id: "cashflow", label: "Cash Flow", icon: "cashflow" },
    { id: "budget", label: "Budget", icon: "budget" },
    { id: "bills", label: "Bills & Payments", icon: "bills", badge: null },
    { id: "reconcile", label: "Reconciliation", icon: "reconcile" },
    { id: "tax", label: "Tax Summary", icon: "tax" },
  ];

  const renderScreen = () => {
    switch (screen) {
      case "insights":     return <Insights transactions={filteredByDate} categories={categories} budgets={budgets} dateRange={dateRange} />;
      case "projects":     return <Projects transactions={filteredByDate} projects={projects} setProjects={setProjects} saveProject={saveProject} deleteProjectDB={async(id)=>{setProjects(p=>p.filter(x=>x.id!==id));if(TENANT_ID!=="demo")await deleteProject(id);}} dateRange={dateRange} />;
      case "dashboard":    return <Dashboard transactions={filteredByDate} categories={categories} budgets={budgets} dateRange={dateRange} />;
      case "transactions": return <Transactions transactions={filteredByDate} allTransactions={transactions} setTransactions={setTransactions} saveTransactions={saveTransactions} categories={categories} dateRange={dateRange} setDateRange={setDateRange} showToast={showToast} />;
      case "categories":   return <Categories categories={categories} setCategories={setCategories} saveCategory={saveCategory} deleteCategory={async(id)=>{setCategories(p=>p.filter(c=>c.id!==id));if(TENANT_ID!=="demo")await deleteCategory(id);}} transactions={filteredByDate} showToast={showToast} />;
      case "pl":           return <PLReport transactions={filteredByDate} categories={categories} dateRange={dateRange} />;
      case "cashflow":     return <CashFlow transactions={filteredByDate} categories={categories} dateRange={dateRange} />;
      case "budget":       return <Budget transactions={filteredByDate} categories={categories} budgets={budgets} setBudgets={setBudgets} saveBudget={saveBudget} showToast={showToast} />;
      case "bills":        return <Bills transactions={filteredByDate} setTransactions={setTransactions} bills={bills} setBills={setBills} saveBill={saveBill} deleteB={async(id)=>{setBills(p=>p.filter(b=>b.id!==id));if(TENANT_ID!=="demo")await deleteBill(id);}} categories={categories} dateRange={dateRange} showToast={showToast} saveTransactions={saveTransactions} />;
      case "reconcile":    return <Reconciliation transactions={filteredByDate} setTransactions={setTransactions} saveTransactions={saveTransactions} categories={categories} showToast={showToast} />;
      case "tax":          return <TaxSummary transactions={filteredByDate} categories={categories} dateRange={dateRange} />;
      default: return null;
    }
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="layout">
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" fill="var(--accent)"/>
              </svg>
            </div>
            <div className="logo-text">
              <div className="logo-mark">Clariva</div>
              <div className="logo-sub">CFO</div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-label">Finance</div>
            {NAV.map(item => (
              <div key={item.id} className={`nav-item ${screen === item.id ? "active" : ""}`} onClick={() => setScreen(item.id)}>
                <span className="nav-icon"><Icon name={item.icon} size={15} /></span>
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className="entity-pill">
              <strong>TorresBee</strong>
              Round Rock, TX
            </div>
          </div>
        </nav>

        <main className="main">
          {/* ── Global Top Bar ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            gap: 10, padding: "14px 32px 0",
            borderBottom: "1px solid var(--border)", marginBottom: 0,
            paddingBottom: 14,
            background: "var(--surface)",
            position: "sticky", top: 0, zIndex: 100
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
              {syncing ? (
                <span style={{ fontSize: 11, color: "var(--accent)", fontFamily: "DM Mono", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  Syncing...
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: realtimeActive ? "var(--accent)" : "var(--text3)", display: "inline-block" }} title={realtimeActive ? "Real-time connected" : "Polling mode"} />
                  {lastSync ? "Updated " + lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  {realtimeActive && <span style={{ color: "var(--accent)" }}>· Live</span>}
                </span>
              )}
              <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => loadAll(true)} title="Refresh data">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              </button>
            </div>
            <KitchenSyncButton
              tenantId={TENANT_ID}
              categories={categories}
              dateRange={dateRange}
              onSync={handleKitchenSync}
              showToast={showToast}
            />
            <DateRangePicker dateRange={dateRange} setDateRange={setDateRange} />
          </div>
          {renderScreen()}
        </main>
      </div>

      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
