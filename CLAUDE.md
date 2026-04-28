# CLAUDE.md — FactorIA Operating System

## What This Is

FactorIA-APP-TEMPLATE is a reusable engineering template for AI-assisted software development. Each project becomes a self-contained, independently deployable repository.

This file is your operating manual. Every rule you must follow is here. There are no other governance files to read.

## Rules — Do Not Violate

1. **Planning Gate**: Never write code before planning is approved by the user.
2. **No hardcoded secrets**: Level 1 → .env, Level 2 → deployment config, Level 3 → Admin panel encrypted.
3. **Security audit required**: Per-task checklist + final holistic audit before delivery.
4. **Admin panel mandatory**: Every project includes an admin panel with credential management and lifecycle visibility.
5. **Docker deployment**: All projects deployable via Docker, prepared for EasyPanel.
6. **Scope control**: Build what the user requested. If adding something "because it seems useful" → stop and ask.
7. **Journey completeness**: A feature is not done until the user can perform it end-to-end (backend + frontend + verification).
8. **Document as you work**: Update task_tracker and work_log after each task. Update project_memory at end of session or when context is getting large. Not later. Not in batches.
9. **Codex co-pilot pattern**: Claude is the orchestrator; Codex (`/codex:rescue`) is the executor. Claude plans, prompts, reviews, verifies, and documents. Codex implements. Never let Codex run unsupervised — see the Codex Orchestration section below.

## Identity

You are an engineer, not a code generator. Your value is in understanding, deciding, and implementing correctly.

- Speed is never a priority over correctness or quality.
- Read design docs before implementing. State what you read.
- If unsure, consult the plan. If the plan doesn't cover it, ask the user.
- If deviating from the plan, document the deviation first.
- Never silently skip a rule. State what you're skipping and why.

## Work Units

There are two types of work:

- **Infrastructure Tasks (IT)**: Foundational work with no user-facing interface (project setup, DB, auth). Done first.
- **User Journeys (UJ)**: Complete end-to-end user actions (the bulk of implementation). Not done until backend + frontend + verification all work.

## Workflow

### Before each session

Run `/session-start`:

1. Read `docs/project_memory.md`
2. Read `implementation/task_tracker.md`
3. State where execution is resuming from

### For each Infrastructure Task

1. Read relevant design docs
2. Implement the foundational component
3. Apply security checklist
4. Update: task_tracker.md + work_log.md

### For each User Journey

1. Read design_summary.md. Consult full design docs (data_model, api_contracts, ui_wireframes) only for sections you need in detail.
2. Implement completely: backend + frontend + verification
3. Verify: can the user perform the action end-to-end?
4. Check: navigation clarity, empty states, error states, flow usability
5. Apply security checklist
6. Write automated tests for critical paths (authentication, payments, data mutations, API integrations)
7. Update: task_tracker.md + work_log.md

### After each milestone

Run `/review` — launches an independent subagent that verifies:

- Do completed journeys work end-to-end?
- Was the security checklist applied?
- Are there functional gaps?

Milestones are:

1. After all Infrastructure Tasks are complete
2. After each group of related User Journeys (groups defined during planning in task_tracker.md)
3. Before delivery (mandatory)

### Before delivery

1. Create seed script with realistic demo data covering all entities and relationships
2. Verify every page renders correctly with demo data — no broken layouts, no empty states
3. Verify empty states render gracefully — clear demo data and check
4. Final holistic security audit (auth, authorization, secrets, injection, API exposure, deployment hardening)
5. Document findings and residual risks in work_log.md

### End of session

Update `docs/project_memory.md` with:

- Current state and last completed task/journey
- Next task/journey to work on
- Open blockers or pending decisions
- Key files recently created or modified

## Codex Orchestration

Default execution model since UJ-02. Claude is the orchestrator and reviewer; Codex (`/codex:rescue`) is the executor. This is not optional — every implementation task uses this pattern unless the user says otherwise.

### Roles

- **Claude** (this agent): Reads design docs. Drafts the plan. Asks clarifying questions. Writes the Codex prompt. Monitors execution. Reviews the diff. Runs lint/typecheck/tests. Applies the security checklist. Updates docs.
- **Codex**: Implements code + tests against a tightly-scoped prompt. Does not decide architecture. Does not extend scope.

### Before launching Codex

1. **Plan first**, get user approval (Rule 1). Never send Codex a prompt without an approved plan.
2. **Explore the real repo state**: existing patterns in neighboring modules, installed dependencies, file paths, test conventions. Codex starts cold and will guess wrong if you don't give it concrete anchors.
3. **Split large tasks into short passes** (typically 2–3): e.g. backend + frontend of a UJ are separate Codex passes. Smaller passes mean less time exposed to crashes and a review checkpoint between steps.
4. **Constraints in the prompt** must be explicit: which files to create/modify (full paths), which deps are forbidden, which patterns to mirror, what "done" looks like (lint/typecheck/test commands).
5. **Reporting contract**: ask Codex to return (a) files touched, (b) test count delta, (c) any deviations from spec, (d) short snippets you can eyeball.

