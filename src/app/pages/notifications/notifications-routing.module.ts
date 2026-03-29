import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../modules/auth/auth.guard';
import { NotificationsPage } from './notifications.page';

const routes: Routes = [
  { path: '', component: NotificationsPage, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class NotificationsPageRoutingModule {}
