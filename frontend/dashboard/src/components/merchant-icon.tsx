import {
  Building2,
  Car,
  Coffee,
  HeartPulse,
  Landmark,
  Plane,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MerchantPresentationFields {
  id?: string | null
  name?: string | null
  icon_key?: string | null
  color_token?: string | null
  color_hex?: string | null
}

function resolveIconKey(fields: MerchantPresentationFields) {
  return fields.icon_key?.trim().toLowerCase() || 'store'
}

export function MerchantIcon({
  className,
  ...fields
}: MerchantPresentationFields & { className?: string }) {
  const key = resolveIconKey(fields)
  const iconClass = cn('size-3.5 text-muted-foreground', className)

  if (key === 'coffee') return <Coffee className={iconClass} />
  if (key === 'food') return <UtensilsCrossed className={iconClass} />
  if (key === 'cart') return <ShoppingCart className={iconClass} />
  if (key === 'bag') return <ShoppingBag className={iconClass} />
  if (key === 'transport') return <Car className={iconClass} />
  if (key === 'bank') return <Landmark className={iconClass} />
  if (key === 'health') return <HeartPulse className={iconClass} />
  if (key === 'travel') return <Plane className={iconClass} />
  if (key === 'bill') return <ReceiptText className={iconClass} />
  if (key === 'company') return <Building2 className={iconClass} />

  return <Store className={iconClass} />
}
