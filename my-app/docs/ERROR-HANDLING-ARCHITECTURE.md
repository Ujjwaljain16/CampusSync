# Error Handling Architecture - Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CampusSync Error Handling Flow                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │         GLOBAL ERROR BOUNDARY                  │
        │  (Catches all unhandled component errors)     │
        │                                                │
        │  • Shows fallback UI                          │
        │  • Tracks errors                              │
        │  • Provides recovery options                  │
        └───────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │           TOAST PROVIDER                       │
        │  (User feedback notifications)                │
        │                                                │
        │  • Success toasts                             │
        │  • Error toasts                               │
        │  • Warning toasts                             │
        │  • Info toasts                                │
        └───────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │         COMPONENT LAYER                        │
        │                                                │
        │  ┌──────────────────────────────────────┐    │
        │  │  Component State Management          │    │
        │  │  • loading: boolean                  │    │
        │  │  • error: string | null              │    │
        │  │  • data: T | null                    │    │
        │  └──────────────────────────────────────┘    │
        │                                                │
        │  ┌──────────────────────────────────────┐    │
        │  │  Error Handling Pattern              │    │
        │  │  1. setLoading(true)                 │    │
        │  │  2. setError(null)                   │    │
        │  │  3. try { ... }                      │    │
        │  │  4. catch { setError, toast }        │    │
        │  │  5. finally { setLoading(false) }    │    │
        │  └──────────────────────────────────────┘    │
        └───────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │            API LAYER                           │
        │                                                │
        │  ┌──────────────────────────────────────┐    │
        │  │  Error Handler Middleware            │    │
        │  │  • Wraps all API routes              │    │
        │  │  • Catches thrown errors             │    │
        │  │  • Returns formatted responses       │    │
        │  └──────────────────────────────────────┘    │
        │                                                │
        │  ┌──────────────────────────────────────┐    │
        │  │  Standard Error Responses            │    │
        │  │  • 400 Bad Request                   │    │
        │  │  • 401 Unauthorized                  │    │
        │  │  • 403 Forbidden                     │    │
        │  │  • 404 Not Found                     │    │
        │  │  • 422 Validation Error              │    │
        │  │  • 500 Internal Server Error         │    │
        │  └──────────────────────────────────────┘    │
        └───────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │         ERROR MONITORING                       │
        │                                                │
        │  • Tracks all errors with severity            │
        │  • Logs to console (dev)                      │
        │  • Sends to external service (prod)           │
        │  • Performance tracking                       │
        │  • User context                               │
        └───────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR FLOW DIAGRAM                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                              User Action
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  User clicks     │
                        │  button/submit   │
                        └──────────────────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  Component sets  │
                        │  loading = true  │
                        │  error = null    │
                        └──────────────────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  API Call        │
                        └──────────────────┘
                                   │
                        ┌──────────┴──────────┐
                        │                     │
                   Success                 Failure
                        │                     │
                        ▼                     ▼
             ┌──────────────────┐  ┌──────────────────┐
             │  Update state    │  │  Catch error     │
             │  Show success    │  │  Set error state │
             │  toast           │  │  Show error toast│
             └──────────────────┘  │  Track error     │
                        │           └──────────────────┘
                        │                     │
                        └──────────┬──────────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  finally block   │
                        │  loading = false │
                        └──────────────────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  UI Updates      │
                        │  User sees       │
                        │  feedback        │
                        └──────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                       ERROR SEVERITY LEVELS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    LOW          MEDIUM          HIGH          CRITICAL
     │             │              │               │
     │             │              │               │
     ▼             ▼              ▼               ▼
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐
│ Warnings│  │ Feature │  │Important│  │ System   │
│ Non-    │  │ Failures│  │ Failures│  │ Breaking │
│ Critical│  │         │  │         │  │          │
└─────────┘  └─────────┘  └─────────┘  └──────────┘
   Console      Toast        Toast        Toast +
    Only         Only         +            Alert +
                            Track          Track +
                                          Email


┌─────────────────────────────────────────────────────────────────────────────┐
│                       TOAST NOTIFICATION TYPES                               │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
    │ ✓ SUCCESS │     │ ✗ ERROR   │     │ ⚠ WARNING │     │ ⓘ INFO    │
    │           │     │           │     │           │     │           │
    │ Green     │     │ Red       │     │ Yellow    │     │ Blue      │
    │ Checkmark │     │ X Circle  │     │ Triangle  │     │ Info Icon │
    └───────────┘     └───────────┘     └───────────┘     └───────────┘
         │                  │                  │                  │
         └──────────────────┴──────────────────┴──────────────────┘
                                   │
                                   ▼
                        Auto-dismiss after 5s
                        (configurable duration)


┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPONENT ERROR STATE MACHINE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌──────────┐
                        │  IDLE    │
                        └──────────┘
                             │
                    User Action/Mount
                             │
                             ▼
                        ┌──────────┐
                        │ LOADING  │
                        │          │
                        │ • Show   │
                        │   spinner│
                        │ • Disable│
                        │   buttons│
                        └──────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
             Success                 Error
                  │                     │
                  ▼                     ▼
            ┌──────────┐         ┌──────────┐
            │ SUCCESS  │         │  ERROR   │
            │          │         │          │
            │ • Show   │         │ • Show   │
            │   data   │         │   error  │
            │ • Success│         │ • Retry  │
            │   toast  │         │   button │
            └──────────┘         └──────────┘
                  │                     │
                  └──────────┬──────────┘
                             │
                          Retry
                             │
                             ▼
                        ┌──────────┐
                        │ LOADING  │
                        └──────────┘
```
