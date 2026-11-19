// Sancus agent: what the agent says while a tool runs. Shared by the server (stream events) and
// the browser (voice mode pre-records these so they play instantly).
export const PROGRESS: Record<string, string> = {
  get_balances: "Checking your balances",
  list_recipients: "Looking up your recipients",
  quote_payment: "Getting a live quote",
  propose_payment: "Preparing the payment",
  buy_route_quote: "Buying a live route quote for one cent",
  recent_activity: "Reading your recent activity",
  propose_collection: "Setting up the collection",
  list_people: "Looking up your team",
  propose_limits: "Preparing the new limits",
  my_spending: "Checking your card and limits",
  open_page: "Opening that page",
}

export const VOICE_GREETINGS = ["Hi, I'm listening. What should I do?", "I'm listening."]
