import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, fetchTransactions, upsertTransactions, fetchCategories, upsertCategory, deleteCategory, fetchBudgets, upsertBudget } from "./lib/supabase.js";
import { parseBoACSV, parseOFX } from "./lib/parsers.js";

const TENANT_ID = import.meta.env.VITE_TENANT_ID || "demo";

// ─── STYLES ────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0b0e;
    --surface: #111318;
    --surface2: #181c22;
    --surface3: #1e232c;
    --border: rgba(255,255,255,0.07);
    --border2: rgba(255,255,255,0.12);
    --text: #e8eaf0;
    --text2: #8b909e;
    --text3: #555b6b;
    --accent: #00d4a0;
    --accent2: #00a87e;
    --accentBg: rgba(0,212,160,0.08);
    --accentBorder: rgba(0,212,160,0.2);
    --red: #f05e5e;
    --redBg: rgba(240,94,94,0.08);
    --yellow: #f0c84a;
    --yellowBg: rgba(240,200,74,0.08);
    --blue: #4a9ff0;
    --blueBg: rgba(74,159,240,0.08);
    --purple: #a47ff0;
    --purpleBg: rgba(164,127,240,0.08);
    --sidebar: 220px;
    --radius: 10px;
    --radius2: 6px;
  }

  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }
  #root { height: 100%; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }

  .layout { display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: var(--sidebar);
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow-y: auto;
  }
  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid var(--border);
  }
  .logo-mark { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .logo-sub { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text3); letter-spacing: 0.08em; margin-top: 2px; }
  .sidebar-section { padding: 16px 10px 8px; }
  .sidebar-section-label { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text3); padding: 0 8px 8px; font-family: 'DM Mono', monospace; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: var(--radius2);
    cursor: pointer; transition: all 0.15s;
    font-size: 13px; color: var(--text2); font-weight: 400;
    margin-bottom: 1px;
  }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active { background: var(--accentBg); color: var(--accent); }
  .nav-item.active .nav-icon { color: var(--accent); }
  .nav-icon { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.7; }
  .nav-item.active .nav-icon { opacity: 1; }
  .nav-badge { margin-left: auto; background: var(--red); color: #fff; font-size: 10px; border-radius: 99px; padding: 1px 6px; font-family: 'DM Mono', monospace; }
  .sidebar-footer { margin-top: auto; padding: 14px 12px; border-top: 1px solid var(--border); }
  .entity-pill { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius2); padding: 8px 10px; font-size: 11px; color: var(--text2); }
  .entity-pill strong { display: block; color: var(--text); font-size: 12px; font-family: 'Syne', sans-serif; }

  /* MAIN */
  .main { flex: 1; overflow-y: auto; background: var(--bg); }
  .page { padding: 28px 32px; max-width: 1300px; }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
  .page-title { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700; color: var(--text); }
  .page-subtitle { font-size: 12px; color: var(--text3); margin-top: 3px; font-family: 'DM Mono', monospace; }

  /* BUTTONS */
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius2); font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; font-family: 'DM Sans', sans-serif; }
  .btn-primary { background: var(--accent); color: #0a0b0e; }
  .btn-primary:hover { background: #00f0b8; }
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
  .kpi-value { font-family: 'DM Mono', monospace; font-size: 26px; font-weight: 500; color: var(--text); margin: 6px 0 4px; letter-spacing: -0.02em; }
  .kpi-delta { font-size: 11px; font-family: 'DM Mono', monospace; }
  .kpi-delta.pos { color: var(--accent); }
  .kpi-delta.neg { color: var(--red); }
  .kpi-accent { border-top: 2px solid var(--accent); }
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
  .modal-title { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; }
  .modal-body { padding: 20px; }
  .modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; }

  /* UPLOAD ZONE */
  .upload-zone { border: 2px dashed var(--border2); border-radius: var(--radius); padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--accent); background: var(--accentBg); }
  .upload-icon { font-size: 32px; margin-bottom: 12px; }
  .upload-title { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
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

  /* P&L REPORT */
  .pl-section { margin-bottom: 8px; }
  .pl-header { background: var(--surface2); padding: 10px 14px; border-radius: var(--radius2); font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .pl-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px 8px 24px; border-bottom: 1px solid var(--border); }
  .pl-row:hover { background: var(--surface2); }
  .pl-row-name { font-size: 13px; color: var(--text2); }
  .pl-total { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--surface3); border-radius: var(--radius2); margin: 4px 0; }
  .pl-total-label { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; }
  .pl-net { background: var(--accentBg); border: 1px solid var(--accentBorder); padding: 14px 18px; border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  .pl-net-label { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800; color: var(--text); }

  /* BUDGET */
  .budget-row { display: grid; grid-template-columns: 1fr 130px 130px 130px 100px; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .budget-header { font-size: 10px; color: var(--text3); font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; padding: 0 0 8px; }
  .budget-progress { }

  /* CATEGORY COLOR SWATCH */
  .swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }

  /* TOAST */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius); padding: 12px 18px; font-size: 13px; z-index: 9999; display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
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
  { id: "10", name: "Uncategorized", type: "expense", color: "#555b6b", taxLine: "" },
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

