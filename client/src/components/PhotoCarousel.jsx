import { useState } from 'react'
import Icon from './ui/Icon'

// Parse photo_url : soit un JSON tableau, soit une URL simple, soit vide. Renvoie tableau d'URLs http(s).
export function parsePhotos(value) {
  if (!value) return []
  let arr
  try {
    const p = JSON.parse(value)
    arr = Array.isArray(p) ? p : [p]
  } catch {
    arr = [value]
  }
  return arr.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u))
}

export default function PhotoCarousel({ value, compact = false }) {
  const photos = parsePhotos(value)
  const [i, setI] = useState(0)
  if (photos.length === 0) return null
  const idx = Math.min(i, photos.length - 1)
  const taille = compact ? 'h-12 w-12' : 'h-40 w-full'
  const prev = () => setI(n => (n - 1 + photos.length) % photos.length)
  const next = () => setI(n => (n + 1) % photos.length)

  return (
    <div className="relative">
      <a href={photos[idx]} target="_blank" rel="noopener noreferrer">
        <img src={photos[idx]} alt={`Photo ${idx + 1}`} className={`${taille} object-cover rounded-lg border border-quai-border`} />
      </a>
      {photos.length > 1 && (
        <>
          <button type="button" onClick={prev} aria-label="Photo précédente"
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-quai-navy/70 text-white rounded-full p-1 hover:bg-quai-navy">
            <Icon name="chevron-left" size="sm" />
          </button>
          <button type="button" onClick={next} aria-label="Photo suivante"
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-quai-navy/70 text-white rounded-full p-1 hover:bg-quai-navy">
            <Icon name="chevron-right" size="sm" />
          </button>
          <div className="flex justify-center gap-1 mt-1">
            {photos.map((_, k) => (
              <button type="button" key={k} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}
                className={`h-1.5 w-1.5 rounded-full ${k === idx ? 'bg-quai-navy' : 'bg-quai-border'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
