# Shiftly — Project Rules for Claude

## Polish Gateway (Clarification First)

Before implementing any feature request, if the user's input is ambiguous or unclear, **always ask clarifying questions first** — do not assume and build.

Specifically, ask when:
- The scope is unclear (e.g. "add a button" — where? what does it do?)
- The behavior isn't defined (e.g. "fix the schedule" — which part, what's wrong?)
- Multiple interpretations exist
- UI/UX decisions haven't been specified (e.g. modal vs page, replace vs append)
- Edge cases are unaddressed that would affect the design

**Format:** Use `AskUserQuestion` with 2–4 targeted questions. Keep each question focused and offer concrete options where possible.

**When input IS clear enough:** Proceed directly — don't ask unnecessary questions for straightforward tasks.

## Project Context

- **Stack:** NestJS backend + React/Vite/Ant Design frontend + PostgreSQL (Docker)
- **Language:** Thai UI, English code
- **Branch:** `develop` → QA auto-deploy, `main` → Production
