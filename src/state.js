/* Shared mutable state: top-level variables that more than one module reassigns.
   ES module imports are read-only, so these live here as G.name. */
export const G = {};