// parseBoACSV and parseOFX imported from ./lib/parsers.js

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
function Dashboard({ transactions, categories, budgets }) {
  const totalIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const netIncome = totalIncome - totalExpense;
  const uncat = transactions.filter(t => t.category === "10").length;

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
          <div className="page-subtitle">January 2025 · TorresBee Restaurant</div>
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
function Transactions({ transactions, setTransactions, categories, showToast }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();

  const filtered = transactions.filter(t => {
    if (filter === "income" && t.amount < 0) return false;
    if (filter === "expense" && t.amount > 0) return false;
    if (filter === "uncat" && t.category !== "10") return false;
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      let parsed = [];
      if (file.name.toLowerCase().endsWith(".ofx") || file.name.toLowerCase().endsWith(".qfx")) {
        parsed = parseOFX(text);
      } else {
        parsed = parseBoACSV(text);
      }
      if (parsed.length === 0) { showToast("No transactions found in file. Check the format.", "error"); return; }
      setTransactions(prev => [...parsed, ...prev]);
      showToast(`${parsed.length} transactions imported successfully!`, "success");
    };
    reader.readAsText(file);
  };

  const updateCategory = (id, catId) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: catId } : t));
  };

  const toggleReconcile = (id) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, reconciled: !t.reconciled } : t));
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
          <div className="page-subtitle">{transactions.length} transactions · {transactions.filter(t => t.category === "10").length} uncategorized</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => fileRef.current.click()}>
          <Icon name="upload" size={13} /> Import CSV / OFX
        </button>
        <input type="file" ref={fileRef} accept=".csv,.ofx,.qfx" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Upload drop zone */}
      <div className="upload-zone mb-16"
        style={{ padding: "20px", textAlign: "left", display: "flex", alignItems: "center", gap: 16 }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current.click()}
        className={`upload-zone mb-16 ${drag ? "drag" : ""}`}
      >
        <div style={{ fontSize: 24 }}><Icon name="bank" size={28} color="var(--accent)" /></div>
        <div>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 600, fontSize: 14 }}>Drop your Bank of America statement here</div>
          <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "DM Mono", marginTop: 3 }}>Supports CSV and OFX/QFX · Drag & drop or click to browse</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono", textAlign: "right" }}>
          BoA Online → Statements → Download<br />Select .CSV or .OFX format
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
                    <select className="cat-select" value={t.category} onChange={e => updateCategory(t.id, e.target.value)}>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
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
function Categories({ categories, setCategories, transactions, showToast }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", type: "expense", color: "#f05e5e", taxLine: "" });
  const [editing, setEditing] = useState(null);

  const COLORS = ["#f05e5e", "#f0c84a", "#4a9ff0", "#a47ff0", "#00d4a0", "#f0904a", "#4af0d0", "#90a0b0", "#e06090", "#60c0e0"];
  const TAX_LINES = ["COGS", "Wages", "Rent", "Advertising", "Depreciation", "Insurance", "Office", "Utilities", "Repairs", "Travel", "Meals", "Gross Receipts", "Other Income", ""];

  const openAdd = () => { setEditing(null); setForm({ name: "", type: "expense", color: "#f05e5e", taxLine: "" }); setModal(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ name: c.name, type: c.type, color: c.color, taxLine: c.taxLine }); setModal(true); };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) {
      setCategories(prev => prev.map(c => c.id === editing ? { ...c, ...form } : c));
      showToast("Category updated", "success");
    } else {
      setCategories(prev => [...prev, { id: Date.now().toString(), ...form }]);
      showToast("Category created", "success");
    }
    setModal(false);
  };

  const remove = (id) => {
    if (id === "10") { showToast("Cannot delete Uncategorized", "error"); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    setTransactions && setTransactions(prev => prev.map(t => t.category === id ? { ...t, category: "10" } : t));
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
                {c.id !== "10" && <button className="btn btn-ghost" style={{ padding: "4px 6px", color: "var(--red)" }} onClick={() => remove(c.id)}><Icon name="trash" size={13} /></button>}
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
function PLReport({ transactions, categories }) {
  const [period, setPeriod] = useState("monthly");
  const [expanded, setExpanded] = useState({ income: true, expense: true });

  const incomeCats = categories.filter(c => c.type === "income");
  const expenseCats = categories.filter(c => c.type === "expense" && c.id !== "10");

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
          <div className="page-subtitle">January 2025 · TorresBee Restaurant</div>
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
function CashFlow({ transactions, categories }) {
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
function Budget({ transactions, categories, budgets, setBudgets, showToast }) {
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

  const expCats = categories.filter(c => c.type === "expense" && c.id !== "10");
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
                  onBlur={() => showToast("Budget saved", "success")}
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
function TaxSummary({ transactions, categories }) {
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [transactions, setTransactions] = useState(SAMPLE_TRANSACTIONS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [budgets, setBudgets] = useState(SAMPLE_BUDGETS);
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // ── Supabase sync on mount ──────────────────────────────────
  useEffect(() => {
    if (TENANT_ID === 'demo') return;
    const load = async () => {
      setSyncing(true);
      const [txns, cats, bgts] = await Promise.all([
        fetchTransactions(TENANT_ID),
        fetchCategories(TENANT_ID),
        fetchBudgets(TENANT_ID),
      ]);
      if (txns.length > 0) setTransactions(txns.map(t => ({ ...t, category: t.category_id || '10' })));
      if (cats.length > 0) setCategories(cats.map(c => ({ ...c, taxLine: c.tax_line || '' })));
      if (bgts.length > 0) setBudgets(bgts.map(b => ({ ...b, categoryId: b.category_id })));
      setSyncing(false);
    };
    load();
  }, []);


  const showToast = (message, type = "info") => setToast({ message, type, id: Date.now() });

  const uncat = transactions.filter(t => t.category === "10").length;

  const NAV = [
    { id: "dashboard", label: "Overview", icon: "dashboard" },
    { id: "transactions", label: "Transactions", icon: "transactions", badge: uncat > 0 ? uncat : null },
    { id: "categories", label: "Chart of Accounts", icon: "categories" },
    { id: "pl", label: "Profit & Loss", icon: "pl" },
    { id: "cashflow", label: "Cash Flow", icon: "cashflow" },
    { id: "budget", label: "Budget", icon: "budget" },
    { id: "reconcile", label: "Reconciliation", icon: "reconcile" },
    { id: "tax", label: "Tax Summary", icon: "tax" },
  ];

  const renderScreen = () => {
    switch (screen) {
      case "dashboard": return <Dashboard transactions={transactions} categories={categories} budgets={budgets} />;
      case "transactions": return <Transactions transactions={transactions} setTransactions={setTransactions} categories={categories} showToast={showToast} />;
      case "categories": return <Categories categories={categories} setCategories={setCategories} transactions={transactions} showToast={showToast} />;
      case "pl": return <PLReport transactions={transactions} categories={categories} />;
      case "cashflow": return <CashFlow transactions={transactions} categories={categories} />;
      case "budget": return <Budget transactions={transactions} categories={categories} budgets={budgets} setBudgets={setBudgets} showToast={showToast} />;
      case "reconcile": return <Reconciliation transactions={transactions} categories={categories} showToast={showToast} />;
      case "tax": return <TaxSummary transactions={transactions} categories={categories} />;
      default: return null;
    }
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="layout">
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">Clariva</div>
            <div className="logo-sub">LEDGER · v1.0</div>
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
          {renderScreen()}
        </main>
      </div>

      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
