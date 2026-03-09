import { cn } from '@/lib/utils'
import { CategoryPresentationFields } from './category-icon'

function resolveColor({ color_hex, color_token }: Pick<CategoryPresentationFields, 'color_hex' | 'color_token'>) {
  if (color_hex) return color_hex
  if (!color_token) return 'hsl(var(--muted-foreground) / 0.4)'
  const token = color_token.trim()
  if (token.startsWith('--')) return `var(${token})`
  return `var(--color-${token}, var(--${token}, hsl(var(--muted-foreground) / 0.4)))`
}

export function CategoryColorDot({
  className,
  color_hex,
  color_token,
}: Pick<CategoryPresentationFields, 'color_hex' | 'color_token'> & { className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 rounded-full', className)}
      style={{ backgroundColor: resolveColor({ color_hex, color_token }) }}
      aria-hidden
    />
  )
}
