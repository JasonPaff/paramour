---
"@paramour-js/next": minor
---

New `@paramour-js/next/testing` entry: `ParamourTestingProvider` and `withParamourTesting` let component tests drive the paramour hooks through a React-context adapter seam instead of module mocks — runner-agnostic, no `vi.mock`/`jest.mock` needed. The hooks now resolve their Next.js reads (params, pathname, search params, router) through the seam with real-Next fallbacks, and the testing adapter can model `params: null` and the pages-router unmounted/pending states.
