import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { GamesService } from '../games/games.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false,
})
export class RegisterPage implements OnInit {

  etapaAtual: number = 1;
  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  onHorarioChange(dia: string, periodo: string, checked: boolean): void {
    if (!Array.isArray(this.horariosSelecionados[dia])) {
      this.horariosSelecionados[dia] = [];
    }
    if (checked) {
      if (!this.horariosSelecionados[dia].includes(periodo)) {
        this.horariosSelecionados[dia].push(periodo);
      }
    } else {
      this.horariosSelecionados[dia] = this.horariosSelecionados[dia].filter(p => p !== periodo);
    }
  }
  form: any = {
    name: '',
    nickname: '',
    email: '',
    password: '',
    jogos_favoritos: [],
    platforms: [],
    game_style: '',
    available_times: '',
    profile: ''
  };
  jogos: any[] = [];
  diasSemana: string[] = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  periodos: string[] = ['Manha', 'Tarde', 'Noite', 'Madrugada'];
  horariosSelecionados: { [dia: string]: string[] } = {};
  loading: boolean = false;
  error: string = '';
  ok: boolean = false;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly gamesService = inject(GamesService);

  constructor() {
    // Inicializa todos os dias com array vazio
    this.diasSemana.forEach((dia) => this.horariosSelecionados[dia] = []);
  }

  ngOnInit(): void {
    this.gamesService.list().subscribe((jogos) => this.jogos = jogos);
  }

  erros: { [key: string]: string } = {};
  avancarEtapa() {
    this.erros = {};
    if (this.etapaAtual === 1) {
      if (!this.form.name || this.form.name.trim() === '') {
        this.erros['name'] = 'Nome é obrigatório.';
      }
      if (!this.form.nickname || this.form.nickname.trim() === '') {
        this.erros['nickname'] = 'Apelido é obrigatório.';
      }
      if (!this.form.email || this.form.email.trim() === '') {
        this.erros['email'] = 'E-mail é obrigatório.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) {
        this.erros['email'] = 'E-mail inválido.';
      }
      if (!this.form.password || this.form.password.trim() === '') {
        this.erros['password'] = 'Senha é obrigatória.';
      } else if (this.form.password.length < 6) {
        this.erros['password'] = 'Senha deve ter pelo menos 6 caracteres.';
      }
      if (Object.keys(this.erros).length === 0) {
        this.etapaAtual = 2;
      }
    } else if (this.etapaAtual === 2) {
      if (!this.form.jogos_favoritos || this.form.jogos_favoritos.length === 0) {
        this.erros['jogos_favoritos'] = 'Selecione pelo menos um jogo favorito.';
      }
      if (!this.form.platforms || this.form.platforms.length === 0) {
        this.erros['platforms'] = 'Selecione pelo menos uma plataforma.';
      }
      if (!this.form.game_style || this.form.game_style.trim() === '') {
        this.erros['game_style'] = 'Estilo de jogo é obrigatório.';
      }
      if (!this.form.profile || this.form.profile.trim() === '') {
        this.erros['profile'] = 'Descrição é obrigatória.';
      }
      if (Object.keys(this.erros).length === 0) {
        this.etapaAtual = 3;
      }
    } else if (this.etapaAtual === 3) {
      const hasHorarios = Object.values(this.horariosSelecionados).some((horarios: string[]) => horarios.length > 0);
      if (!hasHorarios) {
        this.erros['available_times'] = 'Selecione pelo menos um horário disponível.';
      }
      if (Object.keys(this.erros).length === 0) {
        this.submit();
      }
    }
  }

  voltarEtapa() {
    if (this.etapaAtual > 1) this.etapaAtual--;
  }

  getAvailableTimes(): string {
    return JSON.stringify(this.horariosSelecionados);
  }

  submit(): void {
    // Inclui horários selecionados como string JSON
    this.form.available_times = this.getAvailableTimes();
    this.loading = true;
    this.error = '';
    this.errorDetails = '';
    console.log('[REGISTER] Enviando cadastro...', {
      name: this.form.name,
      email: this.form.email,
      jogos_favoritos: this.form.jogos_favoritos,
      platforms: this.form.platforms,
      hasAvatar: !!this.avatarFile
    });

    // Monta FormData para envio multipart (avatar + campos)
    const fd = new FormData();
    fd.append('name', this.form.name || '');
    fd.append('nickname', this.form.nickname || '');
    fd.append('email', this.form.email || '');
    fd.append('password', this.form.password || '');
    fd.append('game_style', this.form.game_style || '');
    fd.append('available_times', this.form.available_times || '');
    fd.append('profile', this.form.profile || '');
    // Arrays como JSON para o backend parsear
    fd.append('platforms', JSON.stringify(this.form.platforms || []));
    fd.append('jogos_favoritos', JSON.stringify(this.form.jogos_favoritos || []));
    if (this.avatarFile) {
      fd.append('avatar', this.avatarFile, this.avatarFile.name);
    }

    this.auth.register(fd).subscribe({
      next: (resp) => {
        this.loading = false;
        this.ok = true;
        console.log('[REGISTER] Sucesso', resp);
        setTimeout(() => this.router.navigateByUrl('/login'), 1200);
      },
      error: (err) => {
        this.loading = false;
        // Trata mensagens específicas e validações
        const payload = err?.error;
        let msg: string | undefined;
        if (payload?.error) {
          msg = payload.error;
        } else if (Array.isArray(payload?.errors) && payload.errors.length) {
          msg = payload.errors.map((e: any) => e.msg).join(' | ');
        }
        if (!msg) {
          if (typeof payload === 'string' && payload.length < 300) {
            msg = payload;
          } else if (err.status === 0) {
            msg = 'Servidor inacessível (verifique se API está rodando)';
          }
        }
        this.error = msg || 'Falha no cadastro';
        this.errorDetails = `status=${err.status}; statusText=${err.statusText}; tipoPayload=${typeof payload}`;
        console.warn('Erro ao cadastrar', { err, payload, mapped: this.error });
      }
    });
  }

  avatarFile: File | null = null;
  avatarPreview: string | null = null;
  avatarError = '';
  errorDetails: string = '';

  onAvatarChange(ev: any) {
    const file: File = ev.target.files?.[0];
    this.avatarError = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      this.avatarError = 'Arquivo não é uma imagem';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.avatarError = 'Imagem maior que 20MB';
      return;
    }
    this.avatarFile = file;
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview = reader.result as string;
    reader.readAsDataURL(file);
  }
}