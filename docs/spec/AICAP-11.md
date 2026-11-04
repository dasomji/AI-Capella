# AICAP-11: Validate complete musical scores and preserve source MusicXML and multipage voice identity

Observed risks

Browser parseMusicXML rejects malformed XML but can return an empty Score for valid non-score XML; scan import treats parser invocation as validation. Existing OMR compact-note rewrites omit notation features; movement merge matches parts positionally and drops sections when part counts differ.

Acceptance criteria

Shared runtime validation checks actual supported MusicXML structure, unique/known part IDs, useful nonempty measures, finite/valid pitch and rational timing, voices/staves, tie consistency and cross-part alignment; return actionable page/measure diagnostics.

Handle pickups, grace notes, tuplets, meter/key changes, repeats/endings, piano staves, divisi and lyric verses; distinguish supported musical exceptions from real timing errors rather than enforcing every voice to fill every bar blindly.

Preserve raw MusicXML as canonical source, derived playback representation and parser/schema version separately; validation must not silently rewrite/lossily reconstruct original notation.

Multipage transcription keeps stable parts and reconciles page-boundary ties, lyric continuation and key/meter context; retain page/system/measure provenance, including repeated printed measure numbers and changing staff/voice counts.

Never discard a section because its part count differs or map voices solely by array position. Uncertain assembly is surfaced for review.

Add representative fixtures asserting source notation, playable timing and PDF engraving, including complex and imperfect scores. Reject empty/non-score XML and malformed model output before import.

Evidence

src/main.ts:1455-1458 calls parseMusicXML as validation; src/musicxml.ts:466-495,530-542 can return an empty score; omr-service/src/score.ts:33-38 validates root only, :302-360 reconstructs narrow note fields, :415-430 drops different-part-count movements, :105-111 guesses page mapping. test/score.test.mjs:21-26 compares compact notes rather than full notation fidelity.

Dependencies

Shared score contracts and repository versions; foundation for AICAP direct transcription. Validate existing library import as well as model output.
