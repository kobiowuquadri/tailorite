"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Ban, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { ProductionBadge, productionIcon } from "@/components/status/status-badge";
import { ReasonDialog } from "@/components/order/reason-dialog";
import { api } from "@/lib/api";
import { invalidateOrder, qk } from "@/lib/queries";
import { toastError } from "@/lib/form-errors";
import { formatCalendarDate, formatDateTime, relativeDays } from "@/lib/format";
import { PRODUCTION_STATUS_LABELS, type OrderDetailDto, type ProductionStatus } from "@/contracts/orders";

function actionLabel(from: ProductionStatus, to: ProductionStatus): string {
  if (to === "IN_PROGRESS") return from === "NOT_STARTED" ? "Start production" : "Back to in progress";
  if (to === "READY_FOR_FITTING") return "Ready for fitting";
  if (to === "READY_FOR_COLLECTION") return "Ready for collection";
  if (to === "COMPLETED") return "Mark completed";
  return PRODUCTION_STATUS_LABELS[to];
}

export function ProductionSection({ order, timeZone }: { order: OrderDetailDto; timeZone: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<ProductionStatus | "archive" | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const due = order.activeVersion?.deliveryDate ?? null;
  const relative = relativeDays(due, timeZone);
  const open = order.productionStatus !== "COMPLETED" && order.productionStatus !== "CANCELLED";

  async function move(to: ProductionStatus) {
    setBusy(to);
    try {
      const updated = await api<OrderDetailDto>(`/orders/${order.id}/production`, { method: "POST", body: { to } });
      queryClient.setQueryData(qk.order(order.id), updated);
      await invalidateOrder(queryClient, order.id);
      toast.success(`Production: ${PRODUCTION_STATUS_LABELS[to]}`);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy("archive");
    try {
      const updated = await api<OrderDetailDto>(`/orders/${order.id}/${archived ? "archive" : "unarchive"}`, { method: "POST" });
      queryClient.setQueryData(qk.order(order.id), updated);
      await invalidateOrder(queryClient, order.id);
      toast.success(archived ? "Order archived. It stays searchable under Archived." : "Order restored to the active list.");
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(reason: string) {
    const updated = await api<OrderDetailDto>(`/orders/${order.id}/cancel`, { method: "POST", body: { reason } });
    queryClient.setQueryData(qk.order(order.id), updated);
    await invalidateOrder(queryClient, order.id);
    toast.success("Order cancelled. Its history and approved versions are kept.");
  }

  return (
    <section aria-labelledby="production-title" className="space-y-3">
      <h2 id="production-title" className="text-lg font-semibold">
        Production
      </h2>
      <div className="space-y-4 rounded-xl border border-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ProductionBadge status={order.productionStatus} />
          {due && open ? (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
              Due {formatCalendarDate(due)}
              {relative ? <span className="text-muted-foreground">({relative})</span> : null}
            </span>
          ) : null}
        </div>

        {order.productionStatus === "CANCELLED" ? (
          <p className="text-sm text-muted-foreground">
            Cancelled {formatDateTime(order.cancelledAt, timeZone)}
            {order.cancelReason ? ` — ${order.cancelReason}` : ""}
          </p>
        ) : null}

        {!order.activeVersion && open ? (
          <p className="text-sm text-muted-foreground">Production can start once the customer approves a version of the brief.</p>
        ) : null}

        {order.allowedProductionTransitions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {order.allowedProductionTransitions.map((to) => {
              const Icon = productionIcon(to);
              return (
                <Button
                  key={to}
                  variant={to === "IN_PROGRESS" && order.productionStatus === "NOT_STARTED" ? "default" : "outline"}
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => (to === "COMPLETED" ? setConfirmComplete(true) : void move(to))}
                >
                  {busy === to ? <Spinner /> : <Icon />} {actionLabel(order.productionStatus, to)}
                </Button>
              );
            })}
          </div>
        ) : null}

        {(order.canCancel || order.canArchive || order.archivedAt) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {order.canArchive ? (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void setArchived(true)}>
                {busy === "archive" ? <Spinner /> : <Archive />} Archive order
              </Button>
            ) : null}
            {order.archivedAt ? (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void setArchived(false)}>
                {busy === "archive" ? <Spinner /> : <ArchiveRestore />} Restore from archive
              </Button>
            ) : null}
            {order.canCancel ? (
              <Button variant="ghost" size="sm" className="text-[#b42318] hover:text-[#b42318]" onClick={() => setCancelling(true)}>
                <Ban /> Cancel order
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this order as completed?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this once the outfit has been collected. Completed orders can no longer be changed, but stay in your records and can be
              archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => void move("COMPLETED")}>Mark completed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this order?"
        description="Any version awaiting approval and any open change are withdrawn, and every customer link stops working. Approved versions, payments and history are kept."
        label="Reason for cancelling"
        maxLength={500}
        confirmLabel="Cancel order"
        destructive
        onConfirm={cancel}
      />
    </section>
  );
}
