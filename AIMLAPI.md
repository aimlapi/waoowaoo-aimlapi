# aimlapi.com — position note on waoowaoo

**Status: do not integrate. This file is fork-only and must never be sent upstream.**

This note records why no aimlapi.com provider integration was written for this
repository, and what the upstream licence does and does not allow us to do with
this fork. It is written for a colleague deciding whether to take any of this
further.

Verified 2026-09-03 against upstream `waooAI/waoowaoo` at commit
`60fafe97750991eabf9ff80ccd2dc3d5a95458b8` (the fork is even with upstream).

---

## 1. The licence is the governing constraint

`LICENSE` in this repository is **Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**.
The file is 14 lines. Quoted in full where it matters:

> Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
>
> This is a human-readable summary of (and not a substitute for) the license.
> Disclaimer: This license is not a software license in the strict Open Source sense,
> but it is used here to protect the commercial rights of the project.
>
> You are free to:
> - Share — copy and redistribute the material in any medium or format
> - Adapt — remix, transform, and build upon the material
>
> Under the following terms:
> - Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
> - NonCommercial — You may not use the material for commercial purposes.
> - ShareAlike — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

### What it permits

- **Reading, cloning and studying the code.** Unrestricted.
- **Forking and redistributing it**, including publicly, including verbatim —
  "Share — copy and redistribute the material in any medium or format".
- **Modifying it** — "Adapt — remix, transform, and build upon the material".

All three are conditioned on Attribution (credit, a link to the licence, and a
statement that changes were made), ShareAlike, and NonCommercial.

### What it forbids

- **"You may not use the material for commercial purposes."** CC BY-NC-SA 4.0
  defines NonCommercial as *not primarily intended for or directed towards
  commercial advantage or monetary compensation*. Writing a provider integration
  that routes a user's paid model traffic to aimlapi.com, and tagging those
  requests with a partner id whose only function is revenue attribution, is
  primarily directed towards commercial advantage. That is the exact thing the
  licence prohibits, and the licence file says so in its own words: it exists
  "to protect the commercial rights of the project".
- **ShareAlike is a second, separate problem.** Any adaptation must be
  distributed under CC BY-NC-SA 4.0. Any of our own code mixed into this tree
  inherits a NonCommercial copyleft obligation. That is not a licence we want
  attaching to our integration code.

### Two caveats a lawyer should see before anyone relies on this

1. **The repository does not actually ship the licence it names.** `LICENSE`
   contains only the Creative Commons *deed summary*, and states of itself:
   "This is a human-readable summary of (and not a substitute for) the license."
   The CC BY-NC-SA 4.0 legal code is not present in the repository. GitHub's own
   licence detection agrees it cannot identify it — the API reports
   `"spdx_id": "NOASSERTION"`, `"key": "other"`.
2. **The licence was added after the fact.** It arrives in commit `8bc8eb33`,
   "Create LICENSE", dated 2026-04-27, seven weeks after the first commit on the
   current history (`881ed449`, "feat: initial release v0.3.0", 2026-03-08).

Neither caveat makes the intent ambiguous. The author's stated purpose is to
reserve commercial rights, and we should read it that way.

### What this means for this fork

Holding a fork for evaluation is within "Share". Publishing a *commercial*
derivative is not. This note is the only change we have made, and it is an
assessment, not an exploitation. **Whether aimlapi.com should keep a public fork
of an NC-licensed project at all is a decision for a human, not an inference from
this note.**

---

## 2. Three claims from the survey, re-checked

The survey listed this repo as "not doing" on three grounds. Two hold, one is
wrong, and the correction matters.

### Claim 1 — "zero pull requests of any state, ever". **False.**

The true situation is different and stronger: **pull requests are switched off at
the repository level**, and at least 40 pull requests existed before they were.

- `GET /repos/waooAI/waoowaoo/pulls?state=all` returns **HTTP 404**. The
  endpoint itself is gone, not empty. The web UI at `/pulls` shows 0 open /
  0 closed and "There aren't any". A tool that treats that 404 as an empty list
  will report "zero PRs" — which is, most likely, how the survey got here.
- Issues and PRs share one number sequence. This repo has 165 issues numbered
  3–208, leaving 43 gaps. Requesting a gap through the *issues* endpoint
  discriminates cleanly:
  - `#1, #2, #5, #6, #20, #22, #25, #26, #27, #30, #31, #32, #41, #42, #44, #45,
    #51, #52, #54, #62, #63, #66, #68, #73, #76, #81, #88, #90, #94, #99, #101,
    #105, #110, #115, #116, #117, #118, #119, #123, #128` — 40 numbers, all
    returning `"Pull requests are disabled for this repo"`. These are pull
    requests GitHub still holds but will not serve.
  - `#183, #195, #198` and everything from `#209` up return a plain
    `"Not Found"` — deleted issues and unallocated numbers.
