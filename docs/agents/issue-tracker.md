---
schema_version: "28.0"
agent_id: "codex"
status: "complete"
checksum_md5: "not_computed"
---

# Issue Tracker

This repository currently has no detected Git remote and no existing external issue tracker configuration.

Use local markdown issues until a remote tracker is configured.

## Local Convention

- Store local issues under `.scratch/issues/`.
- Use one markdown file per issue.
- Include status, owner, links to relevant docs, and acceptance criteria.
- If the repository later moves to GitHub, update this file and `AGENTS.md`.

## Agent Behavior

Skills that create or triage issues should write local markdown issue files unless the user explicitly requests another tracker.
