// The legacy scoped-CSS attribute (data-astro-cid-<hash>) a template's markup carries. The Phase 0
// pages were built by an earlier Astro build whose scoped styles survive as plain CSS keyed on these
// attributes, so a template that reuses that CSS must stamp the same attribute. Phase 2 retires them
// with the design-system restyle.
export const scope = (cid) => (cid ? { [`data-astro-cid-${cid}`]: '' } : {});
