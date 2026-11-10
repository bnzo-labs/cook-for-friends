import { headers } from "next/headers"

import { getCurrentCustomer } from "@/modules/identity"

import { WaitlistForm } from "./WaitlistForm"

export interface WaitlistMountProps {
  sessionId: string
  dateLabel: string
}

/** Server read of the signed-in customer's email (prefill only); anonymous → empty field. */
export async function WaitlistMount({ sessionId, dateLabel }: WaitlistMountProps) {
  const customer = await getCurrentCustomer(await headers()).catch(() => null)
  return <WaitlistForm sessionId={sessionId} dateLabel={dateLabel} defaultEmail={customer?.email ?? ""} />
}
