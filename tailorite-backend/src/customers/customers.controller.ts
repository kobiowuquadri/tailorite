import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { actorOf, Auth, StudioId } from '../auth/decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { IdPipe } from '../common/validation/id.pipe.js';
import {
  CustomerInput,
  CustomerListQuery,
  MeasurementProfileInput,
  type CustomerDto,
  type CustomerSummaryDto,
} from '../contracts/customers.js';
import type { Page } from '../contracts/common.js';
import type { AuthContext } from '../common/http/request-context.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @StudioId() studioId: string,
    @Query(new ZodPipe(CustomerListQuery)) query: CustomerListQuery,
  ): Promise<Page<CustomerSummaryDto>> {
    return this.customers.list(studioId, query);
  }

  @Post()
  create(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(CustomerInput)) body: CustomerInput,
  ): Promise<CustomerDto> {
    return this.customers.create(studioId, actorOf(auth), body);
  }

  @Get(':customerId')
  get(
    @StudioId() studioId: string,
    @Param('customerId', new IdPipe('Customer')) customerId: string,
  ): Promise<CustomerDto> {
    return this.customers.get(studioId, customerId);
  }

  @Patch(':customerId')
  update(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('customerId', new IdPipe('Customer')) customerId: string,
    @Body(new ZodPipe(CustomerInput)) body: CustomerInput,
  ): Promise<CustomerDto> {
    return this.customers.update(studioId, actorOf(auth), customerId, body);
  }

  @Put(':customerId/measurements')
  saveMeasurements(
    @StudioId() studioId: string,
    @Auth() auth: AuthContext,
    @Param('customerId', new IdPipe('Customer')) customerId: string,
    @Body(new ZodPipe(MeasurementProfileInput)) body: MeasurementProfileInput,
  ): Promise<CustomerDto> {
    return this.customers.saveMeasurements(studioId, actorOf(auth), customerId, body);
  }
}
