"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";
import type { ShareLinkDto } from "@/contracts/approvals";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
    return true;
  } catch {
    toast.error("Copying is blocked in this browser. Select the text and copy it manually.");
    return false;
  }
}

/** The raw link is only available right after it is created: the server stores only its hash. */
export function ShareLinkView({ link, customerName, timeZone }: { link: ShareLinkDto; customerName: string; timeZone: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          {link.purpose === "APPROVAL" ? `Approval link for version ${link.versionNumber}` : "Change-request link"} — for {customerName}
        </p>
        <div className="flex gap-2">
          <Input value={link.url} readOnly aria-label="Customer link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (await copy(link.url, "Link")) setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Works until {formatDateTime(link.expiresAt, timeZone)}.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="bg-[#128c4a] hover:bg-[#0f7a40]">
          <a href={link.whatsappUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Open WhatsApp with this message
          </a>
        </Button>
        <Button type="button" variant="outline" onClick={() => copy(link.messageText, "Message")}>
          <Copy /> Copy message
        </Button>
      </div>
      <details className="rounded-lg bg-canvas p-3 text-sm">
        <summary className="cursor-pointer font-medium">Message preview</summary>
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{link.messageText}</p>
      </details>
      <Alert>
        <AlertDescription>
          Opening WhatsApp only prepares the message — you choose the chat and press send. Tailorite does not send messages. Copy the link now: for
          security it is not shown again. If it is lost, create a new link from the order page (the old one then stops working).
        </AlertDescription>
      </Alert>
    </div>
  );
}
