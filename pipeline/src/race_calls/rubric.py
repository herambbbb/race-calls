"""The chaos rubric (design Decision 3).

The same five lines are Jev's `score` criteria and the definition the scorer computes
from data, so the question and the answer key can never drift apart. The actual level
is the highest row whose condition holds; a race where no higher row holds is 0.
"""

CHAOS_INSTRUCTIONS = (
    "How chaotic will this race be? Rate it on the five-level rubric. The actual level "
    "will be the highest level whose condition the race meets."
)

CHAOS_CRITERIA: tuple[str, ...] = (
    "0: calm - no safety car or virtual safety car, at most 2 retirements, and the winner "
    "led most laps.",
    "1: lively - a virtual safety car, or 3 to 4 retirements, or 3 or more lead changes.",
    "2: eventful - one full safety car, or a first-lap incident that brought out a yellow "
    "flag or a virtual safety car.",
    "3: chaotic - two or more full safety cars, or 5 or more retirements.",
    "4: bedlam - a red flag, or wet running, or a podium with none of the top six starters.",
)

CHAOS_LEVELS = len(CHAOS_CRITERIA)