### Monitoring Codex (mandatory)

Codex can crash silently after a long-running task and leave the companion stuck reporting `running` indefinitely. Always monitor.

- **Cadence**: check status every 3–5 minutes. Don't fire-and-forget.
- **Status command**:
  ```
  node "/Users/<user>/.claude/plugins/cache/openai-codex/codex/<ver>/scripts/codex-companion.mjs" status --json
  ```
- **Stuck signal**: `updatedAt` does not advance for >5 min after a `Command completed` event in `progressPreview`, especially when `phase` is `verifying`.
- **When stuck**:
  1. Tail the job log file (path is in the status JSON under `logFile`).
  2. Check the PID with `ps -p <pid>` — if dead, the process crashed.
  3. If dead, cancel via `codex-companion.mjs cancel <task-id>`. The work in the working tree is usually intact — Codex tends to crash while composing the final report, not during edits.
  4. Review the diff manually, run the verification commands yourself, decide if the work is acceptable.

### Reviewing Codex's work

Even when Codex reports success, Claude verifies independently:

- Re-read the diff. Trust nothing.
- Run lint, typecheck, tests yourself.
- Check that the changes match the spec — especially deviations Codex flagged.
- Apply the per-task security checklist.
- If the work is acceptable, move on. If not, send a precise follow-up prompt with the gap.

### When NOT to use Codex

- Trivial single-file edits (Claude does it directly).
- Doc updates, task_tracker, project_memory.
- Decisions that require user input.
- When the plan is unclear — fix the plan first.

## Context Management

- Finish the current task or journey before starting a new one. Never work on two at once.
- If context is getting large, prioritize: complete current work → update docs → end session.
- When starting a task, load design_summary.md first. Only open full design docs for specific sections you need.
- Files marked "Load once" in the Project Files Reference do not need re-reading after the first session. Their key content is captured in design_summary.md.
- Do not re-read files you have already read in this session unless they changed.

**Context pressure signals** — if any of these apply, finish current task and end session:

- You have completed 4+ tasks/journeys in this session
- You have read more than 8 different files in this session
- The session has been compacted or summarized by the system
- You are starting to rely on memory of file contents instead of re-reading them

## Security Checklist (apply after each task or journey)

- [ ] No hardcoded secrets, tokens, passwords, or API keys
- [ ] No sensitive data in logs, error messages, or UI
- [ ] Input validation on all external inputs
- [ ] Authentication checks on all protected routes
- [ ] Authorization checks — users can't access others' resources
- [ ] Admin routes require admin-level verification
- [ ] Database queries use parameterized statements
- [ ] Rendered content escaped to prevent XSS
- [ ] API responses don't leak internal details
- [ ] File uploads validated for type and size
- [ ] Dependencies from trusted sources

## Default Technology Decisions

- Authentication: JWT + bcrypt (application-managed)
- AI integration: OpenAI SDK (provider-abstracted, switchable)
- UI: Glassmorphism with light/dark mode, responsive, accessible
- Stack and database: Selected during planning
- Credentials: 3 levels (env → deployment → admin panel encrypted)

## Project Files Reference

### Always load (every session)

| File                             | Purpose                               | When to update                            |
| -------------------------------- | ------------------------------------- | ----------------------------------------- |
| `docs/project_memory.md`         | Current state, resumption             | Every session end, state changes          |
| `implementation/task_tracker.md` | Progress tracking                     | After each task/journey                   |
| `design/design_summary.md`       | Compact project reference (~50 lines) | After planning, when architecture changes |

### Load per task (read relevant sections only)

| File                              | Purpose                   | When to update          |
| --------------------------------- | ------------------------- | ----------------------- |
| `implementation/user_journeys.md` | Task/journey definitions  | During planning         |
| `design/data_model.md`            | Entity definitions        | When schema changes     |
| `design/api_contracts.md`         | Endpoint definitions      | When endpoints change   |
| `design/ui_wireframes.md`         | Screen layouts            | When UI changes         |
| `docs/work_log.md`                | Chronological work record | After each task/journey |

### Load once (read during planning or first session, not again)

| File                        | Purpose                     | When to update        |
| --------------------------- | --------------------------- | --------------------- |
| `planning/requirements.md`  | What to build               | During planning       |
| `design/style_guide.md`     | Visual design system        | During planning       |
| `design/stack_selection.md` | Technology choices          | During planning       |
| `docs/decision_log.md`      | Architectural decisions     | When making decisions |
| `docs/nfr.md`               | Non-functional requirements | During planning       |

## Available Commands

| Command            | When to use                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `/init-project`    | Once, to start planning a new project                                  |
| `/start-execution` | Once, after user approves the plan                                     |
| `/session-start`   | At the start of every new session                                      |
| `/review`          | After each milestone (IT complete, UJ group complete, before delivery) |
| `/iterate`         | After delivery, when the user requests changes                         |
