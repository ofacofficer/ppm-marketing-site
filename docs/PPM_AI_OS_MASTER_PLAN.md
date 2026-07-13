# PPM AI OS — Master Build Plan

**Company:** Proactive Property Management (PPM) — Daniel Rivera, President
**Mission of this document:** Turn PPM into an automated property-management company run by a team of Claude agents and subagents, with Slack as the conversational interface and the **PPM AI OS** as the single command center for every action and all monitoring.

**How to use this document:** This is the master guide for **Claude Code**. It is written so an engineering agent can execute it end-to-end with minimal further input from Dan. Work the phases in order (§9). Each phase has explicit **acceptance criteria**. Where a step needs a secret or a one-time human action, it is listed in §12 (Open items) — everything else is autonomous. Do not invent scope; when a detail is missing, prefer the smallest change that satisfies the acceptance criteria and log a question to `#exec-suite` rather than blocking.

**Status of the world (as of 2026-06-29):** This is **not** greenfield. A substantial AI OS already exists and the *body* (data sync + deterministic engines) runs on schedule today; the *brain* (Claude agent layer) is built but has been idle ~1 week. The strategy chosen by Dan is **Evolve & Consolidate**: revive and complete what exists, finish the migration off n8n, remove duplication, and elevate Claude agents from "chat personas" to the actual operators of the business.

---

## 1. Locked decisions (the constitution)

These were decided by Dan and are binding for the whole build. Encode them in `exec_settings` and `brand_constants`, and reference them everywhere.

| # | Decision | Value |
|---|----------|-------|
| D1 | **Build approach** | Evolve & consolidate the existing OS. Keep the Buildium mirror, Supabase `ppm-db`, the Vercel command-center dashboard, the decision-tier guardrails, and the 6 exec agents. Finish the n8n→agent/edge migration. Delete duplication. |
| D2 | **Autonomy posture** | **Bounded autonomy.** Agents act within preset limits; money over threshold, owner payouts, legal/eviction/fair-housing, and new vendors require Dan's Slack approval. |
| D3 | **Spend guardrails** | Auto-approve a single repair/bill **≤ $250** AND cumulative **≤ $750/month per property**. Anything above either cap, any owner distribution, and any **new vendor** → Dan approval. |
| D4 | **External comms** | **Auto-send routine, draft sensitive.** Routine templated comms (repair updates, rent reminders, scheduling) send autonomously. Anything novel, legal, money-related, or complaint-related is drafted for Dan's one-tap approval. |
| D5 | **Priority order** | (1) **Maintenance & repairs**, (2) **Rent / AR & owner money**, (3) **Leasing & vacancies**, then (4) Growth & owner experience. |
| D6 | **Human team** | **Dan + a VA/assistant.** AI runs operations and coordinates licensed vendors. The VA handles in-person/physical work (showings, inspections, lockboxes, signatures) and exceptions, fed via a **"My Tasks" queue in the command-center dashboard.** |
| D7 | **Run budget** | **Standard (~$600–1,500/mo)** all-in. Model tiering: **Haiku** for cheap classification/triage, **Sonnet 4.6** default for workers and conversation, **Opus 4.8** for orchestration, month-end close, compliance/legal reasoning, and ambiguous judgment. |

**Operating principles (non-negotiable):**
1. **Buildium is the system of record.** Agents never hold authoritative state; they read the mirror and write back to Buildium via the controlled write path. The mirror is a cache, not the truth.
2. **Every consequential action is a logged decision.** No money moves, no external message sends, no Buildium write happens without a row in `decision_ledger` (or an equivalent audit log) tying it to an actor, a tier, evidence, and an outcome.
3. **Bounded autonomy by default; humans on the exceptions.** The default is the agent acts within policy; the human is pulled in only at the guardrail boundaries (§5).
4. **Compliance is a hard gate, not a suggestion.** Rent control, eviction, security deposits, and fair housing are never handled autonomously. NJ has 117+ municipal rent-control ordinances — always verify local rules (CCO owns this).
5. **One command center.** Dan should be able to see status and take any action from Slack and/or the dashboard. No action requires logging into Buildium/QuickBooks/etc. directly.
6. **Fail safe, fail loud.** On uncertainty, agents stop and ask in Slack rather than guess. Every agent run is observable and reversible where possible.

---

## 2. Current-state baseline (what already exists — inventory for Claude Code)

### 2.1 Surfaces
- **Marketing site** — static Astro build in this repo (`ppm-marketing-site`), served on Netlify at `njpropertymanager.com`. Owned by CGO.
- **PPM AI OS dashboard (command center)** — Vercel project **`ppm-ai-os-dashboard`** (team `team_3bDqh0CUA02JqJYblIVAxRV8`). This is the canvas for the command center in §7.
- **Supabase `ppm-db`** — project `tpwnpzpuqrgbzislgoif` (region us-west-2). The brain/state store + edge functions + cron heartbeat.
- **Slack** — workspace `proactivepm.slack.com`. The conversational interface.

