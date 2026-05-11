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
  if (!rows || rows.length === 0) return true
  const tid = tenantId || TENANT()
  if (tid === 'demo') return true
  const mapped = rows.map(t => ({
    id: t.id,
    tenant_id: tid,
    date: t.date,
    description: t.description,
    amount: t.amount,
    category_id: t.category || t.category_id || null,
    recurring_id: t.recurring_id || t.recurringId || null,
    account_id: t.account_id || t.accountId || null,
    account: t.account || 'Imported',
    reconciled: t.reconciled || false,
    source: t.source || 'manual',
    notes: t.notes || '',
  }))
  const { error } = await supabase.from('r7_ledger_transactions').upsert(mapped, { onConflict: 'id' })
  if (error) console.error('upsertTransactions', error)
  return !error
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
export async function fetchKitchenPurchases(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_purchases').select('id, date, total, vendor_id, status, invoice_url').eq('tenant_id', tenantId).order('date', { ascending: false })
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q
  if (error) { console.error('fetchKitchenPurchases', error); return [] }
  return data
}

export async function fetchKitchenSnapshots(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_snapshots').select('id, date, gross_sales, net_sales, tips, orders, avg_ticket').eq('tenant_id', tenantId).order('date', { ascending: false })
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q
  if (error) { console.error('fetchKitchenSnapshots', error); return [] }
  return data
}

export async function fetchKitchenVendors(tenantId) {
  const { data, error } = await supabase.from('r7_vendors').select('id, name, email, phone').eq('tenant_id', tenantId).order('name')
  if (error) { console.error('fetchKitchenVendors', error); return [] }
  return data
}

export async function fetchKitchenStaff(tenantId) {
  const { data, error } = await supabase.from('r7_staff').select('id, name, role, hourly_rate').eq('tenant_id', tenantId).order('name')
  if (error) { console.error('fetchKitchenStaff', error); return [] }
  return data
}

export async function fetchTenant(tenantId) {
  const { data, error } = await supabase.from('r7_tenants').select('*').eq('id', tenantId).single()
  if (error) { console.error('fetchTenant', error); return null }
  return data
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
  return purchases.map(p => ({
    id: 'kitchen_purchase_' + p.id,
    date: p.date,
    description: (vendorMap[p.vendor_id] || 'VENDOR PURCHASE').toUpperCase(),
    amount: -(parseFloat(p.total) || 0),
    category_id: foodBevCategoryId || null,
    category: foodBevCategoryId || UNCATEGORIZED,
    account: 'Kitchen Sync',
    reconciled: p.status === 'paid',
    source: 'kitchen_purchase',
    notes: p.invoice_url ? 'Invoice: ' + p.invoice_url : '',
  }))
}

export function snapshotsToTransactions(snapshots, diningCategoryId) {
  return snapshots.map(s => ({
    id: 'kitchen_snapshot_' + s.id,
    date: s.date,
    description: 'SQUARE SALES — ' + (s.orders || 0) + ' ORDERS',
    amount: parseFloat(s.net_sales) || 0,
    category_id: diningCategoryId || null,
    category: diningCategoryId || UNCATEGORIZED,
    account: 'Square POS',
    reconciled: true,
    source: 'square_snapshot',
    notes: 'Gross: $' + s.gross_sales + ' | Tips: $' + s.tips + ' | Avg: $' + s.avg_ticket,
  }))
}
