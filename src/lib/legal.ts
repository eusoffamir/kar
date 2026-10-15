// Kar's public policies, shown at /legal/terms, /legal/privacy and /legal/refunds.
// The numbers here must match the database rules (supabase/migrations) and lib/policy.ts.
// Have a lawyer review before scaling beyond the pilot.

export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] };

const OPERATOR = 'Vendor Vision Solutions (SSM 202503074813), trading as Kar';
const CONTACT = 'karsewa.my@gmail.com or WhatsApp +60 18-221 2725';
const UPDATED = '21 October 2026';

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
          'Only the person who booked may drive the car.',
        ],
      },
      {
        h: 'Bookings and payment',
        p: [
          'Prices are set by the owner. Kar adds a booking fee of 5% of the trip price (minimum RM3). The total is shown before you pay and is charged in full at checkout through our payment provider, CHIP.',
          'An unpaid booking is released after 15 minutes. Some cars need the owner to accept your request; if the owner declines or does not reply within 2 hours, you get a full refund.',
          'The security deposit is not paid to Kar. You pay it directly to the owner at pickup, and the owner returns it after the trip, less any damage agreed or decided under "Damage" below.',
        ],
      },
      {
        h: 'House rules',
        p: [
          'No smoking, no ride-hailing or carrying passengers for money, and no racing or reckless driving.',
          'Peninsular Malaysia only. Do not take the car into Thailand or Singapore.',
          'Return the car on time, at the agreed place, with the same fuel level. Late returns are charged per hour after a 15-minute grace period, at the rate shown on the car page.',
          'Take the required before and after photos in the app. They are the evidence if there is a dispute.',
          'You are responsible for traffic summonses, tolls and parking during your trip.',
        ],
      },
      {
        h: 'Cancellations and refunds',
        p: ['See our Refund & Cancellation Policy, which forms part of these terms.'],
      },
      {
        h: 'Damage',
        p: [
          'The owner may report damage within 48 hours of the return, with photos, up to the amount of the deposit. You can accept the claim or dispute it once. Kar then decides using the before and after photos, and both sides agree to follow that decision for the deposit.',
          'Damage or loss above the deposit is between you, the owner and any insurer, and is not covered by Kar.',
        ],
      },
      {
        h: 'Owners',
        p: [
          'During the pilot, only licensed rental operators approved by Kar can list cars. Owners must keep their cars roadworthy, insured and with valid road tax, and must describe them accurately.',
          'Owners receive the trip price minus any Kar commission, paid out by Kar after the 48-hour claim window. An owner who cancels confirmed bookings repeatedly may be removed.',
        ],
      },
      {
        h: 'Our role and liability',
        p: [
          'Kar provides the booking platform only. The rental itself is between you and the owner. To the extent the law allows, Kar is not liable for accidents, breakdowns, loss or damage during a trip, or for indirect losses. Nothing in these terms limits rights you have under the Consumer Protection Act 1999 that cannot be excluded.',
          'We may suspend or close accounts that break these terms or misuse the platform, including fake documents or unpaid damage.',
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
          'Up to 24 hours before pickup: full refund, including the booking fee.',
          'Less than 24 hours before pickup: the owner keeps 50% of the trip price, and you get the rest back.',
          'Before the owner has accepted a request: full refund.',
        ],
      },
      {
        h: 'If the owner or Kar cancels',
        p: [
          'The owner declines, does not reply within 2 hours, or cancels: full refund.',
          'Your ID is not approved: full refund for any bookings that have not started.',
          'The car is not where the app says, or is not usable at pickup: report it in the app under Get help. Kar will review it and refund you in full if the owner is at fault.',
        ],
      },
      {
        h: 'No-shows',
        p: ['If you do not pick up the car within 60 minutes of the start time and did not cancel, the owner can mark a no-show. This is treated as a late cancellation: the owner keeps 50% of the trip price and you get the rest back.'],
      },
      {
        h: 'Timing',
        p: [
          'We send refunds as soon as the cancellation happens. Most arrive within 3 to 7 business days, depending on your bank or e-wallet.',
          `If a refund has not arrived after 7 business days, contact us: ${CONTACT}.`,
        ],
      },
      {
        h: 'Deposits and fees after the trip',
        p: ['The security deposit is held by the owner, not Kar, and is returned by the owner after the trip unless a damage claim is accepted or decided in the owner\'s favour. Late return fees are paid to the owner.'],
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
          'Trips: bookings, before and after photos of the car, the location where you return the car, incident reports and ratings.',
          'Live location during a trip: from pickup until you return the car, your phone sends the car\'s location (position, speed and time) about every 30 seconds, including when the screen is off. It is not collected before pickup or after the return.',
          'Payments: amounts and payment status. Card and bank details are handled by CHIP, our payment provider, and never reach Kar.',
        ],
      },
      {
        h: 'Why we use it',
        p: [
          'To create your account, check that drivers are who they say they are and are licensed, run bookings and payments, send refunds and payouts, settle damage disputes, protect owners\' cars from theft and misuse (live trip location), keep the platform safe from fraud, and meet legal obligations.',
          'We do not sell your data or use it for third-party advertising.',
        ],
      },
      {
        h: 'Who can see it',
        p: [
          'The owner of a car you book sees your name, rating and whether your ID is verified. Your mobile number is shared between you and the owner only during a booking and for 24 hours after the car is returned. Your ID documents are seen only by the Kar team.',
          'The customer who books a car sees the owner\'s name and, once the booking is confirmed, where the car is parked.',
          'The owner of the car you rent sees its live location and route during your trip, and the route for 30 days after it.',
          'Service providers who process data for us: Supabase (database and file storage, Singapore), CHIP (payments, Malaysia), Expo (website hosting) and Google (email). Data may be stored outside Malaysia with these providers.',
          'Authorities, when the law requires it, for example the police after an accident or theft.',
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
          'Pendedahan: pemilik kereta melihat nama, penilaian dan status pengesahan anda, serta lokasi langsung dan laluan kereta semasa perjalanan anda. Nombor telefon dikongsi antara anda dan pemilik hanya semasa tempahan dan 24 jam selepas kereta dipulangkan. Dokumen pengenalan hanya dilihat oleh pasukan Kar. Data diproses oleh Supabase (Singapura), CHIP, Expo dan Google, dan boleh disimpan di luar Malaysia.',
          `Hak anda: anda boleh meminta akses atau pembetulan data, menarik balik persetujuan, atau menutup akaun dan memadam data anda (kecuali rekod yang wajib disimpan mengikut undang-undang). Hubungi: ${CONTACT}. Kami akan membalas dalam masa 21 hari.`,
          'Sekiranya terdapat percanggahan antara versi Bahasa Inggeris dan Bahasa Melayu, versi Bahasa Inggeris akan digunakan.',
        ],
      },
    ],
  },
};
