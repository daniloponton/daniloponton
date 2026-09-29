from council import providers
from council.core import CouncilMember, convene, gather_responses, synthesize


def test_gather_responses_collects_all_members(monkeypatch):
    monkeypatch.setitem(providers.PROVIDERS, "fake", lambda model, prompt: f"{model} says hi")
    members = [CouncilMember("fake", "a"), CouncilMember("fake", "b")]

    responses = gather_responses("question?", members)

    assert {r.answer for r in responses} == {"a says hi", "b says hi"}
    assert all(r.error is None for r in responses)


def test_gather_responses_isolates_member_failure(monkeypatch):
    def flaky(model, prompt):
        if model == "broken":
            raise RuntimeError("boom")
        return "ok"

    monkeypatch.setitem(providers.PROVIDERS, "fake", flaky)
    members = [CouncilMember("fake", "broken"), CouncilMember("fake", "fine")]

    responses = gather_responses("q", members)

    by_model = {r.member.model: r for r in responses}
    assert by_model["broken"].error == "boom"
    assert by_model["fine"].answer == "ok"


def test_synthesize_returns_none_when_nobody_answered(monkeypatch):
    def always_fails(model, prompt):
        raise RuntimeError("down")

    monkeypatch.setitem(providers.PROVIDERS, "fake", always_fails)
    members = [CouncilMember("fake", "a")]
    chair = CouncilMember("fake", "chair")

    responses = gather_responses("q", members)

    assert synthesize("q", responses, chair) is None


def test_convene_end_to_end(monkeypatch):
    def fake_provider(model, prompt):
        if model == "chair-model":
            assert "Council answers" in prompt
            return "final synthesized answer"
        return f"answer from {model}"

    monkeypatch.setitem(providers.PROVIDERS, "fake", fake_provider)
    members = [CouncilMember("fake", "m1"), CouncilMember("fake", "m2")]
    chair = CouncilMember("fake", "chair-model")

    result = convene("what is 2+2?", members, chair)

    assert len(result.responses) == 2
    assert result.synthesis == "final synthesized answer"
