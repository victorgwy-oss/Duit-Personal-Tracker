import { supabase } from './supabase'
import { getUserId } from './sync'
import { blobToDataURL } from './image'

// Persist a receipt image. Online: upload to the private Supabase Storage
// bucket under "<uid>/<txnId>.jpg" and return that path. Local-only: return a
// data: URL that lives directly in IndexedDB. The stored string is what goes
// on transaction.receiptPath either way.
export async function saveReceiptImage(txnId: string, blob: Blob): Promise<string> {
  const uid = getUserId()
  if (supabase && uid) {
    const path = `${uid}/${txnId}.jpg`
    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }
  return blobToDataURL(blob)
}

// Resolve a stored receiptPath to something an <img> can display.
export async function getReceiptUrl(path: string): Promise<string | null> {
  if (path.startsWith('data:')) return path
  if (!supabase) return null
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function deleteReceiptImage(path: string): Promise<void> {
  if (path.startsWith('data:')) return
  if (!supabase) return
  await supabase.storage.from('receipts').remove([path])
}
