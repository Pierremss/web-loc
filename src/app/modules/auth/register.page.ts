import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { GamesService, Game } from '../games/games.service';
import { Platform } from '../../model/platform';
import { PlatformsService } from '../../services/platforms.service';
import { GenresService } from '../../services/genres.service';
import { GameTypesService } from '../../services/game-types.service';
import { ThemeService } from '../../services/theme.service';
import { Subject, catchError, debounceTime, finalize, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false,
})
export class RegisterPage implements OnInit {

  readonly theme = inject(ThemeService);

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
    types: [],
    available_times: '',
    profile: ''
  };
  jogos: any[] = [];
  platformOptions: Platform[] = [];
  genreOptions: any[] = [];
  typeOptions: any[] = [];

  // Pickers (busca + filtros para listas grandes)
  isGamePickerOpen = false;
  isPlatformPickerOpen = false;
  isTypePickerOpen = false;
  isGenrePickerOpen = false;

  gamePickerSearch = '';
  gamePickerGenreIds: number[] = [];
  gamePickerLoading = false;
  gamePickerResults: Game[] = [];

  platformPickerSearch = '';
  typePickerSearch = '';
  genrePickerSearch = '';
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
  verificationStep = false;
  verificationEmail = '';
  verificationDelivered = false;
  verificationExpiresAt: string | null = null;
  verificationMessage = '';
  verificationCode = '';
  verificationError = '';
  verificationSuccess = false;
  verificationResendLoading = false;
  verificationConfirmLoading = false;
  verificationInfo = '';

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly gamesService = inject(GamesService);
  private readonly platformsService = inject(PlatformsService);
  private readonly genresService = inject(GenresService);
  private readonly typesService = inject(GameTypesService);
  private readonly destroyRef = inject(DestroyRef);

  get themeToggleIcon(): string {
    return this.theme.isDark ? 'sunny-outline' : 'moon-outline';
  }

  get themeToggleText(): string {
    return this.theme.isDark ? 'Tema claro' : 'Tema escuro';
  }

  get themeToggleAria(): string {
    return this.theme.isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
  }

  toggleTheme() {
    this.theme.toggle();
  }

  private readonly gameSearchTrigger$ = new Subject<void>();

  constructor() {
    // Inicializa todos os dias com array vazio
    this.diasSemana.forEach((dia) => this.horariosSelecionados[dia] = []);
    this.horariosSelecionados = this.normalizeScheduleMap(this.horariosSelecionados);
  }

  ngOnInit(): void {
    this.setupGamePickerSearch();
    this.platformsService.list().subscribe(platforms => {
      this.platformOptions = platforms.sort((a, b) => a.name.localeCompare(b.name));
    });
    this.genresService.list().subscribe(list => this.genreOptions = list.sort((a: any,b:any)=>a.name.localeCompare(b.name)));
    this.typesService.list().subscribe(list => this.typeOptions = list.sort((a: any,b:any)=>a.name.localeCompare(b.name)));
  }

  private setupGamePickerSearch(): void {
    this.gameSearchTrigger$
      .pipe(
        debounceTime(200),
        switchMap(() => {
          this.gamePickerLoading = true;
          const search = (this.gamePickerSearch || '').trim();
          const genres = Array.isArray(this.gamePickerGenreIds)
            ? this.gamePickerGenreIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)
            : [];

          return this.gamesService
            .list({ pageSize: 60, order: 'name', search: search || undefined, genres: genres.length ? genres : undefined })
            .pipe(
              catchError(() => of([] as Game[])),
              finalize(() => (this.gamePickerLoading = false))
            );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((games) => {
        const selected = new Set(this.normalizeIdArray(this.form.jogos_favoritos));
        const byName = (a: Game, b: Game) => (a.name || '').localeCompare(b.name || '');
        this.gamePickerResults = [...(games || [])].sort((a, b) => {
          const as = selected.has(Number(a.id));
          const bs = selected.has(Number(b.id));
          if (as && !bs) return -1;
          if (!as && bs) return 1;
          return byName(a, b);
        });
      });
  }

  openGamePicker(): void {
    this.isGamePickerOpen = true;
    this.queueGamePickerSearch();
  }

  openPlatformPicker(): void {
    this.isPlatformPickerOpen = true;
  }

  openTypePicker(): void {
    this.isTypePickerOpen = true;
  }

  openGenrePicker(): void {
    this.isGenrePickerOpen = true;
  }

  closePickers(): void {
    this.isGamePickerOpen = false;
    this.isPlatformPickerOpen = false;
    this.isTypePickerOpen = false;
    this.isGenrePickerOpen = false;
  }

  queueGamePickerSearch(): void {
    this.gameSearchTrigger$.next();
  }

  setGamePickerSearch(value: string): void {
    this.gamePickerSearch = value;
    this.queueGamePickerSearch();
  }

  setGamePickerGenres(value: any): void {
    const raw = Array.isArray(value) ? value : [];
    this.gamePickerGenreIds = raw.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
    this.queueGamePickerSearch();
  }

  selectionCountLabel(values: any[] | null | undefined, emptyLabel: string): string {
    const ids = this.normalizeIdArray(values || []);
    if (!ids.length) return emptyLabel;
    return ids.length === 1 ? '1 selecionado' : `${ids.length} selecionados`;
  }

  isSelected(field: 'jogos_favoritos' | 'platforms' | 'types' | 'genres', id: number): boolean {
    const current = this.normalizeIdArray(this.form[field] || []);
    return current.includes(Number(id));
  }

  toggleSelection(field: 'jogos_favoritos' | 'platforms' | 'types' | 'genres', id: number, checked: boolean): void {
    const normalizedId = Number(id);
    const current = this.normalizeIdArray(this.form[field] || []);
    const next = new Set<number>(current);
    if (checked) next.add(normalizedId);
    else next.delete(normalizedId);
    this.form[field] = Array.from(next);
    // Mantém erros em sincronia enquanto o usuário seleciona
    if (this.form[field].length) {
      delete this.erros[field];
    }
  }

  toggleTypeSelection(typeId: number, checked: boolean): void {
    this.toggleSelection('types', typeId, checked);
    const normalized = this.normalizeIdArray(this.form.types || []);
    this.form.types = normalized;
    this.form.game_style = this.resolvePrimaryGameStyle(normalized) || '';
    if (normalized.length) {
      delete this.erros['types'];
    }
  }

  filteredPlatforms(): Platform[] {
    const term = (this.platformPickerSearch || '').trim().toLowerCase();
    if (!term) return this.platformOptions;
    return this.platformOptions.filter((p) => (p?.name || '').toLowerCase().includes(term));
  }

  filteredTypes(): any[] {
    const term = (this.typePickerSearch || '').trim().toLowerCase();
    if (!term) return this.typeOptions;
    return this.typeOptions.filter((t) => String(t?.name || '').toLowerCase().includes(term));
  }

  filteredGenres(): any[] {
    const term = (this.genrePickerSearch || '').trim().toLowerCase();
    if (!term) return this.genreOptions;
    return this.genreOptions.filter((g) => String(g?.name || '').toLowerCase().includes(term));
  }

  trackById(_: number, item: any): number {
    return Number(item?.id) || 0;
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
      const tiposSelecionados = this.normalizeIdArray(this.form.types);
      this.form.types = tiposSelecionados;
      if (!tiposSelecionados.length) {
        this.erros['types'] = 'Selecione pelo menos um tipo de jogo.';
      } else {
        this.form.game_style = this.resolvePrimaryGameStyle(tiposSelecionados) || '';
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

  onTypeSelectionChange(event: CustomEvent): void {
    const rawValue = Array.isArray(event?.detail?.value) ? event.detail.value : [];
    const normalized = this.normalizeIdArray(rawValue);
    this.form.types = normalized;
    this.form.game_style = this.resolvePrimaryGameStyle(normalized) || '';
    if (normalized.length) {
      delete this.erros['types'];
    }
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
    const typeIds = this.normalizeIdArray(this.form.types || []);
    if (!platformIds.length) {
      this.loading = false;
      this.error = 'Selecione pelo menos uma plataforma válida.';
      return;
    }
    this.form.platforms = platformIds;
    this.form.jogos_favoritos = favoriteIds;
    this.form.types = typeIds;
    console.log('[REGISTER] Enviando cadastro...', {
      name: this.form.name,
      email: this.form.email,
      jogos_favoritos: favoriteIds,
      platforms: platformIds,
      types: typeIds,
      hasAvatar: !!this.avatarFile
    });

    // Monta FormData para envio multipart (avatar + campos)
    const fd = new FormData();
    fd.append('name', this.form.name || '');
    fd.append('nickname', this.form.nickname || '');
    fd.append('email', this.form.email || '');
    fd.append('password', this.form.password || '');
    const primaryStyle = this.resolvePrimaryGameStyle(typeIds) || this.form.game_style || '';
    fd.append('game_style', primaryStyle);
    fd.append('available_times', this.form.available_times || '');
    fd.append('profile', this.form.profile || '');
    // Arrays como JSON para o backend parsear
    fd.append('platforms', JSON.stringify(platformIds));
    fd.append('jogos_favoritos', JSON.stringify(favoriteIds));
    // anexar gêneros e tipos selecionados (se existirem)
    const genres = this.normalizeIdArray(this.form.genres || []);
    if (genres.length) fd.append('genres', JSON.stringify(genres));
    if (typeIds.length) fd.append('types', JSON.stringify(typeIds));
    if (this.avatarFile) {
      fd.append('avatar', this.avatarFile, this.avatarFile.name);
    }

    this.auth.register(fd).subscribe({
      next: (resp) => {
        this.loading = false;
        this.ok = false;
        this.handleVerificationResponse(resp);
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

  private resolvePrimaryGameStyle(typeIds: number[]): string {
    if (!Array.isArray(typeIds) || !typeIds.length) {
      return '';
    }
    const firstId = typeIds[0];
    const match = this.typeOptions.find((type: any) => Number(type?.id) === Number(firstId));
    return match?.name ?? '';
  }

  private handleVerificationResponse(resp: any): void {
    if (!resp) {
      this.error = 'Não foi possível iniciar a verificação de e-mail.';
      return;
    }
    this.verificationStep = true;
    this.etapaAtual = 4;
    this.verificationSuccess = false;
    this.verificationCode = '';
    this.verificationError = '';
    this.verificationEmail = String(resp.email || this.form.email || '').trim().toLowerCase();
    this.verificationDelivered = Boolean(resp.delivered);
    this.verificationExpiresAt = resp.expiresAt ?? null;
    this.verificationMessage = resp.message ?? '';
    this.verificationInfo = resp.expiresInMinutes
      ? `O código expira em ${resp.expiresInMinutes} minutos.`
      : '';
  }

  resendVerification(): void {
    if (!this.verificationEmail) return;
    this.verificationResendLoading = true;
    this.verificationError = '';
    this.auth.sendVerificationCode(this.verificationEmail).subscribe({
      next: (resp) => {
        this.verificationResendLoading = false;
        this.verificationDelivered = Boolean(resp.delivered);
        this.verificationMessage = resp.message ?? 'Novo código gerado.';
        this.verificationInfo = resp.expiresInMinutes
          ? `O código expira em ${resp.expiresInMinutes} minutos.`
          : '';
        this.verificationExpiresAt = resp.expiresAt ?? null;
      },
      error: (err) => {
        this.verificationResendLoading = false;
        const payload = err?.error;
        if (payload?.error) {
          this.verificationError = payload.error;
        } else if (Array.isArray(payload?.errors) && payload.errors.length) {
          this.verificationError = payload.errors.map((e: any) => e.msg).join(' | ');
        } else {
          this.verificationError = 'Não foi possível reenviar o código.';
        }
      }
    });
  }

  confirmVerification(): void {
    if (!this.verificationEmail || !this.verificationCode || this.verificationConfirmLoading) {
      this.verificationError = 'Informe o código de 6 dígitos.';
      return;
    }
    this.verificationConfirmLoading = true;
    this.verificationError = '';
    this.auth.confirmVerification(this.verificationEmail, this.verificationCode).subscribe({
      next: (resp) => {
        this.verificationConfirmLoading = false;
        this.verificationSuccess = true;
        this.verificationMessage = resp.alreadyVerified
          ? 'E-mail já estava verificado. Você pode entrar agora.'
          : 'E-mail verificado com sucesso! Você pode fazer login.';
        setTimeout(() => this.router.navigateByUrl('/login'), 1200);
      },
      error: (err) => {
        this.verificationConfirmLoading = false;
        const payload = err?.error;
        if (payload?.error) {
          this.verificationError = payload.error;
        } else if (Array.isArray(payload?.errors) && payload.errors.length) {
          this.verificationError = payload.errors.map((e: any) => e.msg).join(' | ');
        } else {
          this.verificationError = 'Código inválido ou expirado.';
        }
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
    let source: any[] = [];
    if (Array.isArray(value)) {
      source = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
      try {
        const parsed = JSON.parse(value.trim());
        if (Array.isArray(parsed)) {
          source = parsed;
        } else {
          source = value.split(',').map((item) => item.trim()).filter(Boolean);
        }
      } catch {
        source = value.split(',').map((item) => item.trim()).filter(Boolean);
      }
    } else if (value && typeof value === 'object' && 'length' in value) {
      source = Array.from(value as any[]);
    } else {
      return [];
    }

    const ids = source
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