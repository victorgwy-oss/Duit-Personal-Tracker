// Cloudflare Pages Function — POST /api/scan-receipt
// Receives a receipt image (base64) from the app, asks Google Gemini to extract
// structured fields, and returns them. The GEMINI_API_KEY lives only here as a
// server-side environment secret, so it is never exposed to the browser.

interface Env {
  GEMINI_API_KEY: string
  GEMINI_MODEL?: string
}

interface ScanRequest {
  image: string // base64 (no data: prefix)
  mimeType: string
}

const PROMPT = `You are a receipt parser. Read this receipt image and return ONLY JSON matching the schema.
- vendor: the shop/merchant name, or null.
- total: the final amount actually paid (grand total after tax/rounding) as a number, or null.
- date: purchase date as YYYY-MM-DD, or null.
- currency: currency code/symbol if shown (e.g. "RM"), or null.
- items: array of { name, price } line items (price is a number or null). Omit subtotals/tax lines.
Do not guess. Use null when unsure.`

const schema = {
  type: 'object',
  properties: {
    vendor: { type: 'string', nullable: true },
    total: { type: 'number', nullable: true },
    date: { type: 'string', nullable: true },
    currency: { type: 'string', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number', nullable: true },
        },
        required: ['name'],
      },
    },
  },
  required: ['vendor', 'total', 'date', 'items'],
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'Scanner not configured: GEMINI_API_KEY missing.' }, 500)
  }

  let body: ScanRequest
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  if (!body.image) return json({ error: 'No image provided.' }, 400)

  const model = env.GEMINI_MODEL || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`

  const payload = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: body.mimeType || 'image/jpeg', data: body.image } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return json({ error: 'Could not reach Gemini.' }, 502)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return json({ error: `Gemini error (${res.status})`, detail: detail.slice(0, 300) }, 502)
  }

  const data = await res.json<any>()
  const textOut: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textOut) return json({ error: 'Empty response from Gemini.' }, 502)

  let parsed: unknown
  try {
    parsed = JSON.parse(textOut)
  } catch {
    return json({ error: 'Gemini returned unparseable JSON.' }, 502)
  }

  // Normalise to the ScanResult shape the client expects.
  const p = parsed as Record<string, unknown>
  const result = {
    vendor: (p.vendor as string) ?? null,
    total: typeof p.total === 'number' ? p.total : null,
    date: (p.date as string) ?? null,
    currency: (p.currency as string) ?? null,
    items: Array.isArray(p.items) ? p.items : [],
  }
  return json(result, 200)
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
