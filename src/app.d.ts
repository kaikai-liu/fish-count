// See https://svelte.dev/docs/kit/types#app
import type { Logger } from 'pino';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      logger: Logger;
      requestId: string;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
