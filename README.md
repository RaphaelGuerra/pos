# POS Match

Small tool to capture, organize, and export POS credit‑card receipt slips.

This is a small side project for learning — receipt capture UX, ROI‑based OCR with Tesseract, local‑first month storage, and optional encrypted sync. It is not a production finance system.

## What It Does
- Month navigation with totals per day and per month
- Add Receipt dialog: amount, date, POS/DOC/NSU, notes, “not legible” toggles
- Buckets receipts by day, plus an Unknown Day group
- Export current month as CSV or JSON
- Local‑first persistence per month in the browser
- Optional encrypted sync keyed by a Sync ID via `/api/storage`

## How It Works
- Data lives in `localStorage` under `posmatch.v1.data.YYYY-MM`.
- Optional remote sync uses a simple API: `GET/PUT /api/storage/:syncId/:YYYY-MM`.
- Payloads are encrypted in the browser using the Sync ID as the passphrase (Web Crypto API).
- Brazil defaults: currency (BRL), date formatting, and some labels.

## OCR (Optional)
- Tesseract.js is installed and the Add Receipt dialog includes ROI presets for common slip layouts (e.g., Cielo).
- The UI is usable without OCR — you can type fields or mark them as not legible.

## Run Locally
Prerequisites: Node.js >= 20

```bash
cd posmatch
npm install
npm run dev
```

## Tech Stack
- React + Vite
- Tesseract.js (OCR)
- Local storage + optional encrypted sync

## Status & Learnings
- Functional prototype to explore on‑device OCR and daily/monthly rollups
- Next ideas: import JSON back, confidence overlays, reconciliation against statements

## License
All rights reserved. Personal portfolio project — not for production use.
