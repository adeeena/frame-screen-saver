# Repository Guidelines

## Project map

- `web/` contains the Angular application and Express SSR/API server.
- `web/src/app/` contains NgModule-based Angular components, services, pipes, and directives.
- `web/src/server.ts` owns Express routes and upstream-provider integrations.
- `web/public/screensaver.config.json` is the bundled runtime configuration; `web/public/translations.json` contains UI copy by locale.
- `media/` is the deployed photo library. `runtime-data/` and generated media caches are local state, not source.
- `containers/` and `web/Dockerfile` define the production deployment.

Read [README.md](README.md) for the product overview. For executable details, treat `web/package.json`, `web/angular.json`, `web/src/server.config.ts`, and `web/Dockerfile` as authoritative because older README examples may be stale.

## Run and verify

Run npm commands from `web/`.

```powershell
npm ci
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

- `npm start` starts the browser dev server on port 4500 and proxies `/api` and `/media`.
- On Windows, `.\start-dev.ps1` starts the Express/API process and Angular dev server together.
- For production parity, run `npm run build:browser -- --configuration production` and `npm run build:server -- --configuration production`.
- For deployment changes, build from the repository root with `docker compose -f containers/docker-compose.yml --project-directory containers up --build`.
- There is no lint script. Use strict TypeScript/Angular compilation and the targeted Jasmine specs as the code-quality gate.

## Angular and SSR

- Preserve the Angular 11 NgModule architecture. Register new components, pipes, and directives in `web/src/app/app.module.ts`; do not introduce standalone-component or newer-framework APIs.
- Keep TypeScript compatible with the pinned TypeScript 4.1 and RxJS 6 toolchain.
- Keep component TypeScript, template, and SCSS as separate sibling files and follow the existing file-local patterns.
- Guard browser-only timers, HTTP polling, DOM, `window`, `localStorage`, and WebSocket work with `isPlatformBrowser(PLATFORM_ID)`.
- Complete RxJS subjects and clear timers/listeners in lifecycle teardown. Preserve outside-Angular animation work and derived-value caching where already used.
- Keep visible user text behind the `translate` pipe and add the same key to every locale present in `web/public/translations.json`.
- Preserve keyboard access, focus visibility, and `prefers-reduced-motion` behavior in interactive UI.

## Server, configuration, and data

- Client/server API work crosses `web/src/app/services/` and `web/src/server.ts`; keep response shapes aligned and normalize upstream errors at the server boundary.
- When changing runtime configuration, update every affected surface: the TypeScript model/defaults, bundled JSON, config UI, server reader, validation, and tests.
- Keep credentials, deployment-specific paths, and private calendar URLs in environment variables. Never commit `.env` files or production-only values into configuration JSON.
- Treat outbound TLS verification as enabled by default. `ALLOW_INSECURE_TLS` is an explicit local development escape hatch.
- Preserve resilient kiosk behavior: failed feeds should leave the display usable, log actionable errors, and recover on a later poll.

## Tests and changes

- Add focused Jasmine specs next to changed logic, following existing `*.spec.ts` patterns.
- Use deterministic clocks, fixtures, and direct assertions for time, calendar, transit, chart, and SSR behavior.
- Update `README.md` or `web/README.md` when commands, environment variables, routes, or runtime configuration change.
- Keep changes scoped. Validate the smallest relevant spec set first, then the strict browser/server builds when shared models, templates, or SSR code change.
