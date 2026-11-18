import { RouteTransition } from "@/components/sancus-ui/app-shell"

export default function Loading() {
  return (
    <div className="route-loading-page" aria-hidden="true">
      <RouteTransition />
    </div>
  )
}
