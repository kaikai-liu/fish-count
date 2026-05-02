// See https://svelte.dev/docs/kit/types#app
import type { Logger } from 'pino';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      logger: Logger;
      requestId: string;
      // Phase 8 Plan 04 (THM-02 / D-28): hooks.server resolves the validated
      // theme from the fc_theme cookie and stashes it on locals so
      // +layout.server.ts can return it to the client.
      theme: import('$lib/shared/theme').Theme;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
