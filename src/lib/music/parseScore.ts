import { strFromU8, unzipSync } from "fflate";
import type { ScoreDocument } from "../../types/music";
import { parseMidiFile } from "./midi";
import { parseMusicXmlText } from "./musicXml";

export function parseScoreFile(fileName: string, buffer: ArrayBuffer): ScoreDocument {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "mid" || extension === "midi") {
    return parseMidiFile(fileName, buffer);
  }

  if (extension === "xml" || extension === "musicxml") {
    return parseMusicXmlText(fileName, new TextDecoder("utf-8").decode(buffer));
  }

  if (extension === "mxl") {
    const archive = unzipSync(new Uint8Array(buffer));
    const names = Object.keys(archive);
    const containerName = names.find((name) => name.toLowerCase() === "meta-inf/container.xml");
    let rootFile: string | undefined;

    if (containerName) {
      const containerXml = new DOMParser().parseFromString(strFromU8(archive[containerName]), "application/xml");
      if (containerXml.querySelector("parsererror")) throw new Error("MXL 容器无效，无法定位 MusicXML 主文件。");
      rootFile = Array.from(containerXml.getElementsByTagName("*"))
        .find((element) => element.localName === "rootfile")
        ?.getAttribute("full-path") ?? undefined;
      if (!rootFile || !archive[rootFile]) throw new Error("MXL 容器声明的 MusicXML 主文件不存在。");
    }

    const xmlName = (rootFile && archive[rootFile] ? rootFile : undefined)
      ?? names.find((name) => /\.(xml|musicxml)$/i.test(name) && !name.toLowerCase().includes("meta-inf/"));

    if (!xmlName || !archive[xmlName]) throw new Error("MXL 压缩包中没有找到 MusicXML 主文件。");
    return parseMusicXmlText(fileName, strFromU8(archive[xmlName]));
  }

  throw new Error(`暂不支持该文件格式：.${extension || "unknown"}。支持 MIDI、MusicXML、MXL；图片/PDF 需要 Windows 桌面版与本地 Audiveris。`);
}
