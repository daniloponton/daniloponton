"""LLM provider adapters.

Each adapter is a plain function ``(model, prompt) -> response_text``. SDKs
are imported lazily inside each function so a provider you don't use doesn't
need to be installed.
"""
from __future__ import annotations

import os
from typing import Callable

ProviderFn = Callable[[str, str], str]


def call_anthropic(model: str, prompt: str) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


def call_openai(model: str, prompt: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content


def call_gemini(model: str, prompt: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
    return genai.GenerativeModel(model).generate_content(prompt).text


PROVIDERS: dict[str, ProviderFn] = {
    "anthropic": call_anthropic,
    "openai": call_openai,
    "gemini": call_gemini,
}

_REQUIRED_ENV_VAR = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GOOGLE_API_KEY",
}


def is_available(provider: str) -> bool:
    env_var = _REQUIRED_ENV_VAR.get(provider)
    return bool(env_var and os.environ.get(env_var))
