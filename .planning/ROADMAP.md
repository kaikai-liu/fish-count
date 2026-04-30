# Roadmap: FishCount

## Milestones

- ✅ **v1.0 — Browse + Picker + Forecast** (early-closed) — Phases 0–3 (shipped 2026-04-30) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 📋 **v2 — Multi-Axis Trend Explorer** (planning) — direction locked via pivot, scope TBD via `/gsd-new-milestone`

## Phases

<details>
<summary>✅ v1.0 (Phases 0–3) — SHIPPED 2026-04-30 (early close, pivot to v2)</summary>

- [x] Phase 0: Ops Guardrails (6/7 plans, OPS-02 deferred to operator) — completed 2026-04-23
- [x] Phase 1: Ingest + Store (9/9 plans) — completed 2026-04-24
- [x] Phase 2: Browse + Trip Picker + Trends (7/7 plans) — completed 2026-04-25
- [x] Phase 3: Forecast Layer (6/6 plans) — completed 2026-04-26
- [retired] Phase 4: Email Alerts — never executed (12 ALT requirements carry to v2)
- [retired] Phase 5: Polish — never executed (3 POL requirements carry to v2)

Full archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) · [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) · [milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md) · [milestones/v1.0-phases/](milestones/v1.0-phases/)

</details>

### 📋 v2 — Multi-Axis Trend Explorer (Planning)

Phases not yet defined. Anticipated scope (subject to `/gsd-new-milestone` Socratic pass):

- [ ] Phase 6: TBD — Trend explorer redesign (the new "ticker" interface)
- [ ] Phase 7: TBD — Email alerts (carried from retired v1 Phase 4 with redesigned triggers)
- [ ] Phase 8: TBD — Polish (carried from retired v1 Phase 5)

Plus likely operator-cleanup phases for OPS-02 live deploy + ING-10/11 outreach completion + the `picker/+page.svelte:180` integration defect (only if v2 keeps the route).

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0. Ops Guardrails | v1.0 | 6/7 (OPS-02 deferred) | Code complete; deploy operator-gated | 2026-04-23 |
| 1. Ingest + Store | v1.0 | 9/9 | Code complete; first-scrape operator-gated | 2026-04-24 |
| 2. Browse + Trip Picker + Trends | v1.0 | 7/7 | Complete | 2026-04-25 |
| 3. Forecast Layer | v1.0 | 6/6 | Complete (retired in v2) | 2026-04-26 |
| 4. Email Alerts | v1.0 | 0/TBD | Retired with v1.0 close (carries to v2) | — |
| 5. Polish | v1.0 | 0/TBD | Retired with v1.0 close (carries to v2) | — |
| 6+ TBD | v2 | — | Not yet planned | — |

---

*Roadmap created: 2026-04-22*
*v1.0 milestone closed: 2026-04-30*
*Next: `/gsd-new-milestone` to define v2 direction*
