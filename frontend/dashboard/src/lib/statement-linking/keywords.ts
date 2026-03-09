const KEYWORDS = {
  creditCardPayment: ['credit card payment', 'card payment', 'payment -', 'visa payment', 'mastercard payment'],
  loanRepayment: ['loan payment', 'emi', 'instalment', 'installment', 'repayment', 'mortgage payment'],
  transfer: ['transfer', 'fast', 'paynow', 'giro', 'funds transfer', 'internal transfer'],
}

export function containsAnyKeyword(haystack: string, values: string[]) {
  const normalized = haystack.toLowerCase()
  return values.some((value) => normalized.includes(value))
}

export function detectDescriptorClues(sourceDescription: string, targetDescription: string) {
  const combined = `${sourceDescription} ${targetDescription}`.toLowerCase()

  return {
    creditCardPayment: containsAnyKeyword(combined, KEYWORDS.creditCardPayment),
    loanRepayment: containsAnyKeyword(combined, KEYWORDS.loanRepayment),
    transfer: containsAnyKeyword(combined, KEYWORDS.transfer),
  }
}
