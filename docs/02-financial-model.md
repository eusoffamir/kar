# Kar: financial model (year 1)

*These are planning estimates, not guarantees. The editable version is `docs/Kar_Financial_Model.xlsx`. Replace the guesses with real numbers after the first 50 trips and the operator interviews.*

## How money flows
```
Student pays Kar:  trip price + booking fee (5%, min RM3)
   ├─► Owner/operator gets: trip price − commission (weekly payout)
   └─► Kar keeps:          booking fee + commission (+ small fees)
Deposit, late fees, damage: settled directly between the student and the owner/operator (never through Kar)
Pro subscription: operator pays Kar monthly
```
About one week of owner payouts sits with Kar at any time. **This is owner money, not profit. Never spend it.**

## Assumptions (base case)

| Item | Value |
|---|---|
| Average trip price | RM80 |
| Booking fee | 5%, minimum RM3 → RM4.00 on an RM80 trip |
| Pro commission on app bookings | Waived in months 1–3 (pilot), then 5% → RM4.00 |
| Small fees Kar keeps | RM0 (no late-fee share or claim fee since Kar left deposits; summons admin not counted) |
| Payment gateway (FPX) | −RM2.00/trip |
| Goodwill and bad-debt reserve | −RM0.80/trip (1% of trip value) |
| **What Kar keeps per app trip** | **Pilot RM1.20 → from month 4, RM5.20** |
| Pro subscription | RM149/month (to be confirmed) |
| Key box | Sold installed at RM299, costs ~RM149 → RM150 profit |
| GPS tracker (from month 7) | RM150 profit + RM10/month |
| Casual owners (15%) | Not in year 1 (waiting for an insurer) |

**Growth assumptions**

| Month | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| App trips | 40 | 80 | 130 | 180 | 230 | 280 | 330 | 380 | 420 | 460 | 500 | 540 |
| Paying Pro operators | 0 | 3 | 5 | 6 | 7 | 8 | 10 | 11 | 12 | 13 | 14 | 15 |
| Key boxes sold | 0 | 2 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 4 | 4 |
| GPS trackers sold | – | – | – | – | – | – | 2 | 2 | 2 | 2 | 2 | 2 |

UiTM Seri Iskandar is added in month 7.

## Costs
**One-off at the start: RM5,210**

| Item | RM |
|---|---|
| Lawyer-checked terms, house rules and privacy policy | 2,000 |
| Apple developer account (USD 99/yr) | 450 |
| Google Play account (one-time) | 110 |
| SSM renewal and adding the business activity | 100 |
| Launch marketing (posters, campus booth) | 800 |
| First 5 key boxes (earned back as they sell) | 750 |
| Starting claims reserve | 1,000 |

**Month 7: RM1,500** to register a Sdn Bhd.

**Monthly fixed costs** (no founder salary in year 1)

| | Months 1–3 | Months 4–6 | Months 7–12 |
|---|---|---|---|
| Software (Supabase, domain, email, store fees) | 150 | 150 | 300 |
| Marketing (ads, referral credits) | 500 | 800 | 1,200 |
| Part-time support (student) | 0 | 600 | 1,200 |
| Phone and data | 50 | 50 | 50 |
| Company secretary and audit | 0 | 0 | 400 |
| Contingency | 200 | 200 | 300 |
| **Total** | **900** | **1,800** | **3,450** |

## Base case, month by month (RM)

