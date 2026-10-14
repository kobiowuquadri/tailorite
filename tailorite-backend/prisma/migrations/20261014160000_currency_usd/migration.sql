-- Tailorite works in US dollars. Stored amounts are integer hundredths of the currency unit,
-- so existing values are unchanged; only the currency code moves from NGN to USD.
ALTER TABLE "Studio" ALTER COLUMN "currency" SET DEFAULT 'USD';
UPDATE "Studio" SET "currency" = 'USD' WHERE "currency" = 'NGN';
