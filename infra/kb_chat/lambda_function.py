import json
import boto3
import uuid
import os
from datetime import datetime, timezone
from time import sleep
from botocore.exceptions import ClientError

# Configuration
BEDROCK_REGION = os.environ.get('REGION')
HARNESS_ARN = os.environ.get('HARNESS_ARN')  # Harness ARN (stable), not that of the executable version
MAX_RETRIES = int(os.environ.get('MAX_RETRIES', '3'))
MIN_SESSION_ID_LENGTH = 33  # required by runtimeSessionId

agentcore_client = boto3.client('bedrock-agentcore', region_name=BEDROCK_REGION)

# User-facing messages: the technical detail only goes to the Lambda log
FRIENDLY_ERRORS = {
    'ThrottlingException': 'Too many requests. Try again in a few seconds.',
}
DEFAULT_ERROR = 'Could not query the knowledge base. Please try again.'


def _ensure_valid_session_id(session_id):
    """AgentCore Runtime requires a runtimeSessionId of at least 33 characters."""
    if len(session_id) < MIN_SESSION_ID_LENGTH:
        session_id = (session_id + str(uuid.uuid4())).replace('-', '')[:64]
    return session_id


def _extract_completion(response):
    """Accumulates the text of the contentBlockDelta events returned by invoke_harness."""
    completion = ''
    for event in response.get('stream', []):
        if 'contentBlockDelta' in event:
            delta = event['contentBlockDelta'].get('delta', {})
            if 'text' in delta:
                completion += delta['text']
        elif 'runtimeClientError' in event:
            raise Exception(json.dumps({
                'errorType': 'RuntimeClientError',
                'errorMessage': event['runtimeClientError'].get('message', 'Unknown harness error'),
                'statusCode': 502
            }))
    return completion


def _json_response(status_code, body):
    # CORS is added by API Gateway (CorsConfiguration of the HttpApi)
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }


def lambda_handler(event, context):
    try:
        # Parse body
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body') or {}

        # Get basic parameters
        user_input = body.get('prompt') or body.get('query', '')
        if not user_input or not user_input.strip():
            return _json_response(400, {
                'error': 'The message is empty or contains only spaces.',
                'errorType': 'EmptyInputError',
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        user_input = user_input.strip()

        # The portal sends a null sessionId on the first message
        session_id = _ensure_valid_session_id(body.get('sessionId') or str(uuid.uuid4()))

        # Invoke the Harness with automatic retries
        completion = ''
        for attempt in range(MAX_RETRIES):
            try:
                response = agentcore_client.invoke_harness(
                    harnessArn=HARNESS_ARN,
                    runtimeSessionId=session_id,
                    messages=[{
                        'role': 'user',
                        'content': [{'text': user_input}]
                    }]
                )
                completion = _extract_completion(response)
                break  # Exit on success
            except ClientError as e:
                error_code = e.response['Error']['Code']

                # Retry only on throttling and while attempts remain
                if error_code == 'ThrottlingException' and attempt < MAX_RETRIES - 1:
                    sleep(2 ** attempt * 2)  # Backoff: 2s, 4s, 8s
                    continue

                status_code = e.response.get('ResponseMetadata', {}).get('HTTPStatusCode', 500)
                raise Exception(json.dumps({
                    'errorType': error_code,
                    'errorMessage': str(e),
                    'statusCode': status_code
                }))

        # Successful response
        return _json_response(200, {
            'response': completion.strip(),
            'sessionId': session_id,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        # Try to parse a structured error
        try:
            error_data = json.loads(str(e))
            status_code = error_data.get('statusCode', 500)
            error_type = error_data.get('errorType', 'UnknownError')
        except Exception:
            status_code = 500
            error_type = type(e).__name__

        print(f'ERROR {error_type}: {e}', flush=True)  # technical detail only in CloudWatch
        return _json_response(status_code, {
            'error': FRIENDLY_ERRORS.get(error_type, DEFAULT_ERROR),
            'errorType': error_type,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
