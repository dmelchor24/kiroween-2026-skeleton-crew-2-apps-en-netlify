"""
Tool: save_to_s3
Saves the validated IAM policy to an S3 bucket and generates
a presigned URL for direct download from the frontend.
"""

import json
import os
import re
import unicodedata
import boto3

from datetime import datetime, timezone
from strands  import tool
import saved_state                       # shared state (see saved_state.py)


S3_BUCKET      = os.environ.get("POLICIES_BUCKET", "iam-policies-bucket")
PRESIGNED_TTL  = int(os.environ.get("PRESIGNED_TTL_SECONDS", 3600))  # 1 hour

def _ascii(text: str, limit: int = 256) -> str:
    """S3 only accepts ASCII in metadata: strips accents and non-ASCII characters."""
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    return plain.strip()[:limit]


def _order_policy(policy: dict) -> dict:
    """
    Reorders the keys of an IAM policy according to the canonical AWS order:
      Root level:     Version → Statement
      Each Statement: Sid → Effect → Principal → Action → Resource → Condition
    Any extra key goes at the end, alphabetically.
    """
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


def save_policy(
    policy: dict,
    service: str,
    permission_level: str,
    validation_summary: str = "",
) -> dict:
    """
    Saves an IAM policy to S3 and returns the key and the presigned URL.

    Plain function (no @tool): used by both the `save_to_s3` tool and agent.py,
    which saves the validated policy even if the model does not call the tool.

    The policy is saved under the path:
        policies/{service}/{YYYY-MM-DD}/{timestamp}.json
    """
    s3     = boto3.client("s3")
    now    = datetime.now(timezone.utc)
    date   = now.strftime("%Y-%m-%d")
    ts     = now.strftime("%Y%m%dT%H%M%SZ")

    service_slug = re.sub(r"[^a-z0-9._-]+", "-", _ascii(service).lower()).strip("-") or "policy"
    key          = f"policies/{service_slug}/{date}/{ts}.json"

    policy_body = json.dumps(_order_policy(policy), indent=2, ensure_ascii=False)

    # The model often calls the tool twice with the same policy: do not duplicate the file.
    if saved_state.last_saved is not None and saved_state.last_body == policy_body:
        return saved_state.last_saved

    # Save to S3 with metadata
    s3.put_object(
        Bucket      = S3_BUCKET,
        Key         = key,
        Body        = policy_body.encode("utf-8"),
        ContentType = "application/json",
        Metadata    = {
            "service":          service_slug,
            "permission-level": _ascii(permission_level) or "n/a",
            "generated-at":     now.isoformat(),
            "validation":       _ascii(validation_summary) or "n/a",
        },
    )

    # Generate presigned URL for download
    presigned_url = s3.generate_presigned_url(
        ClientMethod = "get_object",
        Params       = {"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn    = PRESIGNED_TTL,
    )

    saved_state.last_body  = policy_body
    saved_state.last_saved = {
        "saved":         True,
        "bucket":        S3_BUCKET,
        "key":           key,
        "presigned_url": presigned_url,
        "expires_in":    PRESIGNED_TTL,
        "size_bytes":    len(policy_body.encode("utf-8")),
        "saved_at":      now.isoformat(),
    }
    return saved_state.last_saved


@tool
def save_to_s3(
    policy: dict,
    service: str,
    permission_level: str,
    validation_summary: str = "",
) -> dict:
    """
    Saves an IAM policy to S3 and returns the key and presigned URL.

    The policy is saved under the path:
        policies/{service}/{YYYY-MM-DD}/{timestamp}.json

    The object includes metadata in the S3 headers for traceability.

    Args:
        policy:             Dictionary with the IAM policy ready to save.
        service:            Name of the AWS service the policy applies to.
        permission_level:   Privilege level of the generated policy.
        validation_summary: Summary of the validation result (optional).

    Returns:
        Dictionary with key, bucket, presigned_url and metadata of the saved object.
    """
    return save_policy(policy, service, permission_level, validation_summary)
