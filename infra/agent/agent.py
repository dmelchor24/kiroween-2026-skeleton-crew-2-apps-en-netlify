"""
IAM Policy Agent — FastAPI server for Amazon Bedrock AgentCore Runtime.

The runtime expects:
  POST /invocations  → agent invocation
  GET  /ping         → health check

Port: 8080, architecture: linux/arm64
"""

import json
import re
import os
from datetime import datetime, timezone

from fastapi          import FastAPI, HTTPException
from pydantic         import BaseModel
from typing           import Dict, Any

from strands          import Agent
from strands.models   import BedrockModel
from tools            import generate_iam_policy, validate_iam_policy, save_to_s3
from tools.validate   import check_policy
from tools.s3_save    import save_policy
import saved_state


# ─── System prompt ───────────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are an AWS security expert specialized in IAM policies.
Your job is to generate correct, secure, production-ready IAM policies.

When the user describes a service and the actions they need, you must:

1. Call generate_iam_policy with the correct parameters extracted from the message.
   - Infer the AWS service name (e.g. "bucket" → "s3").
   - Convert natural-language actions into IAM terms whenever possible.
   - If the user does not specify a privilege level, use "least-privilege".
   - If the user does not specify a resource ARN, use "*" and warn about it in your response.

2. Call validate_iam_policy with the generated policy and the privilege level.
   - If validation fails (valid: false), fix the errors and generate again.
   - If there are warnings, mention them to the user in your final response.

3. Only after validation succeeds (valid: true), call save_to_s3.
   - It is MANDATORY to save every valid policy, even if the user asks for "just the JSON".
   - Never save to S3 a policy that has not passed validation.

4. Respond to the user with:
   - The IAM policy in JSON format, inside a ```json block.
   - If the user asks for only the JSON or a brief response, respond ONLY with that block:
     the server already returns the S3 path and the download URL on its own.
   - A summary of the included actions and why.
   - The validation warnings, if any.
   - The presigned URL to download the file.
   - The S3 key where it was saved.

Be concise. Do not explain basic IAM concepts unless the user asks.
If the request is ambiguous (e.g. "give me access to everything"), ask for more context before generating.
Never generate policies with "Action": "*" and "Resource": "*" at the same time.
""".strip()


# ─── Strands agent (lazy init — built on the first invocation) ────────────────
_agent_instance: Agent | None = None


def _get_agent() -> Agent:
    global _agent_instance
    if _agent_instance is None:
        model = BedrockModel(
            model_id    = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-5"),
            region_name = os.environ.get("AWS_REGION", "us-east-1"),
        )
        _agent_instance = Agent(
            model         = model,
            system_prompt = SYSTEM_PROMPT,
            tools         = [generate_iam_policy, validate_iam_policy, save_to_s3],
        )
    return _agent_instance


# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="IAM Policy Agent", version="1.0.0")


class InvocationRequest(BaseModel):
    input: Dict[str, Any]


class InvocationResponse(BaseModel):
    output: Dict[str, Any]


@app.post("/invocations", response_model=InvocationResponse)
async def invoke_agent(request: InvocationRequest):
    """
    Main endpoint called by AgentCore Runtime.
    Expected payload: { "input": { "prompt": "..." } }
    """
    prompt = request.input.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="The 'prompt' field inside 'input' is required.",
        )

    saved_state.reset()  # last_saved is filled if the model calls save_to_s3 in this invocation
    try:
        agent         = _get_agent()
        result        = agent(prompt)
        response_text = str(result)
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"ERROR in /invocations:\n{tb}", flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"Agent error: {str(exc)}",
        )

    policy = _extract_json(response_text)
    s3_key = _extract_pattern(response_text, r"policies/[^\s\"']+\.json")
    s3_url = _extract_pattern(
        response_text,
        r"https://[^\s\"']+\.amazonaws\.com[^\s\"']+",
    )

    # Guaranteed save: if the model already saved (save_to_s3) that result is used; if not,
    # the server validates and saves the policy itself (the flow does not depend on the LLM obeying).
    saved = saved_state.last_saved
    if policy and not saved:
        saved = _autosave(prompt, policy)
    if saved:
        s3_key = saved["key"]
        s3_url = saved["presigned_url"]

    return InvocationResponse(
        output={
            "message":   response_text,
            "policy":    policy,
            "s3_key":    s3_key,
            "s3_url":    s3_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.get("/ping")
async def ping():
    """Health check required by AgentCore Runtime."""
    return {"status": "healthy"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    """Extracts the first valid JSON block from the agent's text."""
    for pattern in [r"```json\s*([\s\S]*?)```", r"```\s*([\s\S]*?)```"]:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                continue

    brace_start = text.find("{")
    if brace_start != -1:
        for end in range(len(text), brace_start, -1):
            try:
                return json.loads(text[brace_start:end])
            except json.JSONDecodeError:
                continue

    return None


def _infer_level(prompt: str) -> str:
    """Infers the privilege level from the prompt text (default: least-privilege)."""
    text = prompt.lower()
    if "broad" in text:
        return "broad"
    if "standard" in text:
        return "standard"
    return "least-privilege"


def _infer_service(policy: dict) -> str:
    """Takes the prefix of the first action (e.g. 's3:GetObject' → 's3')."""
    try:
        action = policy["Statement"][0]["Action"]
        action = action[0] if isinstance(action, list) else action
        prefix = str(action).split(":")[0].strip().lower()
        if prefix and prefix != "*":
            return prefix
    except (KeyError, IndexError, TypeError):
        pass
    return "policy"


def _autosave(prompt: str, policy: dict) -> dict | None:
    """Validates and saves the policy to S3. Returns None (without breaking the response) if it cannot."""
    try:
        level = _infer_level(prompt)
        check = check_policy(policy, level)
        if not check["valid"]:
            print(f"AUTOSAVE skipped, invalid policy: {check['errors']}", flush=True)
            return None
        return save_policy(policy, _infer_service(policy), level, check["summary"])
    except Exception as exc:
        print(f"ERROR in autosave: {exc!r}", flush=True)
        return None


def _extract_pattern(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text)
    return match.group(0) if match else None


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
