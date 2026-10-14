import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BadgeCheck,
  CheckCheck,
  CircleDashed,
  CircleHelp,
  ClipboardCheck,
  FilePen,
  GitCompareArrows,
  Hourglass,
  PackageCheck,
  PencilRuler,
  Ruler,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AGREEMENT_STATUS_LABELS,
  PRODUCTION_STATUS_LABELS,
  type AgreementStatus,
  type ProductionStatus,
} from "@/contracts/orders";

export type Tone = "neutral" | "blue" | "teal" | "amber" | "coral" | "red";

const TONES: Record<Tone, string> = {
  neutral: "bg-neutral-tint text-[#3d4757] ring-[#d7dde6]",
  blue: "bg-blue-tint text-blue-ink ring-[#c9dcff]",
  teal: "bg-teal-tint text-teal-ink ring-[#b6ebe6]",
  amber: "bg-amber-tint text-amber-ink ring-[#f6dfa3]",
  coral: "bg-coral-tint text-coral-ink ring-[#ffcfc6]",
  red: "bg-[#fdecea] text-[#b42318] ring-[#f6c7c2]",
};

/** Workflow state shown with an icon and a label as well as colour. */
export function StatusBadge({
  label,
  icon: Icon,
  tone,
  className,
  size = "md",
}: {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        TONES[tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden="true" />
      {label}
    </span>
  );
}

const AGREEMENT: Record<AgreementStatus, { icon: LucideIcon; tone: Tone }> = {
  DRAFT: { icon: FilePen, tone: "neutral" },
  NEEDS_CLARIFICATION: { icon: CircleHelp, tone: "amber" },
  READY_FOR_REVIEW: { icon: ClipboardCheck, tone: "blue" },
  AWAITING_APPROVAL: { icon: Hourglass, tone: "blue" },
  APPROVED: { icon: BadgeCheck, tone: "teal" },
  REVISION_DRAFT: { icon: PencilRuler, tone: "amber" },
  REVISION_AWAITING_APPROVAL: { icon: GitCompareArrows, tone: "coral" },
};

const PRODUCTION: Record<ProductionStatus, { icon: LucideIcon; tone: Tone }> = {
  NOT_STARTED: { icon: CircleDashed, tone: "neutral" },
  IN_PROGRESS: { icon: Scissors, tone: "blue" },
  READY_FOR_FITTING: { icon: Ruler, tone: "amber" },
  READY_FOR_COLLECTION: { icon: PackageCheck, tone: "teal" },
  COMPLETED: { icon: CheckCheck, tone: "teal" },
  CANCELLED: { icon: Ban, tone: "red" },
};

export function AgreementBadge({ status, size }: { status: AgreementStatus; size?: "sm" | "md" }) {
  const meta = AGREEMENT[status];
  return <StatusBadge label={AGREEMENT_STATUS_LABELS[status]} icon={meta.icon} tone={meta.tone} size={size} />;
}

export function ProductionBadge({ status, size }: { status: ProductionStatus; size?: "sm" | "md" }) {
  const meta = PRODUCTION[status];
  return <StatusBadge label={PRODUCTION_STATUS_LABELS[status]} icon={meta.icon} tone={meta.tone} size={size} />;
}

export const agreementIcon = (status: AgreementStatus) => AGREEMENT[status].icon;
export const productionIcon = (status: ProductionStatus) => PRODUCTION[status].icon;
