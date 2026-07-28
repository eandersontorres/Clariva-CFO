// api/anthropic.js — generic passthrough to the Anthropic Messages API.
//
// This forwards an arbitrary request body on the org's ANTHROPIC_API_KEY, so
// an open version is a blank cheque: any caller picks the model, the prompt
// and the token count, and it bills us. It previously sent
// `Access-Control-Allow-Origin: *` with no auth at all, which meant any web
// page on the internet could drive it from a visitor's browser.
//
// Now: a logged-in operator (or CRON_SECRET) is required, and the CORS
// allowlist is explicit. Same-origin calls from the CFO app need no CORS at
// all; the allowlist exists only for sibling Favo apps on other domains.
//
// NOTE: nothing in this repo calls this endpoint — the PDF flows go through
// parse-statement / parse-paystub / parse-aggregator-statement instead. It is
// kept (gated) rather than deleted because CLAUDE.md still documents it as the
// canonical proxy. If no sibling app uses it, delete it outright.

import { authorizeSession } from './_auth.js'

const DEFAULT_ALLOWED = [
  'https://cfo.clariva.cloud',
  'https://cfo.favo.team',
]

function allowedOrigins() {
  const fromEnv = (process.env.FAVO_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return fromEnv.length ? fromEnv : DEFAULT_ALLOWED
}

export default async function handler(req, res) {
  const origin = req.headers?.origin
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authorizeSession(req, res)
  if (!auth.ok) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
