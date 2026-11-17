# Pre-Decision Pixel Parity

AICAP-28 intentionally changed the design after the d96bae9 parity baseline. Comparing new
screens to that old revision cannot gate these approved decisions. Comparing HEAD with itself
would only prove fixture repeatability, not detect a regression. The manual
`test:browser:design-parity` script and its npm entry are therefore retired. Historical captures
remain outside Git under `/home/dev/.local/state/aicap-design/impl/`.

Retained regression coverage checks emitted CSS and React/DOM computed-style parity across
themes and viewports (`test:browser:design-system`), component forms, keyboard/focus behavior,
fourth-theme propagation, renderer repainting, admin responsive geometry and contrast, and
real account/admin/transcription journeys. `scripts/ci/check-coverage.mjs` enforces their CI
presence. This retirement does not waive any functional assertion or timing threshold.
