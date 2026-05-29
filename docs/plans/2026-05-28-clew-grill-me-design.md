# Design Spec: Native clew-grill-me Operational Skill

## Goal
Implement a native, canonical `clew` operational skill `clew-grill-me` inside the `skills/` directory to enable automated, explainable, and local-first interactive planning alignment using clew runbooks and verification gates.

## Directory Structure
```text
skills/
  clew-grill-me/
    clew.yaml   # Skill manifest, policies, and runbook steps
    skill.md    # Strict interactive alignment guidelines
```

## Specification

### 1. Skill Manifest (`skills/clew-grill-me/clew.yaml`)
```yaml
id: clew-grill-me
version: 1.0.0
kind: instruction_skill
name: Interactive Planning Alignment (Grill Me)
description: Clarify scope, explore designs, and align on architecture before coding.
instructions:
  file: skill.md
tags:
  - planning
  - design
  - alignment
capabilities:
  required:
    - filesystem
    - terminal
  optional:
    - git
compatibility:
  providers:
    - claude
    - codex
    - opencode
activation:
  triggers:
    - plan
    - design
    - bootstrap
    - new feature
    - architecture
    - grill-me
policies:
  - always interview the user with clarifying questions one at a time
  - propose 2-3 approaches with clear trade-offs and your recommendation
  - never write implementation code or step-by-step plans until a design specification is saved and approved
  - keep all designs strictly bound by the YAGNI principle
steps:
  - id: grill-design
    title: "Planning Phase 1: Interactive Design Spec"
    instruction: "Interview the user one question at a time to clarify scope, propose 2-3 approaches, and author a design document named 'docs/plans/YYYY-MM-DD-<feature>-design.md' containing a '# Design Spec' header."
    gates:
      - type: command
        command: "DESIGN_FILE=$(find docs/plans -name '*design.md' | head -n 1); if [ -z \"$DESIGN_FILE\" ]; then echo 'No design document found in docs/plans/!' >&2; exit 1; fi; grep -q '# Design Spec' \"$DESIGN_FILE\""
        description: "Asserts that the design specification document exists in 'docs/plans/' and contains the proper '# Design Spec' header."

  - id: grill-plan
    title: "Planning Phase 2: Implementation Plan"
    instruction: "Translate the approved design into a step-by-step implementation plan saved under 'docs/plans/YYYY-MM-DD-<feature>.md' that includes the standard hands-off executing-plans instruction."
    gates:
      - type: command
        command: "PLAN_FILE=$(find docs/plans -name '*.md' ! -name '*design.md' | head -n 1); if [ -z \"$PLAN_FILE\" ]; then echo 'No implementation plan found in docs/plans/!' >&2; exit 1; fi; grep -q 'REQUIRED SUB-SKILL: Use superpowers:executing-plans' \"$PLAN_FILE\""
        description: "Asserts that the step-by-step implementation plan document exists and conforms to standard handoff conventions."
```

### 2. Instruction Guidelines (`skills/clew-grill-me/skill.md`)
Detail rules for interviewing developers with single questions, proposing architecture trade-offs, getting step-by-step section approval, and outputting clean implementation plans.
