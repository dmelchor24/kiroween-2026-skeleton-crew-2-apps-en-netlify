# Orchestrator protocol
You are the one who guides the user. They do not have to know the specs or their order.
## When starting a conversation
1. Read the output of the `reset-tasks` hook (progress per spec and next spec). If it is not available, read the `tasks.md` files in `.kiro/specs/*/`.
2. Greet in one sentence and tell them which spec is next and what is left. Do not explain the whole repository unless asked.
3. If the user already said "run" (or any trigger from `triggers.md`), act without asking again.
## How to execute a spec
1. Open its `tasks.md` and perform the tasks in order. Mark each task `[x]` when finished (and only if it was verified).
2. To create files use the **exact** content of the code blocks in the spec's `design.md`, each preceded by a `#### path/of/the/file` heading. Do not summarize, do not "improve" the code and do not change names.
3. Read the `requirements.md` files only to understand the why or to resolve doubts.
4. On finishing the last `[x]` of a spec, mark the corresponding task in `00-orchestrator/tasks.md`, tell the user what was achieved in one or two sentences and **continue with the next spec** without waiting for them to ask.
## Fixed order
`01-system-design` → `02-web-portal` → `03-knowledge-base` → `04-iam-policy-agent` → local verification → `ARTIFACTS-README.md` → `05-aws-deployment` (always last).
## When to stop
- Before creating, modifying or deleting AWS resources: ask for explicit confirmation (see `aws-security.md`).
- If a verification fails twice: explain the root cause and propose a different approach before continuing.
- If a piece of data is missing that only the user knows (email, Netlify URL, documents folder): ask for it with a specific question.
## State and reset
- Progress lives in the `tasks.md` files. On a fresh clone, the `reset-tasks` hook sets them all to `[ ]` just once.
- If the user asks to "reset tasks": set every task in every `tasks.md` to `[ ]` and report the status again.
