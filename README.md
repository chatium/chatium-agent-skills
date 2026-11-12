# Chatium agent skills

Externally maintained skills for Chatium projects using Codex and Claude Code.

[chatium-development](skills/chatium-development/SKILL.md) guides application
development in the Chatium UGC runtime: Vue pages, routes, Heap data, authentication,
stored media, background jobs, AI agents, automations, messaging, analytics, and
platform SDK integrations. Topic references are loaded only for the requested task.
References may be in English or Russian; agents respond in the user's language.

[chatium-processes](skills/chatium-processes/SKILL.md) guides multi-stage customer
journeys: discovery, process maps, implementation, independent reviews, testing
and launch. It uses `chatium-development` for platform SDKs and application code.

[chatium-site-optimization](skills/chatium-site-optimization/SKILL.md) improves existing
sites through Tailwind and Font Awesome migration, Vue SSR and Google Fonts bundling,
with preview checks and before/after rendering measurements.

[chatium-domain-email](skills/chatium-domain-email/SKILL.md) connects account domains
and Chatium Email through the public SDKs, preserves existing DNS/mail services,
and verifies HTTPS, DNS, transport and mailbox readiness separately from test-message delivery.

[chatium-traffic](skills/chatium-traffic/SKILL.md) analyzes one account's visits,
sessions, visitors, staff activity, business events and ad spend through `@traffic/sdk`,
with a verified schema snapshot and SQL recipes.

Skills live in `skills/chatium-<name>/SKILL.md`. Each skill has YAML frontmatter
with a matching `name` and a `description`. `agents/openai.yaml` (Codex format) gives the menu
label, short description and `assets/icon.svg` icon shown by Codex and Chatium Code;
`metadata: { chatium-menu: hidden }` in the frontmatter keeps a skill out of the
Chatium Code `/` menu while `/name` still invokes it. Supporting documents and executable
helpers live beside `SKILL.md` or in its task-specific subdirectories. Topic prefixes such as
`google-` and `sender-` identify related articles. Skill directories contain regular
files without symlinks.

The core guide follows the Chatium application-development instructions, adapted for
local source editing. SDK signatures are checked against typings available in the
current project or explicitly provided by the user; references preserve behavior,
integration flows, and platform constraints that typings do not express. Vue,
component separation, workspace layout, and one `/` route per file are intentional
skill conventions, not platform limitations. The skill concerns application source
development; account connection
and source delivery are outside its scope.
