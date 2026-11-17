# Glossary

- **Token**: a named design input, authored in `src/design-system/tokens.css`, consumed through a semantic role or theme snapshot.
- **Semantic role**: a name describing an input's purpose, such as surface, ink or focus; each retained theme maps it to a value.
- **Recipe**: a pure typed function selecting complete semantic Tailwind class strings for component slots and variants; shared by React and DOM adapters.
- **Theme**: a complete semantic role mapping selected by the root `data-theme` attribute. Adding one requires one token block and one registry entry. System preference resolves to night paper or parchment.
- **Preset**: an orthogonal presentation choice retained alongside a theme, such as the Revival type preset; it overrides its declared roles without defining a separate palette.
- **Material strategy**: a token-selected paper/waves or light/dark rendering treatment; it is independent of the theme ID.
- **Shell recipe**: token-backed utilities attached by native route/domain constructors while preserving behavior and renderer hooks.
