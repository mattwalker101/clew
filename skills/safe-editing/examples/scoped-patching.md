# Example: Scoped Patching

This example demonstrates the "Surgical Precision" mandate by contrasting a broad, risky change with a safe, scoped patch.

## The Goal
Add a `timeout` option to a network request function.

## Bad: "Clean-up Sprawl" (Risky)
The programmer decides to also rename parameters and change the error handling style in the same commit.

```diff
- export function fetchData(url: string) {
-   return fetch(url).then(res => res.json());
+ export async function getResource(targetUrl: string, options: { timeout?: number } = {}) {
+   try {
+     const controller = new AbortController();
+     if (options.timeout) setTimeout(() => controller.abort(), options.timeout);
+     const response = await fetch(targetUrl, { signal: controller.signal });
+     return await response.json();
+   } catch (e) {
+     throw new NetworkError(e.message);
+   }
```
**Why this is bad**:
- Breaks the public API (`fetchData` -> `getResource`).
- Changes the programming model (Promises -> async/await).
- Changes error handling without a mandate.
- High risk of regressions in callers.

## Good: Scoped Patch (Safe)
The programmer adds the feature while maintaining the existing API and style.

```diff
- export function fetchData(url: string) {
-   return fetch(url).then(res => res.json());
+ export function fetchData(url: string, options: { timeout?: number } = {}) {
+   const controller = new AbortController();
+   if (options.timeout) setTimeout(() => controller.abort(), options.timeout);
+   return fetch(url, { signal: controller.signal }).then(res => res.json());
```
**Why this is good**:
- **Backward Compatible**: Existing callers are unaffected.
- **Minimal Diff**: Only the necessary logic is added.
- **Preserves Style**: Maintains the `.then()` chain used in the file.
