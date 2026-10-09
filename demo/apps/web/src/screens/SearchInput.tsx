import { Search, X } from "lucide-react";
import { useId, useRef } from "react";

export function SearchInput({
  value,
  set,
  placeholder,
}: {
  value: string;
  set: (value: string) => void;
  placeholder: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="search">
      <Search size={18} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>
        {placeholder}
      </label>
      <input
        id={id}
        ref={input}
        type="search"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          aria-label="Limpar busca"
          onClick={() => {
            set("");
            input.current?.focus();
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
