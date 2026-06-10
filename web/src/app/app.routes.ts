import { Routes } from '@angular/router';
import { TheFrame } from './components/the-frame/the-frame.component';
import { ConfigPageComponent } from './components/config-page/config-page.component';

export const routes: Routes = [
    { path: '', component: TheFrame },
    { path: 'config', component: ConfigPageComponent },
];
