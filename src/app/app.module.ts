import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './interceptors/auth.interceptor';

import { LoginPage } from './modules/auth/login.page';
import { RegisterPage } from './modules/auth/register.page';
import { UsersListPage } from './modules/users/users-list.page';
import { GamesListPage } from './modules/games/games-list.page';
import { HomePage } from './home.page';

@NgModule({
  declarations: [AppComponent, LoginPage, RegisterPage, UsersListPage, GamesListPage, HomePage],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule, FormsModule, HttpClientModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}