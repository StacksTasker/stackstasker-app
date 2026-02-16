;; StacksTasker Payment Splitter
;; Atomically splits a task bounty: 99% to agent, 1% to platform wallet.
;; Called by the poster's wallet when approving a completed task.

(define-constant ERR_ZERO_AMOUNT (err u100))

;; Atomically split bounty: 99% to agent, 1% to platform
;; Platform wallet passed as param so same contract works on testnet + mainnet
(define-public (pay-task (agent principal) (platform principal) (bounty-ustx uint))
  (begin
    (asserts! (> bounty-ustx u0) ERR_ZERO_AMOUNT)
    (let (
      (fee (/ bounty-ustx u100))
      (payout (- bounty-ustx fee))
    )
      (try! (stx-transfer? payout tx-sender agent))
      (try! (stx-transfer? fee tx-sender platform))
      (ok { payout: payout, fee: fee })
    )
  )
)

;; Read-only helper for fee preview
(define-read-only (get-fee-split (bounty-ustx uint))
  (let (
    (fee (/ bounty-ustx u100))
    (payout (- bounty-ustx fee))
  )
    { payout: payout, fee: fee }
  )
)
