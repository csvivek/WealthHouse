import {
  ArrowRightLeft,
  BriefcaseBusiness,
  Car,
  CircleDollarSign,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  MoreHorizontal,
  ReceiptText,
  ShoppingBag,
  Ticket,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CategoryPresentationFields {
  id?: string | number | null
  name?: string | null
  icon_key?: string | null
  color_token?: string | null
  color_hex?: string | null
  domain_type?: string | null
  payment_subtype?: string | null
}

function resolvedIconKey(fields: CategoryPresentationFields) {
  const iconKey = fields.icon_key?.toLowerCase().trim()
  if (iconKey) return iconKey
  if (fields.domain_type === 'income') return 'income'
  if (fields.domain_type === 'transfer') return 'transfer'
  if (fields.payment_subtype === 'cash') return 'cash'
  return 'wallet'
}

export function CategoryIcon({
  className,
  ...fields
}: CategoryPresentationFields & { className?: string }) {
  const key = resolvedIconKey(fields)
  const iconClass = cn('size-3.5 text-muted-foreground', className)

  if (key === 'income') return <CircleDollarSign className={iconClass} />
  if (key === 'transfer') return <ArrowRightLeft className={iconClass} />
  if (key === 'shopping' || key === 'groceries') return <ShoppingBag className={iconClass} />
  if (key === 'food' || key === 'dining') return <UtensilsCrossed className={iconClass} />
  if (key === 'transport') return <Car className={iconClass} />
  if (key === 'home') return <Home className={iconClass} />
  if (key === 'education') return <GraduationCap className={iconClass} />
  if (key === 'healthcare') return <HeartPulse className={iconClass} />
  if (key === 'utilities') return <ReceiptText className={iconClass} />
  if (key === 'salary') return <BriefcaseBusiness className={iconClass} />
  if (key === 'entertainment') return <Ticket className={iconClass} />
  if (key === 'cash') return <HandCoins className={iconClass} />

  return <Wallet className={iconClass} />
}

export function UnknownCategoryIcon({ className }: { className?: string }) {
  return <MoreHorizontal className={cn('size-3.5 text-muted-foreground', className)} />
}
