import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { AdminRecomendacoesPageRoutingModule } from './admin-recomendacoes-routing.module';
import { AdminRecomendacoesPage } from './admin-recomendacoes.page';

@NgModule({
  imports: [CommonModule, IonicModule, AdminRecomendacoesPageRoutingModule],
  declarations: [AdminRecomendacoesPage]
})
export class AdminRecomendacoesPageModule {}
