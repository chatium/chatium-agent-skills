# Chatium agent skills

Externally maintained skills for Chatium projects using Codex and Claude Code.

[chatium-development](skills/chatium-development/SKILL.md) guides application
development in the Chatium UGC runtime: Vue pages, routes, Heap data, authentication,
stored media, background jobs, AI agents, automations, messaging, analytics, and
platform SDK integrations. Topic references are loaded only for the requested task.
References may be in English or Russian; agents respond in the user's language.

Skills live in `skills/chatium-<name>/SKILL.md`. Each skill has YAML frontmatter
with a matching `name` and a `description`. Supporting resources can live beside
its `SKILL.md` in the same directory. Skill directories contain regular files and
directories, without symlinks.

The core guide follows the Chatium application-development instructions, adapted for
local source editing. SDK signatures are checked against typings available in the
current project or explicitly provided by the user; references preserve behavior,
integration flows, and platform constraints that typings do not express. Vue,
component separation, workspace layout, and one `/` route per file are intentional
skill conventions, not platform limitations. The skill concerns application source
development; account connection
and source delivery are outside its scope.
