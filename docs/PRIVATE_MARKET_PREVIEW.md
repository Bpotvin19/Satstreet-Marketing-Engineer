# Private Market preview

The Private Market prototype is an illustrative, desk-assisted opportunity network for qualified Satstreet clients. It does not create orders, match counterparties, transmit form data, or connect to production systems.

## Run locally

From the repository root:

```sh
python3 -m http.server 4173 --directory public
```

Open:

- Client prototype: `http://localhost:4173/private-market.html`
- Internal mock workflow: `http://localhost:4173/private-market-internal.html`

The two views share browser-local prototype state. A status, publication-consent, or notes change in the internal view affects only the same browser's local client view.

## Prototype boundaries

- All opportunities and internal references are fictional.
- Expressed interests are saved to `localStorage` only.
- Nothing is sent to Satstreet, HubSpot, a trading system, a wallet, or another user.
- No order is placed and no transaction is executed.
- “Contact the desk” provides instructions to use an established Satstreet channel; it does not send a message.

## Production requirements

Turning this prototype into a production product would require, at minimum:

1. Product, legal, compliance and regulatory review of the operating model, language, eligibility rules and jurisdictional availability.
2. Authenticated client and employee experiences with role-based access control, session security and strong identity assurance.
3. An approved data model and encrypted service layer for opportunities, interests, permissions, audit history and retention.
4. Explicit publication-consent capture and a workflow preventing private client information or counterparty identity from reaching client-facing surfaces.
5. Compliance integrations for KYC/KYB status, suitability or eligibility controls, sanctions screening and case escalation.
6. A controlled desk workflow for review, approval, withdrawal, expiry and conflict handling, with immutable audit logs.
7. Secure notifications through approved channels, with human accountability and no peer-to-peer contact.
8. Market-abuse, privacy, threat-model and penetration testing, plus operational monitoring and incident response.
9. Defined execution handoff, quote lifecycle, disclosures, records, reconciliation and settlement procedures outside this discovery interface.
10. Accessibility, browser, device, load and failure-mode testing using approved representative data.

## Verification

- `npm run typecheck`
- `node --check public/assets/private-market.js`
- `node scripts/build-resource-cache.mjs`

The resource-cache build exits successfully without `NOTION_TOKEN`, logging that the optional cache refresh was skipped.
