"""Command-line entry point.

    python -m council.cli "your question" \\
        --member anthropic:claude-sonnet-5:Claude \\
        --member openai:gpt-4o:GPT \\
        --chair anthropic:claude-opus-5-5:Chair
"""
from __future__ import annotations

import argparse
import sys

from .core import CouncilMember, convene
from .providers import is_available


def _parse_member(spec: str) -> CouncilMember:
    parts = spec.split(":")
    if len(parts) not in (2, 3):
        raise argparse.ArgumentTypeError(
            f"invalid member '{spec}', expected provider:model or provider:model:label"
        )
    provider, model, *label = parts
    return CouncilMember(provider, model, label[0] if label else "")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="council",
        description="Ask a question to a council of LLMs and get a synthesized answer.",
        epilog=(
            "Example:\n"
            '  python -m council.cli "What\'s the best way to learn Python?" \\\n'
            "    --member anthropic:claude-sonnet-5:Claude \\\n"
            "    --member openai:gpt-4o:GPT \\\n"
            "    --chair anthropic:claude-opus-5-5:Chair\n\n"
            "Providers read their API key from an environment variable:\n"
            "  anthropic -> ANTHROPIC_API_KEY\n"
            "  openai    -> OPENAI_API_KEY\n"
            "  gemini    -> GOOGLE_API_KEY"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("question", help="the question to put to the council")
    parser.add_argument(
        "--member",
        action="append",
        dest="members",
        required=True,
        type=_parse_member,
        metavar="provider:model[:label]",
        help="a council member; repeat for each one (providers: anthropic, openai, gemini)",
    )
    parser.add_argument(
        "--chair",
        required=True,
        type=_parse_member,
        metavar="provider:model[:label]",
        help="the model that synthesizes the council's answers into one response",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    missing = [m.label for m in [*args.members, args.chair] if not is_available(m.provider)]
    if missing:
        print(f"Missing API key(s) for: {', '.join(missing)}", file=sys.stderr)
        return 1

    result = convene(args.question, args.members, args.chair)

    for response in result.responses:
        print(f"\n=== {response.member.label} ===")
        print(response.answer if response.answer is not None else f"[error] {response.error}")

    print("\n=== Council synthesis ===")
    print(result.synthesis if result.synthesis is not None else "[no member answered successfully]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
