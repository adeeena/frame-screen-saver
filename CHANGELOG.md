# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Runtime configuration for product copy, media packs, message policy, world-clock cities, and transit routes.
- English and French translation catalogs with locale fallback, translation keys, and a language selector.
- Configurable compact weather cities and one featured city with local time, timezone offset, and weather.
- Transit mission codes, wide-screen departure rows, imminent-departure animation, and support for up to three departures per route.
- Reduced-motion support, visible keyboard focus, and tablet-sized interactive controls.
- Server-aware automatic reloads that retry every 20 minutes while the server or network is unavailable.

### Changed

- Generalized product branding, labels, CSS tokens, media discovery, and server configuration for reusable deployments.
- Improved Ken Burns motion, weather night-band alignment, rain meters, transport hierarchy, and city-label spacing.
- Reduced Angular change-detection work by moving pointer tracking outside Angular and caching derived weather, calendar, city, and transit data.
- Production builds now target current browsers and use realistic bundle budgets.

### Fixed

- Production browser builds failing because the initial bundle exceeded its configured budget.
- Stale or excessive per-second binding reevaluation across the display.
- Incorrect sun icons for clear or fair nighttime weather.
- Missing calendar events after moving the private ICS URL to environment configuration.
- Optional WebSocket dependency and unused TypeScript entry warnings during production builds.
- Pinch-to-zoom on kiosk and signage devices.

### Security

- Removed deployment secrets and machine-specific paths from source configuration.
- Kept calendar URLs and provider credentials in ignored environment files.
- Enabled outbound TLS certificate verification by default.
