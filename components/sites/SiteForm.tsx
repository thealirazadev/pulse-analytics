"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SiteForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!domain.trim() || !name.trim()) {
      setError("Enter a domain and a name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, name }),
      });
      if (res.status === 201) {
        setDomain("");
        setName("");
        router.refresh();
        return;
      }
      if (res.status === 409) {
        setError("That domain is already registered.");
      } else if (res.status === 400) {
        setError("Enter a bare domain like example.com and a name up to 80 characters.");
      } else {
        setError("Could not add the site. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Domain"
          name="domain"
          placeholder="example.com"
          autoComplete="off"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <Input
          label="Name"
          name="name"
          placeholder="My Site"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" loading={submitting}>
          Add site
        </Button>
      </div>
    </form>
  );
}
