"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { Pagination } from "@/components/common/pagination";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced";
import { formatDateShort } from "@/lib/format";
import type { CustomerSummaryDto } from "@/contracts/customers";
import type { Page } from "@/contracts/common";

export default function CustomersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const page = Number(params.get("page") ?? "1") || 1;
  const [search, setSearch] = useState(params.get("search") ?? "");
  const debounced = useDebouncedValue(search.trim());

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("search", debounced);
    if (page > 1 && debounced === (params.get("search") ?? "")) next.set("page", String(page));
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(`/customers${qs ? `?${qs}` : ""}`);
  }, [debounced, page, params, router]);

  const query = { search: debounced, page };
  const customers = useQuery({
    queryKey: qk.customers(query),
    queryFn: () =>
      api<Page<CustomerSummaryDto>>(`/customers?${new URLSearchParams({ page: String(page), pageSize: "20", ...(debounced ? { search: debounced } : {}) })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Contact details and measurements for the people you sew for."
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <UserPlus /> Add customer
            </Link>
          </Button>
        }
      />
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          aria-label="Search customers"
          placeholder="Search by name, phone or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {customers.isPending ? (
        <PageSkeleton rows={4} />
      ) : customers.error ? (
        <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
      ) : customers.data.total === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{debounced ? "No customers match your search" : "No customers yet"}</EmptyTitle>
            <EmptyDescription>
              {debounced ? "Try a different name or phone number." : "Add a customer to start their first order."}
            </EmptyDescription>
          </EmptyHeader>
          {!debounced ? (
            <EmptyContent>
              <Button asChild>
                <Link href="/customers/new">
                  <UserPlus /> Add customer
                </Link>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Measurements</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.data.items.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      {c.isSynthetic ? <span className="ml-2 text-xs text-amber-ink">Synthetic</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{c.orderCount}</TableCell>
                    <TableCell>
                      {c.hasMeasurements ? (
                        <span className="inline-flex items-center gap-1 text-sm text-teal-ink">
                          <Check className="size-4" aria-hidden="true" /> Recorded
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not recorded</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateShort(c.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">
            {customers.data.items.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="block rounded-xl border border-border bg-white p-4">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.phone ?? "No phone"} · {c.orderCount} order{c.orderCount === 1 ? "" : "s"} ·{" "}
                    {c.hasMeasurements ? "Measurements recorded" : "No measurements"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={customers.data.page}
            totalPages={customers.data.totalPages}
            total={customers.data.total}
            noun="customers"
            onPage={(p) => router.replace(`/customers?${new URLSearchParams({ ...(debounced ? { search: debounced } : {}), page: String(p) })}`)}
          />
        </>
      )}
    </div>
  );
}
