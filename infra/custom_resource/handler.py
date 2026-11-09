"""
Stack custom resources (the entire lifecycle stays inside CloudFormation).

Actions (ResourceProperties.Action):
  PackageAgent    — Takes the layer built by `sam build` (agent/ + arm64 dependencies
                    under python/), repackages it with agent.py at the root and
                    uploads it to the code bucket. Returns Bucket and Key.
  EmptyBucket     — On Delete empties the bucket (objects + versions + delete markers).
  RuntimeLogGroup — Creates/adopts the runtime's log group, sets retention and deletes it on Delete.
"""

import hashlib
import json
import logging
import os
import tempfile
import urllib.request
import zipfile

import boto3
from botocore.exceptions import ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

RUNTIME_LOG_PREFIX = "/aws/bedrock-agentcore/runtimes/"
LAYER_PREFIX = "python/"


# ─── Response to CloudFormation ────────────────────────────────────────────────

def send(event, context, status, physical_id, data=None, reason=""):
    body = json.dumps({
        "Status": status,
        "Reason": reason or f"See log stream {context.log_stream_name}",
        "PhysicalResourceId": physical_id,
        "StackId": event["StackId"],
        "RequestId": event["RequestId"],
        "LogicalResourceId": event["LogicalResourceId"],
        "Data": data or {},
    }).encode()
    req = urllib.request.Request(
        event["ResponseURL"], data=body, method="PUT",
        headers={"Content-Type": "", "Content-Length": str(len(body))})
    urllib.request.urlopen(req, timeout=30)


# ─── PackageAgent ──────────────────────────────────────────────────────────────

def _repackage(src_zip, dst_zip):
    """Copies the layer zip removing the python/ prefix (agent.py ends up at the root)."""
    with zipfile.ZipFile(src_zip) as zin, \
         zipfile.ZipFile(dst_zip, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            name = info.filename
            if not name.startswith(LAYER_PREFIX) or name == LAYER_PREFIX:
                continue
            name = name[len(LAYER_PREFIX):]
            if "__pycache__/" in name or name.endswith(".pyc"):
                continue
            new = zipfile.ZipInfo(name, date_time=info.date_time)
            mode = (info.external_attr >> 16) & 0o777
            if name.endswith("/"):
                new.external_attr = (0o040755 << 16) | 0x10
            else:
                new.external_attr = (0o100000 | (mode or 0o755)) << 16
            new.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(new, zin.read(info))


def package_agent(props, request_type, physical_id):
    bucket, prefix = props["Bucket"], props["KeyPrefix"].strip("/")
    if request_type == "Delete":
        # The previous zip is deleted when CFN replaces the resource; the whole
        # bucket is emptied by EmptyBucket when the stack is deleted.
        if physical_id.startswith(prefix + "/"):
            try:
                boto3.client("s3").delete_object(Bucket=bucket, Key=physical_id)
            except ClientError as exc:
                if exc.response["Error"]["Code"] != "NoSuchBucket":
                    raise
        return physical_id, {}

    layer = boto3.client("lambda").get_layer_version_by_arn(Arn=props["LayerVersionArn"])
    content = layer["Content"]
    digest = hashlib.sha256(content["CodeSha256"].encode()).hexdigest()[:16]
    key = f"{prefix}/agent-{digest}.zip"

    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "layer.zip"), os.path.join(tmp, "agent.zip")
        with urllib.request.urlopen(content["Location"], timeout=120) as resp, open(src, "wb") as fh:
            while chunk := resp.read(1024 * 1024):
                fh.write(chunk)
        _repackage(src, dst)
        with zipfile.ZipFile(dst) as zf:
            if "agent.py" not in zf.namelist():
                raise RuntimeError("The package does not contain agent.py at the root")
        boto3.client("s3").upload_file(dst, bucket, key)

    log.info("Agent package: s3://%s/%s", bucket, key)
    return key, {"Bucket": bucket, "Key": key}


# ─── EmptyBucket ───────────────────────────────────────────────────────────────

def empty_bucket(props, request_type, physical_id):
    name = props["BucketName"]
    if request_type == "Delete":
        bucket = boto3.resource("s3").Bucket(name)
        try:
            bucket.object_versions.delete()
            bucket.objects.all().delete()
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "NoSuchBucket":
                raise
    return f"empty-{name}", {}


# ─── RuntimeLogGroup ───────────────────────────────────────────────────────────

def runtime_log_group(props, request_type, physical_id):
    logs = boto3.client("logs")
    if request_type == "Delete":
        if physical_id.startswith(RUNTIME_LOG_PREFIX):
            try:
                logs.delete_log_group(logGroupName=physical_id)
            except logs.exceptions.ResourceNotFoundException:
                pass
        return physical_id, {}

    name = props["LogGroupName"]
    try:
        logs.create_log_group(logGroupName=name)
    except logs.exceptions.ResourceAlreadyExistsException:
        pass  # AgentCore created it first: it is adopted
    logs.put_retention_policy(logGroupName=name, retentionInDays=int(props["RetentionInDays"]))
    return name, {}  # if the name changes, CFN sends Delete for the previous one


ACTIONS = {
    "PackageAgent":    package_agent,
    "EmptyBucket":     empty_bucket,
    "RuntimeLogGroup": runtime_log_group,
}


def handler(event, context):
    log.info(json.dumps({k: v for k, v in event.items() if k != "ResponseURL"}))
    request_type = event["RequestType"]
    physical_id = event.get("PhysicalResourceId", "none")
    try:
        action = ACTIONS[event["ResourceProperties"]["Action"]]
        physical_id, data = action(event["ResourceProperties"], request_type, physical_id)
        send(event, context, "SUCCESS", physical_id, data)
    except Exception as exc:
        log.exception("Custom resource failed")
        send(event, context, "FAILED", physical_id, reason=str(exc)[:500])
