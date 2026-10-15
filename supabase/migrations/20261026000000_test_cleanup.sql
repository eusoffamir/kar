-- Pre-pilot test cleanup: the end-to-end tests returned the real Axia with a test parking pin
-- ("Block 22 car park (test)"), which renters would see. Remove it only if it's still that test pin, so the car
-- shows the owner's own pickup spot again. Real returns afterwards set a new pin as usual.
delete from car_last_location
where car_id = '8efd2097-2021-4513-8f0a-7c7b97ae9e5f' and note = 'Block 22 car park (test)';
