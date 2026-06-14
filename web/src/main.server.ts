// Zone.js must be loaded before Angular in the SSR bundle.
// The browser build gets it via polyfills.ts, but the server builder
// (@angular-devkit/build-angular:server) does not include polyfills.ts,
// so we import the Node-compatible variant explicitly here.
import 'zone.js/dist/zone-node';
export { AppServerModule } from './app/app-server.module';
