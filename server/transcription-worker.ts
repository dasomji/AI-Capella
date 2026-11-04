process.env.LIGHTSCORE_PROCESS_ROLE = "worker";
await import("./transcription-worker-main");
