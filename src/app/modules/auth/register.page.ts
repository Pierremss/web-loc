import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { GamesService } from '../games/games.service';
import { Platform } from '../../model/platform';
import { PlatformsService } from '../../services/platforms.service';
import { GenresService } from '../../services/genres.service';
import { GameTypesService } from '../../services/game-types.service';

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
    const normalizedValue = this.normalizePeriodValue(periodo);
    if (!normalizedValue) return;
    const current = Array.isArray(this.horariosSelecionados[dia])
      ? this.normalizePeriodList(this.horariosSelecionados[dia])
      : [];
    if (checked) {
      if (!current.includes(normalizedValue)) current.push(normalizedValue);
    } else {
      const index = current.indexOf(normalizedValue);
      if (index !== -1) current.splice(index, 1);
    }
    this.horariosSelecionados[dia] = this.normalizePeriodList(current);
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
  platformOptions: Platform[] = [];
  genreOptions: any[] = [];
  typeOptions: any[] = [];
  diasSemana: string[] = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  periodos: { label: string; value: string }[] = [
    { label: 'Manhã', value: 'Manha' },
    { label: 'Tarde', value: 'Tarde' },
    { label: 'Noite', value: 'Noite' },
    { label: 'Madrugada', value: 'Madrugada' },
  ];
  horariosSelecionados: { [dia: string]: string[] } = {};
  loading: boolean = false;
  error: string = '';
  ok: boolean = false;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly gamesService = inject(GamesService);
  private readonly platformsService = inject(PlatformsService);
  private readonly genresService = inject(GenresService);
  private readonly typesService = inject(GameTypesService);

  constructor() {
    // Inicializa todos os dias com array vazio
    this.diasSemana.forEach((dia) => this.horariosSelecionados[dia] = []);
    this.horariosSelecionados = this.normalizeScheduleMap(this.horariosSelecionados);
  }

  ngOnInit(): void {
    this.gamesService.list().subscribe((jogos) => this.jogos = jogos);
    this.platformsService.list().subscribe(platforms => {
      this.platformOptions = platforms.sort((a, b) => a.name.localeCompare(b.name));
    });
    this.genresService.list().subscribe(list => this.genreOptions = list.sort((a: any,b:any)=>a.name.localeCompare(b.name)));
    this.typesService.list().subscribe(list => this.typeOptions = list.sort((a: any,b:any)=>a.name.localeCompare(b.name)));
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
      } else if (this.isAdminEmail(this.form.email)) {
        this.erros['email'] = 'Este endereço é reservado para o administrador.';
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
      const jogosSelecionados = this.normalizeIdArray(this.form.jogos_favoritos);
      this.form.jogos_favoritos = jogosSelecionados;
      if (!jogosSelecionados.length) {
        this.erros['jogos_favoritos'] = 'Selecione pelo menos um jogo favorito.';
      }
      const plataformasSelecionadas = this.normalizeIdArray(this.form.platforms);
      this.form.platforms = plataformasSelecionadas;
      if (!plataformasSelecionadas.length) {
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

  handleNavBack(): void {
    if (this.etapaAtual > 1) {
      this.voltarEtapa();
    } else {
      void this.router.navigateByUrl('/home');
    }
  }

  goToHome(): void {
    void this.router.navigateByUrl('/home');
  }

  getAvailableTimes(): string {
    const normalized = this.normalizeScheduleMap(this.horariosSelecionados);
    this.horariosSelecionados = normalized;
    return JSON.stringify(normalized);
  }

  submit(): void {
    // Inclui horários selecionados como string JSON
    this.form.available_times = this.getAvailableTimes();
    this.loading = true;
    this.error = '';
    this.errorDetails = '';
    if (this.isAdminEmail(this.form.email)) {
      this.loading = false;
      this.error = 'Este endereço de e-mail não pode ser utilizado.';
      return;
    }
    const platformIds = this.normalizeIdArray(this.form.platforms);
    const favoriteIds = this.normalizeIdArray(this.form.jogos_favoritos);
    if (!platformIds.length) {
      this.loading = false;
      this.error = 'Selecione pelo menos uma plataforma válida.';
      return;
    }
    this.form.platforms = platformIds;
    this.form.jogos_favoritos = favoriteIds;
    console.log('[REGISTER] Enviando cadastro...', {
      name: this.form.name,
      email: this.form.email,
      jogos_favoritos: favoriteIds,
      platforms: platformIds,
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
  fd.append('platforms', JSON.stringify(platformIds));
  fd.append('jogos_favoritos', JSON.stringify(favoriteIds));
  // anexar gêneros e tipos selecionados (se existirem)
  const genres = this.normalizeIdArray(this.form.genres || []);
  const types = this.normalizeIdArray(this.form.types || []);
  if (genres.length) fd.append('genres', JSON.stringify(genres));
  if (types.length) fd.append('types', JSON.stringify(types));
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

  private readonly periodMap: Record<string, string> = {
    manha: 'Manha',
    tarde: 'Tarde',
    noite: 'Noite',
    madrugada: 'Madrugada',
  };

  private normalizePeriodValue(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    const key = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return this.periodMap[key] || trimmed;
  }

  private normalizePeriodList(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((value) => {
      const normalized = this.normalizePeriodValue(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });
    const order = new Map(this.periodos.map((option, index) => [option.value, index]));
    result.sort((a, b) => (order.get(a) ?? 100) - (order.get(b) ?? 100));
    return result;
  }

  private normalizeScheduleMap(source: { [dia: string]: string[] }): { [dia: string]: string[] } {
    const normalized: { [dia: string]: string[] } = {};
    const byDayKey = new Map<string, string[]>();
    Object.entries(source || {}).forEach(([dia, periods]) => {
      const key = this.normalizeDayKey(dia);
      if (!Array.isArray(periods)) return;
      const list = this.normalizePeriodList(periods);
      if (!byDayKey.has(key)) {
        byDayKey.set(key, list);
      } else {
        byDayKey.set(key, this.normalizePeriodList([...(byDayKey.get(key) ?? []), ...list]));
      }
    });
    this.diasSemana.forEach((dia) => {
      const key = this.normalizeDayKey(dia);
      normalized[dia] = this.normalizePeriodList(byDayKey.get(key) ?? []);
    });
    return normalized;
  }

  private normalizeDayKey(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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

  private normalizeIdArray(value: any): number[] {
    if (!Array.isArray(value)) return [];
    const ids = value
      .map((item: any) => {
        if (typeof item === 'number') return item;
        if (typeof item === 'string' && item.trim() !== '') return Number(item);
        if (item && typeof item === 'object' && 'id' in item) return Number(item.id);
        return NaN;
      })
      .filter((id: number) => Number.isInteger(id) && id > 0);
    return Array.from(new Set(ids));
  }

  private isAdminEmail(email: string): boolean {
    return String(email ?? '').trim().toLowerCase() === 'admin@gmail.com';
  }
}