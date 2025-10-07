import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatPage } from './chat.page';
import { AuthGuard } from '../../modules/auth/auth.guard';

const routes: Routes = [
  { path: '', component: ChatPage, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ChatPageRoutingModule {}
