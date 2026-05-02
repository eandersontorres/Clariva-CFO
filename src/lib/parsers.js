// api/parse-statement.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { pdfBase64, filename } = req.body
  if (!pdfBase64) return res.status(400).json({ error: 'No PDF data provided' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: `You are a bank statement parser. Extract every transaction from this PDF.

CRITICAL: Respond with ONLY a raw JSON array. No markdown. No explanation. No \`\`\`json fences. No text before or after. Start your response with [ and end with ].

Each object must have exactly:
- "date": "YYYY-MM-DD"
- "description": "MERCHANT NAME" (uppercase, max 60 chars)  
- "amount": number (negative=debit/purchase/withdrawal, positive=credit/deposit/payment received)
- "account": "Checking ••XXXX" or "Credit ••XXXX" using last 4 digits if visible

Rules:
- Include ALL transactions: purchases, deposits, transfers, fees, payments
- Credit card purchases → negative
- Credit card payments received → positive  
- Checking withdrawals → negative
- Checking deposits → positive
- Skip balance rows, totals, opening/closing balance lines
- If no account digits visible use "Bank of America"

Example: [{"date":"2025-01-03","description":"SYSCO FOODS","amount":-2340.50,"account":"Checking ••4821"}]`
            }
          ]
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(502).json({ error: 'Anthropic API error', detail: err.slice(0, 300) })
    }

    const data = await response.json()
    let rawText = (data.content?.[0]?.text || '').trim()

    // Aggressive cleaning — strip any markdown, leading/trailing text
    // Find first [ and last ] 
    const firstBracket = rawText.indexOf('[')
    const lastBracket = rawText.lastIndexOf(']')

    if (firstBracket === -1 || lastBracket === -1) {
      return res.status(422).json({
        error: 'AI did not return a JSON array. The PDF may be scanned/image-based or encrypted.',
        preview: rawText.slice(0, 300),
      })
    }

    const jsonStr = rawText.slice(firstBracket, lastBracket + 1)

    let transactions
    try {
      transactions = JSON.parse(jsonStr)
    } catch (e) {
      // Try to fix common issues: trailing commas, single quotes
      const fixed = jsonStr
        .replace(/,\s*([}\]])/g, '$1')  // trailing commas
        .replace(/'/g, '"')              // single quotes
      try {
        transactions = JSON.parse(fixed)
      } catch (e2) {
        return res.status(422).json({
          error: 'Could not parse transactions from PDF. Try downloading as CSV from Bank of America instead.',
          detail: e2.message,
        })
      }
    }

    if (!Array.isArray(transactions)) {
      return res.status(422).json({ error: 'Expected JSON array from AI' })
    }

    const sanitized = transactions
      .filter(t => t.date && t.description && typeof t.amount === 'number' && !isNaN(t.amount))
      .map((t, i) => ({
        id: `pdf_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        date: String(t.date).slice(0, 10),
        description: String(t.description).toUpperCase().trim().slice(0, 80),
        amount: parseFloat(t.amount),
        account: t.account || 'Bank of America',
        category_id: null,
        category: '10',
        reconciled: false,
        source: 'pdf',
      }))

    return res.status(200).json({ transactions: sanitized, count: sanitized.length })

  } catch (err) {
    console.error('parse-statement:', err)
    return res.status(500).json({ error: err.message })
  }
}
