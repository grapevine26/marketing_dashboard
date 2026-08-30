"use client";

import { useState } from "react";
import { MarketingEvent, EventGuest } from "@/lib/db/types";
import { toggleCheckinAction } from "../../actions";
import { Search, CheckCircle2 } from "lucide-react";

export default function CheckinList({
  event,
  initialGuests,
}: {
  event: MarketingEvent;
  initialGuests: EventGuest[];
}) {
  const [guests, setGuests] = useState<EventGuest[]>(initialGuests);
  const [search, setSearch] = useState("");

  const handleToggle = async (guestId: string, currentVal: boolean) => {
    await toggleCheckinAction(guestId, !currentVal, event.id);
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, checked_in: !currentVal } : g))
    );
  };

  const filtered = guests.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return g.name.toLowerCase().includes(q) || g.contact.includes(q);
  });

  const checkedCount = guests.filter((g) => g.checked_in).length;

  return (
    <div className="space-y-4 font-sans">
      <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] flex items-center justify-between text-xs">
        <span className="text-zinc-400">현재 입장 완료 인원:</span>
        <strong className="text-base font-bold text-blue-400">
          {checkedCount} / {guests.length}명
        </strong>
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="인플루언서 이름 또는 전화번호 뒷자리..."
          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#131418] border border-[#22242A] text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
        />
        <Search className="w-5 h-5 text-zinc-500 absolute left-3.5 top-3.5" />
      </div>

      <div className="space-y-2">
        {filtered.map((g) => (
          <div
            key={g.id}
            onClick={() => handleToggle(g.id, g.checked_in)}
            className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
              g.checked_in
                ? "bg-blue-950/20 border-blue-600/50"
                : "bg-[#131418] border-[#22242A] hover:border-[#353942]"
            }`}
          >
            <div className="space-y-0.5">
              <div className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <span>{g.name}</span>
                {g.party_size > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px]">
                    동반 {g.party_size - 1}명
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-zinc-400">{g.contact}</div>
            </div>

            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                g.checked_in
                  ? "bg-blue-600 text-white"
                  : "border border-[#22242A] text-transparent"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}