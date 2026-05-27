# reviewai

AI-powered code review CLI. Review your code changes with AI before pushing.

## Features

- Review unstaged, staged, or PR changes
- Multiple output formats (terminal, JSON, markdown)
- Configurable AI model
- Local execution — your code stays private
- GitHub Action for automated PR reviews

## Install

```bash
npm install -g reviewai
```

## Usage

```bash
# Review unstaged changes
reviewai

# Review staged changes
reviewai --staged

# Review with specific model
reviewai --model gpt-4o

# Output as JSON
reviewai --format json

# Output as markdown
reviewai --format markdown
```

## Configuration

Create `.reviewai.yml` in your project root:

```yaml
model: gpt-4o
format: terminal
# apiKey: sk-...  # or use OPENAI_API_KEY env var
```

## Environment Variables

- `OPENAI_API_KEY` — Your OpenAI API key

## GitHub Action

Add to `.github/workflows/review.yml`:

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: reviewai/action@v1
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
```

## Output Example

```
Review Summary: Code looks good overall, with a few minor issues.

Found 3 issues: 1 errors, 1 warnings, 1 info

✖ src/auth.ts:42
  Missing input validation on user email
  → Add email format validation before processing

⚠ src/api.ts:15
  Consider adding rate limiting to this endpoint
  → Use express-rate-limit or similar middleware

ℹ src/utils.ts:8
  This function could be simplified using Array.flatMap()
```

## License

MIT
