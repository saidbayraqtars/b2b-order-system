-- AlterTable
-- What a campaign took off the freight. Recorded separately because shippingFee
-- already holds the net amount: folding this into promotionTotal would discount
-- the delivery twice in `grandTotal`, and would break the invoice allocation,
-- which splits promotionTotal across the goods lines.
ALTER TABLE "Order" ADD COLUMN     "shippingDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0;
