"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ReadinessPanel } from "@/components/workbench/review-panels";
import { ShareLinkView } from "@/components/orders/share-link";
import type { BriefEditor } from "@/components/workbench/use-brief-editor";
import { api, isApiError, newIdempotencyKey } from "@/lib/api";
import { invalidateOrder } from "@/lib/queries";
import { toastError } from "@/lib/form-errors";
import { formatCalendarDate, formatKobo } from "@/lib/format";
import type { BriefDto } from "@/contracts/brief";
import type { PublishResultDto } from "@/contracts/approvals";

export function PublishDialog({
  open,
  onOpenChange,
  brief,
  editor,
  orderId,
  customerName,
  timeZone,
  isRevision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brief: BriefDto;
  editor: BriefEditor;
  orderId: string;
  customerName: string;
  timeZone: string;
  isRevision: boolean;
}) {
  const queryClient = useQueryClient();
  const [ttl, setTtl] = useState("14");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResultDto | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const terms = editor.content.terms;

  async function publish() {
    setBusy(true);
    try {
      await editor.flush();
      const res = await api<PublishResultDto>(`/orders/${orderId}/versions`, {
        method: "POST",
        body: { expectedRevision: editor.revision(), idempotencyKey, linkTtlDays: Number(ttl) },
      });
      setResult(res);
      await invalidateOrder(queryClient, orderId);
    } catch (error) {
      if (isApiError(error, "PUBLISH_BLOCKED")) {
        await queryClient.invalidateQueries({ queryKey: ["brief", orderId] });
      }
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setResult(null);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Version {result.version.number} is ready for {customerName}</DialogTitle>
              <DialogDescription>
                This version is now frozen. Nothing is agreed until {customerName.split(" ")[0]} approves it.
              </DialogDescription>
            </DialogHeader>
            <ShareLinkView link={result.link} customerName={customerName} timeZone={timeZone} />
            <DialogFooter>
              <Button asChild variant="outline">
                <Link href={`/orders/${orderId}/versions/${result.version.id}`}>See exactly what they will review</Link>
              </Button>
              <Button asChild>
                <Link href={`/orders/${orderId}`}>Go to order</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isRevision ? "Share the change for approval" : "Share for customer review"}</DialogTitle>
              <DialogDescription>
                Sharing creates an exact, unchangeable version and a private link {customerName} can open on their phone.
              </DialogDescription>
            </DialogHeader>
            {brief.readiness.ready ? (
              <div className="space-y-4">
                {brief.pendingVersion ? (
                  <div className="flex items-start gap-2 rounded-lg border border-[#f6dfa3] bg-amber-tint p-3 text-sm text-amber-ink">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Version {brief.pendingVersion.number} is still waiting for the customer. Sharing replaces it, and its link stops working.
                  </div>
                ) : null}
                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-canvas p-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Total price</dt>
                    <dd className="font-semibold tabular">{formatKobo(terms.totalPriceKobo)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Deposit required</dt>
                    <dd className="font-semibold tabular">{formatKobo(terms.depositRequiredKobo)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Delivery date</dt>
                    <dd className="font-semibold">{formatCalendarDate(terms.deliveryDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Reference images</dt>
                    <dd className="font-semibold">{editor.content.references.length}</dd>
                  </div>
                </dl>
                <div className="space-y-1">
                  <Label htmlFor="ttl">Link stays valid for</Label>
                  <Select value={ttl} onValueChange={setTtl}>
                    <SelectTrigger id="ttl" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <ReadinessPanel readiness={brief.readiness} />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={publish} disabled={busy || !brief.readiness.ready}>
                {busy ? <Spinner /> : <Send />} Create version and link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