### 2.2 The brain: Supabase `ppm-db`
- **~200 tables.** Major families: `bld_*` (Buildium mirror), `recon_*` / `ap_*` / `ar_*` / `cfo_*` / `gl_*` (accounting), `leasing_*`, `maintenance_*` + `vendor_*`, `marketing_*`, `compliance_*` + `fair_housing_*`, `owner_exp_*`, `kp_*` (knowledge platform), `exec_*` + `csuite_*` + `decision_*` (agent layer & governance), `builder_*` (self-build subsystem), `tech_*` (platform health), `n8n_*` (migration tracking).
- **~90 edge functions.** Notable: `buildium-sync` (mirror writer), `buildium-write` / `buildium-actions` (controlled write-back), `exec-router` + `exec-task-worker` (agent runtime), `slack-interactivity` (approvals), `decision-router`, the `recon-*` and `ap-*` / `ar-*` accounting pipeline, `cfo-monthly-close` + `cfo-yec-*` (close & year-end), `maintenance-*` (intake→dispatch→closure), `market-rent-propose`, `pandadoc-*` (e-sign), `plaid-sync`, `notify-*` / `comms-*`.
- **Cron heartbeat (pg_cron) — ALL ACTIVE.** Buildium sync (workorders `*/15`, core hourly, financials/lease-tx/vendor-tx/bank-tx on staggered minutes, 6h families); **`exec-task-worker` every minute**; nightly Postgres engines `run_maintenance()` 05:35, `run_operations()` 05:40, `run_owner_health()` 05:45, `run_leasing()` 05:50, `run_lease_lifecycle()` 05:25, `ops_nightly_autoclose()` 04:15, `mark_stale_tasks()` hourly; `cos-standup` weekdays 12:00, `cos-weekly-brief` Mon 12:30, `exec-briefing` Mon 06:00, `cfo-monthly-close` 3rd 09:00, `market-rent-propose` monthly; `ap-gmail-scan` every 3h, `recon-drive-watch` every 30m, `plaid-sync` 6h, `tech-telemetry` 15m, `tech-backlog-triage` nightly, `n8n-drawdown-drain` every 3m.

### 2.3 The agents (today)
Six exec agents are defined in `exec_agents`, all `enabled=true`, all on `claude-sonnet-4-6`, each bound to a Slack channel:

| key | role | Slack channel |
|-----|------|---------------|
| `cos` | Chief of Staff | `C0B9QCZ1V52` (exec-suite) |
| `cfo` | CFO (accounting, AP/AR, close) | `C0BAF3S33AL` |
| `coo` | COO (maintenance, leasing ops, owner exp) | `C0B9QJ3RA3W` |
| `cgo` | CGO (growth/marketing/site) | `C0B9LV1HGSE` |
| `cco` | CCO (compliance) | `C0B9EJF2R1R` |
| `cto` | CTO (platform health, the "builder") | `C0B9HHRL4LV` |

Other config in `exec_settings`: `decision_log_channel_id=C0B95ASHSJK`, `esign_admin_channel_id=C0AQC4DQ1CL`. There is **no CEO agent** — Dan is CEO. A "CEO proxy" concept exists via `kp_trigger_policies` (high-stakes detection → hold → escalate to Dan).

**Reality check:** Only COO/CFO/CTO/COS have ever been conversed with; CCO and CGO have zero history. The agents are currently **reactive** (respond when mentioned) + run a few scheduled briefings. The actual operational logic today lives mostly in **deterministic Postgres engines** (`run_maintenance()` etc.) and edge functions, not in agent reasoning. **The central transformation of this plan is to make Claude agents the operators**, using the deterministic engines and edge functions as their *tools and guardrails*.

### 2.4 Governance that already works (build on it)
- **`decision_ledger`** with tiers: **Tier 0/1 auto-execute**, **Tier 2** propose→approve/reject→execute, **Tier 3** high-stakes. 114 decisions logged with a healthy mix of auto/approved/rejected. This is the spine for bounded autonomy (§5).
- `pending_approvals`, `comms_approval_queue` + `comms_auto_approve_policy`, `decision_auto_execute_rules`, `marketing_ceo_overrides`, `kp_trigger_policies` — all the scaffolding for human-in-the-loop and red lines.
- `slack-interactivity` edge function — handles Slack button approvals.

### 2.5 Data integrations connected
Buildium (PM SOR), Plaid (bank feeds), Gmail (AP invoices, comms), Google Drive (documents/recon evidence), PandaDoc (e-sign for leases/PM agreements), Intercom (support), plus available MCP servers: Slack, Supabase, Vercel, Netlify, QuickBooks, Ahrefs/Semrush (SEO for CGO), GoDaddy, SurveyMonkey, Thumbtack (vendor sourcing), Indeed.

### 2.6 Known debt to clean up (tracked in §8)
- **n8n migration unfinished:** 68 n8n workflows still active, 262 queued to retire; `workflow_registry` has heavy duplication (469 entries, many unclassified/retired). 
- **`tech_backlog` ~13.8k open rows** — mostly auto-generated error events; needs dedup/triage, not 13.8k tickets.
- **RLS disabled on 15 tables** (exposed to anon key) — security fix required (§8.3). Do **not** blanket-enable without policies (it will break access); add policies per table.
- **~5% Buildium sync error rate** in the last 24h (24 errors) — CTO to root-cause.
- **224 `builder_backlog` items** frozen since 2026-06-12 — review, keep the self-build loop, prune stale.

