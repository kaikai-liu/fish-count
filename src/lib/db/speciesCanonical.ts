// src/lib/db/speciesCanonical.ts — read-time species canonicalization.
//
// Polish pass (post-Phase 8). The source site records bluefin/yellowfin tuna
// with verbatim size-class suffixes — "bluefin tuna (up to 100 pounds)",
// "bluefin tuna (up to 280 pounds)", etc. — producing 100+ near-duplicate
// species values. Anglers think in terms of "bluefin tuna," not weight bins.
//
// Strategy (mirrors the trip-type alias pattern in aliases.ts but with no
// table — the rule is regular and stable enough to express as a SQL CASE):
//   - "<species> (up to N pounds)" → "<species>"  (collapse size variants)
//   - "<species> released"          → unchanged   (kept-and-released is a
//                                                  meaningful angler signal)
//
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// Discipline: this constant is the SOLE legitimate canonical-species SQL
// fragment. Never inline the regex/CASE elsewhere.
//
// Read-time only — raw catch_reports.species is never mutated, so reverting
// is a code change away.

/**
 * SQL expression that resolves to the canonical species label for the
 * `cr` (catch_reports) alias. Use as a SELECT, GROUP BY, or WHERE expression.
 *
 * Example:
 *   `WHERE ${CANONICAL_SPECIES_EXPR} = @species`
 *   `GROUP BY ${CANONICAL_SPECIES_EXPR}`
 */
export const CANONICAL_SPECIES_EXPR = `
  CASE
    WHEN cr.species LIKE '% (up to % pounds)'
      THEN trim(substr(cr.species, 1, instr(cr.species, ' (up to ') - 1))
    ELSE cr.species
  END
`;
