# Chay Kun Wai - Resume and Professional Site

This repository publishes an evidence-first English and Simplified Chinese professional site plus two role-specific, ATS-safe English resumes.

## Public routes

- `/` - English professional site
- `/zh/` - Simplified Chinese site (pending native-language review)
- `/resume/backend/` - printable Backend Lead Engineer / Technical Lead resume
- `/resume/fde/` - printable Forward-Deployed Engineer / Technical Lead resume

Stable downloads:

- `assets/download/Kun-Wai-Chay-Backend-Lead-Engineer.pdf` - canonical backend lead resume
- `assets/download/Kun-Wai-Chay-Forward-Deployed-Engineer.pdf`
- `assets/download/Kun-Wai-Chay-Backend-Lead-Engineer-CN.pdf` - generated Simplified Chinese backend lead resume
- `assets/download/Kun-Wai-Chay-Forward-Deployed-Engineer-CN.pdf` - generated Simplified Chinese FDE resume
- `assets/download/Chay Kun Wai - Resume - CN.pdf` - existing Simplified Chinese resume

## Source of truth

Edit only `src/resume-data.json` for career content. The build reads that canonical bilingual record and generates every HTML page and PDF. Generated HTML files contain a warning and must not be edited directly.

Evidence safeguards intentionally reject:

- public claims marked `needs-approval`;
- missing English or Chinese fields;
- placeholder text and weak resume phrases;
- inconsistent verified dates or employment relationships;
- unapproved customer names;
- AI work described as deployed or production experience.

The public AI-assisted WMS case study describes only the verified prototype scope. It distinguishes the implemented RAG-based V1 from the planned, unimplemented V2 and explicitly states that the work was internal, unreleased, and has no production-impact claim. The canonical record retains an interview-evidence checklist for the exact model/runtime, retrieval design, evaluation, failure controls, security design, and operating characteristics.

## Build and verification

Node.js 20 or newer is recommended.

```powershell
npm install
npm run build
npm run verify
```

`npm run build` generates the static pages and exports four role-specific two-page A4 PDFs in English and Simplified Chinese with Playwright Chromium. Existing manually maintained downloads are left untouched.

`npm run verify` checks canonical claims, content rules, local and external links, responsive layouts at 390x844, 768x1024, and 1440x900, portrait aspect-ratio regression, keyboard focus, image accessibility, Lighthouse thresholds, A4 PDF structure, extracted text order, metadata, hyperlinks, page counts, and file sizes.

## Manual release gates

Automation cannot replace these checks:

1. Confirm official titles, dates, technologies, and contact details before each application cycle.
2. Obtain approval before replacing any anonymized customer label with a public name.
3. Have a fluent reviewer approve every Simplified Chinese field, then set `meta.translationReview` to `human-reviewed`.
4. Render and visually inspect every PDF page after material content or style changes.
5. Use the FDE resume for AI-focused roles only after the public prototype summary is backed by interview-ready architecture, retrieval, evaluation, failure-control, security, and operating-detail evidence.
6. Keep LinkedIn dates and relationship labels synchronized with the canonical record.
7. Keep GitHub off the public resume until the profile README and pinned repositories demonstrate interview-ready backend engineering work.

The site remains a static GitHub Pages project and requires no runtime JavaScript or server-side processing.
