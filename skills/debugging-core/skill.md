# Debugging Core

This skill provide a disciplined, systematic approach to diagnosing and resolving software defects. It prioritizes empirical evidence and verification over guesswork.

## Core Mandates

### 1. Reproduce First
- **Concrete Reproduction**: Do not attempt to fix a bug until it has been empirically reproduced with a minimal test case or reproduction script.
- **Minimize the Case**: Reduce the reproduction case to the smallest possible set of inputs and conditions that still trigger the defect.

### 2. Instrumented Inspection
- **Locate the Failure**: Narrow the failing execution path using logging, instrumentation, or debugger tools. Identify exactly where the actual behavior diverges from the expected behavior.
- **No Guessing**: Base every hypothesis on observed data. If the data is missing, add instrumentation until the failure is visible.

### 3. Surgical Fix
- **Smallest Coherent Fix**: Implement the minimal change required to resolve the defect. Avoid "collateral" refactoring or unrelated changes during a bug fix.
- **Root Cause Resolution**: Address the underlying root cause rather than merely patching the symptom.

### 4. Exhaustive Verification
- **Verify the Fix**: Prove that the fix resolves the reproduction case.
- **Regression Testing**: Run the full test suite (or relevant subsets) to ensure that the fix has not introduced new defects.
- **Durable Verification**: The reproduction case should be converted into a permanent regression test to prevent the defect from returning.

## Operational Policies
- **Document the Diagnosis**: Provide a clear technical rationale for the fix, explaining the root cause and the verification steps taken.
- **Scientific Method**: Formulate a hypothesis, predict an outcome, perform an experiment (instrumentation or fix), and observe the result. Repeat until the defect is understood and resolved.
