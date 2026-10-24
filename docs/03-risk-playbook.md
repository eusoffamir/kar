# Kar: risk playbook

*Researched in October 2026. Status key: ✅ = already in the app · 🟡 = partly · ❌ = not built yet (see `04-roadmap.md`).*

## 1. What competitors teach us

| Signal | What happened | Lesson for Kar |
|---|---|---|
| **SOCAR Malaysia is shutting down on 31 Aug 2026** after 8 years | It owned its fleet. No official reason was given; reports point to a failed IPO and a debt swap. Its P2P sister platform **Trevo keeps operating**, and SOCAR users are being sent there. | Owning a fleet burns capital. Trevo becomes our direct competitor, and SOCAR's ex-users are looking for a new app right now. |
| **Getaround left the US in Feb 2025**, then moved toward dissolution | Ran out of cash. Unlock hardware in every car, short trips, thin local supply. | Never require hardware (the key box is optional). Keep a minimum trip length. Build density in one zone before expanding. |
| **HyreCar went bankrupt in 2023** | Rising insurance claims, a supply deal that collapsed, lawsuits. | Insurance cost is the silent killer. Never self-insure. |
| **Turo is the survivor (~US$958M revenue)** | Its top complaints are unfair damage claims, refund delays, unexplained bans and weak support. Its revenue is tied to the protection plan each host picks. | Win disputes with **evidence and fast, fair decisions**. Copy the plan-tier model once Kar has an insurer. |
| **Trevo + Allianz "Trevo Shield"** · APAD's P2P proof of concept (Trevo, Klezcar, Wahdah, Xcess) | P2P insurance exists, but APAD has published no final P2P rules. | Legal and insurance status is the #1 business risk. Launch with licensed operators first. |
| **Cars stolen in Malaysia are smuggled into Thailand** and beyond | Recovery is very unlikely once a car crosses the border. | Ban trips across the border, offer optional GPS trackers, and limit first-time customers. |
| **Unlicensed rental firms and scams near campuses** | Viral disputes (UiTM Dengkil); students are frequent scam targets. | Payment only in the app, verified owners, a visible "Verified" badge. |

## 2. Customer-side problems

| # | Problem | Business response | App feature | Status |
|---|---|---|---|---|
| C1 | Unfair damage charge | Damage is between owner and renter; Kar stays out and only provides the before/after photos | Before/after photos ✅ | 🟡 |
| C2 | Car not where the app says, or not ready | Full refund + RM10 credit; strike against the owner | Last-parked pin ✅ + "Can't find car" report | 🟡 |
| C3 | Owner cancels last minute | Full refund + credit; strikes for the owner | Owner cancellation with strikes ✅ (only Kar can relist after 3) | ✅ |
| C4 | Breakdown or accident | Accident checklist; police report within 24h; insurer hotline | **Get help / SOS** on the trip ✅ | ✅ |
| C5 | Deposit not returned | Deposits are agreed between owner and renter outside Kar; Terms say Kar doesn't hold them. Owners with complaints can be removed | Terms ✅ | 🟡 |
| C6 | Surprise fees | Show every fee and rule before paying | Price breakdown ✅ + house rules at checkout | 🟡 |
| C7 | Traffic summons after the trip | Match it to the trip time and pass it on, plus RM20 admin | Summons matching | ❌ (P1) |
| C8 | Fuel and toll disputes | Return at the same fuel level; tolls on the customer's own Touch 'n Go | Fuel photo at both ends ✅ | ✅ |
| C9 | Scams | Pay only in the app; verified owners | In-app payment ✅, badge ✅, chat warnings | 🟡 |
| C10 | Personal safety | Verified owners; share trip | Share trip | ❌ (P1) |

## 3. Owner-side problems

| # | Problem | Business response | App feature | Status |
|---|---|---|---|---|
| O1 | Damage, and the customer denies it | Photo evidence; owner settles with the renter or their insurer | Before/after photos ✅ | 🟡 |
| O2 | Late return or no return | Late fee per hour; escalate at 2h; police report at 6h | Late fee calculation, overdue banner, contact button | 🟡 |
| O3 | Theft or a trip across the border | Rules; optional tracker; limits for first-time customers | Travel-area rule in house rules; tracker (P2) | ❌ |
| O4 | Misuse (smoking, joyriding, ride-hailing for money) | Fines; ban the customer | House rules; block ✅; platform-wide ban ✅ | 🟡 |
| O5 | Probationary (P-licence) or young drivers that insurance won't cover | Minimum age and licence class | ID verification captures licence class and expiry ✅; date of birth and P-licence check not built | 🟡 |
| O6 | Private insurance void for paid rentals | Pro (licensed) operators only at launch; P2P insurer later | Owners invite-only ✅; Kar approves cars in the Admin screen ✅; casual waitlist | 🟡 |
| O7 | Slow payouts | Weekly payouts every Friday | Admin payout list with bank references ✅ (manual transfers); owner payout history | 🟡 |
| O8 | Too much admin | Instant book, key box, notifications | Push notifications | ❌ (P1) |
| O9 | Wear and tear | Km cap per day + extra-km fee | Odometer photos ✅ → km calculation | ❌ (P1) |
| O10 | Customer no-show | Within-24h cancellation fee applies | "Mark no-show" button ✅ | ✅ |

