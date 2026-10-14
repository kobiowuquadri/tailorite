"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/states";
import { CustomerForm } from "@/components/customers/customer-form";
import { api } from "@/lib/api";
import type { CustomerDto } from "@/contracts/customers";

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Add customer" description="Store only the contact details you need." />
      <div className="rounded-xl border border-border bg-white p-6">
        <CustomerForm
          submitLabel="Save customer"
          onCancel={() => router.back()}
          onSubmit={async (values) => {
            const customer = await api<CustomerDto>("/customers", { method: "POST", body: values });
            await queryClient.invalidateQueries({ queryKey: ["customers"] });
            toast.success(`${customer.name} added`);
            router.push(`/customers/${customer.id}`);
          }}
        />
      </div>
    </div>
  );
}