---

## 3. Target architecture

### 3.1 The "brain / body" model
```
            ┌──────────────────────────────────────────────────────────┐
            │                      DAN (CEO) + VA                       │
            │   Slack (converse, approve)   ·   Command Center (act/see)│
            └───────────────▲───────────────────────────▲──────────────┘
                            │ converse / approve         │ view / act / VA tasks
        ┌───────────────────┴────────────────────────────┴──────────────┐
        │                  AGENT LAYER  (Claude — the BRAIN)             │
        │  Chief of Staff (orchestrator)                                 │
        │   ├─ CFO    ├─ COO    ├─ CGO    ├─ CCO    ├─ CTO               │
        │   each spawns task-scoped SUBAGENTS (triage, dispatch, draft…) │
        │  Governance: decision_ledger (tiers) · guardrail engine        │
        └───────────────────────────┬────────────────────────────────────┘
                                     │ tools (typed, audited)
        ┌────────────────────────────┴───────────────────────────────────┐
        │                   TOOL / BODY LAYER (deterministic)             │
        │  Supabase edge functions  ·  Postgres engines (run_*)          │
        │  buildium-write/actions · comms-send · pandadoc · plaid · gmail │
        └───────────────────────────┬────────────────────────────────────┘
                                     │
        ┌────────────────────────────┴───────────────────────────────────┐
        │            DATA LAYER  ·  Buildium = system of record           │
        │  bld_* mirror (cron) · Plaid · Drive · QuickBooks · ppm-db      │
        └──────────────────────────────────────────────────────────────────┘
```

**Principle:** Claude agents reason and decide; they never poke databases or external APIs directly with ad-hoc SQL/HTTP for consequential actions. They call a **fixed catalog of typed tools** (edge functions / RPCs) that validate inputs, enforce guardrails, write to `decision_ledger`, and perform the side effect. This makes every action audited, testable, and reversible, and keeps the deterministic engines as a safety floor.

### 3.2 Agent runtime
Adopt the **Claude Agent SDK** as the agent runtime, in two modes, both layered on the existing `exec-router` / `exec-task-worker` spine:

- **Conversational mode (Slack-triggered):** A mention or DM in an exec channel → `exec-router` starts a Claude Agent SDK session with that exec's `system_prompt` (from `exec_agents`) + that exec's tool set + relevant context (recent `exec_conversations`, open items, mirror reads) → the agent runs a tool-use loop → replies in-thread and logs to `exec_conversations` / `decision_ledger`. Short turns can remain in an edge function; long tool chains run in the agent worker (below).
- **Autonomous mode (event/cron-triggered):** Cron or a Buildium webhook enqueues an `exec_tasks` row (e.g., "triage WO #123"). The **agent worker** (the every-minute `exec-task-worker`, upgraded to an Agent SDK loop) claims it, loads the owning exec's prompt + tools, runs, takes guardrailed actions, and records results. Department heads spawn **subagents** for narrow jobs (triage, vendor-match, draft-comm, screen-applicant), either as SDK sub-sessions or as child `exec_tasks`.

**Deployment:** keep short/stateless turns on Supabase edge functions; run the long-lived agent worker as a small always-on service (a container on Fly.io/Render/Railway, or a Supabase background worker) so multi-step tool loops aren't bound by edge timeouts. The cron heartbeat stays in pg_cron. **Decision for Claude Code:** pick the cheapest always-on option that supports 5–15 min agent runs and Node/TS; document the choice in `docs/RUNTIME.md`. Default recommendation: a single Fly.io machine running the agent worker + the Slack gateway.

### 3.3 Memory & knowledge
- **Per-agent working memory:** `cfo_memory`, `admin_memory`, `owner_exp_thread_memory`, `*_thread_memory` — conversation/decision recall scoped per department.
- **Shared knowledge platform (`kp_*`):** SOPs, runbooks, policies, glossary, Buildium KB, Drive index (122 docs indexed). This is the company's long-term memory and the source agents cite. Every new policy/SOP Dan states in Slack should be captured here by the COS.
- **Decision memory:** `decision_ledger` + `kp_decision_patterns` — agents learn from prior approvals/rejections to propose better and auto-handle more over time (raising the autonomy ceiling safely).

### 3.4 Model tiering (per D7)
- **Haiku 4.5** — classification, intent detection, dedup, triage scoring, spam/priority sorting.
- **Sonnet 4.6** — default for all department workers, subagents, and Slack conversation.
- **Opus 4.8** — Chief of Staff orchestration, monthly/year-end close, all compliance/legal reasoning (CCO), and any Tier-3 judgment.
Store per-agent model in `exec_agents.model`; allow per-task overrides. Track token spend in `builder_cost_log` / a `cost_log` and surface monthly run-rate on the dashboard against the ~$1,500 ceiling; alert at 80%.

---

## 4. The agent roster (org chart, ownership, tools, subagents)

Each exec has: a **charter** (system prompt, stored in `exec_agents.system_prompt`), an **autonomy scope** (what it may do without asking — §5), a **tool catalog**, and a set of **subagents** it spawns. Reuse the existing `exec_agents` rows; expand prompts and tools.

