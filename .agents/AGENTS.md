# [PH] Hybrid Book Tool

This is a modern Angular application. Make sure to follow the best practices and patterns as documented through available skills and MCP tools. Especially for anything related to Angular, do not write old Anguar code, always write modern Angular code to the best of available knowledge.

## Style

Always follow the STYLEGUIDE.md.

Do not try to break lines on your own to make them fit the 120 line width limit. When breaking lines due to the line width limit rather than for other reasons, write long unbroken lines then pass them into the analyze_line_length MCP tool in the line-checker server to determine if you have to to break them. The exception is if this tool isn't available, then still write long lines but leave them as they are and warn about the situation if the linter detects long lines.

## Linting
Lint the files with `ng lint`.

## Testing
Run unit tests with `ng test --watch=false`, or just `ng test` for continuous testing if that is a good idea.
