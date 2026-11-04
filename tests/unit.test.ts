import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML } from "../src/musicxml";
import { parseMIDI } from "../src/midi";
describe("preserved musical import boundaries", () => {
  it("loads the bundled MusicXML with voices and timed notes", () => {
    const score = parseMusicXML(
      readFileSync("public/evening-rise.musicxml", "utf8"),
    );
    expect(score.parts.length).toBeGreaterThan(1);
    expect(score.notes.length).toBeGreaterThan(20);
  });
  it("rejects non-MIDI content", () => {
    expect(() => parseMIDI(new ArrayBuffer(20))).toThrow();
  });
});

it("keeps imported source and independent part edits in the local library", async () => {
  const { localLibrary } = await import("../src/local-library");
  const xml = readFileSync("public/evening-rise.musicxml", "utf8");
  const id = await localLibrary.add({
    title: "Local rehearsal",
    xml,
    format: "musicxml",
  });
  await localLibrary.update(id, {
    partNameOverrides: { soprano: "Soprano", bass: "Bass" },
  });
  expect(localLibrary.get(id)?.xml).toBe(xml);
  expect(localLibrary.get(id)?.partNameOverrides).toEqual({
    soprano: "Soprano",
    bass: "Bass",
  });
  await localLibrary.remove(id);
  expect(localLibrary.get(id)).toBeUndefined();
});

it("redacts untrusted errors instead of serializing secret-bearing dependency messages", async () => {
  const { logError, withRequestLog } = await import("../server/logger.server");
  const { vi } = await import("vitest");
  const capture = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    withRequestLog("request-123", () =>
      logError(
        "database.error",
        Object.assign(new Error("postgres://secret/password?token=reset"), {
          code: "57P01",
          password: "private",
        }),
      ),
    );
    const record = JSON.parse(capture.mock.calls[0][0]);
    expect(record.requestId).toBe("request-123");
    expect(record.code).toBe("57P01");
    expect(record.timestamp).toMatch(/Z$/);
    expect(JSON.stringify(record)).not.toMatch(/secret|password|token|private/);
  } finally {
    capture.mockRestore();
  }
});

it("uses separate version bodies, caches by hash and sends granular revision checked edits", async () => {
  const { vi } = await import("vitest");
  const requests: { path: string; body: any }[] = [];
  let piece: any = {
    id: "piece",
    ensembleId: "ensemble",
    title: "Test",
    sortKey: "0001",
    format: "musicxml",
    revision: 1,
    versionNo: 1,
    contentHash: "hash",
    updatedAt: new Date().toISOString(),
    settings: { partNames: {}, removedParts: {}, splitParts: {} },
  };
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const path = String(input),
        body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, body });
      if (path === "/api/me")
        return Response.json({
          user: { id: "unit-account", email: "unit@example.test" },
        });
      if (path === "/api/ensembles")
        return Response.json([
          { id: "ensemble", name: "Unit", isLead: true, capabilities: {} },
        ]);
      if (path.includes("/versions/hash")) return new Response("<score/>");
      if (init?.method === "PATCH") {
        expect(body).toMatchObject({
          op: "partName",
          key: "P1",
          value: "First",
          expectedRevision: 1,
        });
        piece = {
          ...piece,
          revision: 2,
          settings: { ...piece.settings, partNames: { P1: "First" } },
        };
      }
      return Response.json(piece);
    });
  try {
    const ensembles = await import("../src/ensembles");
    await ensembles.initializeEnsembles();
    ensembles.setActiveEnsemble("ensemble");
    const library = await import("../src/library");
    library.clearLibrary();
    expect(await library.scoreBody("piece")).toBe("<score/>");
    expect(await library.scoreBody("piece")).toBe("<score/>");
    expect(requests.filter((r) => r.path.includes("/versions/")).length).toBe(
      1,
    );
    await library.updateSongMetadata("piece", {
      partName: { partId: "P1", name: "First" },
    });
  } finally {
    fetcher.mockRestore();
  }
});

