import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CategoryColorDot } from './category-color-dot'
import { CategoryIcon, CategoryPresentationFields, UnknownCategoryIcon } from './category-icon'

interface CategoryBadgeProps extends CategoryPresentationFields {
  className?: string
  fallbackLabel?: string
  showIcon?: boolean
  showColorDot?: boolean
}

export function CategoryBadge({
  className,
  fallbackLabel = 'Uncategorized',
  showIcon = true,
  showColorDot = true,
  name,
  ...fields
}: CategoryBadgeProps) {
  const label = name?.trim() || fallbackLabel
  const hasCategory = Boolean(name?.trim())

  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal', className)}>
      {showColorDot && <CategoryColorDot {...fields} className="size-2" />}
      {showIcon && (hasCategory ? <CategoryIcon {...fields} name={name} className="size-3.5" /> : <UnknownCategoryIcon className="size-3.5" />)}
      <span>{label}</span>
    </Badge>
  )
}

export const CategoryChip = CategoryBadge
