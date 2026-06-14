import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';

import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { TheFrameComponent } from './components/the-frame/the-frame.component';
import { CoverPageComponent } from './components/cover-page/cover-page.component';
import { ColumnsPageComponent } from './components/columns-page/columns-page.component';
import { DebugOverlayComponent } from './components/debug-overlay/debug-overlay.component';
import { ConfigPageComponent } from './components/config-page/config-page.component';
import { FormatDateTimePipe } from './pipes/format-date-time.pipe';
import { FeatherIconDirective } from './directives/feather-icon.directive';

@NgModule({
  declarations: [
    AppComponent,
    TheFrameComponent,
    CoverPageComponent,
    ColumnsPageComponent,
    DebugOverlayComponent,
    ConfigPageComponent,
    FormatDateTimePipe,
    FeatherIconDirective,
  ],
  imports: [
    BrowserModule.withServerTransition({ appId: 'frame-screen-saver' }),
    HttpClientModule,
    RouterModule.forRoot(routes, { initialNavigation: 'enabledBlocking' }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