### 4.0 Chief of Staff (COS) — orchestrator `:clipboard:`
- **Owns:** routing, prioritization, the daily standup (`cos-standup`), the weekly brief (`cos-weekly-brief`), cross-department coordination, and capturing Dan's directives into `kp_*` SOPs/policies. First responder in `#exec-suite`.
- **Does:** decomposes Dan's natural-language asks into `exec_tasks` for the right department; runs the weekly C-suite meeting (`csuite_sessions`); maintains the company's open-items view; escalates Tier-3 items.
- **Tools:** read-all mirror views, `exec_tasks` create/update, `decision_ledger` read, Slack post, `kp_*` write.
- **Subagents:** *router* (classify+assign), *briefer* (compile standup/brief), *scribe* (turn decisions into SOPs).

### 4.1 COO — Operations `:wrench:` (PRIORITY 1 & 3)
Owns maintenance, leasing operations, owner experience, vendor coordination, and the VA task queue.

**A. Maintenance & repairs (Priority 1 — build first).** End-to-end loop:
1. **Intake** — tenant request via Buildium/portal/email/SMS/Intercom → `request-intake` → `request-classify` (Haiku). Mirror: `bld_work_orders`, `maintenance_*`.
2. **Triage & deflect** — *triage subagent* applies `maintenance_deflection_playbook` (28 rows) and `maintenance_escalation_signals` (10 rows): self-help deflection, emergency detection (S1 = life/safety/flood → instant escalate), categorize, set SLA.
3. **Dispatch** — *vendor-match subagent* picks a vendor from `bld_vendors` + `ppm_vendor_extensions` (trade, coverage, COI valid via `vendor_insurance`, performance via `vendor_performance`/`vendor_sla_monitor`). Within guardrail (≤$250 est. & property ≤$750/mo) → open WO + notify vendor (`maintenance-open-wo`, `maintenance-dispatch`, `maintenance-notify-vendor`) autonomously. Over cap or new vendor → Tier-2/Tier-3 approval to Dan.
4. **Schedule & coordinate** — coordinate vendor↔tenant access; if a physical task is needed (access, inspection, key) → push a **VA task** to the dashboard queue (D6).
5. **Status comms** — auto-send routine updates to tenant & owner (D4) via `comms-send`; draft anything sensitive.
6. **Verify & close** — `maintenance-coordinator` + `MAIN-O1` completion orchestrator confirm work done & vendor bill matches; `maintenance-closure-notify` (≥$500 or S1 notifies owner). Tenant satisfaction survey (`notify-tenant-survey`).
- **Subagents:** triage, vendor-match, scheduler, comms-drafter, closer/QA.
- **Acceptance:** a new tenant request flows intake→close with at most one human touch (approval or VA field task), all steps logged.

**B. Leasing & vacancies (Priority 3).** Listing → applicant → screening → lease → move-in/out.
- Vacancy detected (`vacancy_duration_tracker`) → *listing subagent* drafts/publishes listing (`bld_listings`, `leasing_listings`) and syndicates; CGO assists with copy.
- Applicants (`bld_applicants`/`bld_applicant_applications`) → *screening subagent* scores against criteria (`compliance_screening_log`) — **scoring is automated; the approve/deny decision is a human/CCO-gated Tier-3 step (fair housing).**
- Showings → **VA task** (D6).
- Approved → lease generated & sent for e-sign (`pandadoc-create`); rent set with CFO + `market_rent_proposals`; **rent amount & lease terms = approval** (money + legal).
- Move-in/out (`leasing_move_in_tasks`/`leasing_move_out_tasks`, `turnover_tracker`); deposit handling is compliance-gated.
- **Subagents:** listing, screener, lease-drafter, turn-coordinator.

**C. Owner experience (Priority 4).** Onboarding new owners/doors (`owner_exp_onboarding*`), health scoring & retention (`owner_exp_owner_health`), renewals (`owner_exp_renewals`), reporting, exit interviews. Monthly owner statements (with CFO).

### 4.2 CFO — Money `:moneybag:` (PRIORITY 2)
Owns rent/AR, AP, bank reconciliation, owner distributions, monthly & year-end close. Already the most automated department.

