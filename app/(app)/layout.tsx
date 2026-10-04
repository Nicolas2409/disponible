import { Suspense } from "react";
import { TabBar } from "@/components/TabBar";
import { AddSheetLoader } from "@/components/add/AddSheetLoader";
import { EditorProvider } from "@/components/edit/EditorProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EditorProvider>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 px-4">
          <TabBar />
          <Suspense fallback={<div className="size-[60px] shrink-0" />}>
            <AddSheetLoader />
          </Suspense>
        </div>
      </div>
    </EditorProvider>
  );
}
