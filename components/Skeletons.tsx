"use client";

export function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-gray-200 rounded skeleton ${className}`} />
  );
}

export function ItemCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-5 w-3/5" />
          <SkeletonBar className="h-3 w-2/5" />
        </div>
        <div className="space-y-1 text-right">
          <SkeletonBar className="h-6 w-16 ml-auto" />
          <SkeletonBar className="h-3 w-12 ml-auto" />
        </div>
      </div>
      <div className="flex gap-4 pt-2 border-t border-gray-100">
        <SkeletonBar className="h-3 w-16" />
        <SkeletonBar className="h-3 w-16" />
        <SkeletonBar className="h-3 w-16" />
      </div>
    </div>
  );
}

export function ItemDetailSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-3">
        <SkeletonBar className="h-6 w-6 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-7 w-2/3" />
          <SkeletonBar className="h-4 w-1/3" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 text-center space-y-2">
            <SkeletonBar className="h-3 w-12 mx-auto" />
            <SkeletonBar className="h-6 w-16 mx-auto" />
            <SkeletonBar className="h-3 w-14 mx-auto" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="bg-gray-50 rounded-xl h-32" />

      {/* History items */}
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="flex justify-between">
              <SkeletonBar className="h-5 w-20" />
              <SkeletonBar className="h-5 w-16" />
            </div>
            <SkeletonBar className="h-3 w-3/5" />
            <SkeletonBar className="h-3 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlyerCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex gap-3">
        <SkeletonBar className="w-14 h-14 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-5 w-3/4" />
          <SkeletonBar className="h-3 w-1/2" />
          <SkeletonBar className="h-3 w-2/3" />
        </div>
        <div className="text-right space-y-1">
          <SkeletonBar className="h-6 w-14" />
          <SkeletonBar className="h-3 w-10 ml-auto" />
        </div>
      </div>
    </div>
  );
}

export function HistoryEntrySkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <div className="flex justify-between items-start">
        <div className="space-y-1.5">
          <SkeletonBar className="h-5 w-24" />
          <SkeletonBar className="h-3 w-32" />
        </div>
        <SkeletonBar className="h-3 w-20" />
      </div>
    </div>
  );
}

export function PageSkeleton({ count = 5, type = "item" }: { count?: number; type?: "item" | "flyer" | "history" }) {
  const Component = type === "flyer" ? FlyerCardSkeleton : type === "history" ? HistoryEntrySkeleton : ItemCardSkeleton;
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
}
