# invoice-tools — behaviour spec

_Written 2024-01-08. Describes the library as it was at first release._

## calculateSubtotal(items)

Sums `price * qty` across every item in the list. No rounding — totals are
kept as exact floating point values throughout.

## applyTax(subtotal, taxRate)

Applies a single fixed tax rate of 7.5% to the subtotal and returns the
total.

## Out of scope

Discount codes, printable formatting, and multi-currency support are not
part of this library and are not planned.
