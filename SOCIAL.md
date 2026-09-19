# Launch copy

Ready-to-post copy for **The Confidence Curve**. Character counts are verified against the
platform limits (X: 280 per tweet, LinkedIn: 300 for the post).

---

## X / Twitter thread — 2 tweets

Post these as a two-tweet thread. Tweet 1 sets up the problem, tweet 2 delivers the finding.
Both are under the 280-character limit with room for a link card.

### Tweet 1 — 257 characters

```
I built an instrument to answer one question: when is a model's extra thinking actually worth it?

50 questions, difficulty 1-10, two models, every answer graded in code. No LLM judge.

Rendered as a 3D surface: height = accuracy, colour = reasoning tokens.
```

### Tweet 2 — 269 characters

```
The finding:

Below difficulty 6 the newer model is 40 points BEHIND while burning 3-4x the reasoning tokens. Crossover: 6.

From D7-D10 tokens grow 3.4x while accuracy FALLS.

Switch thinking off and it drops 18 points — below the older model.

Where's your crossover?
```

### If you want the links in-thread

Adding links pushes both tweets over the limit, so reply to the thread with a third tweet:

```
Built by Harish Kotra
harishkotra.me

More builds:
dailybuild.xyz
```

---

## LinkedIn post — 258 characters

Under the 300-character limit. Link goes in the first comment, which keeps the post itself
inside the limit.

```
Built The Confidence Curve: 50 questions x 2 models on a 3D surface showing where extra reasoning finally pays off — and where it just burns tokens.

Turn thinking off and the newer model drops 18 points, below the older one. Its edge was bought, not innate.
```

**First comment:**

```
Full writeup and the technical breakdown: harishkotra.me
More builds: dailybuild.xyz
```

---

## Notes on the numbers used

Every figure in this copy comes from the committed offline verification run at
`data/runs/verification-reasoning.jsonl` and `data/runs/verification-noreasoning.jsonl`.

| Claim | Source |
|---|---|
| 40 points behind below difficulty 6 | gaps at D1–D4 are all −40 |
| 3–4× the reasoning tokens | 175/52 at D1, 340/88 at D4 |
| Crossover at 6 | `findCrossover()` on the committed records |
| 3.4× token growth D7→D10 | 865 → 2,920 |
| Accuracy falls D7→D10 | 100% → 80% |
| Drops 18 points with reasoning off | B: 72.0% → 54.0% |

**Be honest about the caveat if anyone asks:** these numbers come from a deterministic offline
stand-in provider, not from live model calls. The instrument is verified end to end; the reading
it gives on real models is what a user gets by running it with their own key. See
[VERIFICATION.md](VERIFICATION.md).

---

<div align="center">

Built by **[Harish Kotra](https://harishkotra.me)**

**[Checkout my other builds →](https://dailybuild.xyz)**

</div>