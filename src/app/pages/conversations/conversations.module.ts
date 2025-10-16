import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ConversationsRoutingModule } from './conversations-routing.module';
import { ConversationsListPage } from './conversations-list.page';
import { ConversationChatPage } from './conversation-chat.page';
import { RoomCardComponent } from '../../components/room-card/room-card.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, ConversationsRoutingModule, RoomCardComponent],
  declarations: [ConversationsListPage, ConversationChatPage]
})
export class ConversationsModule {}
