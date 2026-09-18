import { Routes } from '@angular/router';
import { TheFrameComponent } from './components/the-frame/the-frame.component';
import { ConfigPageComponent } from './components/config-page/config-page.component';
import { MessagesPageComponent } from './components/messages-page/messages-page.component';

export const routes: Routes = [
    { path: '', component: TheFrameComponent },
    { path: 'config', component: ConfigPageComponent },
    { path: 'messages', component: MessagesPageComponent },
];