- **Rent & AR:** charge verification (`ar-charge-check`, monthly), receipt matching (`ar-match-receipts`), delinquency (`ar-delinquency`), late fees (`ar-assess-late-fees`) — auto **within lease terms & caps**; waivers/payment plans → approval. Mirror: `bld_lease_transactions`, `rent_collection_history`.
- **AP:** invoice intake from Gmail/Drive (`ap-gmail-scan` 3h, `ap-drive-scan`) → extract (`ap-extract`) → decide (`ap-decide`) → post bill (`ap-post-bills`) → pay (`ap-pay-bills`) → match payment (`ap-match-payments`). **Guardrail (D3):** auto-pay a bill only if ≤$250 and property month-to-date ≤$750; else Tier-2 approval. **New vendor → always approval.** Reserve logic via `reserve_config` + `MAIN-O1`.
- **Bank rec:** Plaid feed (`plaid-sync` 6h) + `recon-*` engine (drive-watch → parse → reconcile → propose entries → approve → post). Drift tracked in `bld_reconciliation_drift` (should stay empty).
- **Owner distributions:** computed from owner ledger & reserves — **ALWAYS Tier-3 approval before payout** (D2/D3). `cfo-yec-step4-owner-dist`.
- **Close:** monthly (`cfo-monthly-close`, 3rd of month) with variance review (`monthly_close_variances`); year-end (`cfo-yec-*` six-step). Opus for close reasoning.
- **Books:** QuickBooks MCP available for P&L / balance sheet / AR-AP aging cross-checks against Buildium.
- **Subagents:** ap-clerk, ar-clerk, reconciler, close-controller, distribution-preparer.
- **Acceptance:** rent cycle, AP cycle, and a monthly close run with only threshold-breaching items and owner payouts hitting Dan's approval queue.

### 4.3 CCO — Compliance `:scales:` (hard gate across all departments)
- **Owns:** NJ landlord-tenant law, the 117+ municipal rent-control ordinances, eviction process, security-deposit rules, **fair housing**, vendor COI/insurance compliance, DCA registrations (`property_dca_registrations`), inspections (`property_inspections`), legal notices (`comp_legal_notices`), compliance calendar/deadlines.
- **Operates as a gate:** any action tagged legal/eviction/fair-housing/rent-control/deposit is **routed through CCO and is never autonomous** (Tier-3). CCO maintains `compliance_municipal_regs`, runs `fair_housing_monitor_log` on outbound comms & screening, and owns `kp_trigger_policies` (high-stakes detection).
- **Tools:** Lawve_AI MCP (legal skills), web search, `compliance_*` writes, Slack escalation.
- **Subagents:** rent-control-checker, fair-housing-reviewer, deadline-watcher, notice-drafter (draft only; Dan/attorney sends).
- **Model:** Opus.

### 4.4 CGO — Growth `:chart_with_upwards_trend:` (Priority 4)
- **Owns:** the marketing site (this repo → Netlify), SEO/content, lead capture & nurture, social, reputation, owner-acquisition funnel.
- **Pipelines:** `marketing_content_pipeline`, `marketing_leads_pipeline`, `marketing_seo_rankings`/`marketing_seo_monitoring`, `marketing_social_queue`, `marketing_email_sequences`, `marketing_attribution`, `crm_*`, `sales_pipeline`. **`marketing_ceo_overrides` is checked before any spend/campaign activation.**
- **Tools:** Ahrefs + Semrush MCP (keywords, rank tracking, site audit), GSC data, Netlify deploy, web search, GoDaddy (domains), SurveyMonkey.
- **Compliance hook:** any content touching rent control/eviction/deposits/fair housing → CCO review before publish (per `brand_constants.compliance_note`).
- **Subagents:** content-writer, seo-analyst, lead-nurturer, social-scheduler, cro-tester.

### 4.5 CTO — Platform `:gear:` (the enabler / "builder")
- **Owns:** platform health, the data mirror, edge functions, the agent runtime, observability, the n8n decommission, security, cost monitoring, and the **self-build loop** (`builder_*`).
- **Health:** `tech_workflow_health`, `tech_data_integrity_log`, `bld_mirror_health`, `tech_api_consumption`, `deployment_monitoring`, `system_errors`/`error-collector`, `monitoring_alerts`. Root-cause the ~5% Buildium sync errors.
- **Builder:** `builder_backlog`/`builder_run_log` — the system proposes, builds (in isolation), verifies, and ships its own improvements under approval gates. Keep this loop; prune stale backlog; it is how the OS keeps improving without Dan.
- **Tools:** Supabase admin, Vercel/Netlify deploy, GitHub, cron management, secret rotation (`credential_rotation_log`, `integration_credentials`).
- **Subagents:** mirror-doctor, migration-drainer (n8n), security-auditor, cost-monitor, deploy-bot.
- **Model:** Sonnet default; Opus for architectural changes.

---

## 5. Guardrails & authority matrix (bounded autonomy, concrete)

This is the operational heart of D2–D4. Implement as data in `decision_auto_execute_rules` + `comms_auto_approve_policy` + `kp_trigger_policies`, enforced by every tool before it acts. The decision tiers already exist (`decision_ledger.tier`).

