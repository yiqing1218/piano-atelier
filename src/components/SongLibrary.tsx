import type { LibrarySong } from "../lib/storage/songStore";
import type { RepeatMode } from "../lib/music/playlist";
interface Props { songs: LibrarySong[]; current: string | null; disabled: boolean; repeat: RepeatMode; onRepeat: (value: RepeatMode) => void; onSelect: (song: LibrarySong) => void; onDelete: (song: LibrarySong) => void }
export default function SongLibrary({ songs, current, disabled, repeat, onRepeat, onSelect, onDelete }: Props) {
  return <div className="sidebar-section song-library" aria-label="本地曲库">
    <div className="section-label">本地曲库 · {songs.length} 首</div>
    <select aria-label="循环模式" value={repeat} disabled={disabled} onChange={(event) => onRepeat(event.target.value as RepeatMode)}>
      <option value="once">播放一次</option><option value="list">列表循环</option><option value="shuffle">随机播放</option><option value="one">单曲循环</option>
    </select>
    {!songs.length && <p className="hint-text">导入后自动保存在本机，同一文件不重复入库。</p>}
    <div className="library-scroll">{songs.map((song) => <div className={`library-row ${current === song.id ? "selected" : ""}`} key={song.id}>
      <button type="button" disabled={disabled} aria-current={current === song.id ? "true" : undefined} onClick={() => onSelect(song)} title={song.name}>{song.score.title}<small>{song.score.format.toUpperCase()} · {song.score.notes.length} 音符</small></button>
      <button type="button" disabled={disabled} className="library-delete" aria-label={`从曲库删除 ${song.name}`} title="从曲库删除" onClick={() => onDelete(song)}>×</button>
    </div>)}</div>
  </div>;
}
