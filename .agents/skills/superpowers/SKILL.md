---
name: superpowers
description: >-
  Systematic software engineering workflow including structured brainstorming,
  technical design specification, sub-task planning, parallel subagent delegation,
  and rigorous test verification. Use whenever designing, planning, or executing complex features.
---

# Superpowers Workflow Guide

This skill guides the agent through a disciplined 5-phase software development lifecycle designed for high-quality, zero-regression software delivery.

---

## Phase 1: Brainstorming & Requirements Clarification

Before writing any implementation plan or code:
1. **Understand Intent**: Clarify ambiguous requirements, user personas, technical constraints, and out-of-scope boundaries.
2. **Explore Options**: Propose architectural alternatives, evaluating trade-offs (e.g., local storage vs cloud DB, synchronous vs event-driven).
3. **Align with User**: Ask concise, high-value clarifying questions only when critical design forks exist.

---

## Phase 2: Design Specification (`docs/superpowers/specs/`)

For non-trivial features, document the system design before planning:
- File naming format: `docs/superpowers/specs/YYYY-MM-DD-<feature-name>-design.md`
- Key sections:
  - **Context & Scope**: Problem statement, target users, and non-goals.
  - **Architecture & Data Model**: Entities, relationships, storage schema, API contracts, and RPC functions.
  - **Core Flows & State Transitions**: Step-by-step user journeys and state machine definitions.
  - **Security & Authorization**: Role-based permissions (admin vs staff), public vs protected routes.
  - **Error Handling & Edge Cases**: Failures, fallbacks, duplicates, and rate limiting.

---

## Phase 3: Step-by-Step Implementation Plans (`docs/superpowers/plans/`)

Break large specifications into independent, sequential or parallel implementation plans:
- File naming format: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>-<subtask>.md`
- Key guidelines:
  - **Strict Task Sizing**: Each task should be atomic, testable, and completable in one pass (< 150 lines of code change where possible).
  - **Dependency Ordering**: Migrations -> pure domain libraries -> API/RPC -> UI components -> Integration tests.
  - **Explicit Schema & Contracts**: Avoid vague column descriptions; always specify exact field names, types, and nullability to prevent integration mismatches across agents.

---

## Phase 4: Subagent & Parallel Execution

When executing complex multi-file plans:
1. **Disjoint Workspaces**: Assign parallel subagents to disjoint file sets to eliminate git merge conflicts.
2. **Contract-First Development**: Write domain types and interfaces before implementing consumers and UI.
3. **Incremental Commits**: Commit logically cohesive units with clear descriptions.

---

## Phase 5: Verification & Walkthrough

1. **Automated Testing**: Run unit tests, schema tests, and end-to-end sanity checks.
2. **Security Checks**: Ensure sensitive API keys and administrative RPC endpoints are not exposed to public/anon callers.
3. **Artifact Summary**: Produce a clear `walkthrough.md` with file links, screenshots, and reproduction steps.