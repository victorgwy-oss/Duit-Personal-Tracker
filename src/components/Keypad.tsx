// Shared on-screen number pad. Layout is 1-9 then bottom row 0 · . · ⌫
// (zero left, decimal middle, delete right) — the user's preferred ergonomics.

// Apply one key press to the in-progress amount string, enforcing a single
// decimal point and at most two decimal places.
export function applyAmountKey(prev: string, key: string): string {
  if (key === 'del') return prev.slice(0, -1)
  if (key === '.') {
    if (prev.includes('.')) return prev
    return prev === '' ? '0.' : prev + '.'
  }
  // digit
  if (prev.includes('.') && (prev.split('.')[1]?.length ?? 0) >= 2) return prev
  if (prev === '0') return key // replace a lone leading zero
  return prev + key
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', 'del']

export default function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPress(k)}
          className="py-4 rounded-xl bg-ink-800 border border-ink-700 text-xl font-semibold text-ink-100 active:bg-ink-700 transition select-none"
        >
          {k === 'del' ? '⌫' : k}
        </button>
      ))}
    </div>
  )
}
