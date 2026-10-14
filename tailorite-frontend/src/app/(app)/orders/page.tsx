"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { Pagination } from "@/components/common/pagination";
import { AgreementBadge, ProductionBadge } from "@/components/status/status-badge";
import { DueDate, OrderListItem, orderHref } from "@/components/orders/order-list-item";
import { api } from "@/lib/api";
import { qk, useSession } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced";
import {
  ORDER_FILTERS,
  ORDER_FILTER_LABELS,
  PRODUCTION_STATUS_LABELS,
  ProductionStatus,
  type OrderFilter,
  type OrderSummaryDto,
} from "@/contracts/orders";
import type { Page } from "@/contracts/common";

const ALL = "all";

export default function OrdersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const timeZone = session.data?.studio?.timeZone ?? "Africa/Lagos";
  const filter = (params.get("filter") as OrderFilter | null) ?? null;
  const production = params.get("production");
  const view = params.get("view") === "archived" ? "archived" : "active";
  const page = Number(params.get("page") ?? "1") || 1;
  const [search, setSearch] = useState(params.get("search") ?? "");
  const debounced = useDebouncedValue(search.trim());

  function navigate(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(`/orders${qs ? `?${qs}` : ""}`);
  }

  useEffect(() => {
    if ((params.get("search") ?? "") !== debounced) navigate({ search: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const apiParams = new URLSearchParams({ page: String(page), pageSize: "20", view });
  if (debounced) apiParams.set("search", debounced);
  if (filter && (ORDER_FILTERS as readonly string[]).includes(filter)) apiParams.set("filter", filter);
  if (production && (ProductionStatus.options as string[]).includes(production)) apiParams.set("production", production);

  const orders = useQuery({
    queryKey: qk.orders(Object.fromEntries(apiParams)),
    queryFn: () => api<Page<OrderSummaryDto>>(`/orders?${apiParams}`),
    placeholderData: keepPreviousData,
  });
  const filtered = Boolean(debounced || filter || production);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every order, its agreement status and its production progress."
        actions={
          <Button asChild>
            <Link href="/orders/new">
              <Plus /> New order
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search orders"
              placeholder="Search title, customer or ORD-0001"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter ?? ALL} onValueChange={(v) => navigate({ filter: v })}>
            <SelectTrigger className="sm:w-60" aria-label="Agreement filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All agreement states</SelectItem>
              {ORDER_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>
                  {ORDER_FILTER_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={production ?? ALL} onValueChange={(v) => navigate({ production: v })}>
            <SelectTrigger className="sm:w-52" aria-label="Production filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any production state</SelectItem>
              {ProductionStatus.options.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRODUCTION_STATUS_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs value={view} onValueChange={(v) => navigate({ view: v === "active" ? null : v })}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {orders.isPending ? (
        <PageSkeleton rows={4} />
      ) : orders.error ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : orders.data.total === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "No orders match these filters" : view === "archived" ? "No archived orders" : "No orders yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Clear the search or filters to see more orders."
                : view === "archived"
                  ? "Completed or cancelled orders you archive appear here."
                  : "Create an order to collect a customer's instructions and agree the brief."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  router.replace(view === "archived" ? "/orders?view=archived" : "/orders");
                }}
              >
                Clear filters
              </Button>
            ) : view === "active" ? (
              <Button asChild>
                <Link href="/orders/new">
                  <Plus /> Create your first order
                </Link>
              </Button>
            ) : null}
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-white lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Agreement</TableHead>
                  <TableHead>Production</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Next step</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data.items.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/orders/${o.id}`)}>
                    <TableCell className="max-w-64">
                      <Link href={`/orders/${o.id}`} className="block truncate font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                        {o.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {o.reference}
                        {o.isSynthetic ? " · Synthetic" : ""}
                      </span>
                    </TableCell>
                    <TableCell>{o.customer.name}</TableCell>
                    <TableCell>
                      <AgreementBadge status={o.agreementStatus} size="sm" />
                    </TableCell>
                    <TableCell>
                      <ProductionBadge status={o.productionStatus} size="sm" />
                    </TableCell>
                    <TableCell className="text-sm">
                      <DueDate date={o.dueDate} timeZone={timeZone} />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={orderHref(o)}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {o.nextStep.label} <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {orders.data.items.map((o) => (
              <OrderListItem key={o.id} order={o} timeZone={timeZone} />
            ))}
          </div>
          <Pagination
            page={orders.data.page}
            totalPages={orders.data.totalPages}
            total={orders.data.total}
            noun="orders"
            onPage={(p) => navigate({ page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
