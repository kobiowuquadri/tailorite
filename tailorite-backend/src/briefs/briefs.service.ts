import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor, UserActor } from '../auth/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BriefContent,
  fieldLabel,
  formatIsoDate,
  SUGGESTION_KEYS,
  type AcceptSuggestionInput,
  type BriefDto,
  type ConflictCandidate,
  type CopyMeasurementsInput,
  type CreateIssueInput,
  type DismissIssueInput,
  type Evidence,
  type IssueDto,
  type ResolveIssueInput,
  type SaveBriefInput,
  type SuggestionDto,
  type SuggestionKey,
} from '../contracts/brief.js';
import type { MeasurementValue } from '../contracts/customers.js';
import type { VersionSnapshot } from '../contracts/approvals.js';
import { AgreementStateService } from './agreement-state.service.js';
import { applyFieldValue, currentValueFor } from './apply-value.js';
import { canonicalJson } from '../common/canonical-json.js';
import { stripEvidence } from './readiness.js';
import { dbToDateOnly } from '../common/time/dates.js';
import { lockOrder } from '../orders/order-lock.js';

type IssueRow = Prisma.ClarificationIssueGetPayload<object>;
type SuggestionRow = Prisma.BriefSuggestionGetPayload<object>;

export function toIssueDto(i: IssueRow): IssueDto {
  return {
    id: i.id,
    kind: i.kind,
    origin: i.origin,
    fieldKey: i.fieldKey,
    fieldLabel: fieldLabel(i.fieldKey),
    question: i.question,
    candidates: (i.candidates as ConflictCandidate[] | null) ?? null,
    evidence: (i.evidence as Evidence[] | null) ?? null,
    status: i.status,
    resolutionNote: i.resolutionNote,
    resolvedValue: i.resolvedValue === null || i.resolvedValue === undefined ? null : scalarText(i.resolvedValue),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

/** Text for a stored JSON value (suggestion and resolution values are strings or numbers). */
function scalarText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Unknown';
  if ((key === 'totalPrice' || key === 'depositRequired') && typeof value === 'number') {
    return `₦${value.toLocaleString('en-NG')}`;
  }
  if ((key === 'deliveryDate' || key === 'fittingDate') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatIsoDate(value);
  }
  const text = scalarText(value);
  if (key === 'fabricSupplier') {
    const v = text.toUpperCase();
    return v === 'CUSTOMER' ? 'Customer provides the fabric' : v === 'STUDIO' ? 'Studio sources the fabric' : text;
  }
  return text;
}

export function toSuggestionDto(s: SuggestionRow, content: BriefContent): SuggestionDto {
  const proposed = s.proposedValue as string | number | null;
  return {
    id: s.id,
    resultId: s.resultId,
    fieldKey: s.fieldKey as SuggestionKey,
    fieldLabel: fieldLabel(s.fieldKey),
    proposedValue: proposed,
    displayValue: displayValue(s.fieldKey, proposed),
    unit: s.unit,
    basis: s.basis,
    evidence: s.evidence as Evidence[],
    needsHumanReview: s.needsHumanReview,
    status: s.status,
    currentValue: currentValueFor(content, s.fieldKey),
    createdAt: s.createdAt.toISOString(),
  };
}

const KEY_ORDER = new Map<string, number>(SUGGESTION_KEYS.map((k, i) => [k, i]));

@Injectable()
export class BriefsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agreementState: AgreementStateService,
  ) {}

  private editability(order: {
    productionStatus: string;
    archivedAt: Date | null;
    activeVersionId: string | null;
    activeVersionNumber: number | null;
    draftChangeRequestId: string | null;
  }): { editable: boolean; lockReason: string | null } {
    if (order.productionStatus === 'CANCELLED') return { editable: false, lockReason: 'This order is cancelled.' };
    if (order.archivedAt) return { editable: false, lockReason: 'This order is archived.' };
    if (order.activeVersionId && !order.draftChangeRequestId) {
      return {
        editable: false,
        lockReason: `Version ${order.activeVersionNumber} is the approved agreement. Start a change proposal to change it — the approved version stays in force until the customer accepts the change.`,
      };
    }
    return { editable: true, lockReason: null };
  }

  private async loadOrder(db: Tx | PrismaService, studioId: string, orderId: string) {
    const order = await db.order.findFirst({
      where: { id: orderId, studioId },
      include: {
        draft: true,
        customer: { select: { id: true, name: true, measurementProfile: { select: { unit: true } } } },
        activeVersion: { select: { versionNumber: true, snapshot: true } },
        approvalRequests: { where: { status: 'PENDING' }, include: { version: { select: { id: true, versionNumber: true } } }, take: 1 },
      },
    });
    if (!order || !order.draft) throw Errors.notFound('Order');
    return order;
  }

  async get(studioId: string, orderId: string): Promise<BriefDto> {
    const order = await this.loadOrder(this.prisma, studioId, orderId);
    const draft = order.draft!;
    const { readiness, content } = await this.agreementState.draftState(this.prisma, studioId, orderId);
    const [issues, suggestions, baseVersion] = await Promise.all([
      this.prisma.clarificationIssue.findMany({
        where: { orderId, studioId },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.briefSuggestion.findMany({ where: { orderId, studioId, status: 'PENDING' } }),
      draft.baseVersionId
        ? this.prisma.briefVersion.findUnique({ where: { id: draft.baseVersionId }, select: { versionNumber: true } })
        : null,
    ]);
    const sortedIssues = [...issues].sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (b.status === 'OPEN' && a.status !== 'OPEN') return 1;
      return a.status === 'OPEN' ? a.createdAt.getTime() - b.createdAt.getTime() : 0;
    });
    const sortedSuggestions = [...suggestions].sort(
      (a, b) => (KEY_ORDER.get(a.fieldKey) ?? 99) - (KEY_ORDER.get(b.fieldKey) ?? 99),
    );
    let hasUnpublishedChanges = false;
    if (order.activeVersion) {
      const active = BriefContent.parse((order.activeVersion.snapshot as unknown as VersionSnapshot).brief);
      hasUnpublishedChanges = canonicalJson(stripEvidence(active)) !== canonicalJson(stripEvidence(content));
    }
    const pending = order.approvalRequests[0]?.version ?? null;
    const { editable, lockReason } = this.editability({
      productionStatus: order.productionStatus,
      archivedAt: order.archivedAt,
      activeVersionId: order.activeVersionId,
      activeVersionNumber: order.activeVersion?.versionNumber ?? null,
      draftChangeRequestId: draft.changeRequestId,
    });
    return {
      orderId,
      revision: draft.revision,
      content,
      internalNotes: draft.internalNotes,
      baseVersionId: draft.baseVersionId,
      baseVersionNumber: baseVersion?.versionNumber ?? null,
      changeRequestId: draft.changeRequestId,
      editable,
      lockReason,
      readiness,
      issues: sortedIssues.map(toIssueDto),
      suggestions: sortedSuggestions.map((s) => toSuggestionDto(s, content)),
      hasUnpublishedChanges,
      pendingVersion: pending ? { id: pending.id, number: pending.versionNumber } : null,
      customer: {
        id: order.customer.id,
        name: order.customer.name,
        hasMeasurements: Boolean(order.customer.measurementProfile),
        measurementUnit: order.customer.measurementProfile?.unit ?? null,
      },
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  /** Locks the order and returns the draft, refusing edits the agreement rules do not allow. */
  private async editableDraft(tx: Tx, studioId: string, orderId: string, expectedRevision?: number) {
    await lockOrder(tx, studioId, orderId);
    const order = await this.loadOrder(tx, studioId, orderId);
    const { editable, lockReason } = this.editability({
      productionStatus: order.productionStatus,
      archivedAt: order.archivedAt,
      activeVersionId: order.activeVersionId,
      activeVersionNumber: order.activeVersion?.versionNumber ?? null,
      draftChangeRequestId: order.draft!.changeRequestId,
    });
    if (!editable) throw Errors.invalidState(lockReason ?? 'This brief cannot be edited.');
    if (expectedRevision !== undefined && order.draft!.revision !== expectedRevision) {
      throw Errors.staleRevision(order.draft!.revision);
    }
    return { order, draft: order.draft!, content: BriefContent.parse(order.draft!.content) };
  }

  /** Evidence and references must point at sources of this same order. */
  private async assertSourceLinks(tx: Tx, orderId: string, content: BriefContent) {
    const sources = await tx.sourceAsset.findMany({ where: { orderId }, select: { id: true, kind: true } });
    const byId = new Map(sources.map((s) => [s.id, s.kind]));
    const evidence: Evidence[] = [
      ...Object.values(content.fields).flatMap((f) => f.evidence),
      ...content.exclusions.flatMap((e) => e.evidence),
    ];
    if (evidence.some((e) => !byId.has(e.sourceId))) {
      throw Errors.validation('A linked source does not belong to this order.');
    }
    if (content.references.some((r) => byId.get(r.sourceId) !== 'IMAGE')) {
      throw Errors.validation('Only reference images from this order can be selected for the customer.');
    }
  }

  private async writeDraft(
    tx: Tx,
    orderId: string,
    revision: number,
    content: BriefContent,
    actor: UserActor,
    internalNotes?: string | null,
  ) {
    const result = await tx.briefDraft.updateMany({
      where: { orderId, revision },
      data: {
        content: content as unknown as Prisma.InputJsonValue,
        ...(internalNotes !== undefined ? { internalNotes } : {}),
        revision: { increment: 1 },
        updatedById: actor.userId,
      },
    });
    if (result.count === 0) {
      const current = await tx.briefDraft.findUniqueOrThrow({ where: { orderId }, select: { revision: true } });
      throw Errors.staleRevision(current.revision);
    }
  }

  async save(studioId: string, actor: UserActor, orderId: string, input: SaveBriefInput): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.editableDraft(tx, studioId, orderId, input.expectedRevision);
      await this.assertSourceLinks(tx, orderId, input.content);
      await this.writeDraft(tx, orderId, input.expectedRevision, input.content, actor, input.internalNotes);
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  /** Copies the customer's current measurements into the brief (a snapshot, not a live link). */
  async copyMeasurements(studioId: string, actor: UserActor, orderId: string, input: CopyMeasurementsInput): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      const { order, content } = await this.editableDraft(tx, studioId, orderId, input.expectedRevision);
      const profile = await tx.measurementProfile.findFirst({ where: { customerId: order.customerId, studioId } });
      if (!profile) throw Errors.invalidState('This customer has no saved measurements yet. Add them on the customer page.');
      const all = profile.values as MeasurementValue[];
      const values = input.keys.length ? all.filter((v) => input.keys.includes(v.key)) : all;
      if (values.length === 0) throw Errors.validation('Choose at least one measurement to copy.');
      content.measurements = {
        ...content.measurements,
        mode: 'MEASURED',
        unit: profile.unit,
        values,
        recordedOn: dbToDateOnly(profile.recordedOn),
        notNeededReason: null,
      };
      await this.writeDraft(tx, orderId, input.expectedRevision, content, actor);
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'MEASUREMENTS_COPIED',
        summary: `Copied ${values.length} measurement${values.length === 1 ? '' : 's'} from the customer profile into the brief`,
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  /** Discards unpublished edits by restoring the active approved version's content. */
  async resetToActive(studioId: string, actor: UserActor, orderId: string): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const order = await this.loadOrder(tx, studioId, orderId);
      if (!order.activeVersion) throw Errors.invalidState('There is no approved version to restore.');
      const content = BriefContent.parse((order.activeVersion.snapshot as unknown as VersionSnapshot).brief);
      await this.writeDraft(tx, orderId, order.draft!.revision, content, actor);
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'DRAFT_RESET',
        summary: `Working brief reset to approved version ${order.activeVersion.versionNumber}`,
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  async createIssue(studioId: string, actor: Actor, orderId: string, input: CreateIssueInput): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      await tx.clarificationIssue.create({
        data: {
          studioId,
          orderId,
          kind: 'QUESTION',
          origin: 'STUDIO',
          fieldKey: input.fieldKey ?? null,
          question: input.question,
        },
      });
      await this.audit.record(tx, { studioId, orderId, actor, type: 'ISSUE_CREATED', summary: `Question added: ${input.question}` });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  async resolveIssue(
    studioId: string,
    actor: UserActor,
    orderId: string,
    issueId: string,
    input: ResolveIssueInput,
  ): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      const issue = await tx.clarificationIssue.findFirst({ where: { id: issueId, orderId, studioId } });
      if (!issue) throw Errors.notFound('Question');
      if (issue.status !== 'OPEN') throw Errors.invalidState('This question has already been closed.');
      const r = input.resolution;
      let resolvedValue: string | null = null;

      if (r.type !== 'NOTE_ONLY') {
        if (!issue.fieldKey) throw Errors.validation('This question is not linked to a brief detail; resolve it with a note.');
        const { content } = await this.editableDraft(tx, studioId, orderId, input.expectedRevision);
        let next: BriefContent;
        if (r.type === 'CANDIDATE') {
          const candidates = (issue.candidates as ConflictCandidate[] | null) ?? [];
          const candidate = candidates[r.candidateIndex];
          if (!candidate) throw Errors.validation('Choose one of the listed options.');
          next = applyFieldValue(content, issue.fieldKey, candidate.value, {
            evidence: candidate.evidence,
            origin: 'CLARIFICATION',
          });
          resolvedValue = candidate.value;
        } else if (r.type === 'VALUE') {
          next = applyFieldValue(content, issue.fieldKey, r.value, { origin: 'CLARIFICATION' });
          resolvedValue = r.value;
        } else {
          next = applyFieldValue(content, issue.fieldKey, null, { origin: 'CLARIFICATION', notApplicable: true, note: r.note ?? null });
          resolvedValue = 'Not applicable';
        }
        await this.assertSourceLinks(tx, orderId, next);
        await this.writeDraft(tx, orderId, input.expectedRevision, next, actor);
      } else {
        await lockOrder(tx, studioId, orderId);
      }

      const closed = await tx.clarificationIssue.updateMany({
        where: { id: issueId, status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolutionNote: r.note ?? null,
          resolvedValue: resolvedValue ?? undefined,
          resolvedAt: new Date(),
          resolvedById: actor.userId,
        },
      });
      if (closed.count === 0) throw Errors.invalidState('This question has already been closed.');
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'ISSUE_RESOLVED',
        summary: `${fieldLabel(issue.fieldKey)} resolved${resolvedValue ? `: ${resolvedValue}` : ''}${r.note ? ` (${r.note})` : ''}`,
        data: { issueId, kind: issue.kind },
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  async dismissIssue(studioId: string, actor: UserActor, orderId: string, issueId: string, input: DismissIssueInput): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const issue = await tx.clarificationIssue.findFirst({ where: { id: issueId, orderId, studioId } });
      if (!issue) throw Errors.notFound('Question');
      const closed = await tx.clarificationIssue.updateMany({
        where: { id: issueId, status: 'OPEN' },
        data: { status: 'DISMISSED', resolutionNote: input.note, resolvedAt: new Date(), resolvedById: actor.userId },
      });
      if (closed.count === 0) throw Errors.invalidState('This question has already been closed.');
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'ISSUE_DISMISSED',
        summary: `${fieldLabel(issue.fieldKey)}: marked not relevant — ${input.note}`,
        data: { issueId },
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  async acceptSuggestion(
    studioId: string,
    actor: UserActor,
    orderId: string,
    suggestionId: string,
    input: AcceptSuggestionInput,
  ): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      const suggestion = await tx.briefSuggestion.findFirst({ where: { id: suggestionId, orderId, studioId } });
      if (!suggestion) throw Errors.notFound('Suggestion');
      if (suggestion.status !== 'PENDING') throw Errors.invalidState('This suggestion has already been reviewed.');
      const { content } = await this.editableDraft(tx, studioId, orderId, input.expectedRevision);
      const proposed = suggestion.proposedValue as string | number | null;
      const edited = input.value !== undefined && input.value !== String(proposed ?? '');
      const finalValue = edited ? input.value! : proposed;
      if (finalValue === null) throw Errors.validation('This suggestion has no value. Enter one to accept it.');
      const next = applyFieldValue(content, suggestion.fieldKey, finalValue, {
        evidence: suggestion.evidence as Evidence[],
        origin: edited ? 'AI_EDITED' : 'AI_ACCEPTED',
      });
      await this.assertSourceLinks(tx, orderId, next);
      await this.writeDraft(tx, orderId, input.expectedRevision, next, actor);
      const updated = await tx.briefSuggestion.updateMany({
        where: { id: suggestionId, status: 'PENDING' },
        data: {
          status: edited ? 'EDITED' : 'ACCEPTED',
          decidedValue: finalValue as Prisma.InputJsonValue,
          decidedAt: new Date(),
          decidedById: actor.userId,
        },
      });
      if (updated.count === 0) throw Errors.invalidState('This suggestion has already been reviewed.');
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'SUGGESTION_ACCEPTED',
        summary: `${fieldLabel(suggestion.fieldKey)}: ${edited ? 'edited and accepted' : 'accepted'} suggestion "${displayValue(suggestion.fieldKey, finalValue).slice(0, 80)}"`,
        data: { suggestionId },
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId);
  }

  async rejectSuggestion(studioId: string, actor: UserActor, orderId: string, suggestionId: string): Promise<BriefDto> {
    await this.prisma.$transaction(async (tx) => {
      const suggestion = await tx.briefSuggestion.findFirst({ where: { id: suggestionId, orderId, studioId } });
      if (!suggestion) throw Errors.notFound('Suggestion');
      const updated = await tx.briefSuggestion.updateMany({
        where: { id: suggestionId, status: 'PENDING' },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedById: actor.userId },
      });
      if (updated.count === 0) throw Errors.invalidState('This suggestion has already been reviewed.');
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'SUGGESTION_REJECTED',
        summary: `${fieldLabel(suggestion.fieldKey)}: rejected suggestion`,
        data: { suggestionId },
      });
    });
    return this.get(studioId, orderId);
  }
}
