Handoff Summary — May 30, 2026
    
    What was worked on
    
    Obsidian workspace vault upgrades — full backlog completed:
    - workspace_agent.py built with start, audit, context, intake, finish subcommands
    - wa shell alias in ~/.zshrc
    - Stale-context guard (21-day fresh / 30-day stale thresholds) wired into start and audit
    - All 18 project AGENT_CONTEXT.md files stamped with Last verified: 2026-05-29
    - 3 sub-agents delegated and ran wa audit across all projects; results logged
    - README files created for aimux and armory-supervisor
    - Junk Windows-path file removed from jcodemunch-mcp
    - Templates populated (_workspace/templates/ — 9 files)
    - Agent Quick Reference.md updated with wa alias, stale guard table, daily command
    - All tasks in 2026-05-26-coding-vault-automation-plan.md marked ✅/⚠️
    - Workspace-coding-vault skill updated with stale-context guard section
    
    Hermes agent update — in progress, blocked on GitHub auth:
    - Local main branch was 328 commits behind upstream/main
    - Attempted rebase → 200+ add/add conflicts (divergent history)
    - Switched strategy: created new branch update-2026-05-29 from upstream/main, cherry-picked stashed patches cleanly
    - Stashed patches were: cli.py (+11 lines: _run_cleanup() before sys.exit() in single-query mode), hindsight/init.py (+13 lines: _client_lock mutex for thread-safe lazy client construction), test_hindsight_provider.py (+34 lines: regression tests)
    - Committed all 4 files as 8bd5f9095 on update-2026-05-29
    - Renamed update-2026-05-29 → main; deleted old main
    - origin remote still wrong (points to NousResearch, not user's fork) — fixed during auth attempt but remote URL may need re-confirmation
    
    GitHub auth — blocked. Three attempts with gh auth login --web timed out waiting for browser completion. gh auth status still shows not logged in. User was in process of authenticating when handoff requested.
    
    
    
    Current state of the hermes-agent repo
    
    
    /Users/matt/.hermes/hermes-agent
    Branch: main (formerly update-2026-05-29)
    HEAD: 8bd5f9095 "fix: hindsight cleanup + thread-safety for quiet CLI mode"
    Upstream: upstream/main ✓ (clean, 328 commits ahead of old local main)
    Origin: https://github.com/mattwalker101/hermes-agent.git (remote URL fixed)
    Working tree: clean
    Stash: empty
    
    
    
    
    Pending work
    
    Priority: 1
    Task: Push main to fork (origin)
    Status: Blocked — needs GitHub auth
    ────────────────────────────────────────
    Priority: 2
    Task: Run hermes doctor smoke test
    Status: After push
    ────────────────────────────────────────
    Priority: 3
    Task: Update clew AGENT_CONTEXT.md to reflect v0.5.0 release
    Status: Ready to do
    ────────────────────────────────────────
    Priority: 4
    Task: Deferred: Kanban board mapping for clew (Phase 9/10)
    Status: Postponed
    ────────────────────────────────────────
    Priority: 5
    Task: Deferred: coder profile use in kanban
    Status: Postponed
    
    
    
    clew project status
    
    - Branch: feat/v0.5.0-skill-scanner — v0.5 essentially done
    - Working tree: 4 untracked files, no dirty tracked files
    - Context: ✅ AGENT_CONTEXT.md ✅ README.md ✅ ARCHITECTURE.md ❌ DECISIONS.md missing
    - v0.6 planning is next; Phase 9 board mapping deferred
    - Memory context has: "I am working on the Design OS product within the command_center project" (M3 done)
    
    
    
    coder profile
    
    - Model: auto with custom:manifest provider at http://192.168.50.232:2099/v1
    - This IS the Manifest router on Dingo — not Ollama, not OpenCode Go direct
    - Routes by complexity: simple → cheapest, standard → Flash, complex → MiMo, reasoning → DeepSeek V4 Pro
    - Falls back to direct DeepSeek V4 Flash via OpenCode Go
    - No changes needed — ready to use in kanban
    
    
    
    Key files to know
    
    - /Users/matt/Workspace/_workspace/scripts/workspace_agent.py — core script
    - /Users/matt/Workspace/_workspace/scripts/README.md — full command table
    - /Users/matt/Workspace/_workspace/Agent Quick Reference.md — user-facing docs
    - /Users/matt/.hermes/hermes-agent/ — local Hermes checkout (now on latest upstream)
    - /Users/matt/Workspace/_workspace/plans/2026-05-26-coding-vault-automation-plan.md — all tasks closed
    
    
    
    What you need from the user
    
    GitHub authentication — run this in a new terminal and complete the browser step:
    bash
    gh auth login --web
    
    Then say "done" so the new session can push main to the fork.