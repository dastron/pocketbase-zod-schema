---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: 'bug'
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Error Output**
If applicable, add the full error output or stack trace.

```
Paste error output here
```

**Configuration**
Please provide your configuration file (remove sensitive information):

```json
{
  "schema": {
    "directory": "./src/schema"
  }
}
```

**Schema Example**
If the issue is related to a specific schema, please provide a minimal example:

```typescript
// Minimal schema that reproduces the issue
export const ExampleSchema = z.object({
  // ...
});
```

**Environment (please complete the following information):**
 - OS: [e.g. macOS, Windows, Linux]
 - Node.js version: [e.g. 18.17.0]
 - Package version: [e.g. 0.1.0]
 - PocketBase version: [e.g. 0.26.0]

**Additional context**
Add any other context about the problem here.