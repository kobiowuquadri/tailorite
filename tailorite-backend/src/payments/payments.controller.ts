import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import { RecordPaymentInput, ReversePaymentInput, type FinanceDto } from '../contracts/payments.js';
import type { AuthContext } from '../common/http/request-context.js';
import { PaymentsService } from './payments.service.js';

@Controller('orders/:orderId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  finance(@StudioId() studioId: string, @Param('orderId', new IdPipe('Order')) orderId: string): Promise<FinanceDto> {
    return this.payments.finance(studioId, orderId);
  }

  @Post()
  record(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Body(new ZodPipe(RecordPaymentInput)) body: RecordPaymentInput,
  ): Promise<FinanceDto> {
    return this.payments.record(studioId, actorOf(auth), orderId, body);
  }

  @Post(':paymentId/reverse')
  reverse(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', new IdPipe('Order')) orderId: string,
    @Param('paymentId', new IdPipe('Payment')) paymentId: string,
    @Body(new ZodPipe(ReversePaymentInput)) body: ReversePaymentInput,
  ): Promise<FinanceDto> {
    return this.payments.reverse(studioId, actorOf(auth), orderId, paymentId, body);
  }
}