| Action | Autonomous? | Tier | Rule |
|--------|-------------|------|------|
| Repair/bill ≤ $250 **and** property MTD ≤ $750 | ✅ Auto | 1 | Open WO, dispatch known vendor, pay bill. Log decision. |
| Repair/bill > $250 **or** property MTD > $750 | ⛔ Approve | 2 | Slack approval card to Dan with vendor, estimate, evidence. |
| **New vendor** (not in `bld_vendors`) | ⛔ Approve | 2/3 | Always Dan approval + COI check before first dispatch/pay. |
| **Owner distribution / payout** | ⛔ Approve | 3 | Always Dan approval; CFO prepares, Dan releases. |
| Late fee within lease terms | ✅ Auto | 1 | Assess per lease + local rules (CCO-validated). |
| Fee waiver / payment plan | ⛔ Approve | 2 | Dan approval. |
| New lease / renewal / **rent amount or increase** | ⛔ Approve | 2/3 | Money + legal; Dan approval; CCO checks rent-control cap. |
| Applicant **approve/deny** | ⛔ Approve | 3 | Fair-housing gate; scoring auto, decision human/CCO. |
| Eviction / legal notice / deposit dispute | ⛔ Never auto | 3 | CCO drafts; Dan/attorney executes. |
| Routine templated comm (repair update, rent reminder, scheduling) | ✅ Auto-send | 1 | Per `comms_auto_approve_policy`; logged in `comms_log`. |
| Novel / legal / money / complaint comm | ⛔ Draft | 2 | One-tap approve in Slack, then send. |
| Marketing spend / campaign activation | ⛔ Approve | 2 | Check `marketing_ceo_overrides` first. |
| Internal mirror reads, drafts, proposals, analyses | ✅ Auto | 0 | No side effects; always allowed. |
| Code/infra deploy to production (CTO/builder) | ⛔ Approve | 2/3 | Builder approval gate; isolated build → verify → Dan ok. |

**Approval UX (must be frictionless):**
- Each Tier-2/3 item posts a Slack **approval card** (via `slack-interactivity`) to Dan's channel with: what, why, evidence link, cost, recommended action, and **Approve / Reject / Ask** buttons. Approve → tool executes and logs `executed_at`/`execution_result`. Reject → logged with reason → feeds `kp_decision_patterns`.
- Mirror the same queue in the dashboard (§7) as **"Needs Dan"**, plus a default **timeout policy** (configurable; default: no auto-execute on timeout — it waits and re-pings, except S1 safety which escalates by phone/SMS).
- **Kill switch:** a single `exec_settings.autonomy_paused=true` flag that forces *every* tool into draft/approve mode. The dashboard and a Slack command (`/ppm pause`) toggle it.

---

## 6. Slack — the conversational command center

Slack is where Dan talks to the company. Channels already exist; standardize them.

**Channel map (create any missing; store IDs in `exec_settings`):**
- `#exec-suite` (`C0B9QCZ1V52`) — Dan ↔ Chief of Staff; the default "talk to my company" room. COS routes to departments.
- `#cfo`, `#coo`, `#cgo`, `#cco`, `#cto` — direct lines to each exec (existing channel IDs in §2.3).
- `#decision-log` (`C0B95ASHSJK`) — every Tier-2/3 approval card + outcome; the audit stream.
- `#ops-maintenance`, `#ops-leasing` — operational event feeds (new WO, dispatch, vacancy) for visibility.
- `#alerts` — S1/safety, sync failures, budget 80%, guardrail breaches.
- `#va-tasks` — mirror of the VA queue for awareness (canonical queue lives in the dashboard, D6).

**Interaction patterns:**
- **Natural language:** "@CoS what's the status on 123 Main maintenance?" → COS reads mirror, answers, links evidence. "@CFO why was rent short this month?" → CFO analyzes `bld_lease_transactions`.
- **Commands:** `/ppm status` (company snapshot), `/ppm approvals` (pending queue), `/ppm pause` / `/ppm resume` (kill switch), `/ppm task <dept> <instruction>` (enqueue an `exec_tasks`).
- **Proactive pushes:** daily standup (weekday noon), Monday weekly brief + exec briefing, real-time approval cards, S1 alerts, month-end close summary.
- **Every agent reply** is logged to `exec_conversations`; consequential outcomes to `decision_ledger` and `activity_feed`.

**Acceptance:** Dan can run the entire business from Slack — ask anything, approve anything, pause everything — without opening Buildium/QuickBooks.

---

## 7. The command-center dashboard (Vercel `ppm-ai-os-dashboard`)

The dashboard is the visual command center and the VA's workplace. Audit the existing app first; extend, don't rebuild. Backed by `ppm-db` via the `dashboard-approval` / `cfo-yec-dashboard-api` edge functions + Supabase client (with RLS — §8.3).

**Required views:**
1. **Pulse (home):** portfolio KPIs (occupancy, rent collected vs due, open WOs by SLA, cash position, this-month spend vs budget), agent activity feed, system health (mirror freshness, sync errors), and **monthly run-cost vs the $1,500 ceiling**.
2. **Approvals ("Needs Dan"):** the live Tier-2/3 queue with one-click approve/reject, mirrored to Slack. Filter by department, age, amount.
3. **Departments:** one tab per exec showing its open tasks, recent decisions, and KPIs (CFO: AR aging, AP queue, close status; COO: WO board, vacancies, owner health; etc.).
4. **VA "My Tasks" queue (D6):** the canonical assignment surface — showings, inspections, lockbox/key, signatures, exceptions — with due dates, property, instructions, attachments, and a "done/blocked" action that notifies the requesting agent.
5. **Properties/Owners/Tenants:** drill-down backed by the `bld_*` mirror, with the action history per entity.
6. **Decision ledger / audit:** searchable log of every consequential action, who/what/why/outcome.
7. **Controls:** the autonomy kill switch, guardrail thresholds (the D3 numbers, editable), comms policy, model/budget settings, channel config — all writing to `exec_settings`/policy tables (Dan-only, RLS-protected).

