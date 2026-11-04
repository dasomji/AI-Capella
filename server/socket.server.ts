import { logError as transcriptionLogError } from './logger.server';
import {
  authorize,
  onMembershipChange,
  onLibraryChange,
} from "./domain.server";
import { Server as HttpServer } from "node:http";
import type { ServerType } from "@hono/node-server";
import { Server, type Socket } from "socket.io";
import { env } from "./env.server";
import { currentSession } from "./auth.server";
import { pool } from "./db/index.server";
import { onRevoked } from "./revocation.server";
import { logError } from "./logger.server";
import { installRehearsal } from './rehearsal.server';
export function attachSockets(server: ServerType) {
  if (!(server instanceof HttpServer))
    throw new Error("HTTP/1 Node server required");
  const io = new Server(server, {
    connectTimeout: 10000,
    cors: { origin: env.TRUSTED_ORIGINS, credentials: true },
    allowRequest: (req, callback) =>
      callback(null, env.TRUSTED_ORIGINS.includes(req.headers.origin ?? "")),
  });
  const closeRehearsal = installRehearsal(io.of('/rehearsal'));
  const connected = new Set<Socket>();
  const authenticate = async (
    socket: Socket,
    next: (error?: Error) => void,
  ) => {
    try {
      if (!env.TRUSTED_ORIGINS.includes(socket.handshake.headers.origin ?? ""))
        return next(new Error("Untrusted origin"));
      const headers = new Headers({
        cookie: socket.handshake.headers.cookie ?? "",
      });
      const session = await currentSession(headers);
      if (!session?.user.emailVerified) return next(new Error("Sign in again"));
      socket.data.userId = session.user.id;
      socket.data.token = session.session.token;
      socket.data.expiresAt = new Date(session.session.expiresAt).getTime();
      next();
    } catch {
      next(new Error("Sign in again"));
    }
  };
  for (const namespace of [io.of("/"), io.of("/rehearsal")]) {
    namespace.use(authenticate);
    namespace.on("connection", (socket) => {
      connected.add(socket);
      socket.on(
        "ensemble:join",
        async (ensembleId: unknown, ack?: (result: unknown) => void) => {
          try {
            if (typeof ensembleId !== "string") throw Error();
            await currentSocketMembership(socket, ensembleId);
            await socket.join(`ensemble:${ensembleId}`);
            ack?.({ ok: true });
          } catch {
            ack?.({ code: "not_found" });
          }
        },
      );
      socket.on("disconnect", () => connected.delete(socket));
    });
  }
  // Refresh the account room set after additions as well as removals. Serialize per socket
  // so a slower membership query cannot rejoin a room after a later removal.
  const roomUpdates = new Map<Socket, Promise<void>>();
  function refreshRooms(socket: Socket, ensemble: string) {
    const update = (roomUpdates.get(socket) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const {rows} = await pool.query("select ensemble_id from memberships where user_id=$1",[socket.data.userId]);
      if (!socket.connected) return;
      const wanted = new Set(rows.map(row => `ensemble:${row.ensemble_id}`));
      for (const room of socket.rooms) if (room.startsWith("ensemble:") && !wanted.has(room)) await socket.leave(room);
      for (const room of wanted) await socket.join(room);
      socket.emit("membership:changed", {ensembleId: ensemble});
    });
    roomUpdates.set(socket,update);
    void update.catch(error=>logError("socket.membership_rooms",error)).finally(()=>{if(roomUpdates.get(socket)===update)roomUpdates.delete(socket);});
  }
  const unsubscribeMembership = onMembershipChange(
    (ensemble, user, removed) => {
      for (const socket of connected)
        if (user ? socket.data.userId === user : socket.rooms.has(`ensemble:${ensemble}`)) {
          if (!ensemble) socket.disconnect(true);
          else {
            if (removed) void socket.leave(`ensemble:${ensemble}`);
            refreshRooms(socket, ensemble);
          }
        }
    },
  );
  const deliverTranscription=async (ensemble:string,job:string)=>{
    for(const socket of connected){
      if(!socket.rooms.has(`ensemble:${ensemble}`))continue;
      const r=await pool.query("select 1 from memberships m join session s on s.user_id=m.user_id where m.ensemble_id=$1 and m.user_id=$2 and s.token=$3 and s.expires_at>now() and (m.is_lead or m.ai_transcription)",[ensemble,socket.data.userId,socket.data.token]);
      if(r.rowCount)socket.emit('transcription:progress',{ensembleId:ensemble,jobId:job});
    }
  };
  let notificationClient:import('pg').Client|undefined;
  let notificationsClosed=false;
  let notificationRetry:ReturnType<typeof setTimeout>|undefined;
  const listenForProgress=async()=>{
    if(notificationsClosed)return;
    const {Client}=await import('pg');
    const client=new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
    notificationClient=client;
    let failed=false;
    const recover=(error:unknown)=>{
      if(failed)return;failed=true;
      transcriptionLogError('transcription.notifications',error);
      void client.end().catch(()=>{});
      if(!notificationsClosed){notificationRetry=setTimeout(()=>{void listenForProgress();},1000);notificationRetry.unref();}
    };
    client.on('error',recover);
    client.on('notification',message=>{
      if(message.channel!=='transcription_progress' || !message.payload)return;
      try{const data=JSON.parse(message.payload);void deliverTranscription(data.ensemble,data.job).catch(error=>transcriptionLogError('transcription.progress',error));}
      catch(error){transcriptionLogError('transcription.notification_input',error);}
    });
    try{await client.connect();if(notificationsClosed){await client.end();return;}await client.query('listen transcription_progress');}catch(error){recover(error);}
  };
  void listenForProgress();
  const unsubscribeTranscription=()=>{notificationsClosed=true;clearTimeout(notificationRetry);void notificationClient?.end().catch(error=>transcriptionLogError('transcription.close',error));};
  const unsubscribeLibrary = onLibraryChange(async (ensemble, changes) => {
    const recipients = [...connected].filter((s) =>
      s.rooms.has(`ensemble:${ensemble}`),
    );
    if (!recipients.length) return;
    // Query failure propagates to the background logger; it is not proof of removal.
    const result = await pool.query(
      "select m.user_id,s.token from memberships m join session s on s.user_id=m.user_id where m.ensemble_id=$1 and m.user_id=any($2::text[]) and s.token=any($3::text[]) and s.expires_at>now()",
      [
        ensemble,
        [...new Set(recipients.map((s) => s.data.userId))],
        recipients.map((s) => s.data.token),
      ],
    );
    const valid = new Set(result.rows.map((r) => r.user_id + ":" + r.token));
    for (const socket of recipients) {
      if (!valid.has(socket.data.userId + ":" + socket.data.token)) {
        await socket.leave(`ensemble:${ensemble}`);
        continue;
      }
      socket.emit("library:changed", {
        ensembleId: ensemble,
        changes: changes.map((c: any) => ({
          ...c,
          pieceId: c.pieceId ?? c.id,
          revision: c.revision,
          versionNo: c.versionNo,
          contentHash: c.contentHash,
          ...(c.deleted ? { deleted: true } : {}),
        })),
      });
    }
  });
  const unsubscribe = onRevoked((token) => {
    for (const socket of connected)
      if (socket.data.token === token) socket.disconnect(true);
  });
  let failures = 0,
    busy = false;
  const timer = setInterval(async () => {
    if (busy || !connected.size) return;
    busy = true;
    try {
      const result = await pool.query(
        "select token, expires_at from session where token = ANY($1::text[]) and expires_at > now()",
        [[...new Set([...connected].map((s) => s.data.token))]],
      );
      const valid = new Map(result.rows.map((row) => [row.token,new Date(row.expires_at).getTime()]));
      failures = 0;
      for (const socket of connected)
        if (!valid.has(socket.data.token)) socket.disconnect(true);
        else socket.data.expiresAt = valid.get(socket.data.token)!;
    } catch (error) {
      logError("socket.session_check", error);
      if (++failures >= 3)
        for (const socket of connected) socket.disconnect(true);
    } finally {
      busy = false;
    }
  }, 15000);
  timer.unref();
  const close = io.close.bind(io);
  io.close = ((callback?: () => void) => {
    closeRehearsal();
    clearInterval(timer);
    unsubscribe();
    unsubscribeMembership();
    unsubscribeLibrary();unsubscribeTranscription();
    return close(callback);
  }) as typeof io.close;
  return io;
}

export async function currentSocketMembership(
  socket: Socket,
  ensembleId: string,
) {
  const session = await currentSession(
    new Headers({ cookie: socket.handshake.headers.cookie ?? "" }),
  );
  if (!session?.user.emailVerified) throw new Error("Sign in again");
  return authorize(pool, session.user.id, ensembleId);
}
