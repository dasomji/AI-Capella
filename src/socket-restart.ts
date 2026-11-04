/** Each socket owner disposes its timer together with the socket. */
export function serverRestart(socket: {on(event:string,listener:(value:any)=>void):unknown;off(event:string,listener:(value:any)=>void):unknown;connect():unknown;disconnect():unknown}, connecting:()=>void=()=>{}) {
 let timer:ReturnType<typeof setTimeout>|undefined, until=0, closed=false;
 const connect=()=>{if(!closed && Date.now()>=until)socket.connect();};
 const restart=(value:any)=>{
   const delay=Number(value?.reconnectAfterMs);
   until=Date.now()+Math.min(60000,Math.max(0,Number.isFinite(delay)?delay:1000));
   clearTimeout(timer);socket.disconnect();connecting();timer=setTimeout(connect,Math.max(0,until-Date.now()));
 };
 socket.on('server:restarting',restart);
 return {connect,dispose(){closed=true;clearTimeout(timer);socket.off('server:restarting',restart);}};
}
