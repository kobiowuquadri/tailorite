import type { Tx } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';

/**
 * Locks the order row for the rest of the transaction. Agreement transitions (publish, approve,
 * reject, cancel) take this lock so concurrent decisions on the same order are serialized.
 */
export async function lockOrder(tx: Tx, studioId: string, orderId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id = ${orderId}::uuid AND "studioId" = ${studioId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw Errors.notFound('Order');
}

/** Lock by id alone, for customer-portal paths where the studio comes from the access record. */
export async function lockOrderById(tx: Tx, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
}
