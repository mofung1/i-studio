import { Star } from 'lucide-react'

export function FavoriteStar({ active, size = 16 }: { active: boolean; size?: number }) {
  return (
    <Star
      size={size}
      className={`favorite-star${active ? ' is-active' : ''}`}
      fill={active ? 'var(--favorite-fill)' : 'none'}
      aria-hidden="true"
    />
  )
}
