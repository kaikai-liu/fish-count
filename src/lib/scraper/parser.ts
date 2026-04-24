// src/lib/scraper/parser.ts
// Pure HTML → CatchRow[] transform. No I/O. No DB. No network.
//
// Contract:
//   - parsePage(html) walks div.panel > table.table-stripped > tbody > tr
//   - Each <tr> expands into 0+ CatchRow entries (one per dock-totals species fragment)
//   - Row-level failure (shape or Zod) → append to failures[] and continue (D-07 quarantine)
//   - MUST NEVER throw. Even on empty string, garbage HTML, or unexpected shapes.
//     Cheerio's tolerant parser + this module's explicit guards make this true.
//
// Source HTML structure (verified via live probe 2026-04-23 — see RESEARCH.md §Summary):
//   <div class='panel'>
//     <h2 class="panel-heading">{landing name} Fish Counts for {date}</h2>
//     <table class='table table-stripped'>
//       <tbody>
//         <tr>
//           <td><a href="/charter_boats/{slug}.php"><b>{boat}</b></a>
//               <a href="/landings/{slug}">{landing}</a><br>{city}</td>
//           <td>{N} Anglers<br><a href="...">{trip_type}</a></td>
//           <td>{N1} {Species1}, {N2} {Species2}, {N3} {Species3} <font color="red">Released</font></td>
//         </tr>
//       </tbody>
//     </table>
//   </div>
//
// "Released" qualifier handling (Open Question 1 resolution):
//   <font color="red">Released</font> appears AFTER a species count
//   (e.g., "15 Spiny Lobster Released"). Cheerio's .text() strips the <font>
//   tag but keeps "Released". Per plan decision, we STORE VERBATIM:
//   "spiny lobster released" becomes a distinct species row from "spiny lobster".
//   Do NOT strip "Released" — that is a Phase 2 display concern.
//
// Threat mitigations (see plan <threat_model>):
//   - T-01-13 (Tampering): Zod min(1) at CatchRowSchema rejects empty strings
//   - T-01-14 (DoS huge input): Cheerio is memory-bounded by input size; no recursion
//   - T-01-15 (Info disclosure): raw_html_snippet stored for replay; no PII in source
//   - T-01-16 (EoP via transform): only .toLowerCase().trim() — no eval
//   - T-01-17 (Spoofing numerics): parseInt→NaN fails Zod's int/nonnegative check
import * as cheerio from 'cheerio';
import { CatchRowSchema, type CatchRow } from './schema.ts';

export interface ParseFailure {
  row_index: number;
  raw_html_snippet: string;
  zod_error: string;
}

export function parsePage(html: string): { rows: CatchRow[]; failures: ParseFailure[] } {
  const rows: CatchRow[] = [];
  const failures: ParseFailure[] = [];

  // Cheerio never throws on malformed HTML (tolerant parser per Context7 /cheeriojs/cheerio),
  // but defend against unexpected runtime failures anyway — the parser's non-throwing
  // contract is load-bearing for the pipeline (see RESEARCH.md §Pitfall 2).
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return { rows, failures };
  }

  // Global row counter across the WHOLE page so failure row_index values are unique
  let rowIndex = -1;

  $('div.panel').each((_, panelEl) => {
    const $panel = $(panelEl);

    // Skip pager / header panels that contain no data table
    const $table = $panel.find('table.table-stripped').first();
    if ($table.length === 0) return;

    $table.find('tbody > tr').each((_, trEl) => {
      rowIndex++;
      const $tr = $(trEl);
      const $tds = $tr.find('> td');

      if ($tds.length !== 3) {
        // Shape failure: quarantine and continue (D-07)
        failures.push({
          row_index: rowIndex,
          raw_html_snippet: $.html($tr),
          zod_error: JSON.stringify([
            { code: 'shape', message: `expected 3 <td>, got ${$tds.length}` }
          ])
        });
        return;
      }

      // <td 0>: boat anchor + landing anchor + city
      const $boatCell = $tds.eq(0);
      const source_name = $boatCell.find('a > b').first().text().trim();
      const source_url = $boatCell.find("a[href*='/charter_boats/']").first().attr('href') || undefined;
      const $landingAnchor = $boatCell.find("a[href*='/landings/']").first();
      const landing_source_name = $landingAnchor.text().trim();
      const landing_source_url = $landingAnchor.attr('href') || undefined;

      // <td 1>: "{N} Anglers<br><a>{trip_type}</a>"
      const $tripCell = $tds.eq(1);
      const tripCellText = $tripCell.text();
      const anglerMatch = tripCellText.match(/(\d+)\s+Anglers/i);
      const angler_count = anglerMatch ? parseInt(anglerMatch[1], 10) : NaN;
      const trip_type = $tripCell.find('a').first().text().trim(); // VERBATIM per D-08

      // <td 2>: "{N1} {Species1}, {N2} {Species2} Released, ..."
      // Strategy: get text() (Cheerio drops <font> tags but keeps inner "Released"),
      // then split on commas. For each fragment, match leading integer + remainder
      // (which may end in " Released"). Fragment-level shape failures are silently
      // skipped here because Zod will catch anything that matters.
      const $dockCell = $tds.eq(2);
      const dockText = $dockCell.text();
      const fragments = dockText.split(',').map((s) => s.trim()).filter(Boolean);

      for (const frag of fragments) {
        const m = frag.match(/^(\d+)\s+(.+)$/);
        if (!m) continue;
        const candidate = {
          source_name,
          landing_source_name,
          trip_type,
          angler_count,
          species: m[2], // schema transform lowercases + trims (D-03)
          species_count: parseInt(m[1], 10),
          source_url,
          landing_source_url
        };
        const result = CatchRowSchema.safeParse(candidate);
        if (!result.success) {
          failures.push({
            row_index: rowIndex,
            raw_html_snippet: $.html($tr),
            zod_error: JSON.stringify(result.error.issues)
          });
          continue;
        }
        rows.push(result.data);
      }
    });
  });

  return { rows, failures };
}
