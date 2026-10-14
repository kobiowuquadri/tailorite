import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../auth/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  CustomerDto,
  CustomerInput,
  CustomerListQuery,
  CustomerSummaryDto,
  MeasurementProfileDto,
  MeasurementProfileInput,
  MeasurementValue,
} from '../contracts/customers.js';
import type { Page } from '../contracts/common.js';
import { dateOnlyToDb, dbToDateOnly } from '../common/time/dates.js';

type CustomerRow = Prisma.CustomerGetPayload<{
  include: { measurementProfile: true; _count: { select: { orders: true } } };
}>;

function toProfileDto(p: NonNullable<CustomerRow['measurementProfile']>): MeasurementProfileDto {
  return {
    unit: p.unit,
    recordedOn: dbToDateOnly(p.recordedOn),
    takenBy: p.takenBy,
    notes: p.notes,
    values: p.values as MeasurementValue[],
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toSummary(c: CustomerRow): CustomerSummaryDto {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    orderCount: c._count.orders,
    hasMeasurements: Boolean(c.measurementProfile),
    isSynthetic: c.isSynthetic,
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toDto(c: CustomerRow): CustomerDto {
  return {
    ...toSummary(c),
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    measurementProfile: c.measurementProfile ? toProfileDto(c.measurementProfile) : null,
  };
}

const include = { measurementProfile: true, _count: { select: { orders: true } } } as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(studioId: string, query: CustomerListQuery): Promise<Page<CustomerSummaryDto>> {
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      studioId,
      archivedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(studioId: string, customerId: string): Promise<CustomerDto> {
    const row = await this.prisma.customer.findFirst({ where: { id: customerId, studioId }, include });
    if (!row) throw Errors.notFound('Customer');
    return toDto(row);
  }

  async create(studioId: string, actor: Actor, input: CustomerInput): Promise<CustomerDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { studioId, name: input.name, phone: input.phone, email: input.email, notes: input.notes },
        include,
      });
      await this.audit.record(tx, {
        studioId,
        actor,
        type: 'CUSTOMER_CREATED',
        summary: `Customer ${created.name} added`,
        data: { customerId: created.id },
      });
      return created;
    });
    return toDto(row);
  }

  async update(studioId: string, actor: Actor, customerId: string, input: CustomerInput): Promise<CustomerDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const result = await tx.customer.updateMany({
        where: { id: customerId, studioId },
        data: { name: input.name, phone: input.phone, email: input.email, notes: input.notes },
      });
      if (result.count === 0) throw Errors.notFound('Customer');
      await this.audit.record(tx, {
        studioId,
        actor,
        type: 'CUSTOMER_UPDATED',
        summary: `Customer ${input.name} updated`,
        data: { customerId },
      });
      return tx.customer.findFirstOrThrow({ where: { id: customerId, studioId }, include });
    });
    return toDto(row);
  }

  /**
   * Replaces the customer's current measurement profile. Published and approved agreement
   * versions keep their own copies, so this never changes an existing agreement.
   */
  async saveMeasurements(
    studioId: string,
    actor: Actor,
    customerId: string,
    input: MeasurementProfileInput,
  ): Promise<CustomerDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, studioId } });
      if (!customer) throw Errors.notFound('Customer');
      const data = {
        unit: input.unit,
        recordedOn: dateOnlyToDb(input.recordedOn),
        takenBy: input.takenBy,
        notes: input.notes,
        values: input.values,
      };
      await tx.measurementProfile.upsert({
        where: { customerId },
        create: { ...data, studioId, customerId },
        update: data,
      });
      await tx.customer.update({ where: { id: customerId }, data: { updatedAt: new Date() } });
      await this.audit.record(tx, {
        studioId,
        actor,
        type: 'MEASUREMENTS_UPDATED',
        summary: `Measurements for ${customer.name} updated (${input.values.length} values, ${input.unit === 'INCH' ? 'inches' : 'cm'})`,
        data: { customerId, count: input.values.length, unit: input.unit },
      });
      return tx.customer.findFirstOrThrow({ where: { id: customerId, studioId }, include });
    });
    return toDto(row);
  }
}
