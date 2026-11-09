# Knowledge base artifact

This file does two things, in this order:

1. **Generate the artifact**: the document that feeds the knowledge base (section 1). It does not require AWS and is created by the `03-knowledge-base` spec.
2. **Synchronize it**: upload it to the bucket, start ingestion and show progress in the console until it finishes (section 2). It requires the deployed stack and authorization; it is run by `05-aws-deployment` and by the "synchronize knowledge base" trigger.

> Synchronization is **not automatic**: uploading the file to S3 is not enough. You must start ingestion with `start-ingestion-job`.

## 1. Generate the artifact

Create the `kiroween-2026-information/` folder at the root and, inside it, the file with the exact content of the block below. If the file already exists and is identical, do nothing. If the user already has other documents in that folder, do not touch them.

#### kiroween-2026-information/categories-and-prizes.md

````markdown
# Participating categories

- Resurrection: Bring an already obsolete technology back to life.
- Frankenstein: Combine technologies that usually do not work well together.
- Skeleton Crew: Create a minimalist code template and then present two different applications built from it.
- Costume Contest: Develop an application with a striking, polished user interface.

# Prizes per category

More than 100,000 dollars in prizes

* 1st place - $30,000 cash
* Second place - $20,000 cash
* 3rd place - $10,000 cash

* Best Resurrection - $5,000 cash
* Best Frankenstein - $5,000 cash
* Best Skeleton Crew - $5,000 cash
* Best Costume Contest - $5,000 cash

* Best Startup Project - $10,000 cash
* Best Ghost of Kiroween Past - $2,000 cash
* Best Kiro Crew Application - $1,000 cash
* Best Student Project: Resurrection - $1,500 cash

# Other prizes and subscriptions

* $1,500 USD and a one-year Kiro Pro Max subscription. Awarded to the student with the highest score in the Resurrection category. All team members must be students.

* Best Student Project: Frankenstein - $1,500 cash and a one-year Kiro Pro Max subscription. Awarded to the student with the highest score in the Frankenstein category. All team members must be students.

* Best Student Project: Skeleton Crew - $1,500 cash and a one-year Kiro Pro Max subscription. Awarded to the student with the highest score in the Skeleton Crew category. All team members must be students.

* Best Student Project: Costume Contest - $1,500 cash and a one-year Kiro Pro Max subscription. Awarded to the participating student with the highest score in the Costume Contest category. All team members must be students.

* Best Demo - $1,000 cash

* Blog Bonus Prize: 100 winners - 2,000 additional Kiro credits. Awarded to the 100 highest-scoring submissions that include a public blog post about Kiro and their project, published on any third-party blogging platform during the submission period.

* Social Blitz Prize: 5 winners - 3-month Kiro Pro+ subscription. The Kiro team selects 5 eligible submissions that include a link to a public social media post with the hashtag #KiroweenHackathon26, published during the submission period. The quality of the post and the information it provides about Kiro will be evaluated.
````

## 2. Synchronize with the knowledge base

Requirements: the `skeleton-crew` stack deployed. All commands are run directly from Kiro (no `.sh` files).

### 2.1 Authorization (mandatory)

Before uploading anything, show the user the following and wait for an explicit yes:

- Account (`aws sts get-caller-identity`), region `us-east-1`, stack `skeleton-crew`.
- Source folder (by default `kiroween-2026-information`) and the files that will be uploaded.
- Destination bucket (`KnowledgeDocsBucketName`). `aws s3 sync` **without** `--delete`: nothing is deleted from the bucket.
- That a knowledge base ingestion (`KnowledgeBaseId`) is started afterwards.

### 2.2 Read the Outputs (read-only)

```
aws cloudformation describe-stacks --stack-name skeleton-crew --region us-east-1 --query "Stacks[0].Outputs"
```

Take `KnowledgeDocsBucketName`, `KnowledgeBaseId` and `KnowledgeDataSourceId` (formatted as `<KnowledgeBaseId>|<DataSourceId>`: the data source id is the part after the `|`).

### 2.3 Upload the documents

```
aws s3 sync "kiroween-2026-information" "s3://<KnowledgeDocsBucketName>/" --region us-east-1
```

### 2.4 Start ingestion (direct command, so the `authorize-aws` hook can see it)

```
aws bedrock-agent start-ingestion-job --region us-east-1 --knowledge-base-id <KnowledgeBaseId> --data-source-id <DataSourceId> --query "ingestionJob.ingestionJobId" --output text
```

The output is the `ingestionJobId`.

### 2.5 Show progress until it finishes

Run inline, replacing `JOB_ID` with the `ingestionJobId` obtained in 2.4 (do not save the script). It polls every 10 s, prints one line per poll and exits with code 0 if ingestion ends `COMPLETE` or with code 1 if it fails or times out (15 min). It only performs reads.

````bash
python3 - JOB_ID <<'PY'
import json, subprocess, sys, time

REGION = "us-east-1"
STACK = "skeleton-crew"
JOB = sys.argv[1]


def aws(*args):
    r = subprocess.run(["aws", *args, "--region", REGION, "--output", "json"],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit("AWS CLI error: " + (r.stderr.strip() or "no details"))
    return json.loads(r.stdout)


outs = {o["OutputKey"]: o["OutputValue"] for o in
        aws("cloudformation", "describe-stacks", "--stack-name", STACK)["Stacks"][0]["Outputs"]}
kb, ds = outs["KnowledgeDataSourceId"].split("|")

print(f"Synchronizing knowledge base {kb} (data source {ds}, ingestion {JOB})", flush=True)
start_time = time.time()
while True:
    job = aws("bedrock-agent", "get-ingestion-job", "--knowledge-base-id", kb,
              "--data-source-id", ds, "--ingestion-job-id", JOB)["ingestionJob"]
    st, e = job["status"], job.get("statistics", {})
    secs = int(time.time() - start_time)
    print(f"[{secs // 60:02d}:{secs % 60:02d}] {st:<11} | scanned {e.get('numberOfDocumentsScanned', 0)}"
          f" | new {e.get('numberOfNewDocumentsIndexed', 0)}"
          f" | modified {e.get('numberOfModifiedDocumentsIndexed', 0)}"
          f" | failed {e.get('numberOfDocumentsFailed', 0)}", flush=True)
    if st == "COMPLETE":
        print("Synchronization finished: the knowledge base can now answer using these documents.")
        sys.exit(0)
    if st in ("FAILED", "STOPPED"):
        print("Ingestion ended in " + st + ": " + "; ".join(job.get("failureReasons", [])) )
        sys.exit(1)
    if time.time() - start_time > 900:
        sys.exit("Timed out waiting for ingestion (15 min).")
    time.sleep(10)
PY
````

### 2.6 Closing

Summarize in one or two sentences how many documents were indexed and suggest testing the chat with a question whose content is only in the document (for example, which categories Kiroween 2026 has). If the chat's response could not be verified, say so.