**Acceptance:** Dan sees everything and can act on anything; the VA works exclusively from the "My Tasks" queue; thresholds and the kill switch are adjustable without code.

---

## 8. Consolidation & cleanup (do alongside Phase 0–1)

### 8.1 Finish the n8n decommission
- Keep `n8n-drawdown-drain` running. For each of the 68 active n8n workflows: confirm there's an edge-function/agent replacement in `n8n_replacement_map`; if yes, deactivate via `n8n-admin` and log to `n8n_deactivation_log`; if no, build the replacement (assign to the owning exec) before deactivating. Target: **0 active n8n workflows.**
- De-duplicate `workflow_registry` (469 → the canonical set). Mark superseded rows `retired`. One workflow = one owner + one schedule.

### 8.2 Tame `tech_backlog`
- Collapse the ~13.8k rows by `error_hash`/`occurrence_count` into a small set of real issues; auto-close resolved/duplicate; keep only actionable items. Wire `tech-backlog-triage` to do this nightly going forward.

### 8.3 Security: RLS (required, careful)
- 15 tables have RLS disabled and are exposed to the anon key (`n8n_*`, `comms_*`, `ops_daily_digest`, `pandadoc_documents`, `property_*`, `vendor_insurance`, `maintenance_surveys`, `maintenance_closure_notifications`). **Do not blanket-enable** — that blocks access. For each: enable RLS **and** add policies (service-role full; authenticated read scoped to the dashboard's needs; anon none). Verify the dashboard and edge functions still work after each change. Run `get_advisors` until clean.
- Audit `system_secrets` / `integration_credentials` storage; ensure secrets live in Supabase Vault / function secrets, not plaintext tables; rotate via `credential_rotation_log`.

### 8.4 Mirror reliability
- Root-cause the ~5% Buildium sync error rate; add retry/backoff and an `#alerts` page when a mirror family goes stale beyond its SLA (`bld_mirror_sla_config`).

---

## 9. Build roadmap (phased, with acceptance criteria)

Execute in order. Each phase ends green before the next starts. Log progress to `#exec-suite` and `builder_run_log`.

### Phase 0 — Stabilize, secure, and instrument (Week 1)
- Confirm the mirror + cron heartbeat are healthy; fix sync errors (§8.4).
- Implement the **kill switch** (`exec_settings.autonomy_paused`) and the **guardrail engine** (D3 numbers) as enforced checks in the write-path tools.
- Fix RLS (§8.3). Verify dashboard/edge functions.
- Stand up **cost tracking** + budget alerting (D7).
- **Acceptance:** `get_advisors` clean on RLS; kill switch flips all tools to draft mode; every write tool checks guardrails; cost run-rate visible.

### Phase 1 — Revive the agents & wire the command center (Weeks 1–2)
- Upgrade `exec-router` + `exec-task-worker` to the Agent SDK runtime (§3.2); deploy the always-on agent worker; document runtime in `docs/RUNTIME.md`.
- Expand all 6 `exec_agents` charters (system prompts) per §4, with explicit autonomy scopes and tool catalogs. Define the typed **tool catalog** (wrap existing edge functions: `buildium-write`, `comms-send`, `maintenance-*`, `ap-*`, `ar-*`, `pandadoc-create`, etc.) so agents call tools, not raw APIs.
- Wire Slack: standardize channels (§6), `/ppm` commands, approval cards via `slack-interactivity`, daily standup + weekly brief.
- Extend the dashboard: Approvals queue, Pulse, VA "My Tasks", Controls (§7).
- **Acceptance:** Dan can converse with each exec in Slack and they answer from live data; a test Tier-2 item produces an approval card in Slack + dashboard and executes on approve; standup posts.

### Phase 2 — Maintenance fully autonomous (Weeks 2–4) — PRIORITY 1
- Build the COO maintenance loop end-to-end (§4.1A) with subagents; connect intake (portal/email/SMS/Intercom), triage/deflection, vendor-match, guardrailed dispatch, comms (D4), VA hand-offs, verify/close.
- Replace the deterministic `run_maintenance()` engine's judgment steps with agent reasoning, keeping it as a fallback/safety net.
- **Acceptance:** 10 consecutive real work orders flow intake→close with ≤1 human touch each; all emergencies (S1) escalate instantly; every action logged; owner/tenant comms correct.

### Phase 3 — Rent / AR & owner money (Weeks 4–6) — PRIORITY 2
- Bring CFO AR (charges, receipts, delinquency, late fees), AP (intake→pay with D3 guardrails), bank rec (Plaid + `recon-*`), and **owner distributions (Tier-3 approval)** fully online. Run a real **monthly close** under agent control (Opus).
- **Acceptance:** a full rent cycle + AP cycle + monthly close complete with only cap-breaching items and owner payouts in Dan's queue; books reconcile to Buildium/QuickBooks; drift table stays empty.

### Phase 4 — Leasing & vacancies (Weeks 6–8) — PRIORITY 3
- COO leasing loop (§4.1B): listing/syndication, applicant screening (auto-score, human/CCO decision), VA-coordinated showings, e-sign leases (rent/terms approval), move-in/out turns.
- **Acceptance:** a vacancy goes listing→screened applicants→approved→signed lease→move-in with fair-housing gate enforced and showings handled via the VA queue.

### Phase 5 — Growth & owner experience (Weeks 8–10) — PRIORITY 4
- CGO: content/SEO engine, lead capture→nurture→close, attribution, site improvements (this repo), all CCO-gated on legal topics and `marketing_ceo_overrides`-gated on spend.
- COO owner experience: onboarding new doors, health/retention, monthly owner statements, renewals.
- **Acceptance:** new leads auto-nurtured into the CRM; a new owner can be onboarded by the system; monthly owner reports go out.

### Phase 6 — Hardening & self-improvement (continuous, from Week 4)
- CCO compliance gate live across all departments; `fair_housing_monitor_log` on all outbound comms & screening; rent-control verification on all rent actions.
- CTO: finish n8n decommission (§8.1), `tech_backlog` tamed (§8.2), builder loop pruned and running under approval gates, full observability + alerting, weekly self-improvement proposals.
- Raise the autonomy ceiling gradually using `kp_decision_patterns` (actions Dan approves ~consistently become candidates for higher auto-tiers, with Dan's sign-off).
- **Acceptance:** 0 active n8n workflows; clean advisors; weekly exec briefing + builder digest; measurable month-over-month rise in % actions handled autonomously without quality loss.

---

## 10. Testing, observability & safety

- **Per-agent eval harness:** golden scenarios per department (e.g., "leaking water heater at 11pm", "rent $300 short", "applicant with prior eviction") with expected tier, action, and comms. Run on every prompt/tool change (CTO owns; gate deploys on pass).
- **Shadow mode:** new autonomous behaviors run in draft-only for a configurable window, with agent proposals compared to Dan's choices, before flipping to auto.
- **Observability:** `activity_feed` (human-readable), `decision_ledger` (audit), `workflow_executions` + `tech_*` (system), cost log. Dashboard Pulse + `#alerts` surface anomalies.
- **Reversibility:** Buildium writes go through `buildium-write` with a `buildium_write_log`; prefer reversible actions; record how to undo.
- **Safety:** kill switch (§5), S1 phone/SMS escalation, hard compliance gate (§4.3), budget ceiling alerting, and "stop and ask" as the default on uncertainty.

---

## 11. Integrations & credentials map

| System | Use | Access today |
|--------|-----|--------------|
| Buildium | System of record (PM) | Mirror (`buildium-sync`) + write (`buildium-write`) — connected |
| Plaid | Bank feeds for rec | `plaid-sync` — connected |
| Gmail | AP invoices, comms intake | `ap-gmail-scan`, `gmail-probe` — connected |
| Google Drive | Documents, recon evidence | `recon-drive-watch`, `kp_drive_index` — connected |
| PandaDoc | E-sign (leases, PM agreements) | `pandadoc-*` — connected |
| QuickBooks | Books cross-check | MCP available — verify connection |
| Intercom | Tenant/owner support | `intercom_config` — verify |
| Slack | Command center | Connected |
| Ahrefs / Semrush | SEO (CGO) | MCP available |
| Vercel / Netlify | Dashboard / site deploy | Connected |
| Anthropic API | Agent brains | **Confirm key + billing for ~$600–1,500/mo** |

---

## 12. Open items — the only things needing Dan (gather once, then go)

1. **Anthropic API key + billing** confirmed for the agent runtime (the one true blocker for "agents actually run").
2. **VA identity & dashboard login** (so the "My Tasks" queue has an assignee) — or confirm "route to me until hired."
3. **Approval-timeout policy** confirmation (default: wait + re-ping; never auto-execute on timeout except S1 safety).
4. **Confirm any service credentials** that may have rotated (Buildium, Plaid, Gmail OAuth, PandaDoc, QuickBooks) — CTO will probe and list any that fail.
5. **Attorney contact** for eviction/legal notice execution (CCO drafts; a human sends).
6. **Phone/SMS number** for S1 safety escalations.

Everything else in this plan is autonomous for Claude Code to build.

---

## 13. First concrete tasks for Claude Code (start here)

1. Read this plan and the current `exec_agents`, `exec_settings`, `decision_auto_execute_rules`, `comms_auto_approve_policy`, and the `exec-router` / `exec-task-worker` / `slack-interactivity` / `buildium-write` edge-function sources.
2. Implement **Phase 0** in full (kill switch, guardrail engine with the D3 numbers, RLS fixes, cost tracking). Open a PR per logical change; keep each reversible.
3. Stand up the **agent runtime** (Phase 1) and bring the **Chief of Staff** online first in `#exec-suite`, then the other five execs.
4. Build the **Approvals queue + VA "My Tasks" + Pulse** dashboard views.
5. Begin **Phase 2 (maintenance)**.
6. Post a short daily progress note to `#exec-suite` and check the §12 open items off as they're resolved.

> Reminder for the building agent: Buildium is the source of truth; every consequential action is a logged, tiered decision; compliance topics are never autonomous; on uncertainty, stop and ask in Slack. Build the company so Dan can run all of it from Slack and the command center — and so it keeps improving itself without him.
