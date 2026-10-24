// Client-side price preview. The database (public.trip_price + bookings_validate trigger)
// recomputes every amount at booking time, so keep this in sync with the migration.

export const FEES = {
  customerFeeRate: 0.05,
  minCustomerFee: 3, // short trips must still cover the payment gateway (~RM2)
  ownerCommissionRate: 0, // waived during the UTP pilot; Pro plan: 5% on Kar-brought bookings
};

export function billableHours(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / 3_600_000);
}

export function tripPrice(hourRate: number, dayRate: number, start: Date, end: Date) {
  const hours = billableHours(start, end);
  const days = Math.floor(hours / 24);
  return days * dayRate + Math.min((hours % 24) * hourRate, dayRate);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quote(
  car: { price_per_hour: number; price_per_day: number; deposit: number },
  start: Date,
  end: Date,
) {
  const trip = tripPrice(car.price_per_hour, car.price_per_day, start, end);
  const fee = Math.max(round2(trip * FEES.customerFeeRate), FEES.minCustomerFee);
  const commission = round2(trip * FEES.ownerCommissionRate);
  return {
    hours: billableHours(start, end),
    trip,
    fee,
    deposit: car.deposit, // held by Kar, refunded 48h after the return minus late fee / approved damage
    total: round2(trip + fee + car.deposit),
    ownerPayout: round2(trip - commission),
    ownerCommission: commission,
  };
}

/** Always two decimals, comma every 3 digits: RM8.00, RM4,844.30. */
export const rm = (n: number) => `RM${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
/** Deposits: no ".00" on whole amounts (RM50, but RM50.50). */
export const rmDeposit = (n: number) => (n % 1 === 0 ? `RM${n}` : rm(n));
