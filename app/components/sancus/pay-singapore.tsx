"use client"

// Sancus: pay a Singapore supplier from the USDC treasury (USDC -> SGD via PayNow / FAST).

import * as React from "react"
import { IconAlertTriangle, IconArrowRight, IconCheck, IconLoader, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WalletSelect } from "@/components/wallet-select"
import { displayMinor, SGD_DECIMALS, USDC_DECIMALS } from "@/lib/sancus/money"
import { maskProxy, type ProxyType } from "@/lib/sancus/paynow"
import { isTerminal, STATUS_STEPS, type PayoutStatus } from "@/lib/sancus/payout-provider"
import type { SerializedQuote } from "@/lib/sancus/fx"
import type { PayoutDto } from "@/lib/sancus/payouts"

type QuoteResponse = { quote: SerializedQuote; rail: "PAYNOW" | "FAST"; railReason: string; etaLabel: string }
type Issue = { field: string; message: string }

const PROXY_LABELS: Record<ProxyType, { label: string; placeholder: string; hint: string }> = {
  MOBILE: { label: "PayNow mobile", placeholder: "+65 9123 4567", hint: "Singapore mobile number registered with PayNow" },
  UEN: { label: "PayNow UEN", placeholder: "201912345K", hint: "Business registration number registered with PayNow" },
  BANK: { label: "Bank account (FAST)", placeholder: "0123456789", hint: "Account number at a Singapore bank" },
}

const sgd = (minor: string | bigint) => displayMinor(BigInt(minor), SGD_DECIMALS, "S$")
const usdc = (minor: string | bigint) => `${displayMinor(BigInt(minor), USDC_DECIMALS, "", 2)} USDC`

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function PaySingapore() {
  const [refreshKey, setRefreshKey] = React.useState(0)
  return (
    <div className="flex flex-wrap items-start gap-6">
      <PayoutForm onCreated={() => setRefreshKey((k) => k + 1)} />
      <PayoutsList refreshKey={refreshKey} />
    </div>
  )
}

function PayoutForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = React.useState("")
  const [proxyType, setProxyType] = React.useState<ProxyType>("UEN")
  const [proxyValue, setProxyValue] = React.useState("")
  const [bankCode, setBankCode] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [reference, setReference] = React.useState("")
  const [walletId, setWalletId] = React.useState("")

  const [quote, setQuote] = React.useState<QuoteResponse | null>(null)
  const [issues, setIssues] = React.useState<Issue[]>([])
  const [quoting, setQuoting] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  // One key per payout attempt: retries after a network error can't double-pay.
  // Created on first submit (not during render, which Next.js prerenders).
  const idempotencyKey = React.useRef<string | null>(null)

  const recipient = React.useMemo(
    () => ({ name, proxyType, proxyValue, bankCode: proxyType === "BANK" ? bankCode : undefined }),
    [name, proxyType, proxyValue, bankCode]
  )

  const ready = Boolean(name.trim() && proxyValue.trim() && amount.trim())

  // Live quote, debounced. Only runs once every required field has a value.
  React.useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setQuoting(true)
      try {
        const res = await fetch("/api/sancus/payouts/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient, sgdAmount: amount }),
          signal: controller.signal,
        })
        const body = await res.json()
        if (res.ok) {
          setQuote(body as QuoteResponse)
          setIssues([])
        } else {
          setQuote(null)
          setIssues(body.issues ?? [{ field: "form", message: body.error ?? "Could not get a quote" }])
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setIssues([{ field: "form", message: "Could not reach the quote service" }])
      } finally {
        setQuoting(false)
      }
    }, 400)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [recipient, amount, ready])

  // Hide stale results while the form is incomplete.
  const shownQuote = ready ? quote : null
  const shownIssues = ready ? issues : []
  const issueFor = (field: string) => shownIssues.find((i) => i.field === field)?.message

  async function submit() {
    if (!shownQuote) return
    idempotencyKey.current ??= newKey()
    setSubmitting(true)
    try {
      const res = await fetch("/api/sancus/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          recipient,
          sgdAmount: amount,
          reference: reference || undefined,
          sourceWalletId: walletId || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setIssues(body.issues ?? [])
        toast.error(body.error ?? "Payout failed")
        return
      }
      const payout = body.payout as PayoutDto
      if (payout.status === "FAILED") {
        toast.error(payout.failureReason ?? "Payout failed")
      } else {
        toast.success(`Paying ${sgd(payout.sgdAmountMinor)} to ${payout.recipientName}`)
      }
      idempotencyKey.current = null
      setAmount("")
      setReference("")
      setQuote(null)
      onCreated()
    } catch {
      // Keep the same idempotency key so a retry can't create a second payout.
      toast.error("Network error. Retrying is safe; you won't be charged twice.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span aria-hidden>🇸🇬</span> Pay a Singapore supplier
        </CardTitle>
        <CardDescription>USDC from your treasury, delivered in SGD by PayNow or FAST.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sx-name">Recipient name</Label>
          <Input id="sx-name" placeholder="Lim Trading Pte Ltd" value={name} onChange={(e) => setName(e.target.value)} />
          {issueFor("name") && <p className="text-destructive text-xs">{issueFor("name")}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Pay to</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={proxyType}
            onValueChange={(v) => v && setProxyType(v as ProxyType)}
            className="w-full"
          >
            <ToggleGroupItem value="UEN" className="flex-1">UEN</ToggleGroupItem>
            <ToggleGroupItem value="MOBILE" className="flex-1">Mobile</ToggleGroupItem>
            <ToggleGroupItem value="BANK" className="flex-1">Bank</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="sx-proxy">{PROXY_LABELS[proxyType].label}</Label>
          <Input
            id="sx-proxy"
            placeholder={PROXY_LABELS[proxyType].placeholder}
            value={proxyValue}
            onChange={(e) => setProxyValue(e.target.value)}
          />
          <p className={issueFor("proxyValue") ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
            {issueFor("proxyValue") ?? PROXY_LABELS[proxyType].hint}
          </p>
        </div>

        {proxyType === "BANK" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sx-bic">Bank SWIFT code</Label>
            <Input id="sx-bic" placeholder="DBSSSGSG" value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
            {issueFor("bankCode") && <p className="text-destructive text-xs">{issueFor("bankCode")}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="sx-amount">Recipient gets (SGD)</Label>
          <Input
            id="sx-amount"
            inputMode="decimal"
            placeholder="2,000.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {issueFor("amount") && <p className="text-destructive text-xs">{issueFor("amount")}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="sx-ref">Reference (optional)</Label>
          <Input id="sx-ref" placeholder="Invoice INV-1042" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Pay from (Arc treasury wallet)</Label>
          <WalletSelect value={walletId} onValueChange={setWalletId} chainFilter="ARC-TESTNET" excludeGatewaySigner />
          <p className="text-muted-foreground text-xs">
            Optional for the demo. With a settlement address configured, the USDC leg is a real Arc testnet transfer.
          </p>
        </div>

        {issueFor("form") && (
          <p className="text-destructive flex items-center gap-1 text-xs">
            <IconAlertTriangle className="size-3.5" /> {issueFor("form")}
          </p>
        )}

        <QuotePanel quote={shownQuote} loading={ready && quoting} />
      </CardContent>

      <CardFooter>
        <Button className="w-full" disabled={!shownQuote || submitting || quoting} onClick={submit}>
          {submitting ? <IconLoader className="animate-spin" /> : <IconSend />}
          {shownQuote ? `Send ${sgd(shownQuote.quote.sgdAmountMinor)}` : "Send payment"}
        </Button>
      </CardFooter>
    </Card>
  )
}

function QuotePanel({ quote, loading }: { quote: QuoteResponse | null; loading: boolean }) {
  if (!quote) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
        {loading ? "Getting a quote…" : "Enter a recipient and amount to see the rate."}
      </div>
    )
  }
  const q = quote.quote
  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Route</span>
        <span className="flex items-center gap-2">
          <Badge variant="secondary">{quote.rail === "PAYNOW" ? "PayNow" : "FAST"}</Badge>
          {q.simulated && <Badge variant="outline">Simulated rate</Badge>}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{quote.railReason}</p>
      <Row label="Recipient gets" value={sgd(q.sgdAmountMinor)} />
      <Row label="Partner fee" value={sgd(q.feeSgdMinor)} />
      <Row label="Rate" value={`1 USDC = S$${q.clientRate}`} hint={`mid ${q.midRate}, ${q.spreadBps / 100}% spread`} />
      <div className="my-1 border-t" />
      <Row label="You pay" value={usdc(q.usdcAmountMinor)} strong />
      <Row label="Arrives" value={quote.etaLabel} />
    </div>
  )
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-base font-semibold" : "font-medium"}>
        {value}
        {hint && <span className="text-muted-foreground ml-1 text-xs font-normal">({hint})</span>}
      </span>
    </div>
  )
}

function PayoutsList({ refreshKey }: { refreshKey: number }) {
  const [payouts, setPayouts] = React.useState<PayoutDto[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const apply = React.useCallback((result: Awaited<ReturnType<typeof fetchPayouts>>) => {
    if (result.ok) {
      setPayouts(result.payouts)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [])

  // Load on mount and whenever a new payout is created.
  React.useEffect(() => {
    let cancelled = false
    fetchPayouts().then((r) => !cancelled && apply(r))
    return () => {
      cancelled = true
    }
  }, [refreshKey, apply])

  // Poll while anything is still in flight.
  const inFlight = payouts?.some((p) => !isTerminal(p.status)) ?? false
  React.useEffect(() => {
    if (!inFlight) return
    const t = setInterval(() => fetchPayouts().then(apply), 2000)
    return () => clearInterval(t)
  }, [inFlight, apply])

  return (
    <Card className="w-full max-w-xl flex-1">
      <CardHeader>
        <CardTitle>Singapore payouts</CardTitle>
        <CardDescription>Live status for each payout, from treasury to recipient.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!payouts && !error && <p className="text-muted-foreground text-sm">Loading…</p>}
        {payouts?.length === 0 && <p className="text-muted-foreground text-sm">No payouts yet.</p>}
        {payouts?.map((p) => <PayoutRow key={p.id} payout={p} />)}
      </CardContent>
    </Card>
  )
}

async function fetchPayouts(): Promise<{ ok: true; payouts: PayoutDto[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/sancus/payouts", { cache: "no-store" })
    const body = await res.json()
    if (!res.ok) return { ok: false, error: body.error ?? "Could not load payouts" }
    return { ok: true, payouts: body.payouts as PayoutDto[] }
  } catch {
    return { ok: false, error: "Could not reach the server" }
  }
}

function PayoutRow({ payout: p }: { payout: PayoutDto }) {
  const failed = p.status === "FAILED"
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{p.recipientName}</p>
          <p className="text-muted-foreground text-xs">
            {p.rail === "PAYNOW" ? `PayNow ${p.proxyType === "UEN" ? "UEN" : "mobile"}` : `FAST ${p.bankCode ?? ""}`} ·{" "}
            {maskProxy(p)}
            {p.reference ? ` · ${p.reference}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{sgd(p.sgdAmountMinor)}</p>
          <p className="text-muted-foreground text-xs">{usdc(p.usdcAmountMinor)}</p>
        </div>
      </div>

      <StatusSteps status={p.status} />

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{new Date(p.createdAt).toLocaleString()}</span>
        {p.providerRef && <span>Ref {p.providerRef}</span>}
        {p.txHash && (
          <a
            className="text-primary underline-offset-2 hover:underline"
            href={`https://explorer.testnet.arc.io/tx/${p.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            Arc tx {p.txHash.slice(0, 10)}…
          </a>
        )}
        {p.simulated && <Badge variant="outline">Simulated</Badge>}
      </div>
      {failed && p.failureReason && (
        <p className="text-destructive flex items-center gap-1 text-xs">
          <IconAlertTriangle className="size-3.5" /> {p.failureReason}
        </p>
      )}
    </div>
  )
}

function StatusSteps({ status }: { status: PayoutStatus }) {
  const order = STATUS_STEPS.map((s) => s.status)
  const failed = status === "FAILED"
  // A failed payout stops at the payout step.
  const reached = failed ? order.indexOf("PAYING_OUT") : order.indexOf(status)
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STATUS_STEPS.map((step, i) => {
        const done = i < reached || (i === reached && status === "COMPLETED")
        const current = i === reached && !done
        const errored = failed && i === reached
        return (
          <li key={step.status} className="flex items-center gap-1">
            <span
              className={[
                "flex items-center gap-1 rounded-full px-2 py-0.5",
                errored
                  ? "bg-destructive/15 text-destructive"
                  : done
                    ? "bg-primary/15 text-primary"
                    : current
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {done && <IconCheck className="size-3" />}
              {current && !errored && <IconLoader className="size-3 animate-spin" />}
              {errored && <IconAlertTriangle className="size-3" />}
              {step.label}
            </span>
            {i < STATUS_STEPS.length - 1 && <IconArrowRight className="text-muted-foreground size-3" />}
          </li>
        )
      })}
    </ol>
  )
}
