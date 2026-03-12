import { Badge } from '@/components/ui/badge'
import { CategoryColorDot } from '@/components/category-color-dot'
import { CategoryIcon } from '@/components/category-icon'
import { cn } from '@/lib/utils'

export interface TagPresentation {
  id?: string | null
  name: string
  color_token?: string | null
  color_hex?: string | null
  icon_key?: string | null
  source?: string | null
}

export function TagBadge({
  name,
  color_token,
  color_hex,
  icon_key,
  className,
}: TagPresentation & { className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 px-2 py-0.5 font-normal', className)}>
      <CategoryColorDot color_token={color_token} color_hex={color_hex} className="size-2" />
      <CategoryIcon icon_key={icon_key ?? 'tag'} className="size-3.5" />
      <span>{name}</span>
    </Badge>
  )
}
