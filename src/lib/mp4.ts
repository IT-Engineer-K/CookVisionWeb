/** 標準的な非フラグメントMP4の映像と再生時間を確認する。 */
export function mp4Duration(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  type Box = { type: string; start: number; end: number };
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    while (start < end) {
      if (end - start < 8 || result.length >= 4096) throw new Error("Invalid MP4");
      const shortSize = view.getUint32(start);
      const header = shortSize === 1 ? 16 : 8;
      if (end - start < header) throw new Error("Invalid MP4");
      const size = shortSize === 1 ? Number(view.getBigUint64(start + 8)) : shortSize || end - start;
      if (size < header || size > end - start) throw new Error("Invalid MP4");
      result.push({ type: tag(start + 4), start: start + header, end: start + size });
      start += size;
    }
    return result;
  }
  const children = (box: Box) => boxes(box.start, box.end);
  function duration(box: Box) {
    const version = bytes[box.start];
    const offset = box.start + (version === 1 ? 20 : 12);
    if ((version !== 0 && version !== 1) || box.end < offset + (version === 1 ? 12 : 8)) return NaN;
    const ticks = version === 1 ? Number(view.getBigUint64(offset + 4)) : view.getUint32(offset + 4);
    return ticks / view.getUint32(offset);
  }

  try {
    const top = boxes(0, bytes.length);
    const movies = top.filter((box) => box.type === "moov");
    const fileType = top[0];
    if (fileType?.type !== "ftyp" || fileType.end - fileType.start < 8 ||
        tag(fileType.start) === "qt  " || movies.length !== 1 ||
        top.some((box) => box.type === "moof") || !top.some((box) => box.type === "mdat" && box.end > box.start)) return null;
    const movie = children(movies[0]);
    const header = movie.find((box) => box.type === "mvhd");
    if (!header || movie.some((box) => box.type === "mvex")) return null;

    const durations = [duration(header)];
    let hasVideo = false;
    for (const track of movie.filter((box) => box.type === "trak")) {
      const media = children(track).find((box) => box.type === "mdia");
      if (!media) return null;
      const metadata = children(media);
      const handler = metadata.find((box) => box.type === "hdlr");
      const mediaHeader = metadata.find((box) => box.type === "mdhd");
      if (!handler || handler.end - handler.start < 12 || !mediaHeader) return null;
      hasVideo ||= tag(handler.start + 8) === "vide";
      durations.push(duration(mediaHeader));
    }
    return hasVideo && durations.every((value) => Number.isFinite(value) && value > 0)
      ? Math.max(...durations)
      : null;
  } catch {
    return null;
  }
}
