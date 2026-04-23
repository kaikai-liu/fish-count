import { json } from '@sveltejs/kit';
export const GET = () => json({ ok: true, service: 'fishcount', ts: new Date().toISOString() });
