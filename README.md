# reviewai

AI-powered code review CLI. Review your code changes with AI before pushing.

## Features

- Review unstaged, staged, or PR changes
- Support for OpenAI and Anthropic Claude models
- Multiple output formats (terminal, JSON, markdown)
- Configurable AI model and provider
- GitHub Action for automated PR reviews
- Automatic retry with exponential backoff
- Local execution — your code stays private

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

# Review a pull request
reviewai --pr 42

# Use Claude model (auto-detects provider)
reviewai --model claude-sonnet-4-20250514

# Explicitly set provider
reviewai --provider claude --model claude-sonnet-4-20250514

# Output as JSON
reviewai --format json

# Output as markdown
reviewai --format markdown
```

## Configuration

Create `.reviewai.yml` in your project root:

```yaml
provider: openai # or claude
model: gpt-4o
format: terminal
# apiKey: sk-...  # or use env var
```

## Environment Variables

- `OPENAI_API_KEY` — Your OpenAI API key
- `ANTHROPIC_API_KEY` — Your Anthropic API key
- `GITHUB_TOKEN` — GitHub token for PR reviews (auto-set in GitHub Actions)

## GitHub Action

Add to `.github/workflows/review.yml`:

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: wanglingtry6/reviewai@v1
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
          # model: gpt-4o
          # provider: openai
          # post-comment: true
```

### Action Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | Yes | - | API key (OpenAI or Anthropic) |
| `model` | No | `gpt-4o-mini` | AI model to use |
| `provider` | No | auto-detect | `openai` or `claude` |
| `format` | No | `markdown` | Output format |
| `post-comment` | No | `true` | Post review as PR comment |

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
