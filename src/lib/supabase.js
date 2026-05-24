import { createClient } from '@supabase/supabase-js'
import { UNCATEGORIZED } from './constants.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)

const TENANT = () => import.meta.env.VITE_TENANT_ID || 'demo'

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
export async function fetchTransactions(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_ledger_transactions').select('*').eq('tenant_id', tenantId).order('date', { ascending: false })
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q
  if (error) { console.error('fetchTransactions', error); return [] }
  return data
}

export async function upsertTransactions(rows, tenantId) {
  if (!rows || rows.length === 0) return { ok: true, saved: 0 }
  const tid = tenantId || TENANT()
  if (tid === 'demo') return { ok: true, saved: rows.length, demo: true }
  const mapped = rows.map(t => ({
    id: t.id,
    tenant_id: tid,
    date: t.date,
    description: t.description,
    amount: t.amount,
    category_id: ((t.category && t.category !== UNCATEGORIZED) ? t.category : t.category_id) || null,
    recurring_id: t.recurring_id || t.recurringId || null,
    account_id: t.account_id || t.accountId || null,
    account: t.account || 'Imported',
    reconciled: t.reconciled || false,
    prior_period: t.prior_period || t.priorPeriod || false,
    tags: Array.isArray(t.tags) ? t.tags : [],
    source: t.source || 'manual',
    notes: t.notes || '',
  }))
  const { data, error } = await supabase.from('r7_ledger_transactions').upsert(mapped, { onConflict: 'id' }).select('id')
  if (error) {
    console.error('upsertTransactions', error, { firstRow: mapped[0] })
    return { ok: false, saved: 0, error: error.message || String(error), rows: rows.length }
  }
  return { ok: true, saved: (data || []).length }
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('r7_ledger_transactions').delete().eq('id', id)
  return !error
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
export async function fetchCategories(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_accounts').select('*').eq('tenant_id', tenantId).order('type', { ascending: false })
  if (error) { console.error('fetchCategories', error); return [] }
  return data
}

export async function upsertCategory(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = {
    id: row.id && !row.id.match(/^\d+$/) ? row.id : undefined,
    tenant_id: tid,
    name: row.name,
    type: row.type,
    color: row.color || '#555b6b',
    tax_line: row.taxLine || row.tax_line || '',
    is_default: row.is_default || false,
  }
  if (!mapped.id) delete mapped.id
  const { error } = await supabase.from('r7_ledger_accounts').upsert(mapped, { onConflict: 'id' })
  if (error) console.error('upsertCategory', error)
  return !error
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('r7_ledger_accounts').delete().eq('id', id)
  return !error
}

// ─── BUDGETS ──────────────────────────────────────────────────────────────────
export async function fetchBudgets(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_budgets').select('*').eq('tenant_id', tenantId)
  if (error) { console.error('fetchBudgets', error); return [] }
  return data
}

export async function upsertBudget(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = {
    tenant_id: tid,
    category_id: row.categoryId || row.category_id,
    monthly: row.monthly || 0,
    annual: row.annual || 0,
    year: row.year || new Date().getFullYear(),
  }
  const { error } = await supabase.from('r7_ledger_budgets').upsert(mapped, { onConflict: 'tenant_id,category_id,year' })
  if (error) console.error('upsertBudget', error)
  return !error
}

// ─── BILLS ────────────────────────────────────────────────────────────────────
export async function fetchBills(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_bills').select('*').eq('tenant_id', tenantId).order('due_date', { ascending: true })
  if (error) { console.error('fetchBills', error); return [] }
  return data
}

export async function upsertBill(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = {
    id: row.id || undefined,
    tenant_id: tid,
    txn_id: row.txnId || null,
    vendor: row.vendor,
    amount: row.amount,
    due_date: row.dueDate,
    issue_date: row.issueDate || row.dueDate,
    status: row.status || 'due',
    category_id: row.category || null,
    paid_date: row.paidDate || null,
    paid_method: row.paidMethod || null,
    notes: row.notes || '',
    source: row.source || 'manual',
  }
  const { error } = await supabase.from('r7_ledger_bills').upsert(mapped, { onConflict: 'id' })
  if (error) console.error('upsertBill', error)
  return !error
}

export async function deleteBill(id) {
  const { error } = await supabase.from('r7_ledger_bills').delete().eq('id', id)
  return !error
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
export async function fetchProjects(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_projects').select('*').eq('tenant_id', tenantId).order('month', { ascending: true })
  if (error) { console.error('fetchProjects', error); return [] }
  return data
}

export async function upsertProject(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = {
    id: row.id || undefined,
    tenant_id: tid,
    title: row.title,
    category: row.category || 'Other',
    month: row.month || new Date().getMonth() + 1,
    year: row.year || new Date().getFullYear(),
    status: row.status || 'Idea',
    impact: row.impact || 'Medium',
    investment: row.investment || 0,
    projected_revenue: row.projectedRevenue || 0,
    notes: row.notes || '',
    roi: row.roi || 0,
  }
  const { error } = await supabase.from('r7_ledger_projects').upsert(mapped, { onConflict: 'id' })
  if (error) console.error('upsertProject', error)
  return !error
}

export async function deleteProject(id) {
  const { error } = await supabase.from('r7_ledger_projects').delete().eq('id', id)
  return !error
}

// ─── BANK ACCOUNTS ────────────────────────────────────────────────────────────
export async function fetchBankAccounts(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_bank_accounts').select('*').eq('tenant_id', tenantId).order('name')
  if (error) { console.error('fetchBankAccounts', error); return [] }
  return data
}

export async function upsertBankAccount(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = {
    id: row.id || undefined,
    tenant_id: tid,
    name: row.name,
    type: row.type || 'checking',
    institution: row.institution || '',
    opening_balance: parseFloat(row.openingBalance ?? row.opening_balance ?? 0),
    opening_date: row.openingDate || row.opening_date || new Date().toISOString().split('T')[0],
    credit_limit: row.creditLimit != null && row.creditLimit !== '' ? parseFloat(row.creditLimit) : (row.credit_limit ?? null),
    status: row.status || 'active',
    notes: row.notes || '',
  }
  if (!mapped.id) delete mapped.id
  const { error } = await supabase.from('r7_ledger_bank_accounts').upsert(mapped, { onConflict: 'id' })
  if (error) console.error('upsertBankAccount', error)
  return !error
}

export async function deleteBankAccount(id) {
  const { error } = await supabase.from('r7_ledger_bank_accounts').delete().eq('id', id)
  return !error
}

// ─── RECURRING ────────────────────────────────────────────────────────────────
export async function fetchRecurring(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_recurring').select('*').eq('tenant_id', tenantId).order('name')
  if (error) { console.error('fetchRecurring', error); return [] }
  return data
}

export async function upsertRecurring(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = {
    id: row.id || undefined,
    tenant_id: tid,
    name: row.name,
    vendor_pattern: row.vendorPattern || row.vendor_pattern || '',
    category_id: row.categoryId || row.category_id || null,
    account: row.account || '',
    amount: parseFloat(row.amount) || 0,
    variance_pct: parseFloat(row.variancePct ?? row.variance_pct ?? 10),
    cadence: row.cadence || 'monthly',
    day_of_month: row.dayOfMonth ?? row.day_of_month ?? null,
    day_of_week: row.dayOfWeek ?? row.day_of_week ?? null,
    start_date: row.startDate || row.start_date || new Date().toISOString().split('T')[0],
    end_date: row.endDate || row.end_date || null,
    status: row.status || 'active',
    notes: row.notes || '',
  }
  if (!mapped.id) delete mapped.id
  const { error } = await supabase.from('r7_ledger_recurring').upsert(mapped, { onConflict: 'id' })
  if (error) console.error('upsertRecurring', error)
  return !error
}

export async function deleteRecurring(id) {
  const { error } = await supabase.from('r7_ledger_recurring').delete().eq('id', id)
  return !error
}

// ─── KITCHEN BRIDGE ───────────────────────────────────────────────────────────
// r7_purchases columns are: id, user_id, date, supplier, "vendorId" (camelCase!),
// items, total, invoice_path, tenant_id, ... Selecting * because the legacy
// names (vendor_id, status, invoice_url) don't exist on this table and used
// to silently 400-out — see ROADMAP "Bug hunt round 2".
export async function fetchKitchenPurchases(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_purchases').select('*').eq('tenant_id', tenantId).order('date', { ascending: false })
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q
  if (error) { console.error('fetchKitchenPurchases', error); return [] }
  return data
}

// NOTE: r7_snapshots is the Kitchen *inventory* snapshot table (label + counts),
// not Square POS revenue. The old fetchKitchenSnapshots / snapshotsToTransactions
// pair selected non-existent columns and was removed. Revenue now comes from
// "Sync Sales" (api/sync-square-sales). fetchKitchenStaff was also removed —
// r7_staff has no hourly_rate column, and labor rates come from Square Labor.

export async function fetchKitchenVendors(tenantId) {
  const { data, error } = await supabase.from('r7_vendors').select('id, name, email, phone').eq('tenant_id', tenantId).order('name')
  if (error) { console.error('fetchKitchenVendors', error); return [] }
  return data
}

export async function fetchTenant(tenantId) {
  const { data, error } = await supabase.from('r7_tenants').select('*').eq('id', tenantId).single()
  if (error) { console.error('fetchTenant', error); return null }
  return data
}

// ─── LABOR TIPS ───────────────────────────────────────────────────────────────
export async function fetchTipsDaily(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_labor_tips_daily').select('*').eq('tenant_id', tenantId).order('date', { ascending: false })
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q.limit(5000)
  if (error) { console.error('fetchTipsDaily', error); return [] }
  return data
}

export async function syncSquareSales(tenantId, range = {}) {
  const res = await fetch('/api/sync-square-sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId, start: range.start, end: range.end }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }))
    throw new Error(err.error || 'Server error ' + res.status)
  }
  return await res.json()
}

export async function syncSquareTips(tenantId, range = {}) {
  const res = await fetch('/api/sync-square-tips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId, start: range.start, end: range.end }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }))
    throw new Error(err.error || 'Server error ' + res.status)
  }
  return await res.json()
}

export async function applyTipPool(rowsByEmployee, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return { ok: true, demo: true }
  // rowsByEmployee = [{ date, team_member_id, employee_name, card_tips, pool_share, pool_method, pool_participant_count, pool_total }]
  const stamped = rowsByEmployee.map(r => ({
    ...r,
    tenant_id: tid,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase
    .from('r7_labor_tips_daily')
    .upsert(stamped, { onConflict: 'tenant_id,date,team_member_id' })
  if (error) { console.error('applyTipPool', error); return { ok: false, error: error.message } }
  return { ok: true }
}

// ─── PAYROLL RUNS ─────────────────────────────────────────────────────────────
export async function fetchPayrollRuns(tenantId) {
  const { data, error } = await supabase.from('r7_payroll_runs').select('*').eq('tenant_id', tenantId).order('period_end', { ascending: false })
  if (error) { console.error('fetchPayrollRuns', error); return [] }
  return data
}

export async function upsertPayrollRun(row, tenantId) {
  const tid = tenantId || TENANT()
  if (tid === 'demo') return { ok: true, demo: true }
  const mapped = {
    id: row.id || undefined,
    tenant_id: tid,
    period_start: row.period_start || row.periodStart,
    period_end: row.period_end || row.periodEnd,
    pay_date: row.pay_date || row.payDate || null,
    status: row.status || 'draft',
    lines: row.lines || [],
    totals: row.totals || {},
    notes: row.notes || '',
    submitted_at: row.submitted_at || row.submittedAt || null,
    reconciled_txn_id: row.reconciled_txn_id || row.reconciledTxnId || null,
    updated_at: new Date().toISOString(),
  }
  if (!mapped.id) delete mapped.id
  const { data, error } = await supabase.from('r7_payroll_runs').upsert(mapped, { onConflict: 'id' }).select('*').maybeSingle()
  if (error) { console.error('upsertPayrollRun', error); return { ok: false, error: error.message } }
  return { ok: true, data }
}

export async function deletePayrollRun(id) {
  const { error } = await supabase.from('r7_payroll_runs').delete().eq('id', id)
  return !error
}

// ─── SQUARE LABOR ─────────────────────────────────────────────────────────────
export async function fetchLaborShifts(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_labor_shifts').select('*').eq('tenant_id', tenantId).order('start_at', { ascending: false })
  if (start) q = q.gte('start_at', start)
  if (end)   q = q.lte('start_at', end + 'T23:59:59.999Z')
  const { data, error } = await q.limit(2000)
  if (error) { console.error('fetchLaborShifts', error); return [] }
  return data
}

export async function syncSquareLabor(tenantId, range = {}) {
  try {
    const res = await fetch('/api/sync-square-labor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, start: range.start, end: range.end }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }))
      throw new Error(err.error || 'Server error ' + res.status)
    }
    return await res.json()
  } catch (err) {
    console.error('syncSquareLabor', err)
    throw err
  }
}

// ─── BOOKINGS FORECAST ────────────────────────────────────────────────────────
// Goes through /api/forecast-bookings because r7_reservations has RLS that
// blocks the anon key. Returns upcoming demand + no-show rate + avg ticket
// in one payload for the Insights forecast card.
export async function fetchBookingsForecast(tenantId) {
  try {
    const res = await fetch('/api/forecast-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }))
      throw new Error(err.error || 'Server error ' + res.status)
    }
    return await res.json()
  } catch (err) {
    console.error('fetchBookingsForecast', err)
    return null
  }
}

// ─── MARKETING BRIDGE ─────────────────────────────────────────────────────────
// Goes through /api/sync-marketing because mkt_* tables have RLS that blocks
// the anon key the browser holds. The endpoint runs with the service role.
export async function fetchMarketingSpend(tenantId, { start, end } = {}) {
  try {
    const res = await fetch('/api/sync-marketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, start, end }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }))
      throw new Error(err.error || 'Server error ' + res.status)
    }
    return await res.json()
  } catch (err) {
    console.error('fetchMarketingSpend', err)
    throw err
  }
}

// ─── CONVERTERS ───────────────────────────────────────────────────────────────
export function purchasesToTransactions(purchases, vendorMap = {}, foodBevCategoryId) {
  return purchases.map(p => {
    // r7_purchases stores the supplier name inline AND a vendorId FK; prefer
    // the inline supplier (always populated by Kitchen's invoice scanner),
    // fall back to vendorMap lookup, then to a generic label.
    const vendor = p.supplier || vendorMap[p.vendorId] || vendorMap[p.vendor_id] || 'VENDOR PURCHASE';
    return {
      id: 'kitchen_purchase_' + p.id,
      date: p.date,
      description: String(vendor).toUpperCase(),
      amount: -(parseFloat(p.total) || 0),
      category_id: foodBevCategoryId || null,
      category: foodBevCategoryId || UNCATEGORIZED,
      account: 'Kitchen Sync',
      reconciled: false,
      source: 'kitchen_purchase',
      notes: p.invoice_path ? 'Invoice: ' + p.invoice_path : '',
    };
  })
}