- Git history settles it beyond inference. Commit
  `b47dc6eeeebebbb7c2cac60d8f2a3252e6352693`, authored by an outside
  contributor on 2026-04-20, reads:

  > `Merge pull request #2 from ienone/copilot/fix-project-agent-functionality`

  An external pull request was opened *and merged*. It is not an ancestor of
  `main` — it lives on development branches.

  Note that GraphQL is **not** a usable check here: `pullRequest(number: N)`
  returns "Pull requests are disabled for this repository" for *any* number,
  including numbers that were never allocated, and `pullRequests.totalCount`
  returns 0. Both are artefacts of the feature being off, not measurements.

**The practical consequence is the opposite of reassuring.** It is not that
nobody has bothered to send a PR. It is that **nobody can** — the door has been
removed, not merely closed. No future upstream contribution is possible by pull
request while this setting stands. It would have to be an issue, or a private
approach to the maintainer.

### Claim 2 — the README line. **True, still at line 141, unchanged.**

`README_en.md:141`, verbatim:

> `- 🔧 Submitting Pull Requests as references — we review every PR carefully for ideas, but the team implements fixes internally rather than merging external PRs directly`

The Chinese `README.md:149` says the same thing.

Worth noting the contradiction: this line invites pull requests "as references"
from a repository on which pull requests are disabled.

### Claim 3 — "CC BY-NC-SA, NonCommercial". **True.** See section 1.

---

## 3. A fourth ground the survey missed

`README_en.md:112`, verbatim:

> `> 💡 **Note**: Currently only official provider APIs are recommended. Third-party compatible formats (OpenAI Compatible) are not yet fully supported and will be improved in future releases.`

aimlapi.com is precisely a third-party OpenAI-compatible endpoint. The
maintainer has stated in the README that this class of provider is not fully
supported. Any integration we proposed would be arguing against a documented
position, on top of everything above.

---

## 4. What the integration would have looked like, and why it is unnecessary

Recorded so nobody has to re-derive it.

- There is a real provider surface. `MODEL_PROVIDER_KEYS` in
  `src/app/[locale]/profile/components/api-config-tab/hooks/useApiConfigFilters.ts:24`
  is a hand-ordered list of nine keys — `ark`, `google`, `bailian`,
  `openrouter`, `minimax`, `vidu`, `fal`, `gemini-compatible`,
  `openai-compatible`. A competing aggregator (`openrouter`) is already
  first-class, so there is a precedent-shaped slot.
- **But we do not need it.** The repo ships a user-configurable
  `openai-compatible` provider: the user supplies a base URL and a key in
  Settings. aimlapi.com works through it today with **no code change at all**.
  Confirmed by a live call on 2026-09-03 reproducing the repo's own client
  construction exactly — `createOpenAICompatClient`
  (`src/lib/model-gateway/openai-compat/common.ts:47`) followed by
  `runOpenAICompatChatCompletion` (`.../openai-compat/chat.ts:10`), which send
  only `{ apiKey, baseURL }` and `{ model, messages, temperature }`:

  ```
  requested_model: openai/gpt-5-5     echoed_model: gpt-5.5-2026-04-23
  finish_reason:  stop
  content:        "waoowaoo openai-compatible path reached."
  usage:          prompt 20 / completion 25 / total 45 (reasoning 5)
  ```

  So the value of a named integration here is placement and attribution, not
  capability — and placement and attribution are the parts the licence forbids.

## 5. No attribution headers, on two independent grounds

- **Licence.** A partner id exists to attribute revenue. Adding one is the
  commercial use the licence prohibits.
- **No mechanism, independently of the licence.** `createOpenAICompatClient`
  (`src/lib/model-gateway/openai-compat/common.ts:47`) constructs `new OpenAI({
  apiKey, baseURL })` and accepts no `defaultHeaders`. The only `defaultHeaders`
  in the tree is in `src/lib/user-api/llm-test-connection.ts:84`, on the
  connection-test path, used once to send `anthropic-version`. Attribution
  headers on the production request path would be new machinery in someone
  else's codebase, which is the shape of contribution that gets refused.

**No partner id was minted for this repository, and none should be.**

---

## 6. Recommendation

1. **Write no integration.** Not upstream, not in this fork.
2. **Add no attribution headers**, and register no partner id.
3. **Do not add aimlapi.com attribution or provider code to this tree**, which
   would create a commercial derivative of an NC-licensed work.
4. If aimlapi.com support in waoowaoo is ever wanted, the licence-clean routes
   are (a) documentation *we* publish on our own site showing users how to point
   the existing `openai-compatible` provider at us — it already works — or (b) a
   commercial licence negotiated with the author, who has explicitly reserved
   those rights. Not a pull request; pull requests are disabled.
5. **Have someone decide whether to keep this fork at all.** It is defensible as
   evaluation, and it is the only copy of 17 branches upstream has since deleted
   (upstream now has exactly one branch, `main`; this fork has 18). That is a
   fact worth knowing before anyone deletes either side.
