import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UsersService, UserSummary } from '../../services/users.service';
import { FriendsService } from '../../services/friends.service';
import { AuthService } from '../../modules/auth/auth.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.page.html',
  styleUrls: ['./user-profile.page.scss'],
  standalone: false,
})
export class UserProfilePage implements OnInit {
  user: UserSummary | null = null;
  meId: number | null = null;
  loading = true;
  error: string | null = null;
  private readonly route = inject(ActivatedRoute);
  private readonly users = inject(UsersService);
  private readonly friends = inject(FriendsService);
  private readonly auth = inject(AuthService);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.meId = this.auth.user?.id ?? null;
    if (!id || Number.isNaN(id)) { this.error = 'ID inválido'; this.loading = false; return; }
    // Buscar perfil público do usuário
    this.users.getPublicProfile(id).subscribe({
      next: (u) => { this.user = u; this.error = null; },
      error: (e) => {
        // Fallback: se for o próprio usuário, tentar endpoint privado
        if (this.meId && id === this.meId) {
          this.users.getById(id).subscribe({
            next: (u) => { this.user = u; this.error = null; },
            error: (err2) => { this.user = null; this.error = (err2?.error?.error || 'Perfil não encontrado'); },
          }).add(() => { this.loading = false; });
        } else {
          this.user = null;
          this.error = (e?.error?.error || 'Perfil não encontrado');
          this.loading = false;
        }
      },
      complete: () => { this.loading = false; }
    });
  }

  sendFriendRequest() {
    if (!this.user) return;
    this.friends.sendRequest(this.user.id).subscribe();
  }
}
