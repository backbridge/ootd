# ADR-001: Dual HTTP Client Support for RESTful Client Package

**Date:** 28 March 2026

**Status:** Accepted

## Context

We are building an npm package that serves as a RESTful client for a web service. The package needs to support both `axios` and native `fetch` as HTTP agents, with the following key requirements:

1. **Lightweight design**: Minimize overhead and complexity in the client implementation
2. **Seamless support**: Automatically use `axios` if available (declared as a dependency), otherwise fall back to `fetch`
3. **Leverage existing dependencies**: Allow package users to take advantage of their existing HTTP dependencies without introducing unnecessary abstractions
4. **Minimize maintenance burden**: Avoid complex object hierarchies or extensive wrapper code

The fundamental challenge is providing a unified client interface that works with both HTTP agents while respecting their different response shapes and APIs, without adding significant abstraction layers.

## Decision

We will implement a **single client using Discriminated Unions** that leverages the intrinsic differences between `axios` and `fetch` response types.

The client will:
- Detect the presence of `axios` at runtime (checking if it's installed/available)
- Use TypeScript Discriminated Unions to represent the response types from both HTTP agents
- Return responses in their native format (`AxiosResponse` or `Response` from fetch) without normalization
- Rely on TypeScript's type narrowing to allow users to handle responses appropriately based on which HTTP agent is in use

This approach means:
- One client implementation, not multiple classes or adapters
- No wrapper objects or normalization layers
- Response types naturally discriminate between axios and fetch
- Users interact with familiar response objects from their chosen HTTP library

## Alternatives Considered

### Alternative 1: Full Adapter Pattern with Normalized Return Types

**Description:** Implement a complete adapter pattern with separate adapter classes for `axios` and `fetch`, normalizing their responses into a common interface.

**Rationale for rejection:** 
- Too heavyweight for our goals
- Requires significant abstraction code
- Forces normalization of response types, hiding native features
- Users lose access to HTTP-agent-specific functionality
- Increases maintenance burden with additional object hierarchy

### Alternative 2: Thin Wrapper Adapters with Factory Pattern

**Description:** Create minimal wrapper classes around `axios` and `fetch` that don't normalize return types, with a factory to instantiate the appropriate wrapper based on `axios` availability.

**Rationale for rejection:**
- Still requires maintaining an object hierarchy (base interface/class with implementations)
- Wrappers must have something in common (shared interface/type), adding unnecessary structure
- More code to maintain than necessary for the lightweight goal
- Factory pattern adds another layer of indirection
- Doesn't significantly reduce complexity compared to full adapter pattern

### Alternative 3: Discriminated Unions (Chosen)

**Description:** Single client implementation that returns discriminated union types based on which HTTP agent is being used.

**Rationale for acceptance:**
- Minimal code overhead - single implementation
- No object hierarchy to maintain
- Leverages TypeScript's type system for safety
- Preserves native response types and their features
- Users get full access to their preferred HTTP agent's API
- Runtime detection of `axios` availability determines behavior

## Consequences

### Benefits

1. **Minimal overhead**: Single client implementation with no adapter layers or wrapper classes
2. **Lightweight**: Achieves the goal of being as lightweight as possible
3. **Type-safe**: TypeScript discriminated unions provide compile-time type narrowing and safety
4. **Native experience**: Users interact with native `AxiosResponse` or `Response` objects they're already familiar with
5. **Zero normalization cost**: No runtime overhead from response transformation
6. **Flexibility**: Users can access all features of their chosen HTTP agent
7. **Simple maintenance**: One implementation path to maintain and test

### Trade-offs

1. **User responsibility**: Package users must handle different response types in their code based on which HTTP agent is available
2. **Type narrowing required**: Users need to use TypeScript type guards or runtime checks to narrow the response type before accessing agent-specific properties
3. **Different APIs**: Users working with both axios and fetch need to understand both APIs (though they typically already do)
4. **Documentation burden**: Must clearly document how to work with the discriminated union and provide examples for both cases

### Implementation Considerations

1. **Dependency detection**: Implement runtime check for `axios` availability (try/catch on import or checking package.json)
2. **Type definitions**: Define TypeScript types using the native response types directly in a discriminated union:
   ```typescript
   type HttpResponse<T> = AxiosResponse<T> | Response
   ```
   The type disparity between `AxiosResponse` and `Response` is wide enough that they can be used as-is without explicit wrapper types. Axios responses have properties like `.data`, `.status`, `.config`, while fetch responses have methods like `.json()`, `.text()` and properties like `.ok`. This natural difference allows TypeScript to discriminate between them effectively.
   
   **Caveat**: Users must infer which response type they're working with implicitly (by checking available properties/methods or based on their project's dependency setup). This is acceptable since users are already familiar with their chosen HTTP agent's API through the course of their normal work.
3. **Type guards**: Optionally provide helper type guards for users who prefer explicit checking:
   ```typescript
   function isAxiosResponse<T>(resp: HttpResponse<T>): resp is AxiosResponse<T> {
     return 'data' in resp && 'config' in resp;
   }
   ```
4. **Clear documentation**: Provide examples showing how to handle both response types
5. **Testing strategy**: Test with both HTTP agents to ensure correct behavior in both modes
