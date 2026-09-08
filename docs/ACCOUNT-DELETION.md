# Account Deletion

## Lifecycle

Deletion is scheduled rather than an immediate unaudited hard delete.

1. User requests deletion.
2. System stores the request and grace deadline.
3. User may cancel before processing.
4. A leased background processor claims due requests.
5. Active sessions/tokens and provider credentials are revoked/destroyed.
6. Owned workspace/content/media resources are removed according to policy.
7. Subscription state is cancelled/closed as appropriate.
8. Retained financial/security records are minimized.
9. User identity is pseudonymized and deletion marked complete.

## Safety

Leases/retries prevent two processors from racing the same deletion. The processor should be idempotent enough to resume after a crash. Deletion UI must display state and deadline instead of promising instant deletion when processing is scheduled.
