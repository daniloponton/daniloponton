# Council of High Intelligence

Ask one question to several LLMs at once, then have a "chair" model read
everyone's answer and write a single synthesized response — noting where
the council agreed and where it didn't.

## How it works

1. Every **member** you list gets the question independently, in parallel.
   They never see each other's answers.
2. The **chair** then receives the question plus every member's answer, and
   writes a synthesis.
3. A member that errors (bad API key, rate limit, etc.) doesn't block the
   others — it's just reported as failed, and the chair synthesizes from
   whoever did answer.

## Setup

```bash
cd council-of-high-intelligence
pip install -r requirements.txt   # or just the SDK(s) for providers you'll use
```

Set an API key for each provider you plan to use:

| provider   | environment variable |
|------------|-----------------------|
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai`    | `OPENAI_API_KEY` |
| `gemini`    | `GOOGLE_API_KEY` |

## Usage

```bash
python -m council.cli "What's the best way to learn Python?" \
  --member anthropic:claude-sonnet-5:Claude \
  --member openai:gpt-4o:GPT \
  --chair anthropic:claude-opus-5-5:Chair
```

`--member` takes `provider:model` or `provider:model:label`, and can be
repeated as many times as you want. Check each provider's docs for their
current model names — this project doesn't hardcode a default roster on
purpose, since model names change over time.

## Adding a provider

Add a `(model, prompt) -> str` function to `council/providers.py` and
register it in the `PROVIDERS` dict, plus its API key env var in
`_REQUIRED_ENV_VAR`. Nothing else needs to change.

## Tests

```bash
pytest
```
