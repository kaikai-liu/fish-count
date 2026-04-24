// src/lib/scraper/schema.ts
// Per-row Zod schema for parsed scraped catch rows. Quarantine-on-failure per D-07
// (see .planning/phases/01-ingest-store/01-CONTEXT.md).
//
// Invariants:
//   - D-03: species is lowercased + trimmed by the schema transform (single source of
//     truth; parser feeds raw strings — normalization lives here).
//   - D-08: trip_type is stored VERBATIM from the source. No allow-list validation
//     against CLAUDE.md's domain language (novelty is data, not error; the canonical
//     domain list is a display-layer concern for Phase 2).
//   - "<species> Released" qualifier is preserved verbatim per Open Question 1
//     resolution (e.g., "Spiny Lobster Released" → "spiny lobster released" after
//     the transform). The parser does NOT strip "Released".
//
// Threats mitigated (see plan <threat_model>):
//   - T-01-13 (Tampering on species/trip_type): z.string().min(1) rejects empty
//   - T-01-16 (Elevation of Privilege via transform): transform contains only
//     `toLowerCase().trim()` — no eval, no prototype access
//   - T-01-17 (Spoofing malformed numerics): z.number().int().nonnegative() rejects
//     NaN, floats, and negatives
import { z } from 'zod';

export const CatchRowSchema = z.object({
  // boat name (verbatim from source <a><b>...</b></a>); display normalization is Phase 2
  source_name: z.string().min(1),

  // landing name (verbatim from source <a href="/landings/..."> anchor text);
  // display normalization is Phase 2 (e.g., "Pt Loma Sportfishing" → canonical CLAUDE.md name)
  landing_source_name: z.string().min(1),

  // verbatim per D-08 — no normalization to CLAUDE.md canonical trip-type list
  trip_type: z.string().min(1),

  // parsed from "N Anglers"; parseInt→NaN fails nonnegative/int check
  angler_count: z.number().int().nonnegative(),

  // D-03: lowercased + trimmed. "Spiny Lobster Released" → "spiny lobster released"
  species: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase().trim()),

  // parsed from leading "N Species" fragment
  species_count: z.number().int().nonnegative(),

  // Optional source-site URLs surfaced now to unblock Phase 2 BRW-02 ("link back to
  // source") without a schema migration. Populated by the parser from row anchors.
  source_url: z.string().optional(),
  landing_source_url: z.string().optional()
});

export type CatchRow = z.infer<typeof CatchRowSchema>;
