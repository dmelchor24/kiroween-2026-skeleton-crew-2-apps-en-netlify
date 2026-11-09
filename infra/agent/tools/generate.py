"""
Tool: generate_iam_policy
Builds the JSON of an AWS IAM policy from the user's
parameters. The agent calls this tool when it has
enough information to put the policy together.
"""

import json
from strands import tool

# Service map → IAM action prefix
SERVICE_PREFIX_MAP = {
    "s3":           "s3",
    "lambda":       "lambda",
    "dynamodb":     "dynamodb",
    "ec2":          "ec2",
    "rds":          "rds",
    "sqs":          "sqs",
    "sns":          "sns",
    "cloudwatch":   "cloudwatch",
    "logs":         "logs",
    "iam":          "iam",
    "kms":          "kms",
    "ssm":          "ssm",
    "bedrock":      "bedrock",
    "glue":         "glue",
    "athena":       "athena",
    "stepfunctions": "states",
    "eventbridge":  "events",
    "apigateway":   "execute-api",
}

# Predefined actions by privilege level and service
ACTIONS_BY_LEVEL = {
    "least-privilege": {
        "s3":          ["s3:GetObject", "s3:PutObject"],
        "lambda":      ["lambda:InvokeFunction"],
        "dynamodb":    ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
        "ec2":         ["ec2:DescribeInstances"],
        "sqs":         ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
        "sns":         ["sns:Publish"],
        "cloudwatch":  ["cloudwatch:PutMetricData"],
        "logs":        ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        "ssm":         ["ssm:GetParameter", "ssm:GetParameters"],
        "bedrock":     ["bedrock:InvokeModel"],
        "kms":         ["kms:Decrypt", "kms:GenerateDataKey"],
    },
    "standard": {
        "s3":          ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
        "lambda":      ["lambda:InvokeFunction", "lambda:GetFunction"],
        "dynamodb":    ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
                        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
        "ec2":         ["ec2:DescribeInstances", "ec2:StartInstances", "ec2:StopInstances"],
        "sqs":         ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage",
                        "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
        "sns":         ["sns:Publish", "sns:Subscribe", "sns:ListTopics"],
        "cloudwatch":  ["cloudwatch:PutMetricData", "cloudwatch:GetMetricStatistics",
                        "cloudwatch:ListMetrics"],
        "logs":        ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents",
                        "logs:DescribeLogGroups", "logs:DescribeLogStreams"],
        "ssm":         ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"],
        "bedrock":     ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        "kms":         ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
    },
    "broad": {
        # For the broad level a wildcard with the service prefix is used
        "_use_wildcard": True,
    },
}


@tool
def generate_iam_policy(
    service: str,
    actions: list[str],
    permission_level: str,
    resource_arn: str = "*",
    conditions: dict = None,
    region: str = "*",
    account_id: str = "*",
) -> dict:
    """
    Generates the JSON of an AWS IAM policy.

    Args:
        service:          AWS service name (e.g. 's3', 'lambda', 'dynamodb').
        actions:          List of required actions in natural language or as
                          IAM prefixes (e.g. ['read', 'write'] or ['s3:GetObject']).
        permission_level: Privilege level: 'least-privilege', 'standard' or 'broad'.
        resource_arn:     ARN of the specific resource. Defaults to '*'.
        conditions:       Dictionary of additional IAM conditions (optional).
        region:           AWS region for the resource ARN (optional).
        account_id:       AWS account ID (optional).

    Returns:
        Dictionary with the IAM policy in AWS format and generation metadata.
    """
    service_key = service.lower().strip()
    prefix      = SERVICE_PREFIX_MAP.get(service_key, service_key)

    # Resolve actions according to level
    if permission_level == "broad":
        resolved_actions = [f"{prefix}:*"]
    else:
        level_actions = ACTIONS_BY_LEVEL.get(permission_level, {})
        # If the service has predefined actions for this level, use them as a base
        base_actions = level_actions.get(service_key, [])

        # Resolve the user's actions (they may come in natural language or as IAM actions)
        resolved_actions = _resolve_actions(actions, prefix, base_actions)

    # Build statement
    statement = {
        "Sid":      f"{service.capitalize()}Access",
        "Effect":   "Allow",
        "Action":   resolved_actions,
        "Resource": resource_arn,
    }

    if conditions:
        statement["Condition"] = conditions

    policy = {
        "Version":   "2012-10-17",
        "Statement": [statement],
    }

    return {
        "policy":           policy,
        "service":          service,
        "prefix":           prefix,
        "permission_level": permission_level,
        "actions_count":    len(resolved_actions),
        "has_wildcard":     any("*" in a for a in resolved_actions),
    }


def _resolve_actions(requested: list[str], prefix: str, base_actions: list[str]) -> list[str]:
    """
    Combines the level's base actions with those requested by the user.
    If the action is already in IAM format (prefix:Action) it is used directly.
    If not, it is added as prefix:* so the agent or the validation can refine it.
    """
    resolved = set(base_actions)

    for action in requested:
        action = action.strip()
        if ":" in action:
            # Already in IAM format
            resolved.add(action)
        else:
            # Natural language → add as a wildcard for the service
            # The validate tool will refine it or the agent will ask for more detail
            resolved.add(f"{prefix}:*")
            break  # one wildcard is a sufficient signal for validate

    return sorted(resolved)
