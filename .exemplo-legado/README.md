# invoice-tools

Small internal library for calculating invoice totals — subtotal, tax, and
the old promo-code discount from the 2024 launch.

## Usage

```js
import { calculateSubtotal, applyTax } from './src/invoice.js';

const subtotal = calculateSubtotal(items);
const total = applyTax(subtotal, 0.075);
```

See `docs/SPEC.md` for the original behaviour spec.

## Running the tests

```sh
node --test
```

## Contributing

Open a PR. There's no CI here yet — run the tests locally before pushing.
