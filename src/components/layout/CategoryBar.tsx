import { CATEGORIES } from "@/lib/mockData";

interface CategoryBarProps {
  selected: string;
  onSelect: (category: string) => void;
}

export default function CategoryBar({ selected, onSelect }: CategoryBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
            selected === cat
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-surface-hover"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
