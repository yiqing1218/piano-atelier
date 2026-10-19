import { synthRender } from "./synthRender";
import type { RenderNote } from "./musicExport";
self.onmessage = async (event: MessageEvent<{ notes: RenderNote[]; banks: ArrayBuffer[]; custom: ArrayBuffer | null; rate: number; frames: number }>) => {
  try {
    const { notes, banks, custom, rate, frames } = event.data;
    const channels = await synthRender(notes, banks, custom, rate, frames, (progress) => self.postMessage({ progress }));
    self.postMessage({ channels }, { transfer: channels.map((channel) => channel.buffer as ArrayBuffer) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
