# Ambient Display

## Development time

## Usage

To have the application running on full screen, launch it in a browser (in kiosk mode).

To do so in macOS:

`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk http://localhost:4400`












This application uses Angular CLI 11.2 and an Express API server.

## Development server

To start the Angular development server and Express API, run:

```powershell
.\start-dev.ps1
```

Open `http://localhost:4400/`. API requests are proxied to `http://localhost:4000/`.

## Configuration

Runtime product identity, copy, media packs, location, world clocks, weather, transit, calendar, and message policy are stored in `public/screensaver.config.json`. The configuration page edits the deployed copy through `/api/config`.

Set `SCREENSAVER_CONFIG_FILE` to load and save an external deployment-specific JSON file instead of the bundled configuration. This is the recommended production setup.

Secrets and machine-specific paths belong in environment variables, not JSON:

- `CALENDAR_ICS_URL`
- `PRIM_API_KEY`
- `NAVITIA_TOKEN`
- `MEDIA_DIR`
- `MESSAGES_FILE`
- `MET_NO_USER_AGENT`
- `APP_TIMEZONE`, `APP_LATITUDE`, and `APP_LONGITUDE` optionally override location settings
- `ALLOW_INSECURE_TLS=true` disables outbound certificate verification only when an enterprise proxy makes that unavoidable

World-clock cities use `role: "compact"` for weather-only rows and `role: "featured"` with an IANA `timezone` for the combined time, offset, and weather row. Only one featured city is supported.

Automatic reloads first probe `/api/clock`. The page reloads only after a successful server response; network errors, timeouts, and HTTP errors are retried every 20 minutes.

UI translations are stored in `public/translations.json` as flat translation keys grouped by locale. Set `appSettings.locale` in the runtime configuration or use the Language control. Missing regional keys fall back from the full locale to its language (for example `fr-FR` to `fr`), then to `defaultLocale`, and finally to the key itself.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

Production bundles target current Chrome, Edge, Firefox, Safari, iOS Safari, and Firefox ESR releases. Legacy ES5 browsers such as Internet Explorer are not supported.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
