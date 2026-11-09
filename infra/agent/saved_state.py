"""
Shared state for the S3 save during an invocation.

Strands reloads each tool's file as a NEW module (it appears as
`s3_save` in addition to `tools.s3_save`), and each copy has its own
global variables. That is why the state lives in this module, which both copies
import by its real name (`saved_state`) and share.
"""

last_saved: dict | None = None   # result of the last successful save
last_body: str | None = None     # saved content (to avoid duplicating the same file)


def reset() -> None:
    """Called by agent.py at the start of each invocation."""
    global last_saved, last_body
    last_saved, last_body = None, None
