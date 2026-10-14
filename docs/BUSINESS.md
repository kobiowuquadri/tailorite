# Business

Everything below is a hypothesis to test. No interviews, customers, revenue or time savings have been recorded yet.

## First customer segment
Independent tailors and small fashion studios in Nigerian cities (one owner, a few apprentices) who take custom orders over WhatsApp: a few messages, a reference picture, a voice note, sometimes over several days.

**The specific problem:** the agreed design, price and date are scattered across chats and memory. Contradictions (long vs elbow-length sleeves) are easy to miss, and when the customer asks for more work later, nobody wrote down what was agreed before, so price and date changes turn into arguments.

## Value
- One clear brief per garment, with each detail traceable to what the customer actually said or sent.
- An explicit approval of an exact version before cutting fabric.
- Later changes shown as before/after with the price and date difference, approved again by the customer.
- A printable record for the workshop and for resolving disputes.

The value we expect is fewer remakes, refunds and disputes. We have **not** measured any of this.

## Pricing hypothesis (not active)
- Free while in beta. Billing is not implemented and no workflow is ever locked.
- Proposed later: first 3 approved orders free, then ₦500 per newly approved order; revisions and change approvals included; drafts, customers and measurements never charged.
- Rationale to test: a tailor pays only when the product produced an agreement. Settings shows what would have been billed under this proposal, clearly marked as not charged.

## Getting the first customers
- Direct visits to tailors in one market cluster (for example Yaba or Surulere in Lagos), onboarding them in person on their own phones with one real upcoming order.
- Fashion schools and training centres: instructors and final-year students, who take commissions and are used to writing specs.
- Ask each early user to send one review link to a real customer; the customer-facing page is the product's main word-of-mouth surface.

## Metrics (from data the product already records)
| Metric | Definition | Source |
| --- | --- | --- |
| Activation | Studio shares its first version within 7 days of sign-up | `BriefVersion.publishedAt`, `Studio.createdAt` |
| Time to first approved order | Sign-up → first `APPROVED` decision | `ApprovalEvent` |
| Approval completion | Shared versions that get a decision within 7 days | `ApprovalRequest` |
| Repeat orders | Studios with ≥ 3 orders in their second month | `Order` |
| Unresolved conflicts | Conflicts still open when the brief is shared (should be 0 — publication blocks them) or dismissed rather than resolved | `ClarificationIssue` |
| Manual correction rate | AI suggestions edited or rejected ÷ suggestions reviewed; payment reversals ÷ entries | `BriefSuggestion`, `ManualPayment` |

## Cost model (assumptions until measured)
Per AI run: `cost = input_tokens × input_price + output_tokens × output_price` (audio and images count as input tokens). Every run stores its input/output token counts (`ExtractionResult`) and the worker logs them, so real numbers can be read after the first live runs. Current Gemini prices must be taken from Google's pricing page at that time; none are assumed here.

| Item | Value |
| --- | --- |
| Average AI runs per approved order | _to measure_ |
| Average input / output tokens per run | _to measure_ |
| Provider cost per approved order | _to measure_ |
| Storage per order (MB) | _to measure_ — visible per studio in Settings |
| Hosting (one VM + managed PostgreSQL) per month | _to quote_ |

## Validation plan
Interview 10–15 tailors before and after two weeks of use. Questions:
1. Tell me about the last order where the customer said the result was not what they asked for. What happened?
2. Where do you keep the details of an order today? How do you find them a week later?
3. When a customer asks for changes after you agreed the price, how do you decide the new price and date? How do you record it?
4. Would your customers open a link and approve on their phone? What would stop them?
5. After using Tailorite: which part did you actually use? What did you skip?
6. Would you pay ₦500 per approved order? What would make it worth more, or less?

| Interview | Date | Segment | Key quote | Would pay? | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
