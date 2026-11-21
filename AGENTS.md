<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Formatting and readability

- Use tabs for code indentation where the file format supports them. Use spaces
  where required, such as YAML indentation.
- Use Allman braces for statement blocks, functions, and block-bodied callbacks:
  put opening braces on their own line. Keep `else`, `catch`, and `finally` on
  their own lines after the preceding closing brace.
- Always use braces for control-flow bodies, including single statements.
- Put one statement per line. Separate logical steps with blank lines, but keep
  closely related statements together.
- Separate control-flow statements from preceding and following statements with
  a blank line, including adjacent independent `if` blocks. Do not insert blank
  lines immediately inside braces. Keep connected `if`/`else` and
  `try`/`catch`/`finally` blocks together without intervening blank lines.
- Use spaces around binary operators and after commas, not inside parentheses.
- Expand object literals and object type declarations to one property per line.
- Expand nested JSX elements onto separate lines. Split long attribute lists
  across lines and extract complex inline event handlers into named functions.
- Expand callbacks containing multiple statements into indented blocks.
- Keep conditions on one line when readable within the line-length target.
  When wrapping is necessary, put one condition per line, keeping the first
  condition beside `if (` (or the equivalent opening construct) and the closing
  parenthesis beside the final condition. Put Boolean operators at the end of
  continuation lines and indent subsequent conditions one level. Do not add
  lines solely for the opening or closing condition parentheses. Extract
  meaningful named predicates when the expression remains difficult to follow.
- Reserve ternaries for short, simple expressions. Avoid nested ternaries.
- Target 100-120 characters per line, prioritizing readability over a rigid limit.
- Preserve JavaScript's newline-sensitive syntax: use `return (` for multiline
  expressions, never a bare `return` followed by its expression on another line.
- Apply formatting to new or changed code without unrelated whole-file rewrites.
  Do not introduce a formatter configuration that contradicts these rules;
  Prettier supports tabs but does not support Allman brace placement.

## Function structure and code comments

- Target roughly 40 lines of executable code per function, excluding blank lines,
  comments, and brace-only lines. Treat this as a readability guideline, not a
  quota.
- Prefer no more than two levels of control-flow nesting inside a function.
  Do not count the function body, object literals, or JSX markup as nesting.
- Use guard clauses and focused helpers to reduce nesting. Extract cohesive,
  meaningfully named responsibilities, not arbitrary chunks to meet a limit.
- Name functions for their complete responsibility, not just their first step;
  for example, use `parseCourse` for parsing unknown input into a `ParsedCourse`.
- Allow longer React components when straightforward JSX remains readable.
  Extract meaningful components rather than fragments solely to reduce length.
- Keep transaction sequencing, error handling, and cleanup together when
  splitting them would obscure correctness or make the operation harder to read.
- Add one- or two-line JSDoc summaries when a function's purpose, constraints, or
  side effects are not obvious. Do not require boilerplate on every function or
  repeat information already clear from its name and types.
- Add a short file-level comment when it clarifies module responsibility or an
  architectural boundary; omit redundant headers on self-explanatory files.
- Comment non-obvious intent and constraints rather than narrating the code.

## TypeScript conventions

- Use `camelCase` for functions and variables, and `PascalCase` for types and
  React components. Preserve external API and database field names at boundaries.
- Name Boolean values as predicates, such as `isReady`, `hasScores`, or `canStart`.
- Prefer `const`; use `let` for reassignment and avoid `var`.
- Use `===` and `!==` rather than equality with implicit conversions.
- Infer obvious local types; explicitly type meaningful public boundaries and
  component props rather than annotating every local variable.
- Use `unknown` and validation for untrusted data instead of `any` or unchecked
  assertions.
- Use `import type` for imports needed only by TypeScript.
- Use `undefined` for omitted values and `null` for intentional absence where
  appropriate; preserve established contracts rather than converting blindly.
- Prefer named exports, except where framework conventions require defaults.
- Follow the repository's existing filename conventions and retain Next.js
  special filenames such as `page.tsx` and `route.ts`.

## React conventions

- Prefer function components with explicit props types.
- Name custom hooks `useSomething`. Call hooks unconditionally at the top level
  of components or custom hooks, following React's Rules of Hooks.
- Pair state names with setters, such as `selectedCourse` and `setSelectedCourse`.
- Name event callback props `onSave` and their implementations `handleSave`.
- Treat state as immutable; create updated objects and arrays rather than
  mutating existing state.
- Use stable identifiers as list keys; avoid array indices when items can change.

### React component structure

- Keep components focused on coordinating behavior and rendering their main
  layout.
- Extract cohesive state, effects, and related handlers into a named custom hook
  when they obscure the component's main purpose. Reuse is not required to
  justify extraction.
- Extract substantial UI sections or conditional rendering into module-level
  child components with explicit props; prefer these over nested
  `renderSomething` helpers.
- Keep short handlers that naturally depend on local state inside their
  component or hook. Do not move them merely to eliminate nested functions.
- Put pure parsing, validation, and transformation helpers outside components.
- Define extracted components at module scope to preserve stable component
  identity.
