# GitHub Copilot Instructions

[AGENTS.md](../AGENTS.md) is the canonical, project-wide instruction file. Read and follow it before changing this repository.

- Work in the pinned Angular 11, TypeScript 4.1, RxJS 6, NgModule stack.
- Keep SSR-safe: guard browser APIs and polling with `isPlatformBrowser`, then clean up subscriptions, timers, and listeners.
- Keep Express responses in `web/src/server.ts` aligned with services in `web/src/app/services/`.
- Keep runtime configuration, config UI, TypeScript models/defaults, server readers, and tests synchronized.
- Put secrets and machine-specific paths in environment variables, not committed JSON.
- Keep visible copy translatable and preserve focus, keyboard, and reduced-motion behavior.
- Run npm commands from `web/`; use strict builds and targeted Jasmine specs to verify changes.
