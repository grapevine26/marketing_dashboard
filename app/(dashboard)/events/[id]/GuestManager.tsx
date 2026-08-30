"use client";

import { useState } from "react";
import { MarketingEvent, EventGuest } from "@/lib/db/types";
import { toggleCheckinAction, saveGuestReviewAction } from "../actions";
import { ExternalLink, CheckCircle2, Search, Save } from "lucide-react";

export default function GuestManager({
  event,
  initialGuests,
}: {
  event: MarketingEvent;
  initialGuests: EventGuest[];
}) {
  const [guests, setGuests] = useState<EventGuest[]>(initialGuests);
  const [search, setSearch] = useState("");
  const [reviewInput, setReviewInput] = useState<Record<string, string>>({});

  const handleToggleCheckin = async (guestId: string, currentVal: boolean) => {
    await toggleCheckinAction(guestId, !currentVal, event.id);
    setGuests((prev) =>
      prev.map((g) =>
        g.id === guestId ? { ...g, checked_in: !currentVal, checked_in_at: !currentVal ? new Date().toISOString() : null } : g
      )
    );
  };

  const handleSaveReview = async (guestId: string) => {
    const link = reviewInput[guestId] || "";
    await saveGuestReviewAction(guestId, link, event.id);
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, review_link: link } : g))
    );
  };

  const attending = guests.filter((g) => g.rsvp_status === "attending");
  const checkedIn = guests.filter((g) => g.checked_in);

  const filtered = guests.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return g.name.toLowerCase().includes(q) || g.contact.includes(q) || g.sns_link.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 font-sans">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A]">
          <div className="text-xs text-zinc-500">행사 정원</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{event.capacity}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A]">
          <div className="text-xs text-zinc-500">참석 응답 (RSVP)</div>
          <div className="text-xl font-bold text-blue-400 mt-1">{attending.length}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A]">
          <div className="text-xs text-zinc-500">현장 체크인</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{checkedIn.length}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A]">
          <div className="text-xs text-zinc-500">후기 콘텐츠 수집</div>
          <div className="text-xl font-bold text-sky-400 mt-1">
            {guests.filter((g) => Boolean(g.review_link)).length}건
          </div>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-zinc-100">초청 게스트 및 참석자 명단 ({guests.length}명)</h2>
          <div className="relative w-60">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 연락처, SNS 검색..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#22242A] overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
              <tr>
                <th className="p-3.5">게스트</th>
                <th className="p-3.5">SNS 채널</th>
                <th className="p-3.5">연락처</th>
                <th className="p-3.5">참석 응답</th>
                <th className="p-3.5">인원</th>
                <th className="p-3.5">현장 체크인</th>
                <th className="p-3.5">후기 콘텐츠 URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#22242A] text-zinc-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-zinc-500">
                    초청된 게스트가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => (
                  <tr key={g.id} className="hover:bg-[#181A20] transition">
                    <td className="p-3.5 font-semibold text-zinc-100">{g.name}</td>
                    <td className="p-3.5">
                      <a
                        href={g.sns_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[130px]"
                      >
                        <span>{g.sns_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="p-3.5 font-mono text-zinc-300">{g.contact}</td>
                    <td className="p-3.5">
                      {g.rsvp_status === "attending" && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-semibold">
                          참석 확정
                        </span>
                      )}
                      {g.rsvp_status === "declined" && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[11px]">
                          불참
                        </span>
                      )}
                      {g.rsvp_status === "pending" && (
                        <span className="px-2 py-0.5 rounded-full bg-[#181A20] text-zinc-500 text-[11px]">
                          미응답
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">{g.party_size}명</td>
                    <td className="p-3.5">
                      <button
                        type="button"
                        onClick={() => handleToggleCheckin(g.id, g.checked_in)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          g.checked_in
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-[#181A20] hover:bg-[#22242A] text-zinc-400"
                        }`}
                      >
                        {g.checked_in ? "체크인 완료 ✓" : "체크인"}
                      </button>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="url"
                          defaultValue={g.review_link || ""}
                          onChange={(e) =>
                            setReviewInput({ ...reviewInput, [g.id]: e.target.value })
                          }
                          placeholder="https://instagram.com/p/..."
                          className="w-36 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveReview(g.id)}
                          className="p-1 rounded bg-[#181A20] hover:bg-[#22242A] text-zinc-300"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}