# Project ContextQuill

ContextQuill is a Work-to-LinkedIn assistant for Codex and ChatGPT Work. It discovers ideas worth sharing inside real work, turns them into high-quality public-safe drafts, locks the exact version approved by a human, and then publishes or schedules it. Post-performance data feeds the next topic and format recommendations.

## What v0.1 includes

- Structured content signals from Codex work, customer conversations, analysis, retrospectives, and industry news
- A profile for positioning, target audience, content pillars, voice, and disclosure boundaries
- A draft library with consistent topic, content-type, format, and hook labels
- Customer and internal-information disclosure checks
- A human review code
- An exact content-hash lock after approval
- Automatic revocation of approval and scheduling after any edit
- Immediate or scheduled publishing after approval
- Text and single-image LinkedIn posts
- Exposure analysis by topic, content type, format, hook, and weekday
- Shrinkage scores and confidence labels to reduce small-sample overfitting
- Tracking for impressions, engagement, clicks, follows, and attributed leads
- Local-first private storage and an audit trail

## Safe approval chain

The state can only move in this direction:

```text
DRAFT -> IN_REVIEW -> APPROVED -> SCHEDULED / PUBLISHED
   ^          Any change to text, links, or images returns the post here
```

When a draft enters review, ContextQuill displays the complete final version and generates a code such as `CQ-A1B2C3`. Only the human reviewer can move that exact version into `APPROVED` by typing `APPROVE CQ-A1B2C3`.

The approval lock covers the post body, links, and attachments. Any later change deletes the approval record and requires a new review.

## Install and use

After installation, select ContextQuill in a new task or say:

- "Set up my ContextQuill content positioning."
- "Find anything in the work we just completed that is worth sharing on LinkedIn."
- "Choose the three strongest ideas for this week's posts."
- "Analyze which recent topics earned more exposure and plan next week's mix."

By default, private content data is stored in:

```text
~/Documents/Codex/ContextQuill
```

Set `CONTEXTQUILL_DATA_DIR` to use another location.

## Connect LinkedIn

ContextQuill uses LinkedIn's official APIs. It does not use browser cookies, simulated posting, or scraping.

The personal ContextQuill LinkedIn app uses Client ID `86z5t5sel4czpt`. It needs the following scopes:

- `openid` and `profile` to bind the token to the correct LinkedIn member;
- `w_member_social` to publish on that member's behalf.

Open LinkedIn's official OAuth token generator with:

```text
npm run authorize-linkedin
```

Select all three scopes and generate the token. Then store it securely with:

```text
npm run connect-linkedin
```

The helper asks for the access token without echoing it, verifies the member through LinkedIn's official `userinfo` endpoint, and stores the token in macOS System Keychain. The token is never written to ContextQuill's JSON content store. ContextQuill records only the member URN, display name, connection time, and expected reauthorization date.

You can also provide credentials through the launch environment:

```text
LINKEDIN_MEMBER_URN
LINKEDIN_ACCESS_TOKEN
```

Run a live identity and connection diagnostic with:

```text
npm run doctor
```

Publishing uses the self-service Share on LinkedIn APIs: `POST /v2/ugcPosts` for text and article posts, plus `POST /v2/assets?action=registerUpload` before single-image posts. The member's daily self-service limit is 150 requests under LinkedIn's current documentation.

## What automatic publishing means

ContextQuill never decides on its own that a draft should be published. Automation begins only after the human has:

1. typed the exact review code to approve the final version; and
2. explicitly selected Publish now or a scheduled time.

Approved scheduled posts publish while the local ContextQuill MCP process is running. If Codex or ChatGPT Work is closed at the scheduled time, ContextQuill publishes the overdue approved post the next time the process starts.

## Performance data

LinkedIn's self-service write permission does not automatically include personal-post analytics access. ContextQuill therefore does not scrape LinkedIn. v0.1 accepts official exports or metrics supplied by the user:

- impressions
- reactions
- comments
- reposts
- clicks
- follows
- attributed leads

Analysis returns:

- mean and median impressions plus a shrinkage-based exposure score
- engagement rate and attributed leads
- performance by content type, format, hook, and weekday
- sample-confidence labels
- topics worth testing again
- a minimum 25% exploration allocation

## Current limitations

- Publishing currently supports text and one image. Multi-image, video, and PDF document posts are later phases.
- Personal-post performance data requires import and is not synchronized automatically.
- Local scheduling depends on the ContextQuill process running. A commercial version needs hosted scheduling.
- LinkedIn access tokens expire and require reauthorization under LinkedIn's current rules.
- LinkedIn's public API terms create policy uncertainty around automated publishing. This version requires explicit human approval for every post; the partnership and review path should be confirmed before commercial launch.

## Validation

The project has no third-party npm dependencies. Use Node.js 20 or later:

```text
npm test
```

The plugin structure is validated with OpenAI's Plugin Creator validator.

## Repository workflow

ContextQuill is maintained in a private GitHub repository. After the initial bootstrap, changes are developed on `codex/*` branches and are not pushed or merged until the owner types the exact approval phrase `APPROVE GITHUB <branch-or-pr>`. Any change after approval requires a fresh review.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md) for the complete workflow and credential-handling rules.

## Next phase

1. Hosted OAuth and secure token renewal
2. Reliable hosted scheduling without a local process
3. Image templates, infographics, and PDF document posts
4. Compliant analytics synchronization or an official import wizard
5. A visual draft library, weekly calendar, and approval interface inside ChatGPT
6. B2B SaaS-specific models for customer cases, operator insights, and demand-generation content
