import { INSTRUMENTS, INSTRUMENT_GROUPS, type InstrumentId } from "../lib/audio/instruments";
interface Props { value: InstrumentId | ""; onChange: (value: InstrumentId | "") => void; label: string; disabled?: boolean; automatic?: string }
const options = INSTRUMENT_GROUPS.map((group) => <optgroup key={group} label={group}>
  {INSTRUMENTS.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
</optgroup>);
export default function InstrumentSelect({ value, onChange, label, disabled, automatic }: Props) {
  return <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as InstrumentId | "")}>
    {automatic && <option value="">自动 · {automatic}</option>}
    {options}
  </select>;
}
