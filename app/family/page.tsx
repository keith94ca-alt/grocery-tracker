"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import Link from "next/link";

export default function FamilyPage() {
  const { user, refresh } = useAuth();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Join family form
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Create family form
  const [newFamilyName, setNewFamilyName] = useState("");
  const [creating, setCreating] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === "admin" && user.family?.adminId === user.id;

  async function regenerateInvite() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/family/invite", { method: "POST" });
      if (res.ok) {
        await refresh();
        setMessage({ type: "success", text: "Invite code regenerated." });
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.error });
      }
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member? Their data stays with the family.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/family/members?userId=${memberId}`, { method: "DELETE" });
      if (res.ok) {
        await refresh();
        setMessage({ type: "success", text: "Member removed." });
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.error });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setMessage(null);
    try {
      const res = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: joinCode }),
      });
      const d = await res.json();
      if (res.ok) {
        await refresh();
        setJoinCode("");
        setMessage({ type: "success", text: `Joined ${d.name}!` });
      } else {
        setMessage({ type: "error", text: d.error });
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/family/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFamilyName }),
      });
      const d = await res.json();
      if (res.ok) {
        await refresh();
        setNewFamilyName("");
        setMessage({ type: "success", text: `Family "${d.name}" created.` });
      } else {
        setMessage({ type: "error", text: d.error });
      }
    } finally {
      setCreating(false);
    }
  }

  async function copyInviteCode() {
    if (!user?.family?.inviteCode) return;
    await navigator.clipboard.writeText(user.family.inviteCode);
    setMessage({ type: "success", text: "Invite code copied!" });
    setTimeout(() => setMessage(null), 2000);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/profile" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">← Profile</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Family</h1>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${message.type === "success" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
          {message.text}
        </div>
      )}

      {user.family ? (
        <>
          {/* Family info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{user.family.name}</h2>
                <p className="text-xs text-gray-400">{user.family.members.length} member{user.family.members.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {/* Members list */}
            <div className="space-y-2">
              {user.family.members.map((m) => {
                const initials = m.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-xs font-bold text-brand-600 dark:text-brand-400">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</p>
                        <p className="text-xs text-gray-400">{m.role}</p>
                      </div>
                    </div>
                    {isAdmin && m.id !== user.id && (
                      <button
                        onClick={() => removeMember(m.id)}
                        disabled={loading}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invite code (admin only) */}
          {isAdmin && user.family.inviteCode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Invite Code</h2>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                  {user.family.inviteCode}
                </code>
                <button
                  onClick={copyInviteCode}
                  className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-xl transition-colors"
                >
                  Copy
                </button>
              </div>
              {user.family.inviteExpiresAt && (
                <p className="text-xs text-gray-400">
                  Expires {new Date(user.family.inviteExpiresAt).toLocaleDateString()}
                </p>
              )}
              <button
                onClick={regenerateInvite}
                disabled={loading}
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
              >
                Regenerate code
              </button>
            </div>
          )}

          {/* Leave family */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">Leave Family</h2>
            {isAdmin && user.family.members.length > 1 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You&apos;re the admin. Transfer admin to another member before leaving. (Feature coming — contact the other member to make them admin first.)
              </p>
            ) : (
              <button
                onClick={async () => {
                  if (!confirm("Leave this family?")) return;
                  const res = await fetch("/api/family/leave", { method: "POST" });
                  if (res.ok) { await refresh(); setMessage({ type: "success", text: "Left family." }); }
                  else { const d = await res.json(); setMessage({ type: "error", text: d.error }); }
                }}
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Leave family
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {/* No family — join or create */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            You&apos;re not in a family yet. Join one with an invite code or create your own.
          </div>

          <form onSubmit={handleJoin} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Join a Family</h2>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              required
              placeholder="Enter invite code"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={joining}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {joining ? "Joining…" : "Join family"}
            </button>
          </form>

          <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Create a Family</h2>
            <input
              type="text"
              value={newFamilyName}
              onChange={(e) => setNewFamilyName(e.target.value)}
              required
              placeholder="e.g. The Smiths"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {creating ? "Creating…" : "Create family"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
