// Simple hash-based router using Svelte 5 runes
class Router {
  current = $state(window.location.hash.slice(2) || '');

  constructor() {
    window.addEventListener('hashchange', () => {
      this.current = window.location.hash.slice(2) || '';
    });
  }

  navigate(path: string) {
    window.location.hash = '#/' + path;
  }
}

export const router = new Router();
