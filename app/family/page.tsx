"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/Toast";

export default function FamilyPage() {
  const { user, refresh } = useAuth();
  const { toast: showToast } = useToast();
  const [joinCode, setJoinCode] = useState("");
  const [newFamilyName, setNewFamilyName] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const family = user.family;

  async function regenerateInvite() {
    setLoading(true);
    try {
      const res = await fetch("/api/family/invite", { method: "POST" });
      if (res.ok) {
        await refresh();
        showToast("New invite code generated", "success");
      } else {
        const d = await res.json();
        showToast(d.error || "Failed", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteCode() {
    if (!family?.inviteCode) return;
    await navigator.clipboard.writeText(family.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  async function joinFamily(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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
        showToast(`Joined ${d.name}`, "success");
      } else {
        showToast(d.error || "Failed to join", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function createFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!newFamilyName.trim()) return;
    setLoading(true);
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
        showToast("Family created", "success");
      } else {
        showToast(d.error || "Failed to create", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!confirm(`Remove ${memberName} from the family?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/family/members?userId=${memberId}`, { method: "DELETE" });
      const d = await res.json();
      if (res.ok) {
        await refresh();
        showToast(`${memberName} removed`, "success");
      } else {
        showToast(d.error || "Failed", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function leaveFamily() {
    const otherMembers = family?.members.filter((m) => m.id !== user.id) ?? [];
    if (isAdmin && otherMembers.length > 0 && !transferTo) {
      showToast("Select a member to transfer admin role to first", "error");
      return;
    }
    if (!confirm("Leave this family?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/family/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transferTo ? { transferToUserId: transferTo } : {}),
      });
      const d = await res.json();
      if (res.ok) {
        await refresh();
        showToast("Left family", "success");
      } else {
        showToast(d.error || "Failed", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Family</h1>

      {family ? (
        <>
          {/* Family info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{family.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{family.members.length} member{family.members.length !== 1 ? "s" : ""}</p>
              </div>
              <span className="text-2xl">👨‍👩‍👧</span>
            </div>

            {/* Members list */}
            <div className="space-y-2">
              {family.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300">
                      {m.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {m.name} {m.id === user.id && <span className="text-gray-400">(you)</span>}
                      </p>
                      {m.role === "admin" && (
                        <p className="text-xs text-brand-600 dark:text-brand-400">Admin</p>
                      )}
                    </div>
                  </div>
                  {isAdmin && m.id !== user.id && (
                    <button
                      onClick={() => removeMember(m.id, m.name)}
                      disabled={loading}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Invite code (admin only) */}
          {isAdmin && family.inviteCode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">Invite Code</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Share this with family members so they can join.</p>
              <div className="flex gap-2">
                <code className="flex-1 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-xl text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                  {family.inviteCode}
                </code>
                <button
                  onClick={copyInviteCode}
                  className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-colors shrink-0"
                >
                  {copiedCode ? "Copied!" : "Copy"}
                </button>
              </div>
              {family.inviteExpiresAt && (
                <p className="text-xs text-gray-400">
                  Expires {new Date(family.inviteExpiresAt).toLocaleDateString()}
                </p>
              )}
              <button
                onClick={regenerateInvite}
                disabled={loading}
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
              >
                🔄 Generate new code
              </button>
            </div>
          )}

          {/* Leave family */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Leave Family</h2>
            {isAdmin && (family.members.filter((m) => m.id !== user.id).length > 0) && (
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Transfer admin role to:
                </label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— select member —</option>
                  {family.members.filter((m) => m.id !== user.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={leaveFamily}
              disabled={loading}
              className="w-full py-2.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              Leave family
            </button>
          </div>
        </>
      ) : (
        /* No family — join or create */
        <div className="space-y-4">
          <form onSubmit={joinFamily} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Join a Family</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Enter an invite code from a family admin.</p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <button
              type="submit"
              disabled={loading || !joinCode.trim()}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Joining…" : "Join family"}
            </button>
          </form>

          <div className="text-center text-sm text-gray-400">or</div>

          <form onSubmit={createFamily} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Create a Family</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Start your own family group and invite others.</p>
            <input
              type="text"
              value={newFamilyName}
              onChange={(e) => setNewFamilyName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. The Smith Family"
            />
            <button
              type="submit"
              disabled={loading || !newFamilyName.trim()}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Creating…" : "Create family"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
