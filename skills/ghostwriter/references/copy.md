# Copy

Read when writing or editing as a company: landing pages, hero and subheads, CTAs, product descriptions, onboarding strings, product-state copy (errors, empty, success, loading, permission), and transactional emails. Voice comes from the company manifest resolved in SKILL.md; this file is the craft.

## Contents

- [Brief, then write](#brief-then-write)
- [Lead with why, prove with specifics](#lead-with-why-prove-with-specifics)
- [Awareness sets the opening](#awareness-sets-the-opening)
- [Page types](#page-types)
- [Product-state copy](#product-state-copy)
- [Transactional emails](#transactional-emails)
- [Editing existing copy](#editing-existing-copy)
- [Mechanics](#mechanics)

## Brief, then write

Settle four things from the user or the files, infer the rest, and mark what you inferred so the user corrects it against real copy instead of a question:

1. **Purpose.** The one action this copy drives (sign up, book a demo, recover an account).
2. **Reader.** Who, what they have already tried, how they arrived (cold ad, warm email, search, inside the product).
3. **Product.** What it does and the concrete outcome for the reader.
4. **Voice.** The manifest's approved voice and glossary. Approved wording outranks anything in this file, including its spelling and any deliberate signature word. Read three existing strings for locale before writing one; a US-spelling rewrite on an en-AU product is a regression across every string it touches.

Then write. One recommended draft by default; alternatives only when the user asks to compare directions. Match the artefact: a button task returns labels, not a headline bundle. A missing company voice is a setup gap: say so and write a clearly labelled provisional draft rather than inventing the brand or borrowing another.

## Lead with why, prove with specifics

- **Why before what.** Most product copy opens with the product or the mechanism. Open with the reader's problem or motivation, then how the product meets it, then what it is. "Stale dashboards kill trust. StrataSync keeps every client in sync automatically." beats "StrataSync is a real-time data sync engine."
- **Benefit, not feature.** What changes for the reader, then the mechanism. "Ship without writing release notes" beats "automated changelog generation".
- **Show, don't tell.** An adjective claims; a specific proves. "Powerful", "simple", "seamless", "robust", "intuitive", "easy" in a hero are unearned; replace each with the outcome, the number, or the scenario, or cut it. "Simple" as a claim is never earned upfront.
- **Every supplied specific appears.** The user's 4,200 customers and Stripe integration never become "thousands of teams" and "your favourite tools".
- **Sentence economy.** Cut "We believe that", "Our mission is to", "Designed to be", "X is a Y that helps you Z" (say "X does Z"), and any line that restates the headline.
- **CTA names the outcome.** Verb plus what they get, 2 to 5 words, a qualifier when space allows: "Start syncing free", "See pricing", "Try it free, no card". "Get started" and "Learn more" attract clicks and mislead; readers wanting pricing land in a signup flow and leave. Two CTAs with the same verb on one screen read as one decision offered twice.

## Awareness sets the opening

The reader's stage decides what the headline can do: copy channels the desire the reader arrived with, it does not create it.

| Reader | Knows | Open with |
|---|---|---|
| Unaware (cold ad, first visit) | Nothing yet | A sharp observation about their world, then the problem |
| Problem-aware | The pain, not that solutions exist | The pain in their words, its cost, then the fix |
| Solution-aware | Solutions exist, not that yours is one | The mechanism and how it differs |
| Product-aware (retargeting, pricing page) | Your product, not whether it works | Proof: numbers, names, demos |
| Most-aware | Everything; they need the next step | The offer and a specific CTA |

The most common hero mismatch is offer-and-urgency copy aimed at a problem-aware reader.

## Page types

- **Homepage:** pick the highest-value segment and write for them; hero, one credibility line, the pain named specifically, three to five outcomes, how it works, proof with specific results, one final CTA. A secondary CTA dilutes the primary.
- **Landing page:** one action, matched to what brought the reader; strip navigation and exits.
- **Pricing page:** name plans for the buyer, not the tier ("Starter, Growth, Scale" over "Basic, Pro, Enterprise").
- **Feature page:** for people already evaluating; skip the broad setup and go to the specific outcome.
- **About page:** every paragraph answers "what does this mean for me"; it is not a résumé.

## Product-state copy

Words a user reads while doing a task, where clarity about object, scope, and consequence beats persuasion. The product decision (what the action affects, whether it is reversible, whether a confirmation exists) belongs to `product-design`, which owns the shared copy rule IDs; this file writes the wording once that is settled.

- **Destructive and primary labels name the object.** `Delete project`, `Remove member`, `Discard changes`, never `Confirm`, `OK`, `Yes`, or a bare verb. `Save`, `Cancel`, and `Close` are the exemptions: every user knows them and they take no object. A destructive dialog reads `Delete project` / `Cancel`, never `Yes` / `No`.
- **One verb per operation.** Delete destroys, Remove detaches, Archive hides reversibly, Cancel abandons, Discard drops unsaved edits. The verb carries the consequence, so the wrong verb misleads. Use the product's glossary when it has one.
- **Errors say what happened, why when known, and the recovery.** "Could not save your changes. Check your connection and try again." Never raw exception text, never a bare "Something went wrong". Drop the blaming vocabulary ("invalid", "you failed to"); "Enter a date after today" says what to do. Preserve what the user typed.
- **Success confirms in past tense what happened to which object,** proportional to the action: "Changes saved", "Invite sent to jane@acme.com". Add what happens next only when it changes what the user does.
- **Empty states name the object and offer the first action.** Never-had-any guides the first step; filtered-to-zero offers to clear the filter; user-cleared confirms completion and says when new content appears.
- **Loading names the target** when known ("Loading your projects…", "Importing 1,240 rows. About a minute."). Keep the triggering control's label stable while busy.
- **Permission requests lead with the benefit,** in context of first use: "Find stores near you. Allow location access." The decline option gets honest wording; confirmshaming costs trust on every later ask.
- **Copy works when heard.** A field error reads sensibly after its label; links and buttons name the destination; no "above", "below", or "here".
- **Budgets.** Button 2 to 4 words; title 3 to 6; error 12 to 18 including the recovery; any sentence the user must act on under 25. Leave 30 to 40% width headroom for translation, more on short strings.

## Transactional emails

Account, payment, recovery, receipt, security, and notification email. Deliver the copy, not a campaign.

- **Ground the event:** trigger, recipient, affected object, current state, next action, any expiry or consequence. Never invent retry schedules, access end dates, refund promises, security conclusions, support channels, or URLs. Mark noncritical unknowns as placeholders; ask when an unknown decides what the recipient must do.
- **Reuse the nearest approved precedent** by purpose and stakes, and check its claims against current behaviour; a shipped example can be stale, and a changed consequence or expiry gets called out.
- **Deliver the parts** a full draft needs: subject (names the event), preheader (adds detail rather than repeating the subject), heading, body (what happened, to which account, what happens next, what the reader can do), action (label and destination when action is needed; a receipt may need none). A point edit returns only the changed text.
- Calm and specific for recovery and security; proportionate reassurance for payment or account changes. The event and the next step lead; the brand shows in the language. Keep promotional additions out unless asked, and flag the change of purpose.
- Preserve variable names, URLs, amounts, dates, and durations exactly. Writing the email does not authorise sending it; keep the project's footer and preference controls.

## Editing existing copy

Set the posture first. **Point edit:** the user named one line; change it plus the minimum connective tissue and return the wording. **Restoration:** the copy has a clear voice and angle; fix specific failures without rebalancing the argument or replacing its lead with a cleverer one. **Rebuild:** the copy is generic or contradictory; write it from the brief and invent no proof.

Then read every reader-facing surface in scope, name the reader's desired outcome in one line, and return the rewritten copy with before and after per changed line. Each change fixes a named failure; a change that is merely different is a regression, so restore the original. Add tags only when the user asks for them: `[VAGUE]`, `[NO-PROOF]`, `[FEATURE-NOT-BENEFIT]`, `[WEAK-CTA]`, `[DEAD-WEIGHT]`, `[VOICE-DRIFT]`, `[AI-ISM]`, `[STATE-COPY]`. Tone shifting with the reader's state (brisk on a save, careful before a deletion) is not voice drift; drift is when the copy reads as a different brand.

## Mechanics

- **Compound adjectives before a noun take a hyphen:** a 7-day trial, a 4-digit code, real-time updates. Standing alone they do not: the trial lasts 7 days. Template variables follow the same rule and hide it: `{{days}}-day trial`, `expires in {{days}} days`. An `-ly` adverb never takes the hyphen ("a fully managed service"). Fix these silently in a rewrite.
- **Casing follows the surface.** Apple, Material, Polaris, Atlassian, and GOV.UK specify sentence case for UI text; title case reads as pasted in.
- **Glossary first.** Read the product's glossary and house style before replacing a term; the same word can be correct in another flow, so replace by meaning, not by search-and-replace.
- **Em dashes count as a banned word** in copy: none in headings or body, and no `--` or spaced hyphen standing in for one.
