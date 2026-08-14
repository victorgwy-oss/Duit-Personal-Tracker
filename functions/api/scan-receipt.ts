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

  // Send the receipt to one model. Resolves with the Response on success, or a
  // failure describing whether it's worth trying a different model.
  async function tryModel(
    model: string,
  ): Promise<{ ok: Response } | { ok: null; retryable: boolean; status: number; detail: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`
    let r: Response
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // A network error isn't the model's fault; another model won't fix it.
      return { ok: null, retryable: false, status: 502, detail: 'Could not reach Gemini.' }
    }
    if (r.ok) return { ok: r }
    const detail = await r.text().catch(() => '')
    // Retry with another model only when THIS model is the problem (retired,
    // unavailable, unknown). Bad key / quota / bad request repeat everywhere.
    const retryable =
      r.status === 404 || /not[\s_]*found|not[\s_]*supported|unavailable|deprecat/i.test(detail)
    return { ok: null, retryable, status: r.status, detail }
  }

  // 1) Try our known models. 2) If all are gone, ask Google which models exist
  // and try a suitable vision model. Either way a retirement self-heals.
  let res: Response | null = null
  let lastStatus = 502
  let lastDetail = ''
  const tried = new Set<string>()
  const attempt = async (models: string[]) => {
    for (const model of models) {
      if (!model || tried.has(model)) continue
      tried.add(model)
      const out = await tryModel(model)
      if (out.ok) return out.ok
      lastStatus = out.status
      lastDetail = out.detail
      if (!out.retryable) return null // fatal for every model — stop early
    }
    return null
  }

  res = await attempt(modelCandidates(env.GEMINI_MODEL))
  if (!res && lastDetail !== 'Could not reach Gemini.') {
    res = await attempt(await discoverModels(env.GEMINI_API_KEY))
  }

  if (!res) {
    return json(
      { error: `No available Gemini model (last status ${lastStatus}).`, detail: lastDetail.slice(0, 300) },
      502,
    )
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

// Ordered list of vision models to try. Newest/most-capable first; the rest are
// fallbacks so a retirement self-heals. If Google ever retires ALL of these,
// this is the single line to update (or set the GEMINI_MODEL env var, which is
// tried first). All support image input + JSON structured output on v1beta.
function modelCandidates(preferred?: string): string[] {
  const defaults = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
  const list = preferred ? [preferred, ...defaults] : defaults
  return Array.from(new Set(list.filter(Boolean)))
}

// Last-resort self-healing: ask the API which models the key can actually use,
// and return the image-capable Gemini models best-first. Only called when every
// hardcoded candidate has been retired, so scanning keeps working untouched.
async function discoverModels(key: string): Promise<string[]> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
    if (!r.ok) return []
    const data = await r.json<any>()
    const models: any[] = Array.isArray(data?.models) ? data.models : []
    return models
      .filter(
        (m) =>
          Array.isArray(m?.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent'),
      )
      .map((m) => String(m?.name ?? '').replace(/^models\//, ''))
      .filter((n) => /gemini/i.test(n) && /flash|pro/i.test(n) && !/embedding|aqa|image-generation/i.test(n))
      .sort((a, b) => rankModel(b) - rankModel(a))
  } catch {
    return []
  }
}

// Prefer flash (fast, cheap, multimodal) and newer version numbers.
function rankModel(name: string): number {
  let score = 0
  if (/flash/i.test(name)) score += 100
  const ver = name.match(/(\d+)\.(\d+)/)
  if (ver) score += Number(ver[1]) * 10 + Number(ver[2])
  if (/lite/i.test(name)) score -= 5
  if (/preview|exp/i.test(name)) score -= 20 // avoid unstable previews when a GA model exists
  return score
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
