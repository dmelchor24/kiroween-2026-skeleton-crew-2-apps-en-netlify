"""
proxy_handler.py — Proxy Lambda between API Gateway and AgentCore Runtime.

Receives the prompt from the frontend via API Gateway HTTP and forwards it to the
AgentCore Runtime using the bedrock-agentcore SDK. Returns the response
to the frontend (CORS is handled by API Gateway).

Required environment variables:
  AGENT_RUNTIME_ARN — ARN of the AgentCore Runtime (injected by SAM)
  AWS_REGION        — AWS region
"""

import json
import os
import uuid
import boto3


RUNTIME_ARN = os.environ["AGENT_RUNTIME_ARN"]
# AWS_REGION is reserved in Lambda — boto3 picks it up automatically from the environment
AWS_REGION  = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")


def lambda_handler(event: dict, context) -> dict:
    # ── Extract body ────────────────────────────────────────
    raw  = event.get("body", "{}")
    body = json.loads(raw) if isinstance(raw, str) else raw

    prompt     = (body.get("prompt") or "").strip()
    session_id = body.get("sessionId") or f"session-{uuid.uuid4().hex}"

    if not prompt:
        return _response(400, {"error": "The 'prompt' field is required."})

    # The AgentCore sessionId must be >= 33 chars
    if len(session_id) < 33:
        session_id = f"session-{session_id}-{uuid.uuid4().hex}"

    # ── Invoke AgentCore Runtime ───────────────────────────
    try:
        client = boto3.client("bedrock-agentcore", region_name=AWS_REGION)

        raw_response = client.invoke_agent_runtime(
            agentRuntimeArn  = RUNTIME_ARN,
            qualifier        = "DEFAULT",
            runtimeSessionId = session_id,
            payload          = json.dumps({"input": {"prompt": prompt}}).encode("utf-8"),
            contentType      = "application/json",
            accept           = "application/json",
        )

        body_bytes = raw_response["response"].read()
        data       = json.loads(body_bytes)

        # The runtime returns { output: { message, policy, s3_key, s3_url, ... } }
        output = data.get("output", data)

        # Normalize the policy key order to the canonical IAM order so
        # it matches what is saved in S3 and shown in the frontend.
        if isinstance(output.get("policy"), dict):
            output["policy"] = _order_policy(output["policy"])

    except Exception as exc:
        print(f"ERROR invoking the runtime: {exc!r}", flush=True)
        return _response(500, {"error": "Error invoking the agent. Check the proxy Lambda logs."})

    return _response(200, output)


# ── Helpers ────────────────────────────────────────────────

def _order_policy(policy: dict) -> dict:
    """Reorders the keys of an IAM policy to the canonical AWS order."""
    ROOT_ORDER      = ["Version", "Statement"]
    STATEMENT_ORDER = ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"]

    def _reorder(obj: dict, key_order: list) -> dict:
        ordered = {k: obj[k] for k in key_order if k in obj}
        for k in sorted(obj):
            if k not in ordered:
                ordered[k] = obj[k]
        return ordered

    result = _reorder(policy, ROOT_ORDER)
    if "Statement" in result and isinstance(result["Statement"], list):
        result["Statement"] = [
            _reorder(stmt, STATEMENT_ORDER) if isinstance(stmt, dict) else stmt
            for stmt in result["Statement"]
        ]
    return result


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        # CORS is added by API Gateway (CorsConfiguration of the HttpApi).
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
