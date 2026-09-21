# Surfaces

Shape defaults for the surfaces that have no reference of their own. Each applies only where the profile is silent; a profile always wins, and the platform's conventions (emoji, apostrophes, sign-offs) come from it, never from here. Every surface still runs the machine-tells pass.

## Chat message (Slack, WhatsApp, LinkedIn message)

One line unless the question was long; answer in the shape of the question. A link over a description of the thing. Multiple short messages beat one long one when the profile shows bursts. No greeting mid-thread, no sign-off. An ask names the thing and the time: "Would I be able to get a review on <link>?" A decline gives the real reason once.

## Email

The point in the first sentence; the reply shorter than the email it answers. Subject is a plain label ("Move domain"), never a sentence. One paragraph per point, a blank line between. Numbered steps only for real step-by-step instructions. Mid-thread, the frame (greeting, sign-off) drops away.

## Social post (LinkedIn)

One specific thing that happened, one number, at most one lesson stated plainly rather than labelled ("The lesson:" is not a sentence). Three to six short blocks. Named credit where it is due. No hashtags, no closing question unless the profile shows one. Longer drafts read as ghostwritten: cut the weakest block.

## Blog post and essay

One claim, three or four concrete episodes or numbers that carry it, a close that steps sideways rather than summarising. Headings are plain noun phrases and few. No lists or tables unless the items cannot be narrated. Keep every real number, product name, and price; strip every claim with nothing behind it. The length is what the evidence needs.

## Ticket and ticket comment (Linear)

The gap, then "so" plus the concrete cost: a gap with no cost is not finished. Identifiers, counts, and file:line do the arguing; quote the offending string rather than paraphrasing it. At most one heading. Scope fences stated flat ("Do not rename public slugs"). A comment adds one fact or one decision and stops; it does not restate the ticket. No user-story boilerplate, no acceptance checklist on a small ticket.

## PR description and review comment (GitHub)

Description: what changed and why in the first line, then how to verify, then what is out of scope. Written like a developer posting in a channel, not a summary of the diff. Link the issue; name the risk if there is one. Opening or updating the PR itself, with templates and reviewers, is `pr-creator`.

Review comment: the line, the problem, and what it costs, then the fix proposed once. Questions are real questions. A nit says it is a nit. No praise padding around a finding; a comment that only says the code is fine is a thumbs-up, not a comment.

## PRD

Problem, who has it and how often, what changes for them, how we will know it worked (a measurable), what is out of scope, open questions. Every section earns its place: drop one the document does not need rather than fill it. Numbers over adjectives; a decision stated as a decision, not hedged; open questions left open and listed, not resolved by the writer. Halve it and check the measurable and the scope fences survived.

## Slide copy and talk script

Slides: one idea per slide, the number or the claim as the headline, at most a few words below it, never a paragraph. A slide the speaker reads aloud is a script, not a slide. Deck structure, visuals, and speaker notes as a system are `presentation-creator`; this is the wording once that is settled.

Script: spoken register. Short sentences, contractions, the story in the order it happened, written to be read aloud without stumbling. One idea per breath. Mark where the slide changes. No "in this talk I will"; start with the first thing that happened.
