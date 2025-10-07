import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConversationsListPage } from './conversations-list.page';
import { ConversationChatPage } from './conversation-chat.page';
import { AuthGuard } from '../../modules/auth/auth.guard';

const routes: Routes = [
  { path: '', component: ConversationsListPage, canActivate: [AuthGuard] },
  { path: ':id', component: ConversationChatPage, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ConversationsRoutingModule {}
