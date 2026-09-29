"""Core council logic: ask every member the same question, then have a
'chair' model read all the answers and synthesize a single response.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from .providers import PROVIDERS


@dataclass(frozen=True)
class CouncilMember:
    provider: str
    model: str
    label: str = ""

    def __post_init__(self) -> None:
        if not self.label:
            object.__setattr__(self, "label", f"{self.provider}:{self.model}")


@dataclass
class MemberResponse:
    member: CouncilMember
    answer: str | None
    error: str | None = None


@dataclass
class CouncilResult:
    question: str
    responses: list[MemberResponse]
    synthesis: str | None


def _ask_member(member: CouncilMember, prompt: str) -> MemberResponse:
    fn = PROVIDERS.get(member.provider)
    if fn is None:
        return MemberResponse(member, None, f"unknown provider: {member.provider}")
    try:
        return MemberResponse(member, fn(member.model, prompt))
    except Exception as exc:  # noqa: BLE001 - isolate one member's failure from the rest
        return MemberResponse(member, None, str(exc))


def gather_responses(question: str, members: list[CouncilMember]) -> list[MemberResponse]:
    with ThreadPoolExecutor(max_workers=max(len(members), 1)) as pool:
        futures = [pool.submit(_ask_member, member, question) for member in members]
        return [future.result() for future in futures]


def _build_synthesis_prompt(question: str, responses: list[MemberResponse]) -> str:
    answers = "\n\n".join(
        f"### {r.member.label}\n{r.answer}" for r in responses if r.answer is not None
    )
    return (
        "You are chairing a council of AI models that were each asked the same "
        "question independently, without seeing each other's answers. Read their "
        "answers, note where they agree and disagree, and write a single "
        "synthesized answer that represents the council's best combined "
        "judgment. Be concise.\n\n"
        f"Question: {question}\n\n"
        f"Council answers:\n\n{answers}"
    )


def synthesize(
    question: str, responses: list[MemberResponse], chair: CouncilMember
) -> str | None:
    if not any(r.answer is not None for r in responses):
        return None
    prompt = _build_synthesis_prompt(question, responses)
    result = _ask_member(chair, prompt)
    if result.error:
        raise RuntimeError(f"chair ({chair.label}) failed to synthesize: {result.error}")
    return result.answer


def convene(
    question: str, members: list[CouncilMember], chair: CouncilMember
) -> CouncilResult:
    responses = gather_responses(question, members)
    synthesis = synthesize(question, responses, chair)
    return CouncilResult(question=question, responses=responses, synthesis=synthesis)
