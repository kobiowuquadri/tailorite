"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerForm } from "@/components/customers/customer-form";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import type { CustomerDto, CustomerSummaryDto } from "@/contracts/customers";
import type { Page } from "@/contracts/common";

export type PickedCustomer = { id: string; name: string };

/** Searchable customer selector with an inline "new customer" option (server-side search). */
export function CustomerPicker({
  value,
  onChange,
  invalid,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer) => void;
  invalid?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 200);
  const results = useQuery({
    queryKey: qk.customers({ picker: debounced }),
    queryFn: () =>
      api<Page<CustomerSummaryDto>>(`/customers?pageSize=8${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`),
    enabled: open,
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className={cn("h-10 w-full justify-between font-normal", !value && "text-muted-foreground")}
          >
            {value ? value.name : "Choose a customer"}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search customers…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{results.isFetching ? "Searching…" : "No customer found."}</CommandEmpty>
              <CommandGroup>
                {results.data?.items.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange({ id: c.id, name: c.name });
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{c.name}</span>
                    {c.phone ? <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__new__"
                  onSelect={() => {
                    setOpen(false);
                    setCreating(true);
                  }}
                >
                  <UserPlus className="size-4" /> Add a new customer
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>Only the details you need. You can add measurements later.</DialogDescription>
          </DialogHeader>
          <CustomerForm
            defaultValues={{ name: search }}
            submitLabel="Add customer"
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              const created = await api<CustomerDto>("/customers", { method: "POST", body: values });
              await queryClient.invalidateQueries({ queryKey: ["customers"] });
              onChange({ id: created.id, name: created.name });
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
