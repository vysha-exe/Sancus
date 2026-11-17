// Sancus: Singapore payout page.
import { PaySingapore } from "@/components/sancus/pay-singapore"

export default function PayPage() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Pay</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pay suppliers in Singapore from your USDC treasury. Sancus converts USDC to SGD and delivers it by
          PayNow or FAST through a licensed payout partner.
        </p>
      </div>
      <PaySingapore />
    </div>
  )
}
