import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import {
  CancelOrderInput,
  CreateOrderInput,
  OrderListQuery,
  ProductionTransitionInput,
  UpdateOrderInput,
  type DashboardDto,
  type OrderDetailDto,
  type OrderSummaryDto,
} from '../contracts/orders.js';
import type { Page } from '../contracts/common.js';
import type { TimelineEventDto } from '../contracts/timeline.js';
import type { AuthContext } from '../common/http/request-context.js';

const orderId = () => new IdPipe('Order');

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('dashboard')
  dashboard(@StudioId() studioId: string): Promise<DashboardDto> {
    return this.orders.dashboard(studioId);
  }

  @Get('orders')
  list(@StudioId() studioId: string, @Query(new ZodPipe(OrderListQuery)) query: OrderListQuery): Promise<Page<OrderSummaryDto>> {
    return this.orders.list(studioId, query);
  }

  @Post('orders')
  create(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(CreateOrderInput)) body: CreateOrderInput,
  ): Promise<OrderSummaryDto> {
    return this.orders.create(studioId, actorOf(auth), body);
  }

  @Get('orders/:orderId')
  detail(@StudioId() studioId: string, @Param('orderId', orderId()) id: string): Promise<OrderDetailDto> {
    return this.orders.detail(studioId, id);
  }

  @Patch('orders/:orderId')
  update(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', orderId()) id: string,
    @Body(new ZodPipe(UpdateOrderInput)) body: UpdateOrderInput,
  ): Promise<OrderDetailDto> {
    return this.orders.update(studioId, actorOf(auth), id, body);
  }

  @Post('orders/:orderId/production')
  @HttpCode(200)
  production(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', orderId()) id: string,
    @Body(new ZodPipe(ProductionTransitionInput)) body: ProductionTransitionInput,
  ): Promise<OrderDetailDto> {
    return this.orders.transitionProduction(studioId, actorOf(auth), id, body);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(200)
  cancel(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('orderId', orderId()) id: string,
    @Body(new ZodPipe(CancelOrderInput)) body: CancelOrderInput,
  ): Promise<OrderDetailDto> {
    return this.orders.cancel(studioId, actorOf(auth), id, body);
  }

  @Post('orders/:orderId/archive')
  @HttpCode(200)
  archive(@StudioId() studioId: string, @Auth() auth: AuthContext, @Param('orderId', orderId()) id: string): Promise<OrderDetailDto> {
    return this.orders.setArchived(studioId, actorOf(auth), id, true);
  }

  @Post('orders/:orderId/unarchive')
  @HttpCode(200)
  unarchive(@StudioId() studioId: string, @Auth() auth: AuthContext, @Param('orderId', orderId()) id: string): Promise<OrderDetailDto> {
    return this.orders.setArchived(studioId, actorOf(auth), id, false);
  }

  @Get('orders/:orderId/timeline')
  timeline(@StudioId() studioId: string, @Param('orderId', orderId()) id: string): Promise<TimelineEventDto[]> {
    return this.orders.timeline(studioId, id);
  }
}
