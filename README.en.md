# class-hub · Class Information & Resource Hub

[简体中文](README.md) | **English**

A self-hosted website for a single school class: resource sites, timetable, holiday calendar,
class chat and group-based permissions — running entirely on Cloudflare Workers + D1 + R2.

[![CI](https://github.com/wwccyy2912/class-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/wwccyy2912/class-hub/actions/workflows/ci.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

> The UI and documentation are written in Simplified Chinese (it targets Chinese schools).
> Issues and pull requests in English are welcome.

## Features

| Module | What it does |
| --- | --- |
| Resource sites | Files (PDF / Office / text), folder sites (upload a ZIP, the directory is parsed), and galleries for images, video and audio with a built-in player |
| Uploads | Client-side WEBP conversion and thumbnails, resumable chunked video upload up to 200 MB, adaptive lite / balanced / quality profiles |
| Timetable | Weekly / bi-weekly courses, double periods, bulk import, today–tomorrow–day-after reminders |
| Calendar | Chinese statutory holidays and make-up workdays synced automatically, holiday countdown, custom events |
| Class chat | Group chat and 1:1 direct messages, attachments, @mentions, recall window, automatic history cleanup, per-room mute |
| Accounts | First-run setup wizard, user groups with 6 permission keys, disable / reset / delete accounts |
| UI | Liquid-glass style, dark and light themes, responsive layout, PWA icons and manifest |

## Tech stack

- **Runtime**: Cloudflare Workers (single bundled ESM worker)
- **Database**: Cloudflare D1 (SQLite) with Drizzle migrations
- **Storage**: Cloudflare R2 (documents, thumbnails, chat attachments, multipart uploads)
- **Frontend**: hand-written ES modules, no framework; PDF.js for the built-in reader

## Quick start (local)

```bash
npm install
npm run build          # bundle the worker and the frontend assets
npm run db:migrate     # create the local D1 schema
npm run dev            # http://127.0.0.1:4173 — the setup wizard greets you
```

Everything runs offline: `wrangler` emulates D1 and R2 inside `.wrangler/state/`.

## Tests

```bash
npm test               # unit tests (fast, pure Node)
npm run test:e2e       # end-to-end: permissions, chat, uploads, integration, rate limiting
npm run test:browser   # UI suites, needs google-chrome and a running dev server
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create class-local                 # put the returned id into wrangler.jsonc
npx wrangler r2 bucket create class-local-files    # enable R2 in the dashboard first
npm run build && npm run deploy:migrate && npm run deploy
```

See [`docs/部署到Cloudflare.md`](docs/部署到Cloudflare.md) (Chinese) for a step-by-step guide,
custom domains, backups and troubleshooting.

## Security

This is a self-hosted tool for one class: there is no public sign-up, and every API call
requires a session created by the setup wizard or by an administrator. Please read
[`SECURITY.md`](SECURITY.md) — including the operational advice about backups, tokens and
putting the site behind Cloudflare Access — before exposing it to the internet.

## Contributing

Contributions are welcome: read [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), then open an issue or a pull request.

## License

[GPL-3.0-or-later](LICENSE) © 2026 class-hub contributors.
