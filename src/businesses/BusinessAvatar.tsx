import { colorOf, initials } from './store'

/** Coloured square with the business's initials. The initials are the signal; the colour only helps. */
export function BusinessAvatar({ name, color, size = 32 }: { name: string; color: string | null; size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-md font-semibold text-white" style={{ width: size, height: size, background: colorOf(color), fontSize: Math.round(size * 0.4) }}>
      {initials(name)}
    </span>
  )
}
