# Requirements: orchestrator
## Introduction
*Lean* template: the repository only contains Kiro specs, hooks, steering and configuration (`.kiro/`), plus `.gitignore`. All the code (`web/` and `pwa/` apps, SAM infrastructure, agent) is **recreated** by running the specs. The orchestrator defines the order, guides the user without being asked and guarantees that a clean clone starts with everything pending.
## Requirements
### Requirement 1: Fixed and automatic order
1. THE specs SHALL be executed one after another: `01-system-design` → `02-web-portal` → `03-knowledge-base` → `04-iam-policy-agent` → local verification → `ARTIFACTS-README.md` → `05-aws-deployment`.
2. WHEN a spec finishes, THE SYSTEM SHALL mark it in `00-orchestrator/tasks.md`, announce the next one and continue without waiting for the user to ask, except at the AWS authorization task.
3. IF a spec fails, THE SYSTEM SHALL stop, indicate which spec and task failed, the cause and how to fix it.
### Requirement 2: Clean clone = everything pending
1. WHEN the repository is opened for the first time on a machine (`.kiro/.initialized-state` does not exist), THE `reset-tasks` hook SHALL set all tasks of all `tasks.md` files to pending (`[ ]`).
2. THE `.kiro/.initialized-state` marker SHALL be kept (it is what prevents progress from being reset every session) and be in `.gitignore` so that each clone resets once.
3. THE hook SHALL NOT reset tasks in later sessions (it preserves progress).
4. THE user MAY ask to "reset tasks" to force a manual reset.
### Requirement 3: Permanent guidance
1. WHEN each session starts, THE `reset-tasks` hook SHALL show progress per spec and which one is next.
2. THE `orchestrator` steering SHALL tell the agent how to propose and execute the next step.
3. THE user ONLY needs to say one of the triggers from the `triggers` steering (for example "run").
### Requirement 4: Output documentation
1. WHEN the code tasks finish, THE SYSTEM SHALL generate `ARTIFACTS-README.md` in the root with every step to bring up and access the project, following the design template.
2. THE SYSTEM SHALL NOT generate files with AWS account identifiers (account, URLs, physical IDs) inside the repository.
### Requirement 5: Zero executable scripts
1. NO spec, hook or document SHALL require `.sh` files.
2. THE `block-sh` hook SHALL prevent the agent from creating `.sh` files.
### Requirement 6: Operational security
1. OPERATIONS that create, modify or delete AWS resources SHALL go through the `authorize-aws` hook.
2. NO secret (passwords, tokens, keys) SHALL be written to the repository.
