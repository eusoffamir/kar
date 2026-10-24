// Kar's public policies, shown at /legal/terms, /legal/privacy and /legal/refunds.
// The numbers here must match the database rules (supabase/migrations) and lib/policy.ts.
// Have a lawyer review before scaling beyond the pilot.

export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] };

const OPERATOR = 'Vendor Vision Solutions (SSM 202503074813), trading as Kar';
const CONTACT = 'karsewa.my@gmail.com or WhatsApp +60 18-221 2725';
const UPDATED = '24 October 2026';

export const LEGAL: Record<'terms' | 'privacy' | 'refunds', LegalDoc> = {
  terms: {
    title: 'Terms of Service',
    updated: UPDATED,
    intro: `Kar is an online booking platform run by ${OPERATOR}. Kar connects customers with licensed car rental operators ("owners"). Kar does not own, rent out or insure any car. By creating an account or booking, you agree to these terms.`,
    sections: [
      {
        h: 'Who can book',
        p: [
          'You must be 21 or older with a full (not probationary) Malaysian driving licence of the right class for the car.',
          'You must verify your identity with your IC or student ID, driving licence and a selfie. You can book while Kar checks your ID, but you can only pick up the car after it is approved. If it is not approved, your bookings are cancelled with a full refund.',
          'Kar may approve your ID automatically, by checking your login email, licence class and expiry date, mobile number and account history, before a person has looked at your photos. Until the Kar team has checked your ID or you have finished your first trip, each trip can be up to 24 hours. The Kar team may still review an approved ID later. If it is not approved then, your bookings that have not started are cancelled with a full refund.',
          'Only the person who booked may drive the car.',
        ],
      },
      {
        h: 'Bookings and payment',
        p: [
          'Prices are set by the owner. Kar adds a booking fee of 5% of the trip price (minimum RM3). The total is shown before you pay and is charged in full at checkout through our payment provider, CHIP.',
          'An unpaid booking is released after 15 minutes. Some cars need the owner to accept your request; if the owner declines or does not reply within 2 hours, you get a full refund.',
          'Kar does not take or hold any security deposit. If an owner asks for a deposit, the amount, how it is paid and when it is returned are agreed between you and the owner, outside Kar, and Kar is not responsible for it. Deposits Kar already holds on earlier bookings are refunded as before.',
        ],
      },
      {
        h: 'House rules',
        p: [
          'Only you may drive the car. Do not let anyone else drive it.',
          'No driving after alcohol or drugs, no racing or reckless driving, and no towing or off-road driving.',
          'No illegal use of the car, including carrying illegal goods. No more passengers than there are seats, and no driving lessons or learner drivers.',
          'No smoking, vaping or pets in the car, and nothing that leaves a strong smell. No ride-hailing, deliveries or carrying passengers for money. Return the car reasonably clean.',
          'If you have not picked up the car 60 minutes after the start time, the owner can mark the booking as a no-show. The owner then keeps 50% of the trip price, and you are refunded the rest of the trip price. The booking fee is not refunded. If nobody marks it, Kar marks it as a no-show by itself 24 hours after the trip’s end time, on the same terms.',
          'Peninsular Malaysia only. Do not take the car into Thailand or Singapore.',
          'Keep the car locked and the keys with you. Do not leave the keys in the car or give them to anyone else.',
          'If a warning light comes on or the car breaks down, stop when it is safe and tell the owner. Do not repair or modify the car without the owner’s permission.',
          'Return the car on time, at the agreed place, with the same fuel level. Late returns are charged per hour after a 15-minute grace period, at the rate shown on the car page. You pay the late fee to the owner directly, and Kar does not collect it. Your account cannot make new bookings until the owner, or Kar, confirms it is paid. If the car is more than 6 hours late and the owner cannot reach you, the owner may report it to the police as not returned, and Kar may give the police your name, ID details, phone number and the car’s location and route.',
          'Take the required before and after photos in the app. They are the evidence if there is a dispute.',
          'You are responsible for traffic summonses, tolls, parking, towing and clamping during your trip.',
        ],
      },
      {
        h: 'Cancellations and refunds',
        p: ['See our Refund & Cancellation Policy, which forms part of these terms.'],
      },
      {
        h: 'Damage',
        p: [
          'You are responsible for damage to or loss of the car during your trip, including from an accident, theft, misuse or lost keys. After an accident or theft you must report it to the police within 24 hours (for an accident, the Road Transport Act 1987 requires this) and tell the owner straight away through Get help in the app.',
          'Damage is settled between you, the owner and any insurer. Kar does not decide damage claims or collect payment for them. The before and after photos taken in the app can be used as evidence by both sides.',
          'If you break these terms or the house rules, the owner’s insurance may refuse to pay for an accident or loss. You are then responsible for the full cost.',
          'Neither the owner nor Kar is responsible for belongings left in the car.',
        ],
      },
      {
        h: 'Owners',
        p: [
          'During the pilot, only licensed rental operators approved by Kar can list cars. Owners must keep their cars roadworthy, insured for rental use and with valid road tax, and must describe them accurately.',
          'Owners send Kar their rental permit and insurance certificate. Kar approves cars only while the insurance is valid, and hides them automatically when it expires. Listings show "Insured by operator" for this reason: the insurance is the owner\'s, not Kar\'s.',
          'Kar may approve a car automatically when its details pass Kar\'s checks. The Kar team may review any car later and take it down at any time.',
          'Owners receive the trip price minus any Kar commission, paid out by Kar. Deposits, late fees and damage are settled between the owner and the renter directly; Kar does not collect or hold them. An owner who cancels confirmed bookings repeatedly may be removed.',
        ],
      },
      {
        h: 'Our role and liability',
        p: [
          'Kar provides the booking platform only. The rental itself is between you and the owner. To the extent the law allows, Kar is not liable for accidents, breakdowns, loss or damage during a trip, or for indirect losses. Nothing in these terms limits rights you have under the Consumer Protection Act 1999 that cannot be excluded.',
          'We may suspend or close accounts that break these terms or misuse the platform, including fake documents, unpaid damage or unpaid late fees.',
        ],
      },
      {
        h: 'General',
        p: [
          'These terms are governed by the laws of Malaysia. We may update them; the date above shows the latest version, and continuing to use Kar means you accept the changes.',
          `Questions or complaints: ${CONTACT}.`,
        ],
      },
    ],
  },

  refunds: {
    title: 'Refund & Cancellation Policy',
    updated: UPDATED,
    intro: 'This policy explains when you get your money back. Refunds go back through CHIP to the bank or e-wallet you paid with.',
    sections: [
      {
        h: 'If you cancel',
        p: [
          'Up to 24 hours before pickup, or before the owner has accepted a request: the trip price is refunded in full.',
          'Less than 24 hours before pickup: the owner keeps 50% of the trip price, and you get the rest back.',
          'The Kar booking fee is not refunded when you cancel. It covers the booking and payment costs.',
        ],
      },
      {
        h: 'If the owner or Kar cancels',
        p: [
          'The owner declines, does not reply within 2 hours, or cancels: full refund, including the booking fee.',
          'Your ID is not approved: full refund for any bookings that have not started.',
          'The car is not where the app says, or is not usable at pickup: report it in the app under Get help. Kar will review it and refund you in full if the owner is at fault.',
        ],
      },
      {
        h: 'No-shows',
        p: ['If you do not pick up the car within 60 minutes of the start time and did not cancel, the owner can mark a no-show. This is treated as a late cancellation: the owner keeps 50% of the trip price, you get the rest of the trip price back, and the booking fee is not refunded. If nobody marks it, Kar marks it as a no-show by itself 24 hours after the trip’s end time, on the same terms.'],
      },
      {
        h: 'Timing',
        p: [
          'We send refunds as soon as the cancellation happens. Most arrive within 3 to 7 business days, depending on your bank or e-wallet.',
          `If a refund has not arrived after 7 business days, contact us: ${CONTACT}.`,
        ],
      },
      {
        h: 'Fees after the trip',
        p: ['Kar does not hold deposits. Late return fees, any deposit the owner asked for, and any damage are settled between you and the owner directly. Until the owner confirms a late fee is paid, you cannot make new bookings. Deposits Kar already holds on earlier bookings are refunded as before.'],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    intro: `This notice is given under the Personal Data Protection Act 2010 (PDPA). ${OPERATOR} ("Kar", "we") is the data user responsible for your personal data. A Bahasa Melayu version is at the end.`,
    sections: [
      {
        h: 'What we collect',
        p: [
          'Account: email address, full name and mobile number.',
          'ID check: photos of your IC or student ID, driving licence and a selfie, plus licence class and expiry date.',
          'Profile photo: a photo of you that you add, needed to book or list a car so owners and renters recognise each other. It is separate from your ID selfie.',
          'Trips: bookings, before and after photos of the car, the location where you return the car, incident reports and ratings.',
          'Live location during a trip: from pickup until you return the car, your phone sends the car\'s location (position, speed and time) about every 30 seconds, including when the screen is off. It is not collected before pickup or after the return.',
          'Payments: amounts and payment status. Card and bank details are handled by CHIP, our payment provider, and never reach Kar.',
        ],
      },
      {
        h: 'Why we use it',
        p: [
          'To create your account, check that drivers are who they say they are and are licensed, run bookings and payments, send refunds and payouts, protect owners\' cars from theft and misuse (live trip location), keep the platform safe from fraud, and meet legal obligations.',
          'Automatic checks (no AI): when you send your ID, Kar\'s system applies fixed rules to your login email address, licence class and expiry date, mobile number and any earlier ID checks. If every rule is met, your ID is approved without a person: you can pick up cars, but each trip can be up to 24 hours until the Kar team has checked your photos or you have finished your first trip. If any rule is not met, your ID is not rejected; it goes to the Kar team, who decide. The system never rejects an ID or a car on its own. Car listings are checked the same way, using the car\'s details and the owner\'s insurance date and cancellation record. The Kar team can review any automatic decision, and you can ask us to.',
          'We do not sell your data or use it for third-party advertising.',
        ],
      },
      {
        h: 'Who can see it',
        p: [
          'The owner of a car you book sees your name, profile photo, rating and whether your ID is verified, and, while the booking is confirmed or on the trip, your selfie so they can check who collects the car. Your mobile number is shared between you and the owner only during a booking, for 24 hours after the car is returned, and while a late fee is still unpaid. Your ID documents are seen only by the Kar team.',
          'Anyone browsing Kar sees the name, profile photo, rating and reviews of owners who have a car on Kar. The customer who books a car also sees, once the booking is confirmed, where the car is parked.',
          'The owner of the car you rent sees its live location and route during your trip, and the route for 30 days after it.',
          'Service providers who process data for us: Supabase (database and file storage, Singapore), CHIP (payments, Malaysia), Expo (website hosting) and Google (email, and sign-in if you choose Continue with Google). Data may be stored outside Malaysia with these providers.',
          'Authorities, when the law requires it, for example the police after an accident or theft, and the police when a car is not returned.',
        ],
      },
      {
        h: 'How long we keep it',
        p: [
          'ID documents: while your account is open, and deleted within 30 days after you ask us to close it.',
          'Booking and payment records: up to 7 years, as tax and accounting law requires.',
          'Trip photos: up to 1 year after the trip, or longer if a claim or dispute is open.',
          'Live trip locations: 30 days, then deleted automatically.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'You can ask to see or correct your personal data, withdraw consent, or close your account and have your data deleted (except records we must keep by law). Closing your account means you can no longer book.',
          `Contact: ${CONTACT}. We reply within 21 days.`,
        ],
      },
      {
        h: 'Security',
        p: ['Data is encrypted in transit. ID documents and trip photos are stored privately and shown only through short-lived links to the people allowed to see them. Database rules stop users from seeing each other\'s private data.'],
      },
      {
        h: 'Notis Privasi (Bahasa Melayu)',
        p: [
          `Notis ini diberikan di bawah Akta Perlindungan Data Peribadi 2010. ${OPERATOR} ("Kar") ialah pengguna data yang bertanggungjawab ke atas data peribadi anda.`,
          'Data yang dikumpul: e-mel, nama penuh, nombor telefon bimbit, gambar IC atau kad pelajar, lesen memandu dan swafoto, rekod tempahan, gambar kereta sebelum dan selepas perjalanan, lokasi pemulangan kereta, lokasi langsung kereta semasa perjalanan (dari pengambilan hingga pemulangan, kira-kira setiap 30 saat, disimpan 30 hari) dan status pembayaran. Butiran kad dan bank dikendalikan oleh CHIP dan tidak sampai kepada Kar.',
          'Tujuan: membuka akaun, mengesahkan identiti dan lesen pemandu, mengurus tempahan, bayaran dan bayaran balik, menyelesaikan pertikaian kerosakan, mencegah penipuan dan mematuhi undang-undang.',
          'Semakan automatik (tanpa AI): apabila anda menghantar ID, sistem Kar menggunakan peraturan tetap untuk menyemak e-mel log masuk, kelas dan tarikh tamat lesen, nombor telefon dan semakan ID terdahulu anda. Jika semua syarat dipenuhi, ID anda diluluskan tanpa semakan manusia: anda boleh mengambil kereta, tetapi setiap perjalanan dihadkan kepada 24 jam sehingga pasukan Kar menyemak gambar anda atau anda menamatkan perjalanan pertama. Jika ada syarat yang tidak dipenuhi, ID anda tidak ditolak, tetapi dihantar kepada pasukan Kar untuk diputuskan. Sistem tidak pernah menolak ID atau kereta secara automatik. Iklan kereta disemak dengan cara yang sama, berdasarkan butiran kereta serta tarikh insurans dan rekod pembatalan pemilik. Pasukan Kar boleh menyemak semula sebarang keputusan automatik, dan anda boleh memintanya.',
          'Pendedahan: pemilik kereta melihat nama, penilaian dan status pengesahan anda, serta lokasi langsung dan laluan kereta semasa perjalanan anda. Nombor telefon dikongsi antara anda dan pemilik hanya semasa tempahan dan 24 jam selepas kereta dipulangkan. Dokumen pengenalan hanya dilihat oleh pasukan Kar. Data diproses oleh Supabase (Singapura), CHIP, Expo dan Google, dan boleh disimpan di luar Malaysia.',
          `Hak anda: anda boleh meminta akses atau pembetulan data, menarik balik persetujuan, atau menutup akaun dan memadam data anda (kecuali rekod yang wajib disimpan mengikut undang-undang). Hubungi: ${CONTACT}. Kami akan membalas dalam masa 21 hari.`,
          'Sekiranya terdapat percanggahan antara versi Bahasa Inggeris dan Bahasa Melayu, versi Bahasa Inggeris akan digunakan.',
        ],
      },
    ],
  },
};