## 4. Business risks

| Risk | Preparation |
|---|---|
| **APAD / legal** | Pilot with licensed operators only. Contact APAD and ask to join the P2P proof of concept. Get legal advice before launching casual owners. |
| **Insurance** | Find an insurer partner (Allianz, Etiqa, Tune). Until then, no casual private cars. |
| **People going around Kar** | Pro subscription (operators gain nothing by bypassing Kar); protection only applies inside the app; phone numbers shown only during a booking and for 24h after ✅. |
| **Cash flow** | FPX/DuitNow (hard for customers to reverse); weekly payouts; never spend owner money; claims reserve. |
| **Seasonality** | Push long trips home during semester breaks; target staff and visitors; second campus. |
| **Not enough cars** | 10–15 operators signed before launch; suggest higher prices to owners when demand peaks. |
| **Support overload** | Help content and an accident checklist in the app; WhatsApp Business quick replies. |
| **Viral bad review** | Fast, fair, evidence-based decisions; published rules; a goodwill credit budget. |
| **Trevo** | Win on campus: student verification, exact parking spot, short trips, Pro tools for operators. |
| **Fraud** | ID + selfie + UTP email; limits for first-time customers. |

## 5. Policies (draft, to be checked by a lawyer)
1. **Who may drive:** only the verified customer. Must be **21 or older**, with a **full (non-probationary) licence** unless the car's owner allows otherwise.
2. **Cancellation (customer):** free up to 24h before pickup. Within 24h, 50% of the trip price is kept and goes to the owner. A no-show counts as a cancellation within 24h.
3. **Cancellation (owner):** full refund to the customer, plus a strike against the owner. **3 strikes** and the owner's cars are hidden.
4. **Late return:** 15-minute grace period, then the car's hourly late fee. Escalate after 2h; police report after 6h with no contact.
5. **Fuel, cleaning, smoking:** return at the same fuel level or pay per bar. RM30 cleaning. RM150 for smoking.
6. **Damage, deposit and late fees:** all settled directly between the owner and the renter. Kar takes no deposit, decides no claims and charges no handling fee. Kar works out the late fee and blocks new bookings until the owner confirms it is paid.
7. **Accidents:** safety first, then call 999, then a police report within 24h, then tell the owner and Kar through Get help.
8. **Summons and tolls:** the customer pays, plus a RM20 admin fee. Tolls come off the customer's own Touch 'n Go card.
9. **Travel area:** Peninsular Malaysia only. **No crossing into Thailand.**

## 6. Weekly early-warning metrics
- **Disputes:** owner/renter complaints about deposits or damage per 100 trips, and unpaid late fees.
- **Owner reliability:** owner cancellation rate, average owner response time.
- **Returns and safety:** returns more than 2h late, serious incidents (target: 0).
- **Leakage:** repeat customer–owner pairs that stop booking through the app.
- **Supply:** cars available at peak times (Friday 4–8pm).
- **Pro:** Pro operators lost each month.

## Sources
- [Malay Mail: SOCAR shutting down](https://www.malaymail.com/news/malaysia/2026/08/15/on-demand-car-sharing-platform-socar-is-shutting-down-in-malaysia-after-8-years-of-operations/231500) · [paultan.org: SOCAR closing](https://paultan.org/2026/08/17/socar-malaysia-close-august-31/) · [Lowyat: SOCAR exit](https://www.lowyat.net/2026/401577/socar-malaysia-exit-31-august-2026/)
- [PYMNTS: Getaround/HyreCar wind down](https://www.pymnts.com/transportation/ridesharing/2025/carsharing-marketplaces-getaround-and-hyrecar-wind-down-us-operations/) · [Sacra: why Turo outlasted Getaround](https://sacra.com/chat/h/8559a162-41f5-4e9a-95e3-1220bf393c81) · [Auto Finance News: HyreCar bankruptcy](https://www.autofinancenews.net/allposts/risk-management/hyrecar-files-for-bankruptcy-prepares-for-sale/)
- [Elliott: Turo cases](https://www.elliott.org/tag/turo/) · [Boston Globe: Turo charges](https://www.bostonglobe.com/2025/08/13/lifestyle/turo-charges-rental-car/) · [Turo earnings plans](https://help.turo.com/en_us/earnings-plans-in-brief-us-hosts-ryy_U4gE9.md)
- [The Star: APAD on renting out private cars](https://thestar.com.my/news/nation/2023/01/21/no-to-renting-out-private-cars) · [Allianz × Trevo Shield](https://www.allianz.com.my/personal/media-hub/trevo-partners-allianz-general-trevo-shield-insurance.html)
- [paultan.org (BM): stolen cars smuggled abroad](https://paultan.org/bm/2016/09/26/kereta-curi-dari-malaysia-turut-diseludup-hingga-ke-myanmar-laos-dan-kemboja-laporan/) · [SAYS: unlicensed rental firm near UiTM](https://says.com/my/seismik/setakat-uitm-cakap-melayu-je-gadis-bongkar-adab-syarikat-pinjam-kereta-tanpa-lesen)
