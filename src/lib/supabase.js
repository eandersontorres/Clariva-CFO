import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Ledger tables ────────────────────────────────────────────────────────────

export async function fetchTransactions(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_ledger_transactions').select('*').eq('tenant_id', tenantId).order('date', { ascending: false })
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q
  if (error) { console.error('fetchTransactions', error); return [] }
  return data
}

export async function upsertTransactions(rows) {
  const { error } = await supabase.from('r7_ledger_transactions').upsert(rows, { onConflict: 'id' })
  if (error) console.error('upsertTransactions', error)
  return !error
}

export async function fetchCategories(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_accounts').select('*').eq('tenant_id', tenantId).order('type', { ascending: false })
  if (error) { console.error('fetchCategories', error); return [] }
  return data
}

export async function upsertCategory(row) {
  const { error } = await supabase.from('r7_ledger_accounts').upsert(row, { onConflict: 'id' })
  if (error) console.error('upsertCategory', error)
  return !error
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('r7_ledger_accounts').delete().eq('id', id)
  return !error
}

export async function fetchBudgets(tenantId) {
  const { data, error } = await supabase.from('r7_ledger_budgets').select('*').eq('tenant_id', tenantId)
  if (error) { console.error('fetchBudgets', error); return [] }
  return data
}

export async function upsertBudget(row) {
  const { error } = await supabase.from('r7_ledger_budgets').upsert(row, { onConflict: 'id' })
  if (error) console.error('upsertBudget', error)
  return !error
}

// ─── Kitchen Bridge ───────────────────────────────────────────────────────────

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

export async function fetchKitchenWaste(tenantId, { start, end } = {}) {
  let q = supabase.from('r7_prod_orders').select('id, date, waste, status').eq('tenant_id', tenantId).not('waste', 'is', null)
  if (start) q = q.gte('date', start)
  if (end)   q = q.lte('date', end)
  const { data, error } = await q
  if (error) { console.error('fetchKitchenWaste', error); return [] }
  return data
}

export async function fetchKitchenItems(tenantId) {
  const { data, error } = await supabase.from('r7_items').select('id, name, cost, price, stock').eq('tenant_id', tenantId).order('name')
  if (error) { console.error('fetchKitchenItems', error); return [] }
  return data
}

export async function fetchTenant(tenantId) {
  const { data, error } = await supabase.from('r7_tenants').select('*').eq('id', tenantId).single()
  if (error) { console.error('fetchTenant', error); return null }
  return data
}

// ─── Converters ───────────────────────────────────────────────────────────────

export function purchasesToTransactions(purchases, vendorMap = {}, foodBevCategoryId) {
  return purchases.map(p => ({
    id: 'kitchen_purchase_' + p.id,
    date: p.date,
    description: (vendorMap[p.vendor_id] || 'VENDOR PURCHASE').toUpperCase(),
    amount: -(parseFloat(p.total) || 0),
    category_id: foodBevCategoryId || null,
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
    account: 'Square POS',
    reconciled: true,
    source: 'square_snapshot',
    notes: 'Gross: $' + s.gross_sales + ' | Tips: $' + s.tips + ' | Avg: $' + s.avg_ticket,
  }))
}
