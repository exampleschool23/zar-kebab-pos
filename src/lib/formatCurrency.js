export function formatCurrency(amount) {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' UZS'
}