| Month | Kept from trips | Subscriptions | Hardware | Fixed costs | One-offs | **Net** | **Running cash position** |
|---|---|---|---|---|---|---|---|
| 0 | | | | | −5,210 | −5,210 | −5,210 |
| 1 | 104 | 0 | 0 | −900 | | −796 | **−6,006 ← lowest** |
| 2 | 208 | 447 | 300 | −900 | | +55 | −5,951 |
| 3 | 338 | 745 | 450 | −900 | | +633 | −5,318 |
| 4 | 1,188 | 894 | 450 | −1,800 | | +732 | −4,586 |
| 5 | 1,518 | 1,043 | 450 | −1,800 | | +1,211 | −3,375 |
| 6 | 1,848 | 1,192 | 450 | −1,800 | | +1,690 | −1,685 |
| 7 | 2,178 | 1,490 | 920 | −3,450 | −1,500 | −362 | −2,047 |
| 8 | 2,508 | 1,639 | 940 | −3,450 | | +1,637 | −410 |
| 9 | 2,772 | 1,788 | 960 | −3,450 | | +2,070 | **+1,660 ← all money earned back** |
| 10 | 3,036 | 1,937 | 980 | −3,450 | | +2,503 | +4,163 |
| 11 | 3,300 | 2,086 | 1,000 | −3,450 | | +2,936 | +7,099 |
| 12 | 3,564 | 2,235 | 1,020 | −3,450 | | +3,369 | **+10,468** |

**Year 1 summary (base)**

| | RM |
|---|---|
| Revenue from trips (after gateway and reserve) | 22,562 |
| Pro subscriptions | 15,496 |
| Hardware profit | 7,920 |
| Fixed costs | −28,800 |
| One-off costs | −6,710 |
| **Profit** | **+10,468** |

## Scenarios

| | Worst | Base | Best (1.5× trips and operators) |
|---|---|---|---|
| Spending | Lean: RM900/month to month 6, RM1,800 after, no Sdn Bhd | as above | as above |
| Lowest cash position | −RM6,838 (month 3) | −RM6,006 (month 1) | −RM5,954 (month 1) |
| All money earned back | Month 12 | Month 9 | Month 6 |
| Year 1 profit | +RM832 | +RM10,468 | +RM29,050 |

## Capital needed

| | RM |
|---|---|
| Lowest cash position (worst case) | ~7,000 |
| Claims and goodwill reserve (one bad incident) | 3,000 |
| Contingency (~1 month of costs) | 3,450 |
| **Recommended** | **≈ 15,000** (bare minimum ~7,000) |

**Where the money can come from:**
- own savings or the partnership;
- the UTP incubator;
- Cradle CIP grants and MRANTI programmes (check current amounts);
- **pre-selling key boxes to operators.**

Avoid giving away equity for under RM20k.

## Break-even
- With RM3,450/month in fixed costs, Kar needs roughly **15 Pro operators (RM2,235) + 235 app trips at RM5.20**, or any mix that adds up to RM3,450.
- **What Kar keeps per app trip, by average trip price:** RM40 → RM2.60 · RM60 → RM3.40 · RM80 → RM5.20 · RM100 → RM7.00. Below RM60, the RM3 minimum fee is what keeps short trips profitable.

## Survival rules
1. **Never spend owner money**, the float waiting for the weekly payout.
2. **Charge Pro from month 2** (month 1 free for the first operators), and charge the 5% commission from month 4.
3. **No salaries, no office** until monthly profit reliably exceeds RM3,450.
4. **Use hardware for cash first:** key boxes are paid upfront.
5. **Semester breaks:** expect about −30% trips, so push longer "balik kampung" trips home.
6. **Keep 3 months of fixed costs** in the bank before hiring anyone.
7. **Don't self-insure** casual cars. Wait for an insurer partner.

## Year 2 outlook (3 campuses)

| | RM/month |
|---|---|
| Pro subscriptions (30 operators × RM149) | 4,470 |
| App bookings (~900 trips × RM5.20) | ~4,680 |
| Hardware and small fees | ~2,800 |
| **Revenue** | **≈ 11,950** |
| Costs (2 founders at RM3k each, part-time ops, marketing, software, company admin) | ≈ −8,500 |
| **Profit** | **≈ +3,450** |

## Tax and compliance (check with an accountant)
- **Tax:** a partnership's profit is taxed at the partners' personal rates. A Sdn Bhd pays 15–17% on the first RM150k (SME rate).
- **SST and e-invoicing:** likely below the SST threshold and LHDN's e-invoice exemption threshold at this size. Confirm the current limits.
- **Books:** keep proper accounts from day 1. Grant applications ask for them.
