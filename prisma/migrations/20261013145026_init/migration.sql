-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('INCH', 'CM');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'NEEDS_CLARIFICATION', 'READY_FOR_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'REVISION_DRAFT', 'REVISION_AWAITING_APPROVAL');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_FITTING', 'READY_FOR_COLLECTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

-- CreateEnum
CREATE TYPE "SourceOrigin" AS ENUM ('PASTED', 'UPLOADED', 'RECORDED', 'SEEDED');

-- CreateEnum
CREATE TYPE "SourceProcessingState" AS ENUM ('NOT_PROCESSED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "TranscriptOrigin" AS ENUM ('MACHINE', 'FIXTURE', 'HUMAN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiRunMode" AS ENUM ('LIVE', 'FIXTURE', 'TEST');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EvidenceBasis" AS ENUM ('EXPLICIT_TEXT', 'AUDIO_TRANSCRIPT', 'VISUAL_OBSERVATION', 'INFERENCE');

-- CreateEnum
CREATE TYPE "IssueKind" AS ENUM ('MISSING', 'CONFLICT', 'QUESTION', 'CUSTOMER_FEEDBACK');

-- CreateEnum
CREATE TYPE "IssueOrigin" AS ENUM ('AI', 'SYSTEM', 'STUDIO', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('INITIAL', 'REVISION');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'DECLINED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PortalAccessPurpose" AS ENUM ('APPROVAL', 'CHANGE_REQUEST');

-- CreateEnum
CREATE TYPE "ChangeInitiator" AS ENUM ('CUSTOMER', 'STUDIO');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('REQUESTED', 'DRAFTING', 'AWAITING_APPROVAL', 'APPROVED', 'DECLINED_BY_STUDIO', 'DECLINED_BY_CUSTOMER', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'PAYMENT', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "VersionSourceRole" AS ENUM ('REFERENCE', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Studio" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "timeZone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "measurementUnit" "MeasurementUnit" NOT NULL,
    "nextOrderNumber" INTEGER NOT NULL DEFAULT 1,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoSeedKey" TEXT,
    "demoExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementProfile" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,
    "values" JSONB NOT NULL,
    "recordedOn" DATE NOT NULL,
    "takenBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MeasurementProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "garmentType" TEXT NOT NULL,
    "agreementStatus" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "activeVersionId" UUID,
    "dueDate" DATE,
    "firstApprovedAt" TIMESTAMPTZ(3),
    "productionUpdatedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAsset" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "origin" "SourceOrigin" NOT NULL,
    "label" TEXT NOT NULL,
    "sender" TEXT,
    "context" TEXT,
    "textContent" TEXT,
    "storageKey" TEXT,
    "previewKey" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "sha256" TEXT NOT NULL,
    "originalName" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "processingState" "SourceProcessingState" NOT NULL DEFAULT 'NOT_PROCESSED',
    "processingError" TEXT,
    "idempotencyKey" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "addedById" UUID,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SourceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "origin" "TranscriptOrigin" NOT NULL,
    "text" TEXT NOT NULL,
    "segments" JSONB,
    "language" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "jobId" UUID,
    "correctsId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" "AiRunMode" NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputSources" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "dispatchedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionResult" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "mode" "AiRunMode" NOT NULL,
    "payload" JSONB NOT NULL,
    "validation" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "draftRevisionAtStart" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefSuggestion" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "resultId" UUID NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "proposedValue" JSONB NOT NULL,
    "unit" TEXT,
    "basis" "EvidenceBasis" NOT NULL,
    "evidence" JSONB NOT NULL,
    "needsHumanReview" BOOLEAN NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedValue" JSONB,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefDraft" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "internalNotes" TEXT,
    "baseVersionId" UUID,
    "changeRequestId" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BriefDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationIssue" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" "IssueKind" NOT NULL,
    "origin" "IssueOrigin" NOT NULL,
    "fieldKey" TEXT,
    "question" TEXT NOT NULL,
    "candidates" JSONB,
    "evidence" JSONB,
    "resultId" UUID,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedValue" JSONB,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefVersion" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceDraftRevision" INTEGER NOT NULL,
    "publishIdempotencyKey" TEXT,
    "basedOnVersionId" UUID,
    "changeRequestId" UUID,
    "totalPriceKobo" BIGINT NOT NULL,
    "depositRequiredKobo" BIGINT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "fittingDate" DATE,
    "publishedById" UUID,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefVersionSource" (
    "versionId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "role" "VersionSourceRole" NOT NULL,

    CONSTRAINT "BriefVersionSource_pkey" PRIMARY KEY ("versionId","sourceId","role")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "baseVersionId" UUID,
    "changeRequestId" UUID,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "pendingSlot" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "closedReason" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalAccess" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "approvalRequestId" UUID,
    "purpose" "PortalAccessPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "approvalRequestId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "customerName" TEXT NOT NULL,
    "comment" TEXT,
    "confirmationText" TEXT,
    "accessId" UUID,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "baseVersionId" UUID NOT NULL,
    "initiator" "ChangeInitiator" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL,
    "openSlot" UUID,
    "customerMessages" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "proposedVersionId" UUID,
    "priceAdjustmentKobo" BIGINT,
    "decisionNote" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPayment" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "signedAmountKobo" BIGINT NOT NULL,
    "method" TEXT,
    "receivedOn" DATE NOT NULL,
    "note" TEXT,
    "reversesId" UUID,
    "idempotencyKey" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "studioId" UUID NOT NULL,
    "orderId" UUID,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "actorLabel" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_absoluteExpiresAt_idx" ON "Session"("absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Studio_demoSeedKey_key" ON "Studio"("demoSeedKey");

-- CreateIndex
CREATE INDEX "Studio_isDemo_demoExpiresAt_idx" ON "Studio"("isDemo", "demoExpiresAt");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_studioId_userId_key" ON "Membership"("studioId", "userId");

-- CreateIndex
CREATE INDEX "Customer_studioId_name_idx" ON "Customer"("studioId", "name");

-- CreateIndex
CREATE INDEX "Customer_studioId_updatedAt_idx" ON "Customer"("studioId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_studioId_key" ON "Customer"("id", "studioId");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementProfile_customerId_key" ON "MeasurementProfile"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementProfile_customerId_studioId_key" ON "MeasurementProfile"("customerId", "studioId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_activeVersionId_key" ON "Order"("activeVersionId");

-- CreateIndex
CREATE INDEX "Order_studioId_agreementStatus_idx" ON "Order"("studioId", "agreementStatus");

-- CreateIndex
CREATE INDEX "Order_studioId_productionStatus_idx" ON "Order"("studioId", "productionStatus");

-- CreateIndex
CREATE INDEX "Order_studioId_dueDate_idx" ON "Order"("studioId", "dueDate");

-- CreateIndex
CREATE INDEX "Order_studioId_updatedAt_idx" ON "Order"("studioId", "updatedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_studioId_key" ON "Order"("id", "studioId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_studioId_orderNumber_key" ON "Order"("studioId", "orderNumber");

-- CreateIndex
CREATE INDEX "SourceAsset_orderId_addedAt_idx" ON "SourceAsset"("orderId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAsset_id_studioId_key" ON "SourceAsset"("id", "studioId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAsset_id_orderId_key" ON "SourceAsset"("id", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAsset_orderId_idempotencyKey_key" ON "SourceAsset"("orderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Transcript_sourceId_createdAt_idx" ON "Transcript"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_status_nextAttemptAt_idx" ON "ExtractionJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_studioId_createdAt_idx" ON "ExtractionJob"("studioId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_orderId_createdAt_idx" ON "ExtractionJob"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionJob_id_studioId_key" ON "ExtractionJob"("id", "studioId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionJob_orderId_idempotencyKey_key" ON "ExtractionJob"("orderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionResult_jobId_key" ON "ExtractionResult"("jobId");

-- CreateIndex
CREATE INDEX "ExtractionResult_orderId_createdAt_idx" ON "ExtractionResult"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionResult_id_studioId_key" ON "ExtractionResult"("id", "studioId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionResult_jobId_studioId_key" ON "ExtractionResult"("jobId", "studioId");

-- CreateIndex
CREATE INDEX "BriefSuggestion_orderId_status_idx" ON "BriefSuggestion"("orderId", "status");

-- CreateIndex
CREATE INDEX "BriefSuggestion_resultId_idx" ON "BriefSuggestion"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefDraft_orderId_key" ON "BriefDraft"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefDraft_orderId_studioId_key" ON "BriefDraft"("orderId", "studioId");

-- CreateIndex
CREATE INDEX "ClarificationIssue_orderId_status_idx" ON "ClarificationIssue"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BriefVersion_orderId_versionNumber_key" ON "BriefVersion"("orderId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BriefVersion_orderId_publishIdempotencyKey_key" ON "BriefVersion"("orderId", "publishIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BriefVersion_id_orderId_key" ON "BriefVersion"("id", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefVersion_id_studioId_key" ON "BriefVersion"("id", "studioId");

-- CreateIndex
CREATE INDEX "BriefVersionSource_sourceId_idx" ON "BriefVersionSource"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_versionId_key" ON "ApprovalRequest"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_pendingSlot_key" ON "ApprovalRequest"("pendingSlot");

-- CreateIndex
CREATE INDEX "ApprovalRequest_orderId_createdAt_idx" ON "ApprovalRequest"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_versionId_orderId_key" ON "ApprovalRequest"("versionId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalAccess_tokenHash_key" ON "CustomerPortalAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_orderId_createdAt_idx" ON "CustomerPortalAccess"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalEvent_approvalRequestId_key" ON "ApprovalEvent"("approvalRequestId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_orderId_createdAt_idx" ON "ApprovalEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_openSlot_key" ON "ChangeRequest"("openSlot");

-- CreateIndex
CREATE INDEX "ChangeRequest_orderId_createdAt_idx" ON "ChangeRequest"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPayment_reversesId_key" ON "ManualPayment"("reversesId");

-- CreateIndex
CREATE INDEX "ManualPayment_orderId_createdAt_idx" ON "ManualPayment"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPayment_orderId_idempotencyKey_key" ON "ManualPayment"("orderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UsageEvent_studioId_type_createdAt_idx" ON "UsageEvent"("studioId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_orderId_type_key" ON "UsageEvent"("orderId", "type");

-- CreateIndex
CREATE INDEX "AuditEvent_studioId_createdAt_idx" ON "AuditEvent"("studioId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_orderId_createdAt_idx" ON "AuditEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementProfile" ADD CONSTRAINT "MeasurementProfile_customerId_studioId_fkey" FOREIGN KEY ("customerId", "studioId") REFERENCES "Customer"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_studioId_fkey" FOREIGN KEY ("customerId", "studioId") REFERENCES "Customer"("id", "studioId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "BriefVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAsset" ADD CONSTRAINT "SourceAsset_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_sourceId_studioId_fkey" FOREIGN KEY ("sourceId", "studioId") REFERENCES "SourceAsset"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "Transcript"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionResult" ADD CONSTRAINT "ExtractionResult_jobId_studioId_fkey" FOREIGN KEY ("jobId", "studioId") REFERENCES "ExtractionJob"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionResult" ADD CONSTRAINT "ExtractionResult_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefSuggestion" ADD CONSTRAINT "BriefSuggestion_resultId_studioId_fkey" FOREIGN KEY ("resultId", "studioId") REFERENCES "ExtractionResult"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefSuggestion" ADD CONSTRAINT "BriefSuggestion_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefDraft" ADD CONSTRAINT "BriefDraft_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefDraft" ADD CONSTRAINT "BriefDraft_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "BriefVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefDraft" ADD CONSTRAINT "BriefDraft_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationIssue" ADD CONSTRAINT "ClarificationIssue_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationIssue" ADD CONSTRAINT "ClarificationIssue_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ExtractionResult"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefVersion" ADD CONSTRAINT "BriefVersion_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefVersion" ADD CONSTRAINT "BriefVersion_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES "BriefVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefVersionSource" ADD CONSTRAINT "BriefVersionSource_versionId_orderId_fkey" FOREIGN KEY ("versionId", "orderId") REFERENCES "BriefVersion"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefVersionSource" ADD CONSTRAINT "BriefVersionSource_sourceId_orderId_fkey" FOREIGN KEY ("sourceId", "orderId") REFERENCES "SourceAsset"("id", "orderId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefVersionSource" ADD CONSTRAINT "BriefVersionSource_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_versionId_orderId_fkey" FOREIGN KEY ("versionId", "orderId") REFERENCES "BriefVersion"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_versionId_orderId_fkey" FOREIGN KEY ("versionId", "orderId") REFERENCES "BriefVersion"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_versionId_orderId_fkey" FOREIGN KEY ("versionId", "orderId") REFERENCES "BriefVersion"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_baseVersionId_orderId_fkey" FOREIGN KEY ("baseVersionId", "orderId") REFERENCES "BriefVersion"("id", "orderId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_proposedVersionId_fkey" FOREIGN KEY ("proposedVersionId") REFERENCES "BriefVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "ManualPayment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_orderId_studioId_fkey" FOREIGN KEY ("orderId", "studioId") REFERENCES "Order"("id", "studioId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