- Keep extracted hooks and components in the same file initially unless size,
  reuse, or navigation benefits justify separate files.
- Extract by responsibility, not line count. Avoid helpers with excessive
  parameters, passing raw setters unnecessarily, or moving an entire oversized
  component into one oversized hook.
- Preserve effect dependencies, cleanup, state ownership, event ordering,
  accessibility, and observable behavior during extraction.

## Application structure and ownership

- Organize files by responsibility and feature ownership, not merely file type.
  A file's location should communicate its purpose and intended consumers.
- Keep the application root focused on root routing, layout, global styles,
  metadata, and explicitly organized private directories.
- Keep route-specific UI and helpers beside their route, using private folders
  such as `_components` when appropriate.
- Put domain logic shared across routes or entry points under
  `app/_features/<feature>`. Reuse across unrelated features is not required
  to justify feature ownership.
- Put genuinely cross-feature presentation under `app/_components`.
- Put shared infrastructure, such as database connectivity, under `app/_lib`.
  Do not use shared folders as miscellaneous dumping grounds.
- Keep pages, layouts, API handlers, and Server Actions focused on their
  framework responsibilities and delegating domain operations.
- Keep HTTP request/response concerns in route handlers and UI concerns in
  components. Do not have feature code import route entry points.
- Give shared domain concepts a clear owning feature. Other features may use
  that feature's focused interfaces; avoid circular dependencies and creating
  a generic shared module solely to hide unclear ownership.
- Preserve server/client boundaries. Mark server-only infrastructure and data
  access appropriately; keep shared types and pure functions safe to import
  without pulling server dependencies into client code.
- Split mixed-responsibility modules when their contents belong in different
  locations. Do not move an ambiguous catch-all file wholesale merely to
  satisfy a directory scheme.
- Add subdirectories only when they clarify an existing responsibility.
  Avoid empty scaffolding, unnecessary barrel exports, and excessive nesting.
- Keep tests in the existing test structure, grouped by the behavior they
  cover. Update imports and test fixtures when implementation files move.
- Preserve Next.js special filenames, route groups, directives, and URL
  structure. Private implementation directories must not introduce routes.
- Before adding a file, identify its owner and consumers; place it at the
  narrowest appropriate scope.

## Tests and documentation

- Keep test and documentation changes proportional to the feature's importance,
  complexity, and risk in the context of the whole project, not its recency.
- Update existing documentation where useful, focusing on information readers
  need. Avoid lengthy descriptions of obvious controls or incidental details.
- Test meaningful behavior, edge cases, and regressions according to their
  risk. Prefer focused coverage that fits the existing suite over redundant,
  brittle, or unnecessarily elaborate tests.
- Do not omit necessary documentation or important tests merely to minimize
  changes.

## UI design standards

Apply these standards when creating, modifying, reviewing, or refining
UI. Existing implementation is not evidence that a design decision
should be preserved.

### Own the design outcome

- Take responsibility for interaction design, not just implementing
  controls. The user supplies goals, constraints, and preferences;
  independently resolve ordinary layout and interaction decisions.
- When asked to improve or "take another pass" at UI, evaluate its
  structure and workflow—not merely colors, spacing, and decoration.
- Preserve product capabilities, data integrity, and accessibility.
  Do not confuse preserving behavior with preserving the current
  arrangement, component boundaries, or presentation of controls.
- Ask about consequential changes to product behavior. Do not require
  the user to art-direct routine design improvements.

### Design around the primary task

- Make the primary task immediately apparent and easy to repeat.
  Secondary information and management actions must not compete with
  or obstruct it.
- Organize the interface around the user's mental model, not storage
  structures or implementation mechanics.
- Reveal complexity when needed. Avoid presenting all capabilities,
  editing controls, and explanations simultaneously.
- Prefer self-explanatory interactions. Excessive instructional copy
  is a signal to reconsider the design, not merely shorten the text.

### Make the interface feel cohesive

- Establish deliberate hierarchy, alignment, density, typography,
  spacing, and control treatments across the whole workflow.
- Remove unnecessary stacking, repeated labels, competing emphasis,
  and containers that add visual weight without useful grouping.
- Make frequent actions efficient and secondary actions discoverable
  without giving them equal prominence.
- Keep routine interactions spatially stable. Background work must
  not cause layout shifts, flashing messages, or focus loss.
- Reuse successful existing patterns, but do not perpetuate a weak
  pattern solely for consistency.

### Evaluate and iterate

- Before changing UI, identify its main usability and visual hierarchy
  weaknesses against these standards. Use that assessment to guide
  implementation; do not stop at an audit unless asked.
- Inspect the rendered result in realistic populated states and at
  relevant viewport sizes. Exercise the primary workflow, not just
  isolated controls.
- Compare the result against the starting point: what became clearer,
  quieter, faster, or more coherent? Resolve evident shortcomings
  before declaring completion.
- Passing tests, fitting a mobile viewport, and using design tokens
  do not alone demonstrate polish.
- Report verification limitations and remaining trade-offs honestly.
  Keep the completion summary focused on meaningful improvements,
  not a checklist of cosmetic changes.
