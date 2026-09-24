import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { TheFrameComponent } from './components/the-frame/the-frame.component';
import { CoverPageComponent } from './components/cover-page/cover-page.component';
import { ColumnsPageComponent } from './components/columns-page/columns-page.component';
import { TransportPageComponent } from './components/transport-page/transport-page.component';
import { WeatherPageComponent } from './components/weather-page/weather-page.component';
import { DebugOverlayComponent } from './components/debug-overlay/debug-overlay.component';
import { ConfigPageComponent } from './components/config-page/config-page.component';
import { MessagesPageComponent } from './components/messages-page/messages-page.component';
import { FormatDateTimePipe } from './pipes/format-date-time.pipe';
import { TranslatePipe } from './pipes/translate.pipe';
import { FeatherIconDirective } from './directives/feather-icon.directive';

@NgModule({
  declarations: [
    AppComponent,
    TheFrameComponent,
    CoverPageComponent,
    ColumnsPageComponent,
    TransportPageComponent,
    WeatherPageComponent,
    DebugOverlayComponent,
    ConfigPageComponent,
    MessagesPageComponent,
    FormatDateTimePipe,
    TranslatePipe,
    FeatherIconDirective,
  ],
  imports: [
    BrowserModule.withServerTransition({ appId: 'frame-screen-saver' }),
    HttpClientModule,
    FormsModule,
    RouterModule.forRoot(routes, { initialNavigation: 'enabledBlocking' }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
