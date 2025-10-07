import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FriendsPage } from './friends.page';
import { AuthGuard } from '../../modules/auth/auth.guard';

const routes: Routes = [
  { path: '', component: FriendsPage, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FriendsPageRoutingModule {}
