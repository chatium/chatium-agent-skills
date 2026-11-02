# Vue SSR adaptation

Read [SSR in coding.md](../../chatium-development/coding.md#ssr) before editing. It defines the first-render data contract, request isolation, lifecycle, router and Teleport constraints.

## Audit the island graph

For each island, inspect its imported stores/composables, child and lazy components, external dependencies and app/router setup. Account for each SSR contract rule in this graph, not only the root SFC. Record whether SSR can produce useful initial content from existing props or only the current loading placeholder.

For each contract violation, identify the smallest local adaptation and its affected consumers. Include the router hook and guards, Teleport sites and body selectors affected by its containers in this assessment.

Preserve intentional coordination between components and islands: trace every consumer before replacing a shared store with instance state. Keep existing data-loading behavior unless a local adaptation suffices. Substantial server data loading, store redesign or architectural work needs a separate user decision; continue other islands. Keep unresolved islands client-rendered and explain the obstacle.

Done when the reachable render graph is accounted for, initial values are shared safely between server and browser, and remaining work fits the agreed scope.

## Enable and verify

Opt in at the server JSX island with `<Comp ssr />`. This is per island; retain client rendering where unsuitable. Rebuild the changed app and check actual target support, including external provider artifacts when relevant.

Apply the contract's initial-response, fallback and hydration checks to each migrated island, recording the intended content found in its response. For fallback reasons use [account logs](../../chatium-development/account-logs.md).

Check direct navigation, router navigation, dialogs/Teleport, lazy children and their initial styles. If the dependency audit found request-specific state, exercise successive requests with different users/data to detect contamination. Inspect class/style/attribute mismatches as well as text: hydration may leave wrong attributes until a later update. A fallback or unresolved mismatch means that island is not verified; fix locally or remove its opt-in.

Use [Fonts and resources](google-fonts.md) when early SSR images compete with critical resources. Confirm client chunks have not been disabled in the test browser; late component styles can hide the expected benefit. Record an initial loading placeholder as such, without claiming server-rendered application data.

Done when the response contains intended content, hydration and interactions pass, request state is isolated, and the shared performance comparison is complete or explicitly unavailable.
