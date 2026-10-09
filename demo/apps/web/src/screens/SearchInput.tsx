import { Search } from "lucide-react";

export function SearchInput({
  value,
  set,
  placeholder,
}: {
  value: string;
  set: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search">
      <Search size={18} />
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
