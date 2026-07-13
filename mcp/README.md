# Zar Kebab repository navigator MCP

This read-only MCP keeps code-discovery context small. It exposes one tool,
`repo_nav`, and returns compact references before source. The index is rebuilt
from the live workspace when files change. It excludes common secret and local
configuration names, binaries, dependencies, build output, symlinks, and paths
outside this repository; credentials still should never be committed to source.

## Navigation sequence

1. `{"op":"guide"}` — compact architecture, commands, and guardrails.
2. `{"op":"map","q":"accounting"}` — feature files and tests.
3. `{"op":"find","q":"atomic cashier settlement"}` — ranked live symbols from exact names or curated task phrases.
4. `{"op":"outline","path":"src/lib/analytics.js"}` — declarations only.
5. `{"op":"read","id":"<returned-id>"}` — bounded source with line numbers.
6. `{"op":"refs","id":"<returned-id>"}` — bounded references.

All list operations return columnar JSON (`cols` plus `rows`) and an opaque
`next` cursor when truncated. Guide rows use `landmark`, `command`, and `rule`
kinds. Continue with only `op` and `cursor`. Default responses are 2.5–6 KB;
the absolute cap is 16 KB. Source IDs and cursors are revision-bound,
preventing an old result from silently pointing to changed code.

## Run and verify

The project-scoped `.codex/config.toml` starts the server automatically after
Codex restarts in this trusted repository. It can also be started manually:

```bash
npm run mcp:nav
npm run mcp:benchmark
```

Use `/mcp` in Codex to confirm that `zarkebab_nav` and `repo_nav` are enabled.

The benchmark starts from natural task phrases and verifies that each query
reaches and reads required implementation markers. It reports a character-based
token proxy against both a broad whole-file workflow and an ideal targeted-search
workflow. The latter is included so the result does not imply that MCP JSON is
smaller than a perfectly targeted `rg` or that character counts are measured
model tokens.
