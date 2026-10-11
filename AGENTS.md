# Maintaining chatium-development

Behavioral regression tests live in the sibling `ai-harness` repository, under
`evals/regression` (Tim's local checkout is `~/projects/botan-harness`). Read its
[regression workflow](https://github.com/chatium/ai-harness/blob/main/evals/regression/README.md)
when changing this skill's behavior. Test prompts and checkers belong there;
keep benchmark instructions out of the installed skill's runtime context.

Add a case for new supported behavior while retaining earlier scenarios. Use the
smoke profile during edits and the full profile before accepting a new baseline.
Report any failure, skipped coverage or incomplete run explicitly. A partial pass
does not establish that the whole skill still works. Baseline acceptance is an
explicit command after a complete run, separate from publishing the skill.