it("reloads a conflict without retrying the stale edit", async () => {
  const { vi } = await import("vitest");
  let writes = 0,
    reads = 0;
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      if (init?.method === "PATCH") {
        writes++;
        return Response.json({ code: "revision_conflict" }, { status: 409 });
      }
      reads++;
      return Response.json({
        id: "piece",
        revision: 9,
        settings: { partNames: { P2: "Concurrent" } },
      });
    });
  try {
    const library = await import("../src/library");
    await expect(
      library.updateSongMetadata("piece", {
        partName: { partId: "P2", name: "Stale" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(writes).toBe(1);
    expect(reads).toBe(1);
  } finally {
    fetcher.mockRestore();
  }
});

it('rejects prototype-named settings without calling inherited properties', async () => {
  const {settingsInput}=await import('../src/api/domain');
  for(const key of ['constructor','toString','__proto__']) {
    expect(settingsInput.safeParse({op:'saved',key,value:42}).success).toBe(false);
  }
});
it('removes executable content from score-derived SVG', async () => {
  const {JSDOM}=await import('jsdom');
  const dom=new JSDOM('');
  const {vi}=await import('vitest');
  vi.stubGlobal('DOMParser',dom.window.DOMParser);
  vi.stubGlobal('document',dom.window.document);
  try {
    const {safeSvg}=await import('../src/safe-svg');
    const svg=safeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="evil()"><script>evil()</script><foreignObject/><a href="javascript:evil()"/><use href="#note"/><text>Choir</text></svg>');
    expect(svg.querySelector('script,foreignObject')).toBeNull();
    expect(svg.hasAttribute('onload')).toBe(false);
    expect(svg.querySelector('a[href]')).toBeNull();
    expect(svg.querySelector('use')?.getAttribute('href')).toBe('#note');
    expect(svg.textContent).toBe('Choir');
  } finally {vi.unstubAllGlobals();}
});

it('bounds uploads globally and per user without queuing and releases exactly once', async()=>{
  const {UploadSlots}=await import('../server/upload-slots.server');
  const slots=new UploadSlots(2,1), a=slots.take('a'), b=slots.take('b');
  expect(slots.take('a')).toEqual({code:429});
  expect(slots.take('c')).toEqual({code:503});
  if('release' in a){a.release();a.release();}
  expect('release' in slots.take('c')).toBe(true);
  expect(slots.take('d')).toEqual({code:503});
  if('release' in b)b.release();
});

it('SVG boundary rejects 18 executable payloads and retains real Verovio notation', async()=>{
  const {JSDOM}=await import('jsdom'); const {vi}=await import('vitest');
  const dom=new JSDOM('');vi.stubGlobal('DOMParser',dom.window.DOMParser);vi.stubGlobal('document',dom.window.document);
  try {
    const {safeSvg}=await import('../src/safe-svg');
    const payloads=[
      '<meta xmlns="http://www.w3.org/1999/xhtml" http-equiv="refresh" content="0;url=https://evil.test"/>',
      '<style>@import "https://evil.test";</style>','<style>text {fill:red}</style>',
      '<g style="fill:u\\72l(https://evil.test)"/>','<g fill="u\\000072 l(https://evil.test)"/>',
      '<foreignObject><p xmlns="http://www.w3.org/1999/xhtml">bad</p></foreignObject>',
      '<use href="https://evil.test/a.svg#x"/>','<use href="javascript:evil()"/>',
      '<animate href="#x" attributeName="href" to="javascript:evil()"/>','<set href="#x" attributeName="href" to="https://evil.test"/>',
      '<a href="javascript:evil()"><text>link</text></a>','<image href="data:image/svg+xml,bad"/>',
      '<script>evil()</script>','<g onload="evil()"/>','<g xmlns="https://evil.test"/>',
      '<g fill="red/*evil*/"/>','<g fill="\\110000evil"/>','<g fill="url(https://evil.test)"/>','<use href="&#106;avascript:evil()"/>','<g xml:base="https://evil.test"><use href="#glyph"/></g>',
    ];
    for(const payload of payloads){const svg=safeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${payload}</svg>`);expect(svg.outerHTML).not.toMatch(/evil|foreignObject|<style|<animate|<set|onload|xml:base/);}
    expect(()=>safeSvg('<!DOCTYPE svg [<!ENTITY x "evil">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>')).toThrow();
    const [{default:create},{VerovioToolkit}]=await Promise.all([import('verovio/wasm'),import('verovio/esm')]);
    const toolkit=new VerovioToolkit(await create());
    try {
      toolkit.setOptions({svgViewBox:true});toolkit.loadData(readFileSync('public/evening-rise.musicxml','utf8'));
      for(let i=1;i<=toolkit.getPageCount();i++) {
        const raw=toolkit.renderToSVG(i), original=new dom.window.DOMParser().parseFromString(raw,'image/svg+xml').documentElement;
        expect(safeSvg(raw).outerHTML).toBe(dom.window.document.importNode(original,true).outerHTML);
      }
    }finally{(toolkit as unknown as {destroy():void}).destroy();}
  }finally{vi.unstubAllGlobals();}
},30000);

it('library socket boundary ignores stale revisions, versions and post-delete events',async()=>{
 const {vi}=await import('vitest');const {JSDOM}=await import('jsdom');const dom=new JSDOM('');
 vi.stubGlobal('window',dom.window);vi.stubGlobal('Event',dom.window.Event);
 vi.resetModules();
 const handlers=new Map<string,(event:any)=>Promise<void>>();
 vi.doMock('socket.io-client',()=>({io:()=>({on:(name:string,fn:any)=>handlers.set(name,fn),emit:()=>{},disconnect:()=>{}})}));
 vi.doMock('../src/domain-client',()=>({api:async()=>[]}));
 try {
  const {subscribeToSongs,clearLibrary}=await import('../src/library');let songs:any[]=[];
  const stop=subscribeToSongs(rows=>{songs=rows;},e=>{throw e;},'ensemble');await Promise.resolve();
  const deliver=(change:any)=>handlers.get('library:changed')!({ensembleId:'ensemble',changes:[change]});
  const m={id:'piece',pieceId:'piece',settings:{},sortKey:'0',revision:5,versionNo:2,title:'Newest',updatedAt:new Date().toISOString()};
  await deliver(m);await deliver({...m,revision:4,title:'Stale'});await deliver({...m,revision:6,versionNo:1,title:'Old version'});
  expect(songs[0].title).toBe('Newest');
  await deliver({...m,revision:6,deleted:true});await deliver(m);expect(songs).toEqual([]);
  stop();clearLibrary();
 }finally{vi.doUnmock('socket.io-client');vi.doUnmock('../src/domain-client');vi.unstubAllGlobals();}
});
