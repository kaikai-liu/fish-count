// src/routes/+layout.server.ts — Phase 8 Plan 04 (THM-02 / D-28).
//
// Surfaces the validated theme (read from the fc_theme cookie in
// hooks.server.ts) to the client layout so the ThemeToggle component
// renders with the correct initial state on every navigation.
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => ({
  theme: locals.theme
});
