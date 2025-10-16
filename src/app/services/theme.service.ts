import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = false;

  constructor() {
    try {
      const saved = localStorage.getItem('webloc-theme');
      this.isDark = saved === 'dark' || (saved === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch {
      this.isDark = false;
    }
    this.apply();
  }

  toggle() {
    this.isDark = !this.isDark;
    try { localStorage.setItem('webloc-theme', this.isDark ? 'dark' : 'light'); } catch {}
    this.apply();
  }

  setDark(dark: boolean) {
    this.isDark = dark;
    try { localStorage.setItem('webloc-theme', this.isDark ? 'dark' : 'light'); } catch {}
    this.apply();
  }

  private apply() {
    try {
      document.body.classList.toggle('dark', this.isDark);
    } catch {}
  }
}
