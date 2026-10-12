# Kar: business model

*Last updated: 14 Oct 2026. Prices marked "to be confirmed" are set in the app's `platform_settings` and can change without code changes.*

## What Kar is
Kar is a car-rental marketplace for university campuses, starting at UTP (Seri Iskandar). Kar **does not own cars**. It connects people who have cars with students who need them, and gives both sides the tools that WhatsApp rental lacks:
- payment in the app;
- photo evidence at pickup and return;
- the exact parking spot;
- verified customers;
- a blacklist.

## Two kinds of owner, two plans

| | **Pro operator** (launch with these) | **Casual owner** (later) |
|---|---|---|
| Who | Existing rental businesses around campus with 5–20 cars, licensed and insured | Private individuals earning extra from one car |
| Pays Kar | **RM149/month** (to be confirmed) **+ 5%** on bookings Kar brings in through the app | **15%** per trip |
| Their own WhatsApp/walk-in bookings | Added to Kar's calendar, **0%** | – |
| When | From day 1 | Only after a P2P insurance partner is in place (waitlist until then) |

Students pay a **5% booking fee (minimum RM3)** on every app booking.

## Every way Kar makes money

| # | Who pays | What for | Amount |
|---|---|---|---|
| 1 | Student | Booking fee | 5% of trip, minimum RM3 |
| 2 | Pro operator | Subscription for the software | RM149/month (to be confirmed) |
| 3 | Pro operator | Commission on customers Kar brings in | 5% of app-booked trips |
| 4 | Casual owner | Commission | 15% of trip |
| 5 | Owner/operator | Key box (installed) / GPS tracker | ~RM150 profit per unit, plus RM10/month per tracker |
| 6 | Customer | Claim handling, summons admin, share of late fees | RM30 / RM20 / 20% of the late fee |
| 7 | Later | Insurance referral commission, featured listings | Year 2 and later |

**Not Kar's money:** the trip price belongs to the owner, and the **deposit is collected and held by the owner/operator**. Kar records the deposit and provides the photo evidence for any deduction. This avoids gateway refund costs and slow refunds, and means Kar never holds customers' money, which would raise Bank Negara (BNM) issues.

## One RM80 booking, three ways

| | Casual owner's car | Pro operator's car (booked in app) | Pro operator's WhatsApp booking |
|---|---|---|---|
| Customer pays Kar | RM84 | RM84 | – (pays operator) |
| Owner receives | RM68 (80 − 15%) | RM76 (80 − 5%) | RM80 |
| Kar earns | RM4 + RM12 = **RM16** | RM4 + RM4 = **RM8** | RM0 (covered by subscription) |
| Payment gateway | −RM2 | −RM2 | – |
| **Kar keeps** | **RM14** | **RM6** | **RM0** |

## Flaws found in earlier versions, and how they're fixed

| Flaw | Fix |
|---|---|
| Pro at 0% commission meant Kar kept ~RM2 when it brought a customer | Pro pays 5% on bookings Kar brings in |
| One campus can't cover ~RM3,450/month in fixed costs, and the founder isn't paid | Grow to 3+ campuses within 18 months, set up by student ambassadors |
| A short RM16 trip earned RM0.80 but cost ~RM2 in gateway fees | Minimum booking fee of RM3 |
| Private-car insurance is often void for paid rentals, a legal and reputational risk | Launch with licensed Pro operators only; casual owners wait for an insurer partner |
| Kar holding deposits costs refund fees, refunds are slow, and holding customer money raises BNM issues | Owner/operator holds the deposit; Kar provides the evidence |
| A 10% casual commission is too thin to include protection | 15% once insurance is included (Turo takes 10–40%) |
| Trip volume, operator count and willingness to pay are guesses | Validate before building more (below) |

## What must be true for Kar to work
1. **8 or more UTP operators** agree to pay ~RM149/month + 5%. Ask them before building anything else. If this fails, the model is wrong.
2. **150 or more app trips a month** at UTP by month 6.
3. **A second campus by month 9** (UiTM Seri Iskandar), using a low-cost student ambassador.
4. **A P2P insurer partner by year 2** (Trevo works with Allianz), or casual owners never launch.

## Why this model, not the alternatives
- **Owning a fleet (SOCAR):** too much capital. SOCAR Malaysia is shutting down on 31 Aug 2026.
- **Hardware in every car (Getaround):** costs too much to run. Getaround left the US in 2025.
- **Pure marketplace:** operators take repeat customers to WhatsApp and cut Kar out. The Pro subscription removes that incentive.
