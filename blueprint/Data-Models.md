# Data Models

## User

- name
- email
- passwordHash
- googleId
- avatar
- role
- plan
- isVerified
- status
- lastLoginAt
- createdAt
- updatedAt

## RefreshToken

- user
- tokenHash
- familyId
- userAgent
- ipAddress
- expiresAt
- revokedAt
- replacedByToken
- createdAt

## Brand

- owner
- name
- slug
- logo
- businessType
- description
- website
- location
- language
- targetAudience
- tone
- products
- offers
- preferredHashtags
- blockedWords
- competitors
- goals
- brandColors
- fontStyle
- preferredCta
- localStyle
- status
- createdAt
- updatedAt

## SocialAccount

- brand
- platform
- accountName
- accountId
- accessTokenEncrypted
- refreshTokenEncrypted
- tokenExpiresAt
- permissions
- status
- lastSyncAt
- createdAt

## Post

- brand
- campaign
- platform
- type
- title
- caption
- hashtags
- media
- link
- status
- scheduledAt
- publishedAt
- platformPostId
- errorMessage
- retryCount
- createdBy
- approvedBy
- createdAt
- updatedAt

## Campaign

- brand
- name
- goal
- description
- platforms
- startDate
- endDate
- status
- posts
- createdBy
- createdAt

## Media

- brand
- uploadedBy
- fileName
- fileUrl
- publicId
- fileType
- mimeType
- size
- folder
- tags
- consentRequired
- consentStatus
- createdAt

## VideoTemplate

- name
- category
- aspectRatio
- duration
- scenes
- requiredFields
- previewUrl
- status
- createdAt

## VideoRender

- brand
- template
- post
- inputData
- outputUrl
- cloudinaryPublicId
- status
- costCredits
- errorMessage
- createdBy
- createdAt

## AiVideoJob

- brand
- provider
- providerJobId
- mode
- prompt
- sourceMedia
- aspectRatio
- duration
- status
- outputUrl
- costCredits
- errorMessage
- createdBy
- createdAt

## AvatarProfile

- owner
- brand
- name
- sourceMedia
- provider
- providerAvatarId
- status
- consent
- createdAt
- deletedAt

## AvatarConsent

- user
- avatarProfile
- consentVersion
- ownershipConfirmed
- allowedUse
- ipAddress
- userAgent
- acceptedAt
- revokedAt

## Analytics

- brand
- post
- platform
- views
- likes
- comments
- shares
- clicks
- reach
- engagementRate
- lastSyncedAt

## Subscription

- user
- plan
- status
- provider
- providerCustomerId
- providerSubscriptionId
- currentPeriodStart
- currentPeriodEnd
- cancelAtPeriodEnd

## UsageLog

- user
- brand
- action
- provider
- credits
- metadata
- createdAt

## CreditLedger

- user
- type
- amount
- balanceAfter
- reason
- referenceType
- referenceId
- createdAt

## Notification

- user
- type
- title
- message
- entityType
- entityId
- readAt
- createdAt

## Approval

- post
- requestedBy
- reviewer
- status
- requestedAt
- resolvedAt

## ApprovalComment

- approval
- user
- body
- createdAt

## AuditLog

- user
- action
- entityType
- entityId
- ipAddress
- userAgent
- metadata
- createdAt

## Payment

- user
- provider
- amount
- currency
- status
- reference
- metadata
- createdAt
