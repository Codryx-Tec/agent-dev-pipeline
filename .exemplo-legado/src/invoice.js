// Invoice math. Started as a single function, grew two more over a couple of
// years without anyone going back to update docs/SPEC.md.

export function calculateSubtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function applyTax(subtotal, taxRate) {
  return Math.round(subtotal * (1 + taxRate) * 100) / 100;
}

// Added later, when invoices needed to be printed instead of only stored.
// Never got a test — it shipped the same week as a client deadline and
// nobody came back for it.
export function formatInvoice(invoice) {
  const subtotal = calculateSubtotal(invoice.items);
  const total = applyTax(subtotal, invoice.taxRate);
  const lines = invoice.items.map(
    (item) => `  ${item.name} x${item.qty} — $${(item.price * item.qty).toFixed(2)}`
  );
  return [
    `Invoice #${invoice.id}`,
    ...lines,
    `Subtotal: $${subtotal.toFixed(2)}`,
    `Total (incl. tax): $${total.toFixed(2)}`,
  ].join('\n');
}
