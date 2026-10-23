export interface CheckinState {
  enabled: boolean
  rewardMinor: number
  claimed: boolean
  claimedRewardMinor: number
  canClaim: boolean
  date: string
  nextClaimAt: string
  refreshAfterSeconds: number
  unavailableReason: string
}
export interface CreditPolicy {
  signupGiftMinor: number
  checkin: CheckinState
}
