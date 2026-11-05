# unipay widget — embeddable checkout

Deployed as `widget.js` from this service. Mounted by any website:

```html
<script src="https://pay.yourdomain.com/widget.js"></script>
<div id="checkout"></div>
<script>
  YourPay.mount('#checkout', { token: order.widget_token,
    theme: { '--pay-accent': '#6d5df6', '--pay-bg': '#ffffff', '--pay-radius': '12px', '--pay-font': 'inherit' } });
</script>
```

Theming: CSS custom properties only → the checkout blends into ANY host site.

## Tabs (each defined so no payer can misunderstand it)

| Tab | What the payer sees | The one line that prevents mistakes |
|---|---|---|
| 1 Bitcoin / Lightning | Two SEPARATE sub-options: Lightning QR vs on-chain address | never shown together; on-chain shows required confirmations |
| 2 Altcoins | Network name in LARGE text above the QR | "Send only {asset} on the {network} network to this address. Other networks permanently lose funds." |
| 3 Gift Card | wizard: brand → denomination → tier (Photo 84% vs E-code 71%) → code/photo | final step shows "You pay $100 card → You receive $84.00 of {product}" + "codes cannot be returned once submitted" |
| 4 Voucher | PIN input grouped 4-4-4-4 | "Your voucher is sent to administration for manual redemption." |
| 5 Card (guide) | "We never see your card." Two buttons: buy e-gift card elsewhere → paste in tab 3; or buy BTC via on-ramp → pay tab 1 | keeps order session alive across tabs |

## Cross-cutting UI rules
- ONE active rail per order — starting a submission suspends other tabs.
- Status states rendered identically everywhere: Awaiting payment → Detected → Confirming → Confirmed ✓ (with order id + tx ref, screenshot-able).
- No cancel button anywhere. Before submission: "free to leave". After: "irreversible".
- Mobile: `capture` attribute opens camera directly for the photo tier; sample "good photo" placeholder shown first.
