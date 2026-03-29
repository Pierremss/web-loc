import { Injectable } from '@angular/core';

type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = false;
  mode: ThemeMode = 'system';

  private readonly storageKey = 'webloc-theme';
  private mediaQuery?: MediaQueryList;

  constructor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
    this.mode = this.restoreMode();
    this.isDark = this.resolveDarkState(this.mode);
    this.apply();

    if (this.mediaQuery) {
      const listener = (event: MediaQueryListEvent) => {
        if (this.mode === 'system') {
          this.isDark = event.matches;
          this.apply();
        }
      };

      try {
        this.mediaQuery.addEventListener('change', listener);
      } catch {
        this.mediaQuery.addListener(listener);
      }
    }
  }

  toggle() {
    const next = this.isDark ? 'light' : 'dark';
    this.setMode(next);
  }

  setDark(dark: boolean) {
    this.setMode(dark ? 'dark' : 'light');
  }

  setMode(mode: ThemeMode) {
    this.mode = mode;
    this.persistMode(mode);
    this.isDark = this.resolveDarkState(mode);
    this.apply();
  }

  private resolveDarkState(mode: ThemeMode) {
    if (mode === 'dark') {
      return true;
    }
    if (mode === 'light') {
      return false;
    }
    return this.mediaQuery ? this.mediaQuery.matches : false;
  }

  private apply() {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;

    if (this.mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', this.mode);
    }

    const body = document.body;
    if (body) {
      body.classList.toggle('dark', this.isDark);
    }
    root.classList.toggle('dark', this.isDark);
    root.style.setProperty('color-scheme', this.isDark ? 'dark' : 'light');
  }

  private restoreMode(): ThemeMode {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {}
    return 'system';
  }

  private persistMode(mode: ThemeMode) {
    try {
      localStorage.setItem(this.storageKey, mode);
    } catch {}
  }
}
