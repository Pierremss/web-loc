import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SwipePage } from './swipe.page';
import { SwipeRoutingModule } from './swipe-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SwipeRoutingModule],
  declarations: [SwipePage]
})
export class SwipePageModule {}
