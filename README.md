# Kiroween 2026 · Lean template
> This project is part of the **Kiroween 2026 Hackathon** · #KiroweenHackathon26
Two applications in separate folders, `web/` (used from the browser) and `pwa/` (the same app, installable on iPhone and Mac), that share a single backend on AWS (`infra/`). Both offer:
- **Login** with Amazon Cognito: email, password and a 6-digit code (MFA).
- **Chat with your knowledge base** (your own documents queried with AI).
- **IAM policy generator** with an AI agent.
The template **itself is not application code**: it is the instructions (Kiro specs, hooks and steering) for Kiro to create it for you, step by step. After running it, the `web/`, `pwa/` and `infra/` folders contain the generated code.
## Kiroween category: Skeleton Crew
This project competes in the **Skeleton Crew** category: a minimalist template (`.kiro/` plus `.gitignore`) and, from it, **two distinct applications**:
| Application | Folder | What sets it apart |
|---|---|---|
| Web | `web/` | Used from the browser, no manifest or service worker. |
| PWA | `pwa/` | Installable on iPhone and Mac: manifest, service worker, icons and iOS settings. |
Both are generated from the same specs and share the backend in `infra/`. The `.kiro/` folder (specs, hooks and steering) is versioned in full because it is the core of the project.
It also includes an AWS documentation MCP server; in this project it makes sure that, when writing the SAM template, it is based on current documentation.
## Try the applications
Both applications are already deployed, so judges and visitors can try them right away without downloading anything.
> Building the project from scratch is a different path: you need to download this repository, open it in Kiro and run the specs and hooks (see [Getting started](#getting-started)) so your own artifacts and AWS resources are generated. The deployed apps below skip all of that.
### Test credentials
Use this demo user to sign in to either application:
| Field | Value |
|---|---|
| Email | `test@gmail.com` |
| Password | `Kirocrew2026!` |
Login requires a 6-digit MFA code. On your first sign-in, scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.) and enter the code it shows.
### Web application access
The web version of the app, used from the browser.
- Link: _coming soon_
### PWA application access
The installable version of the app (iPhone and Mac).
- Link: _coming soon_
## What you need before starting
| Tool | What for | Check |
|---|---|---|
| [Kiro](https://kiro.dev) | Runs the instructions | — |
| Node.js 18 or higher | Run each app with `npm run dev` | `node --version` |
| Python 3.14 | Build the agent with SAM | `python3 --version` |
| AWS CLI v2 with credentials | Create the resources in your account | `aws sts get-caller-identity` |
| AWS SAM CLI 1.100+ | Deploy the infrastructure | `sam --version` |
| Access to the Claude Sonnet 4.5 model in Amazon Bedrock (us-east-1) | Chat and agent | Bedrock console |
| `uv` (optional) | AWS documentation inside Kiro (MCP) | `uvx --version` |
macOS or Linux only: on Windows `sam build` fails with the agent's dependencies. If you use Windows, follow the [Using Windows with WSL2](#using-windows-with-wsl2) section.
## Using Windows with WSL2
On native Windows `sam build` fails (a dependency of the agent tries to install `pywin32`). The solution is to work inside WSL2 with Ubuntu, which behaves like Linux. No code or specs need to change.
> These steps are still pending validation on a real Windows machine.
1. **Install WSL2 with Ubuntu** (PowerShell as administrator) and restart if prompted:
   ```
   wsl --install -d Ubuntu
   ```
2. **Work in the Linux file system.** Clone the repository in Ubuntu's `~/` (for example `~/skeleton-crew-hackathon`). Do not do it in `/mnt/c/...`: it is much slower and causes permission and line-ending problems.
3. **Install the tools inside Ubuntu** (the Windows ones do not work):
   - Python 3.14 (for example with `uv python install 3.14` or `pyenv`).
   - `uv` (for the AWS documentation MCP).
   - Node.js 18 or higher and npm.
   - AWS CLI v2 and AWS SAM CLI, in their Linux version (x86_64 or aarch64 depending on your machine).
   - Git.
4. **Configure the AWS credentials inside WSL** (`aws configure` or `aws sso login`). Windows credentials are not shared. Do not paste keys in the chat or in repository files.
5. **Open the project in Kiro from WSL** (Ubuntu folder, with Kiro's WSL integration if available). Commands and hooks must run on Linux; if Kiro runs commands on Windows, `sam build` will fail again.
6. **Verify before deploying**, inside Ubuntu:
   ```
   python3 --version
   sam --version
   aws sts get-caller-identity
   node --version
   uvx --version
   ```
7. **Try the build.** From `infra/` run `sam build`. If it compiles, the rest of the flow is the same as on macOS or Linux.
Notes:
- `npm run dev` inside WSL2 serves at `http://localhost:5173` (web) or `5174` (pwa) and is normally opened from the Windows browser.
- The hooks in `.kiro/hooks/` must be tested in WSL: they depend on the tools above existing in Ubuntu.
- `sam deploy` and the other commands that touch AWS still ask for your explicit authorization.
## Getting started
1. Open this folder in Kiro.
2. Type in the chat: **`run`**.
Kiro will tell you which spec is next and will run them one after another, without you repeating it:
| Order | Spec | Result |
|---|---|---|
| 1 | `01-system-design` | Colors, fonts and icons (icons only in `pwa/`) |
| 2 | `02-web-portal` | `web/` and `pwa/` folders: login, menu, PWA (only in `pwa/`) |
| 3 | `03-knowledge-base` | Chat with your knowledge base |
| 4 | `04-iam-policy-agent` | IAM policy generator |
| — | Verification and `ARTIFACTS-README.md` | Complete guide to run the project |
| 5 | `05-aws-deployment` | Creates the resources in AWS (**asks for your authorization first**) |
When finished, in each app (`web/` and `pwa/`) run `npm install` and `npm run dev`:
| App | Commands | URL |
|---|---|---|
| Web | `cd web` · `npm install` · `npm run dev` | http://localhost:5173 |
| PWA | `cd pwa` · `npm install` · `npm run dev` | http://localhost:5174 |
Each folder is self-contained and is deployed as its own Netlify site (*Base directory* `web` or `pwa`) from this same repository.
```
/
├─ web/                        web app (no manifest or service worker)
├─ pwa/                        installable app (manifest, service worker, icons)
├─ infra/                      shared SAM backend
├─ kiroween-2026-information/  sample document for the knowledge base
├─ .kiro/                      specs, hooks and steering
├─ .gitignore                  files that are not pushed to Git
├─ LICENSE                     MIT license
├─ README.md                   this guide
└─ ARTIFACTS-README.md         guide to bring up and use what was generated
```
## Phrases Kiro understands
| You say | Kiro does |
|---|---|
| `run` | Goes through all pending specs |
| `migrate` | Activates the full template and creates all resources in AWS (with your authorization) |
| `deploy architecture` | Same as `migrate`; also works to update |
| `synchronize knowledge base` | Uploads your documents to the knowledge base |
| `create user` | Creates a user in Cognito |
| `apply design` | Applies the color/font changes you made |
| `destroy architecture` | Deletes all the stack's resources, with your authorization |
| `reset tasks` | Sets all tasks back to pending |
| `status` | Shows progress |
## Change colors and fonts
Open `.kiro/specs/01-system-design/design.md`, edit the **Palette (edit here)** table and say `apply design`. You can also ask: "use the Ocean Blue palette".
## If you cloned this repository
When you open it for the first time, Kiro automatically sets all tasks to pending. Type `run` and you're done.
## How to destroy the architecture
Everything the deployment creates lives inside a single CloudFormation stack, `skeleton-crew`, so it is removed all at once and leaves no loose resources.
1. Type in the chat: **`destroy architecture`**.
2. Kiro shows you the account, the region and what will be deleted, and waits for your **explicit yes**. Without it, it runs nothing.
3. Kiro runs, from `infra/`:
   ```
   sam delete --stack-name skeleton-crew --region us-east-1
   ```
4. Kiro verifies (read-only) that nothing from the stack remains: buckets, log groups, runtimes, harness, gateways, knowledge bases or memories.
5. Kiro offers to delete `web/.env.local` and `pwa/.env.local`, which no longer describe live resources.
What is lost: the User Pool with its users, the APIs, the Lambdas, the knowledge base with the indexed documents, the buckets with their contents (documents and generated policies) and the logs. **It cannot be undone**; to have it again you must deploy again (`migrate`).
What is not touched: the repository code, local documents (for example `kiroween-2026-information/`), the other stacks in your account and the SAM artifacts bucket (stack `aws-sam-cli-managed-default`), which SAM creates before the stack and is shared by all your SAM projects.
## What each file in `.kiro` does
`.kiro/` is the template's "brain": it contains everything Kiro needs to recreate the project.
### `specs/`: what to build and in what order
Each spec has three files: `requirements.md` (what it must satisfy and why), `design.md` (the exact content of the generated files) and `tasks.md` (the list of tasks that Kiro marks `[x]` when finished, and where progress lives).
| Spec | What it is for |
|---|---|
| `00-orchestrator` | Defines the execution order and guides the user; tracks overall progress. |
| `01-system-design` | Palette, fonts (both apps) and PWA icons (single source of design). |
| `02-web-portal` | Structure of the two apps (`web/` and `pwa/`), Cognito login with MFA, menu, PWA (`pwa/` only) and API calls. |
| `03-knowledge-base` | Chat over the knowledge base. Includes `knowledge-base-artifact.md`: the sample document and the procedure to sync it with progress in the console. |
| `04-iam-policy-agent` | AI agent and IAM policy generator page. |
| `05-aws-deployment` | Single SAM template, deployment, test user, knowledge base sync. Always last. |
### `steering/`: rules Kiro always follows
| File | What it is for |
|---|---|
| `product.md` | What the project is, its stack and the spec map. |
| `conventions.md` | Code rules for JavaScript, CSS, Python and SAM. |
| `orchestrator.md` | How Kiro guides execution: greets, runs the specs in order and when it stops. |
| `triggers.md` | The phrases it understands (`run`, `migrate`, `destroy architecture`, etc.) and what it does with each. |
| `aws-security.md` | Mandatory authorization before touching AWS, secret handling and stack principles. |
| `new-module.md` | Guide to add a new page to the portal. It is manual: include it with `#new-module` in the chat. |
### `hooks/`: automations that fire on their own
| File | When it fires | What it does |
|---|---|---|
| `reset-tasks.json` | When a session starts | If it is a fresh clone, sets all tasks to pending; always shows progress and the next spec. |
| `next-spec-guide.json` | When a task is completed | If a spec finished, marks it in the orchestrator and announces the next one. |
| `authorize-aws.json` | Before running commands | Asks for a second confirmation on commands that create, modify or delete AWS resources. |
| `block-sh.json` | Before writing a file | Rejects creating `.sh` files. |
| `sam-validate.json` | When saving `infra/**/template.yaml` | Runs `sam validate --lint`. |
| `apply-design.json` | When saving the table in `01-system-design/design.md` | Reminds to regenerate `tokens.css` and the PWA. |
### `settings/`
- `mcp.json`: connects the AWS documentation MCP server (requires `uv`). It is optional.
### `.initialized-state`
It is a local marker (it is in `.gitignore`, not pushed to Git). The `reset-tasks` hook creates it the first time you open the repository on a machine, right after setting all tasks to pending. **It is kept on purpose**: as long as it exists, the hook knows it already initialized this clone and does **not** reset the tasks again every session, so the progress saved in the `tasks.md` files survives between sessions. If you delete it, the next session will reset all tasks. To start from scratch, just delete it or say `reset tasks`.
## Security
- Nothing is created in AWS without your explicit confirmation.
- The chat and policy generator API is **public** (accepts any origin): anyone with the URL can use it and generate cost. It is limited to 5 requests per second.
- No passwords or keys are stored in the repository.
- The `.gitignore` (defined in the `02-web-portal` spec) keeps out of Git: `node_modules/`, `dist/`, `.env`, `.env.local` and `.env.*.local` (local configuration), `.aws-sam/` (SAM build artifacts), `.venv/` and `__pycache__/` (Python), `*.log`, `.kiro/.initialized-state` and macOS system files (`.DS_Store`, `._*`, `.Spotlight-V100`, `.Trashes`…) and Windows system files (`Thumbs.db`, `Desktop.ini`, `$RECYCLE.BIN/`…). `.kiro/` and `infra/samconfig.toml` are versioned.
- There are no `.sh` files: everything is run from Kiro.
## Medium article
> Yet to be written. When it is published, replace this line with the link.
- Link: _coming soon_
## YouTube video
> Yet to be recorded. When it is published, replace this line with the link.
- Link: _coming soon_
## License
This project is distributed under the [MIT](LICENSE) license.
