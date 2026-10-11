# Workspace rules

- When running Flutter commands, try `fvm` first. If `fvm` is not found, use `flutter`.
- Before formatting Dart files, read `.vscode/settings.json` and use its `dart.lineLength` value explicitly: `fvm dart format --line-length <dart.lineLength> <files>`. If `fvm` is unavailable, use `dart format` with the same explicit line length. Never format Dart using the default line length.
- Do not commit or push changes; the user handles this.

## App progress tracking

- The assistant owns updating the app progress in `docs/project-hub.html`; do not leave this work for the user.
- After changing app features, fixing bugs, or running relevant verification, update the affected progress descriptions, statuses, verification results, and snapshot date to match the actual code and available evidence. Update roadmap items when their work is implemented or verified.
- Distinguish implemented code from verified behavior. Only mark a feature as verified when the relevant checks have actually passed; describe any remaining manual checks or limitations. Do not invent completion percentages or mark manual test cases as passed without running them.
- App progress must reflect the latest assistant-maintained source, including when the page restores browser-local data. Keep user-entered manual test results and notes intact when updating progress.
- Keep this page local-only. Do not deploy it, commit, or push unless the user explicitly changes these instructions.
