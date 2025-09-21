POS Match — Receipt Capture & Classification
===========================================

Overview
--------
- Mirrors the cash-ledger header structure (brand | month nav | actions).
- Focuses on capturing, organizing, and exporting POS credit card receipt slips.
- Targets Brazil defaults: R$, pt-BR date, labels.

What’s Implemented
------------------
- Month navigation with the same header grid layout.
- Add Receipt mini-form dialog with Value/Date, Not legible toggles, POS/DOC/NSU, Notes.
- Organize receipts by month → day, plus a “Dia desconhecido” bucket.
- Totals per day and per month (value-only receipts count toward totals).
- Exports for the current month: CSV and JSON buttons in the header.
- Local persistence by month via localStorage.
- Sync ID (optional) with encrypted remote persistence via /api/storage. Requires a KV namespace binding named `POS` and provisioning `space:<SyncID>` key in Cloudflare Pages.

Getting Started
---------------
- cd posmatch
- npm install
- npm run dev

Design Notes
------------
- Header component follows the same class names and layout conventions used in cash-ledger’s Header.
- Right column mirrors ledger’s Sync controls; month actions include Add Receipt + Export CSV/JSON.
- OCR is not implemented yet; fields can be manually typed or marked as “Ilegível”.
- Data model persists receipts per month at key `posmatch.v1.data.{YYYY-MM}`.

Next Steps (Optional)
---------------------
- Wire OCR hints and confidence (e.g., on-device parsing helpers).
- Import JSON back into the month.
- Add remote sync if needed (reuse storage functions/crypto from cash-ledger).
- Reconciliation workflows against online statements.
