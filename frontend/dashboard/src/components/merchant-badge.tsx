import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MerchantColorDot } from '@/components/merchant-color-dot'
import { MerchantIcon, type MerchantPresentationFields } from '@/components/merchant-icon'

interface MerchantBadgeProps extends MerchantPresentationFields {
  className?: string
  fallbackLabel?: string
  showIcon?: boolean
  showColorDot?: boolean
}

export function MerchantBadge({
  className,
  fallbackLabel = 'Unknown merchant',
  showIcon = true,
  showColorDot = true,
  name,
  ...fields
}: MerchantBadgeProps) {
  const label = name?.trim() || fallbackLabel

  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal', className)}>
      {showColorDot && <MerchantColorDot {...fields} className="size-2" />}
      {showIcon && <MerchantIcon {...fields} name={name} className="size-3.5" />}
      <span>{label}</span>
    </Badge>
  )
}
