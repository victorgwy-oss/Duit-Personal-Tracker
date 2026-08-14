// Client side of the receipt scanner. The image is POSTed to our own
// /api/scan-receipt endpoint (a Cloudflare Pages Function) which holds the
// Gemini API key server-side — the key is never exposed to the browser.

export interface ScanResult {
  vendor: string | null
  total: number | null
  date: string | null // ISO yyyy-mm-dd
  currency: string | null
  items: { name: string; price: number | null }[]
}

export class ScanUnavailableError extends Error {}

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<ScanResult> {
  let res: Response
  try {
    res = await fetch('/api/scan-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, mimeType }),
    })
  } catch {
    throw new ScanUnavailableError('Scanner endpoint not reachable.')
  }

  if (res.status === 404) {
    throw new ScanUnavailableError(
      'Receipt scanning isn’t wired up yet. It activates once the app is deployed with a Gemini key.',
    )
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg || `Scan failed (${res.status}).`)
  }
  return (await res.json()) as ScanResult
}

// Read a File into a base64 string (without the data: prefix) for the API.
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? ''
      resolve({ base64, mimeType: file.type || 'image/jpeg' })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
