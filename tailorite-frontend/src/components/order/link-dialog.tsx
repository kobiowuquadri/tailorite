"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ShareLinkView } from "@/components/orders/share-link";
import { api } from "@/lib/api";
import { invalidateOrder } from "@/lib/queries";
import { toastError } from "@/lib/form-errors";
import type { ShareLinkDto } from "@/contracts/approvals";

export type LinkKind = "approval" | "change";

const COPY: Record<LinkKind, { title: string; description: string; action: string; defaultTtl: string }> = {
  approval: {
    title: "Create a new approval link",
    description:
      "Use this if the customer lost the link or it expired. The new link opens the same version; every earlier link for it stops working.",
    action: "Create new link",
    defaultTtl: "14",
  },
  change: {
    title: "Let the customer request a change",
    description:
      "Creates a private link to the approved version. With it the customer can view the agreement and ask for a change — they cannot approve anything with it. You decide whether the change is possible and at what price.",
    action: "Create change-request link",
    defaultTtl: "30",
  },
};

/** Creates a portal link and shows it once (the server keeps only a hash of the token). */
export function LinkDialog({
  kind,
  open,
  onOpenChange,
  orderId,
  customerName,
  timeZone,
}: {
  kind: LinkKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  customerName: string;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const copy = COPY[kind];
  const [ttl, setTtl] = useState(copy.defaultTtl);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<ShareLinkDto | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLink(null);
      setTtl(copy.defaultTtl);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const res = await api<ShareLinkDto>(`/orders/${orderId}/links/${kind}`, { method: "POST", body: { ttlDays: Number(ttl) } });
      setLink(res);
      await invalidateOrder(queryClient, orderId);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{link ? `Link ready for ${customerName}` : copy.title}</DialogTitle>
          <DialogDescription>{link ? "Send it from your own WhatsApp or copy it." : copy.description}</DialogDescription>
        </DialogHeader>
        {link ? (
          <ShareLinkView link={link} customerName={customerName} timeZone={timeZone} />
        ) : (
          <div className="space-y-1">
            <Label htmlFor={`ttl-${kind}`}>Link stays valid for</Label>
            <Select value={ttl} onValueChange={setTtl}>
              <SelectTrigger id={`ttl-${kind}`} className="w-48">
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
        )}
        <DialogFooter>
          {link ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <Spinner /> : <Link2 />} {copy.action}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
