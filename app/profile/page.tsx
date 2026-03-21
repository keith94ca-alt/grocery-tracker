"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import Link from "next/link";

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!user) return null;

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === user!.name) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        await refresh();
        setMessage({ type: "success", text: "Name updated." });
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.error || "Failed to update name" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "New password must be at least 8 characters" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setMessage({ type: "success", text: "Password changed." });
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.error || "Failed to change password" });
      }
    } finally {
      setSaving(false);
    }
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">← Back</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Profile</h1>
      </div>

      {/* Avatar + info */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-2xl font-bold text-brand-600 dark:text-brand-400">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
          <p className="text-sm text-gray-400">{user.email}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${user.role === "admin" ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>
            {user.role}
          </span>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${message.type === "success" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
          {message.text}
        </div>
      )}

      {/* Edit name */}
      <form onSubmit={handleSaveName} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Edit Name</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={saving || name === user.name}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Save name
        </button>
      </form>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Change Password</h2>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Min. 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Change password
        </button>
      </form>

      {/* Family link */}
      {user.family && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">👨‍👩‍👧 {user.family.name}</p>
            <p className="text-xs text-gray-400">{user.family.members.length} member{user.family.members.length !== 1 ? "s" : ""}</p>
          </div>
          <Link href="/family" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline">
            Manage →
          </Link>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={logout}
        className="w-full py-3 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-medium rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
