// scripts/_sveltekit-env-resolver.mjs
// Resolver hooks for the SvelteKit `$env/dynamic/private` virtual module.
// Loaded by scripts/_sveltekit-env-loader.mjs via Node's module.register().
//
// Only intercepts `$env/dynamic/private` — every other specifier passes through
// to the next loader (tsx / Node default).

const VIRTUAL_SPECIFIER = '$env/dynamic/private';
const VIRTUAL_URL = 'sveltekit-env-virtual:dynamic-private';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === VIRTUAL_SPECIFIER) {
    return { url: VIRTUAL_URL, shortCircuit: true, format: 'module' };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === VIRTUAL_URL) {
    // process.env-backed Proxy so any get/set forwards to process.env at runtime
    // (matches tests/helpers/sveltekit-env-shim.ts).
    const source = `
      export const env = new Proxy({}, {
        get(_t, k) { return process.env[k]; },
        set(_t, k, v) {
          if (v === undefined) { delete process.env[k]; }
          else { process.env[k] = String(v); }
          return true;
        }
      });
    `;
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
