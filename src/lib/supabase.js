import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Ledger DB helpers ────────────────────────────────────────────────────────

export async function fetchTransactions(tenantId) {
  const { data, error } = await supabase
    .from('r7_ledger_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false })
  if (error) { console.error('fetchTransactions', error); return [] }
  return data
}

export async function upsertTransactions(rows) {
  const { error } = await supabase
    .from('r7_ledger_transactions')
    .upsert(rows, { onConflict: 'id' })
  if (error) console.error('upsertTransactions', error)
  return !error
}

export async function fetchCategories(tenantId) {
  const { data, error } = await supabase
    .from('r7_ledger_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('type', { ascending: true })
  if (error) { console.error('fetchCategories', error); return [] }
  return data
}

export async function upsertCategory(row) {
  const { error } = await supabase
    .from('r7_ledger_accounts')
    .upsert(row, { onConflict: 'id' })
  if (error) console.error('upsertCategory', error)
  return !error
}

export async function deleteCategory(id) {
  const { error } = await supabase
    .from('r7_ledger_accounts')
    .delete()
    .eq('id', id)
  return !error
}

export async function fetchBudgets(tenantId) {
  const { data, error } = await supabase
    .from('r7_ledger_budgets')
    .select('*')
    .eq('tenant_id', tenantId)
  if (error) { console.error('fetchBudgets', error); return [] }
  return data
}

export async function upsertBudget(row) {
  const { error } = await supabase
    .from('r7_ledger_budgets')
    .upsert(row, { onConflict: 'id' })
  if (error) console.error('upsertBudget', error)
  return !error
}

export async function fetchTenant(tenantId) {
  const { data, error } = await supabase
    .from('r7_tenants')
    .select('*')
    .eq('id', tenantId)
    .single()
  if (error) { console.error('fetchTenant', error); return null }
  return data
}
