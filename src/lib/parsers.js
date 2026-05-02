/**
 * Parse Bank of America CSV export
 * BoA formats:
 *   Format A: Date,Description,Amount,Running Bal.
 *   Format B: "Posted Date","Reference Number","Payee","Address","Amount"
 */
export function parseBoACSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  const transactions = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV respecting quoted fields
    const cols = parseCSVLine(line)
    if (cols.length < 3) continue

    // Skip header rows
    const firstCol = cols[0].toLowerCase()
    if (firstCol === 'date' || firstCol === 'posted date' || firstCol.startsWith('account')) continue

    // Try different column positions
    let date = '', desc = '', amtStr = ''

    if (cols.length >= 4) {
      // Format A: Date, Description, Amount, Running Bal
      date = cols[0]
      desc = cols[1]
      amtStr = cols[2]
    } else if (cols.length >= 5) {
      // Format B: Posted Date, Reference, Payee, Address, Amount
      date = cols[0]
      desc = cols[2] || cols[1]
      amtStr = cols[4]
    }

    const amount = parseFloat(amtStr.replace(/[$,\s]/g, ''))
    if (isNaN(amount)) continue

    let parsedDate
    try {
      const d = new Date(date)
      if (isNaN(d.getTime())) continue
      parsedDate = d.toISOString().split('T')[0]
    } catch { continue }

    transactions.push({
      id: `csv_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      date: parsedDate,
      description: desc.toUpperCase().trim().slice(0, 80),
      amount,
      category_id: 'uncategorized',
      account: 'Imported · BoA',
      reconciled: false,
      source: 'csv',
    })
  }

  return transactions
}

/**
 * Parse OFX / QFX (Quicken Financial Exchange)
 * Standard format used by all US banks
 */
export function parseOFX(text) {
  const transactions = []
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []

  // Also try SGML-style (no closing tags)
  const sgmlBlocks = []
  if (blocks.length === 0) {
    const stmtMatch = text.match(/<BANKTRANLIST>([\s\S]*?)<\/BANKTRANLIST>/i)
    if (stmtMatch) {
      const trns = stmtMatch[1].split('<STMTTRN>').slice(1)
      sgmlBlocks.push(...trns)
    }
  }

  const processBlock = (block) => {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'))
      return m ? m[1].trim() : ''
    }

    const dtPosted = get('DTPOSTED')
    const name = get('NAME') || get('MEMO') || get('PAYEE') || 'UNKNOWN'
    const amtStr = get('TRNAMT')
    const fitid = get('FITID')

    if (!dtPosted || !amtStr) return null

    const amount = parseFloat(amtStr)
    if (isNaN(amount)) return null

    // OFX date format: YYYYMMDDHHMMSS or YYYYMMDD
    const year = dtPosted.slice(0, 4)
    const month = dtPosted.slice(4, 6)
    const day = dtPosted.slice(6, 8)

    return {
      id: fitid ? `ofx_${fitid}` : `ofx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: `${year}-${month}-${day}`,
      description: name.toUpperCase().trim().slice(0, 80),
      amount,
      category_id: 'uncategorized',
      account: 'Imported · BoA',
      reconciled: false,
      source: 'ofx',
    }
  }

  ;[...blocks, ...sgmlBlocks].forEach(block => {
    const txn = processBlock(block)
    if (txn) transactions.push(txn)
  })

  return transactions
}

// CSV line parser that respects quoted fields
function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current.trim())
  return cols
}
