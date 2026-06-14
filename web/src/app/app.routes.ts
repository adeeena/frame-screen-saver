import { Routes } from '@angular/router';
import { TheFrameComponent } from './components/the-frame/the-frame.component';
import { ConfigPageComponent } from './components/config-page/config-page.component';

export const routes: Routes = [
    { path: '', component: TheFrameComponent },
    { path: 'config', component: ConfigPageComponent },
];
