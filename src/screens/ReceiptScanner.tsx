import { useRef, useState } from 'react'
import Sheet from '../components/Sheet'
import { scanReceipt, ScanUnavailableError, type ScanResult } from '../lib/scan'
import { useAccounts, useCategories } from '../hooks/useData'
import { addTransaction, updateTransaction } from '../lib/repo'
import { compressImage, blobToBase64 } from '../lib/image'
import { saveReceiptImage } from '../lib/receipts'
import { todayISO } from '../lib/format'
import { CameraIcon, UploadIcon, CheckIcon } from '../components/icons'

type Stage = 'capture' | 'scanning' | 'review' | 'error'

export default function ReceiptScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('capture')
  const [preview, setPreview] = useState<string>('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)

  // Editable review fields
  const [vendor, setVendor] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  function reset() {
    setStage('capture')
    setPreview('')
    setError('')
    setResult(null)
    setImageBlob(null)
    setSaving(false)
  }

  function close() {
    reset()
    onClose()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStage('scanning')
    try {
      // Shrink once, then reuse the small image for both the AI scan and storage.
      const blob = await compressImage(file)
      setImageBlob(blob)
      setPreview(URL.createObjectURL(blob))
      const { base64, mimeType } = await blobToBase64(blob)
      const res = await scanReceipt(base64, mimeType)
      setResult(res)
      setVendor(res.vendor ?? '')
      setAmount(res.total != null ? String(res.total) : '')
      setDate(res.date ?? todayISO())
      setAccountId(accounts?.find((a) => a.type === 'card')?.id ?? accounts?.[0]?.id ?? '')
      // Guess a category from vendor/items text later; default to first for now.
      setCategoryId(categories?.[0]?.id ?? '')
      setStage('review')
    } catch (err) {
      setError(
        err instanceof ScanUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not read the receipt.',
      )
      setStage('error')
    }
  }

  async function saveFromScan() {
    const value = parseFloat(amount || '0')
    if (!(value > 0) || !accountId || !categoryId || saving) return
    setSaving(true)
    try {
      const txn = await addTransaction({
        date,
        amount: value,
        accountId,
        categoryId,
        note: vendor.trim(),
        source: 'manual',
      })
      // Attach the receipt image. If storage/migration isn't ready, keep the
      // transaction anyway — the photo is a bonus, not a blocker.
      if (imageBlob) {
        try {
          const path = await saveReceiptImage(txn.id, imageBlob)
          await updateTransaction(txn.id, { receiptPath: path })
        } catch (err) {
          console.warn('receipt image not saved', err)
        }
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Scan receipt" full>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {stage === 'capture' && (
        <div className="flex flex-col items-center justify-center gap-4 py-10">
          <div className="h-20 w-20 rounded-2xl bg-ink-800 flex items-center justify-center text-brand-400">
            <CameraIcon width={40} height={40} />
          </div>
          <p className="text-center text-ink-400 text-sm max-w-xs">
            Snap a photo of a receipt and we’ll pull out the vendor, total and date for you to confirm.
          </p>
          <div className="w-full space-y-2 mt-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="w-full py-3.5 rounded-xl bg-brand-500 text-ink-950 font-semibold flex items-center justify-center gap-2"
            >
              <CameraIcon width={20} height={20} /> Take photo
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="w-full py-3.5 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 flex items-center justify-center gap-2"
            >
              <UploadIcon width={20} height={20} /> Choose from gallery
            </button>
          </div>
        </div>
      )}

      {stage === 'scanning' && (
        <div className="flex flex-col items-center gap-4 py-10">
          {preview && <img src={preview} alt="receipt" className="max-h-64 rounded-xl border border-ink-700" />}
          <div className="flex items-center gap-2 text-ink-300">
            <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            Reading receipt…
          </div>
        </div>
      )}

      {stage === 'review' && (
        <div className="space-y-4">
          {preview && (
            <img src={preview} alt="receipt" className="max-h-40 mx-auto rounded-xl border border-ink-700" />
          )}
          <Field label="Vendor">
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
            />
          </Field>
          <Field label="Total">
            <div className="flex items-center bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5">
              <span className="text-ink-500 mr-2">RM</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-lg font-semibold text-ink-100 focus:outline-none"
              />
            </div>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
            />
          </Field>
          <Field label="Wallet">
            <div className="grid grid-cols-2 gap-2">
              {(accounts ?? []).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={`py-2.5 rounded-xl border text-sm ${accountId === a.id ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Category">
            <div className="flex flex-wrap gap-2">
              {(categories ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-1 ${categoryId === c.id ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
                >
                  <span>{c.icon}</span> {c.name}
                </button>
              ))}
            </div>
          </Field>

          {result?.items && result.items.length > 0 && (
            <details className="text-xs text-ink-400">
              <summary className="cursor-pointer">{result.items.length} line items detected</summary>
              <ul className="mt-2 space-y-1">
                {result.items.map((it, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{it.name}</span>
                    <span>{it.price != null ? `RM${it.price.toFixed(2)}` : ''}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button
            onClick={saveFromScan}
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-brand-500 text-ink-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckIcon width={20} height={20} /> {saving ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-4xl">📷</p>
          <p className="text-ink-300 text-sm max-w-xs">{error}</p>
          <button onClick={reset} className="px-5 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm">
            Try again
          </button>
        </div>
      )}
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-400 mb-1.5">{label}</div>
      {children}
    </div>
  )
}
