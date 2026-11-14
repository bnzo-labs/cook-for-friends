/** Seat operations (W3-09, CCR-W3-4). CONTRACT §4. Policy is scheduling's; commerce executes. */
export { executeSeatCancellation } from "./cancel"
// W4-03b (M-2): seat refund/credit cap, reused by scheduling (preview clamp) and W4-07 (staff cancel)
export { getSeatCancellationCap, seatCancellationCap } from "./cap"
export type { SeatCancellationCap } from "./cap"
export { issueCreditCode } from "./credit"
export { getEnrollmentView, listCustomerEnrollments, listCustomerOrders } from "./views"
export { setEnrollmentAttendance } from "./attendance"
export type { EnrollmentView, OrderSummary } from "../types"
