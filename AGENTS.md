# Writing skills

`chatium-development` is delivered only to accounts already using Source Git. Treat that as an environment invariant throughout its entrypoint and references.

State instructions directly when their prerequisites are guaranteed by skill delivery. Remove qualifiers such as “In a Source Git account” and branches for accounts without Source Git. Record delivery assumptions here; add another invariant only when its delivery guarantee is established.

Keep conditions that can vary within the supported environment: the requested task, existing source format, workspace presence, permissions, installed integrations, credentials, build state, and runtime results. An account using Source Git does not guarantee an authorized local checkout or a successful build. Existing legacy files may still need maintenance.

When editing a skill, inspect its diff and search the entrypoint and references for equivalent environment qualifiers in both English and Russian. For each condition, either remove a guaranteed prerequisite, remove an unreachable branch, or retain a real decision with its required action. Preserve API error strings and operational account/checkout checks.

Keep shared instructions in `SKILL.md` and task-specific details in linked references. Give each rule one authoritative home; write the desired action directly and preserve the user's scope.
